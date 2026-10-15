"""Import Equalizer APO parametric filter text without changing its settings."""
import argparse
import json
import math
from pathlib import Path
import re

NUMBER = r'[-+]?(?:\d+(?:\.\d*)?|\.\d+)'
TYPES = {'PK': 1, 'LS': 0, 'HS': 2}


def parse(text):
    preamp = None
    filters = []
    disabled = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        match = re.fullmatch(rf'Preamp:\s*({NUMBER})\s*dB', line, re.I)
        if match:
            if preamp is not None:
                raise ValueError('Duplicate preamp')
            preamp = float(match[1])
            continue
        match = re.fullmatch(rf'Filter\s+(\d+):\s*(ON|OFF)\s+(\w+)\s+Fc\s+({NUMBER})\s*Hz\s+Gain\s+({NUMBER})\s*dB\s+Q\s+({NUMBER})', line, re.I)
        if not match:
            raise ValueError('Unsupported filter line: ' + line)
        index, enabled, kind, frequency, gain, quality = match.groups()
        if enabled.upper() == 'OFF':
            disabled.append(int(index))
            continue
        kind = kind.upper()
        if kind not in TYPES:
            raise ValueError('Unsupported active filter type: ' + kind)
        f = dict(type=TYPES[kind], frequency=float(frequency), gain=float(gain), q=float(quality))
        if not all(math.isfinite(v) for v in f.values()) or not 20 <= f['frequency'] <= 20000 or f['q'] <= 0:
            raise ValueError('Invalid active filter parameters')
        filters.append(f)
    if preamp is None or not math.isfinite(preamp):
        raise ValueError('A finite preamp value is required')
    if not 1 <= len(filters) <= 8:
        raise ValueError('Headphones support at most eight active filters through this command')
    return {'count': len(filters), 'total_gain': preamp, 'filters': filters, 'disabled_filters': disabled}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source')
    args = parser.parse_args()
    source = Path(args.source)
    profile = parse(source.read_text(encoding='utf-8-sig'))
    profile['name'] = source.stem
    output = Path(__file__).resolve().parents[2] / 'profiles' / 'autoeq-profile.json'
    output.write_text(json.dumps(profile, indent=2))
    print(f'Imported {profile["count"]} active filters; preamp {profile["total_gain"]} dB; skipped OFF filters {profile["disabled_filters"]}')
    print('Saved:', output)
