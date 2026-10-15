"""CMF RFCOMM EQ inspection. Default operation only reads settings."""
import argparse
import copy
import ctypes
import datetime
import json
from pathlib import Path
import select
import socket
import struct
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
BACKUPS = ROOT / 'artifacts' / 'backups'
REPORTS = ROOT / 'artifacts' / 'reports'
REPORTS.mkdir(parents=True, exist_ok=True)
LOGS = ROOT / 'artifacts' / 'logs'
BACKUPS.mkdir(parents=True, exist_ok=True)
LOGS.mkdir(parents=True, exist_ok=True)
SERVICE = uuid.UUID('aeac4a03-dff5-498f-843a-34487cf133eb')


def crc16(data):
    crc = 0xffff
    for byte in data:
        crc ^= byte
        for _ in range(8):
            crc = (crc >> 1) ^ (0xa001 if crc & 1 else 0)
    return crc


def packet(command, sequence, payload=b'', device_type=6):
    data = struct.pack('<BHHHB', 0x55, 0x60 | (device_type << 8), command, len(payload), sequence) + payload
    return data + struct.pack('<H', crc16(data))


def decode_eq(payload):
    if len(payload) < 5:
        raise ValueError('Short EQ payload')
    count = payload[0]
    if not 1 <= count <= 16 or len(payload) < 5 + count * 13:
        raise ValueError('Invalid EQ count or length')
    filters = []
    for index in range(count):
        kind, gain, frequency, quality = struct.unpack_from('<Bfff', payload, 5 + index * 13)
        filters.append(dict(type=kind, gain=gain, frequency=frequency, q=quality))
    return dict(count=count, total_gain=struct.unpack_from('<f', payload, 1)[0], filters=filters,
                trailing_hex=payload[5 + count * 13:].hex())


def encode_eq(eq):
    filters = eq['filters']
    data = bytes([len(filters)]) + struct.pack('<f', eq['total_gain'])
    for f in filters:
        data += struct.pack('<Bfff', f['type'], f['gain'], f['frequency'], f['q'])
    # Match Nothing X CustomEQ.obtainDataPacket: contiguous records, tail padding.
    return data + bytes(3 * len(filters))


class Control:
    def __init__(self, mac):
        self.log = []
        self.buffer = bytearray()
        self.sequence = 0
        self.sock = socket.socket(32, socket.SOCK_STREAM, 3)
        self.sock.setblocking(False)
        ws = ctypes.WinDLL('ws2_32')
        ws.connect.argtypes = [ctypes.c_size_t, ctypes.c_void_p, ctypes.c_int]
        ws.connect.restype = ctypes.c_int
        ws.WSAGetLastError.restype = ctypes.c_int
        addr = struct.pack('<HQ16sI', 32, int(mac.replace(':', ''), 16), SERVICE.bytes_le, 0)
        raw = ctypes.create_string_buffer(addr)
        result = ws.connect(self.sock.fileno(), raw, len(addr))
        if result:
            error = ws.WSAGetLastError()
            if error not in (10035, 10036, 10037):
                self.sock.close()
                raise OSError(error, 'Bluetooth service connection failed')
            _, writable, errors = select.select([], [self.sock], [self.sock], 20)
            if not writable or errors:
                self.sock.close()
                raise TimeoutError('Bluetooth service connection did not complete')
            error = self.sock.getsockopt(socket.SOL_SOCKET, socket.SO_ERROR)
            if error:
                self.sock.close()
                raise OSError(error, 'Bluetooth service connection failed')
        self.sock.settimeout(1)
        print('Connected to Nothing control service via SDP UUID', flush=True)

    def record(self, direction, data):
        self.log.append(dict(time=datetime.datetime.now().astimezone().isoformat(), direction=direction, hex=data.hex()))

    def frames(self):
        while self.buffer:
            start = self.buffer.find(0x55)
            if start < 0:
                self.buffer.clear()
                return
            del self.buffer[:start]
            if len(self.buffer) < 8:
                return
            _, control, command, length, sequence = struct.unpack_from('<BHHHB', self.buffer)
            if length > 8192:
                del self.buffer[0]
                continue
            size = 8 + length + (2 if control & 0x20 else 0)
            if len(self.buffer) < size:
                return
            data = bytes(self.buffer[:size])
            del self.buffer[:size]
            if control & 0x20 and crc16(data[:-2]) != struct.unpack_from('<H', data, size - 2)[0]:
                raise ValueError('Response CRC mismatch')
            yield control, command, sequence, data[8:8 + length]

    def request(self, command, payload=b''):
        self.sequence = (self.sequence + 1) % 256
        sequence = self.sequence
        data = packet(command, sequence, payload)
        self.record('TX', data)
        print(f'TX command=0x{command:04x} payload={len(payload)} bytes', flush=True)
        self.sock.sendall(data)
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            try:
                chunk = self.sock.recv(8192)
            except socket.timeout:
                continue
            if not chunk:
                raise ConnectionError('Headphones closed the control connection')
            self.record('RX', chunk)
            self.buffer.extend(chunk)
            response = None
            for control, cmd, seq, body in self.frames():
                print(f'RX command=0x{cmd:04x} seq={seq} status={control & 31} payload={len(body)} bytes', flush=True)
                if cmd == (command & 0x7fff) and seq == sequence:
                    if control & 31:
                        raise RuntimeError(f'Headphones returned status {control & 31}')
                    response = body
            if response is not None:
                return response
        raise TimeoutError(f'No matching response for 0x{command:04x}')

    def close(self):
        self.sock.close()
        stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
        (LOGS / f'probe-log-{stamp}.json').write_text(json.dumps(self.log, indent=2))


