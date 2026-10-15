"""Local-only headphone EQ A/B tool. No third-party dependencies."""
import atexit
import copy
import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
from urllib.parse import urlparse

from cmf_probe import Control, decode_eq, encode_eq

ROOT = Path(__file__).resolve().parents[2]
WEB = Path(__file__).resolve().parent / 'eq-web'
BACKUPS = ROOT / 'artifacts' / 'backups'
LOGS = ROOT / 'artifacts' / 'logs'
BACKUPS.mkdir(parents=True, exist_ok=True)
LOGS.mkdir(parents=True, exist_ok=True)
MAC = '2C:BE:EE:A2:FF:CF'
PROFILE = json.loads((ROOT / 'profiles' / 'autoeq-profile.json').read_text())
LOCK = threading.Lock()
control = None
original = None
state = {'connected': False, 'mode': None, 'eq': None, 'firmware': None,
         'profile': {'name': PROFILE['name'], 'count': PROFILE['count'], 'preamp': PROFILE['total_gain']}}
dirty = False
reboot_expected = None


def log(event, **data):
    with (LOGS / 'eq-web-events.jsonl').open('a', encoding='utf-8') as file:
        file.write(json.dumps({'time': datetime.datetime.now().astimezone().isoformat(), 'event': event, **data}) + '\n')


def write_verified(eq):
    global dirty
    dirty = True  # A failed ACK can still mean a setting was applied.
    control.request(0xf041, encode_eq(eq))
    readback = decode_eq(control.request(0xc044))
    state['eq'] = readback
    if encode_eq(readback) != encode_eq(eq):
        state['mode'] = None
        raise RuntimeError('Headphone readback differs from requested EQ. Use Restore original.')
    log('write-verified', eq=readback)
    return readback


def restore():
    global dirty
    if control is None or original is None:
        return
    write_verified(original)
    dirty = False
    state['mode'] = 'original'


def cleanup():
    global control
    with LOCK:
        if control:
            try:
                if dirty:
                    restore()
            except Exception as error:
                print('Restoration failed. Reconnect and use Restore original:', error, flush=True)
            finally:
                control.close()
                control = None


class Handler(BaseHTTPRequestHandler):
    def reply(self, code, value):
        body = json.dumps(value).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def allowed(self):
        host = self.headers.get('Host', '')
        return host in ('127.0.0.1:8765', 'localhost:8765')

    def do_GET(self):
        if not self.allowed():
            self.reply(403, {'error': 'Local access only'})
            return
        path = urlparse(self.path).path
        if path == '/api/state':
            with LOCK:
                self.reply(200, state)
            return
        files = {'/': ('index.html', 'text/html'), '/app.js': ('app.js', 'text/javascript'), '/style.css': ('style.css', 'text/css')}
        if path not in files:
            self.reply(404, {'error': 'Not found'})
            return
        name, mime = files[path]
        body = (WEB / name).read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', mime + '; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        global control, original, dirty, reboot_expected
        origin = self.headers.get('Origin')
        if not self.allowed() or origin not in (None, 'http://127.0.0.1:8765', 'http://localhost:8765'):
            self.reply(403, {'error': 'Local access only'})
            return
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            self.reply(415, {'error': 'Expected JSON'})
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 <= size <= 1024:
                raise ValueError('Invalid request length')
            data = json.loads(self.rfile.read(size) or b'{}')
            with LOCK:
                if self.path == '/api/connect':
                    if control is None:
                        new = Control(MAC)
                        try:
                            new.request(0xc001)
                            firmware = new.request(0xc042).decode(errors='replace')
                            payload = new.request(0xc044)
                            baseline = decode_eq(payload)
                            if original is None and baseline['count'] != 3:
                                raise ValueError('Expected three original filters. Restore your prior EQ before connecting.')
                            backup = BACKUPS / ('eq-web-backup-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S') + '.json')
                            backup.write_text(json.dumps({'firmware': firmware, 'payload_hex': payload.hex(), 'eq': baseline}, indent=2))
                            control = new
                            if original is None:
                                original = baseline
                                state.update(mode='original', backup=backup.name)
                            dirty = encode_eq(baseline) != encode_eq(original)
                            state.update(connected=True, firmware=firmware, eq=baseline)
                            if reboot_expected is not None:
                                retained = encode_eq(baseline) == encode_eq(reboot_expected)
                                state['persistence'] = {'retained': retained, 'expected': reboot_expected, 'actual': baseline}
                                log('reboot-readback', **state['persistence'])
                                reboot_expected = None
                            log('connected', backup=backup.name, eq=baseline)
                        except Exception:
                            new.close()
                            raise
                elif self.path == '/api/restore':
                    restore()
                elif self.path == '/api/read':
                    if control is None:
                        raise ValueError('Connect first')
                    state['eq'] = decode_eq(control.request(0xc044))
                    state['mode'] = None
                elif self.path == '/api/prepare-reboot':
                    if control is None or not 4 <= state['eq']['count'] <= 8:
                        raise ValueError('Apply a supported test state first')
                    reboot_expected = copy.deepcopy(state['eq'])
                    log('reboot-prepared', expected=reboot_expected, original=original)
                    control.close()
                    control = None
                    state['connected'] = False
                    state.pop('persistence', None)
                elif self.path == '/api/apply':
                    if control is None:
                        raise ValueError('Connect first')
                    mode = data.get('mode')
                    if mode not in ('original', 'four-flat', 'four-cut', 'five-flat', 'five-cut', 'eight-flat', 'eight-cut', 'autoeq', 'autoeq-flat'):
                        raise ValueError('Unknown comparison mode')
                    if mode == 'original':
                        restore()
                    elif mode.startswith('autoeq'):
                        eq = copy.deepcopy(PROFILE)
                        if mode == 'autoeq-flat':
                            for f in eq['filters']:
                                f['gain'] = 0.0
                        write_verified(eq)
                        state['mode'] = mode
                    else:
                        eq = copy.deepcopy(original)
                        eq['filters'].append({'type': 1, 'gain': -6.0 if mode == 'four-cut' else 0.0, 'frequency': 2000.0, 'q': 1.0})
                        if mode.startswith('five'):
                            eq['filters'].append({'type': 1, 'gain': -6.0 if mode == 'five-cut' else 0.0, 'frequency': 500.0, 'q': 1.0})
                        elif mode.startswith('eight'):
                            for frequency in (500.0, 6000.0, 8000.0):
                                eq['filters'].append({'type': 1, 'gain': 0.0, 'frequency': frequency, 'q': 1.0})
                            eq['filters'].append({'type': 1, 'gain': -6.0 if mode == 'eight-cut' else 0.0, 'frequency': 1000.0, 'q': 1.0})
                        eq['count'] = len(eq['filters'])
                        write_verified(eq)
                        state['mode'] = mode
                else:
                    self.reply(404, {'error': 'Unknown action'})
                    return
                self.reply(200, state)
        except Exception as error:
            log('error', message=str(error))
            self.reply(500, {'error': str(error)})


if __name__ == '__main__':
    atexit.register(cleanup)
    server = ThreadingHTTPServer(('127.0.0.1', 8765), Handler)
    print('CMF EQ lab: http://127.0.0.1:8765', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        cleanup()
