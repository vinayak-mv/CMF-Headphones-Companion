"""Test neutral EQ counts 6 through 10, restoring baseline after each attempt."""
import copy
import argparse
import datetime
import json
from pathlib import Path
from cmf_probe import Control, decode_eq, encode_eq

ROOT = Path(__file__).resolve().parents[2]
REPORTS = ROOT / 'artifacts' / 'reports'
REPORTS.mkdir(parents=True, exist_ok=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--counts', type=int, nargs='+', default=list(range(6, 11)))
    counts = parser.parse_args().counts
    if any(count < 6 or count > 10 for count in counts):
        raise ValueError('Only counts six through ten are permitted')
    device = Control('2C:BE:EE:A2:FF:CF')
    report = {'tests': [], 'maximum_verified_count': 5}
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    output = REPORTS / f'eq-limit-test-{stamp}.json'
    try:
        device.request(0xc001)
        report['firmware'] = device.request(0xc042).decode(errors='replace')
        raw = device.request(0xc044)
        baseline = decode_eq(raw)
        if baseline['count'] != 3:
            raise RuntimeError('Restore original three-band EQ before limit testing')
        report['baseline'] = baseline
        report['baseline_raw_hex'] = raw.hex()
        output.write_text(json.dumps(report, indent=2))
        frequencies = [2000, 500, 6000, 1000, 8000, 10000, 14000]
        for count in counts:
            trial = copy.deepcopy(baseline)
            trial['filters'] += [dict(type=1, gain=0.0, frequency=float(f), q=1.0)
                                 for f in frequencies[:count - 3]]
            trial['count'] = count
            result = {'count': count, 'requested': trial, 'payload_length': len(encode_eq(trial))}
            report['tests'].append(result)
            passed = False
            try:
                device.request(0xf041, encode_eq(trial))
                result['acknowledged'] = True
                raw = device.request(0xc044)
                result['readback_raw_hex'] = raw.hex()
                result['readback_length'] = len(raw)
                result['reported_count'] = raw[0] if raw else None
                readback = decode_eq(raw)
                result['readback'] = readback
                passed = encode_eq(readback) == encode_eq(trial)
                result['exact_match'] = passed
                if passed:
                    report['maximum_verified_count'] = count
                print(f'COUNT {count}: reported={readback["count"]}, exact_match={passed}', flush=True)
            except Exception as error:
                result['error'] = repr(error)
                print(f'COUNT {count}: {error}', flush=True)
            finally:
                device.request(0xf041, encode_eq(baseline))
                restored = decode_eq(device.request(0xc044))
                result['original_restored'] = encode_eq(restored) == encode_eq(baseline)
                output.write_text(json.dumps(report, indent=2))
                if not result['original_restored']:
                    raise RuntimeError('Baseline restore mismatch: stop testing')
                print('Original restored and verified', flush=True)
            if not passed:
                report['stopped_at'] = count
                break
    finally:
        output.write_text(json.dumps(report, indent=2))
        device.close()
        print('Results:', output, flush=True)


if __name__ == '__main__':
    main()