def self_check():
    rows = json.loads((ROOT / 'tests' / 'fixtures' / 'eq-capture-packets.json').read_text())
    tested = 0
    for row in rows:
        if row['command'] != '0xf041':
            continue
        payload = bytes.fromhex(row['payload_hex'])
        assert encode_eq(decode_eq(payload)) == payload
        tested += 1
    known = bytes.fromhex('55 60 01 42 c0 00 00 4c a1 25')
    assert crc16(known[:-2]) == struct.unpack('<H', known[-2:])[0]
    print(f'Validated EQ encoder against {tested} captured writes; CRC matches captured firmware query')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mac', default='2C:BE:EE:A2:FF:CF')
    parser.add_argument('--self-check', action='store_true')
    parser.add_argument('--test-four', action='store_true', help='Try a fourth filter, read it back, and restore original EQ')
    args = parser.parse_args()
    if args.self_check:
        self_check()
        return
    control = Control(args.mac)
    try:
        version = control.request(0xc001)
        print('Protocol version:', version.hex())
        firmware = control.request(0xc042)
        print('Firmware:', firmware.decode(errors='replace'))
        payload = control.request(0xc044)
        eq = decode_eq(payload)
        backup = dict(mac=args.mac, firmware=firmware.decode(errors='replace'), payload_hex=payload.hex(), eq=eq)
        stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
        path = BACKUPS / f'eq-backup-{stamp}.json'
        path.write_text(json.dumps(backup, indent=2))
        print(json.dumps(eq, indent=2))
        print('Saved EQ backup:', path)
        if args.test_four:
            if eq['count'] != 3:
                raise ValueError('Four-filter test expects an original three-filter EQ')
            trial = copy.deepcopy(eq)
            trial['filters'].append(dict(type=1, gain=-3.0, frequency=2000.0, q=1.0))
            trial['count'] = 4
            original_write = encode_eq(eq)
            report = dict(backup=str(path), trial=trial)
            try:
                control.request(0xf041, encode_eq(trial))
                readback = decode_eq(control.request(0xc044))
                report['readback'] = readback
                expected = encode_eq(trial)
                report['retained_all_four'] = encode_eq(readback) == expected
                print('FOUR-FILTER READBACK:', json.dumps(readback, indent=2), flush=True)
                print('All four retained:', report['retained_all_four'], flush=True)
            except Exception as error:
                report['test_error'] = repr(error)
                raise
            finally:
                try:
                    control.request(0xf041, original_write)
                    restored = decode_eq(control.request(0xc044))
                    report['restored'] = encode_eq(restored) == original_write
                    print('Original EQ restored and verified:', report['restored'], flush=True)
                    if not report['restored']:
                        raise RuntimeError('Original EQ restoration readback mismatch')
                finally:
                    (REPORTS / f'four-filter-test-{stamp}.json').write_text(json.dumps(report, indent=2))
    finally:
        control.close()


if __name__ == '__main__':
    main()
