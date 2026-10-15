# CMF Headphone Pro: custom EQ reverse-engineering findings

Investigation date: **14 October 2026**. Times below are IST (UTC+05:30).

## Results

The CMF Headphone Pro tested here accepts custom parametric EQ configurations containing **up to eight filters** through command `0xF041`. This exceeds the three controls exposed in Nothing X. Eight-filter settings matched device readback, and the owner confirmed an audible eighth-filter A/B difference.

Nine- and ten-filter writes returned successful acknowledgements, but subsequent reads returned a three-filter configuration rather than the requested settings. Eight is therefore the **practical verified limit for this command, encoding and firmware**, not a claim about every possible DSP or undocumented interface.

A retuned AutoEQ profile containing **seven active peak filters and a −6.1 dB preamp** was applied successfully. All parameters matched readback. The owner confirmed its sound and persistence after a real headphone power cycle; the server also recorded matching readback after reconnection without reapplying the profile.

| Finding | Evidence | Scope |
|---|---|---|
| More than three filters are accessible | Four-, five- and eight-filter writes/readbacks; owner listening tests | Tested unit, firmware 1.0.1.49 |
| Maximum verified count is eight | Counts 6–8 matched; counts 9 and 10 returned three | Custom EQ command and official-app encoding |
| Extra filters affect playback | Owner A/B listening confirmations for filters 4, 5 and 8 | Subjective listening, not microphone measurement |
| Preamp is writable | AutoEQ −6.1 dB matched readback | Tested setting; full supported range unknown |
| Settings survive a reboot | Five-filter experiment and seven-filter AutoEQ matched after reconnection | Owner performed power cycles; no rewrite before the reads |
| The three-slider limit is in the app UI | APK creates three controls; its serializer accepts a filter list | Nothing X 3.10.0 |
| Custom EQ and Dirac/Opteo preset selection use different commands | Repository, APK and live packets | DSP implementation behind custom EQ remains unknown |

## Test environment

| Component | Tested configuration |
|---|---|
| Headphones | CMF Headphone Pro, model B175, product codename Forretress |
| Headphone firmware | **1.0.1.49**, queried directly from device |
| Reported control protocol version | `1.0.0\n` |
| Phone | Redmi Note 12 Pro 5G |
| Nothing X | **3.10.0**, installed APK copied from phone |
| Initial Bluetooth audio configuration | LDAC enabled on Android |
| Probe and webpage host | Windows PC, Python 3.14, native Windows RFCOMM sockets |
| Test page | `http://127.0.0.1:8765/` |
| AutoEQ measurement condition | ANC maximum, per owner’s profile |

Windows playback codec was not measured. Capturing the initial Android traffic with LDAC enabled does not establish which codec Windows used. ANC settings and the physical energy slider should remain unchanged during comparisons.

## Starting references

- [furkanozer1/nothing-x-macos-cmf](https://github.com/furkanozer1/nothing-x-macos-cmf): starting reference for Bluetooth service discovery, handshake and CMF preset selection. Its README reports testing firmware 1.0.1.45; our device tests used 1.0.1.49.
- [Repository preset implementation](https://github.com/furkanozer1/nothing-x-macos-cmf/blob/main/Nothing%20X%20MacOS/framework/NothingServiceImpl.swift): `switchEQ()` sends one preset byte using `SET_DIRAC_OPTEO_EQ`, `0xF01D`, for the headphone family. Its enum exposes four choices; we did not audit whether every preset label matches Headphone Pro’s mobile app.
- [Kuulokenurkka review](https://kuulokenurkka.com/en/review-cmf-headphone-pro/): independently describes the stock slider effects and settings for simulating them. The review’s bass/mid values differ slightly from the exact APK and wire values below.
- [Android Bluetooth capture documentation](https://source.android.com/docs/core/connect/bluetooth/verifying_debugging): HCI snoop logging and bug-report extraction.
- [Microsoft Bluetooth sockets](https://learn.microsoft.com/en-us/windows/win32/bluetooth/bluetooth-and-socket) and [SOCKADDR_BTH](https://learn.microsoft.com/en-us/windows/win32/api/ws2bth/ns-ws2bth-sockaddr_bth): Windows control connection implementation.

## Bluetooth control transport

The tested control path is **Bluetooth Classic RFCOMM**, rather than a BLE characteristic write.

| Item | Value |
|---|---|
| Nothing control-service UUID | `AEAC4A03-DFF5-498F-843A-34487CF133EB` |
| Observed RFCOMM service channel | **28**, advertised in the Android capture |
| Windows connection | Connect by service UUID so Windows resolves the channel through SDP |
| Windows socket arguments | `AF_BTH = 32`, `SOCK_STREAM = 1`, `BTHPROTO_RFCOMM = 3` |
| Connection initialization | Query protocol version with `0xC001` before other requests |

The headphone Bluetooth address is specific to this unit and is currently hard-coded in the scripts. Replace the address when using another unit. Do not assume every firmware/device advertises channel 28; use service discovery.

### Commands used

| Operation | Request | Matching response | Payload |
|---|---:|---:|---|
| Protocol initialization/version | `0xC001` | `0x4001` | Empty request; version text returned |
| Firmware version | `0xC042` | `0x4042` | Empty request; firmware text returned |
| Read custom EQ | `0xC044` | `0x4044` | Empty request; custom EQ data returned |
| Write custom EQ | `0xF041` | `0x7041` | Count, preamp and filter records |
| Dirac/Opteo preset selection in reference repo | `0xF01D` | Not tested here | Preset number; not a custom filter list |

**Our experiments do not use `0xF01D` to write filters.** They use `0xF041` and verify with `0xC044`. The presence of Dirac/Opteo preset commands does not establish whether custom filters are implemented inside Dirac or in a separate processing stage.

We tested with Nothing X’s Custom EQ mode already selected. The tools do not issue a preset-selection command to activate Custom mode. Select Custom in Nothing X before switching to the Windows control connection when reproducing the setup.

### Packet framing

Multi-byte integers and filter floats are little-endian. Offsets are zero-based.

| Offset | Size | Field |
|---:|---:|---|
| 0 | 1 | Start byte `0x55` |
| 1 | 2 | Control field |
| 3 | 2 | Command |
| 5 | 2 | Payload length, excluding header and CRC |
| 7 | 1 | Request sequence number |
| 8 | Variable | Payload |
| 8 + payload length | 2 | CRC16 when control bit `0x20` is set |

Our tested request control value is `0x0660` (wire bytes `60 06`). The Android capture also contained other control/device-type values, including `0x0160`. The exact meaning of all control flags and device-type routing values was not exhaustively investigated; the implementation uses values verified on this device.

CRC16 starts at `0xFFFF`, XORs each byte into the low byte, and performs eight reflected shifts using polynomial `0xA001`. It covers the complete header and payload, excluding the CRC itself; the result is appended little-endian. The encoder was checked against a captured packet, and live response CRCs are validated.

Example firmware query from the capture:

```text
55 60 01 42 c0 00 00 4c a1 25
```

The implementation buffers RFCOMM input because stream reads can split or combine protocol packets. It matches responses using both the expected response command (`request & 0x7FFF`) and sequence number, while ignoring unrelated notifications. It checks the response status rather than treating any response as success.

## Custom EQ payload format

The APK and capture agree on this layout:

| Offset | Size | Meaning |
|---:|---:|---|
| 0 | 1 | Filter count `N` |
| 1 | 4 | Overall gain / preamp, IEEE-754 float32 in dB |
| 5 + 13 × i | 1 | Filter type for zero-based filter `i` |
| 6 + 13 × i | 4 | Gain, float32 in dB |
| 10 + 13 × i | 4 | Frequency, float32 in Hz |
| 14 + 13 × i | 4 | Quality factor Q, float32 |

Each filter record occupies **13 contiguous bytes**. It is not a 16-byte record with interleaved padding.

The official `CustomEQ` serializer allocates `5 + 16 × N` bytes but fills only `5 + 13 × N`. This leaves **3 × N zero bytes at the end of the write payload**. Our encoder preserves this convention.

| Filters | Record data + header | Write payload including trailing zeros |
|---:|---:|---:|
| 3 | 44 bytes | 53 bytes |
| 4 | 57 bytes | 69 bytes |
| 5 | 70 bytes | 85 bytes |
| 6 | 83 bytes | 101 bytes |
| 7 | 96 bytes | 117 bytes |
| 8 | 109 bytes | 133 bytes |
| 9 | 122 bytes | 149 bytes — did not retain requested configuration |
| 10 | 135 bytes | 165 bytes — did not retain requested configuration |

The observed read-response payload is **109 bytes**, equal to `5 + 8 × 13`. With fewer filters, bytes after the declared records can contain nonzero opaque data. We do not interpret that remainder as additional active filters or replay it as write padding. Matching settings means comparing the declared filters and preamp after float32 encoding, not comparing opaque trailing read bytes.

The fixed read size supports an eight-slot interpretation, but firmware code was not inspected. Compact writes without the official serializer’s trailing padding were not tested.

### Filter types

| Type byte | APK name | Validation performed |
|---:|---|---|
| 0 | Low shelf | Stock bass filter captured and read back |
| 1 | Peak | Additional filters and AutoEQ applied/read back/listened to |
| 2 | High shelf | Stock treble filter captured and read back |
| 3 | Low pass | Defined in APK; not independently tested |
| 4 | High pass | Defined in APK; not independently tested |

The local AutoEQ importer currently supports `PK`, `LS` and `HS` exports. Definitions for other types in the APK are not proof of their behavior on this firmware.

## Stock three-slider EQ

| Slider | Type | Frequency from APK and capture | Q |
|---|---|---:|---:|
| Bass | Low shelf | **140 Hz** | **0.80** |
| Mid | Peak | **980 Hz** | **0.66** |
| Treble | High shelf | **3,500 Hz** | **1.00** |

The capture’s record order was **mid, treble, bass**. Each isolated +2 slider change appeared as +2.0 dB in its corresponding record. The APK computes overall gain as `−max(0, slider gains)`: flat settings yielded negative zero, and a single +2 dB boost yielded −2 dB overall gain. Therefore moving a stock slider can change both its filter gain and the global preamp.

The review lists 135 Hz for bass and 1,000 Hz / Q 0.7 for mid, while treble matches exactly. The cause of these small differences is unknown. We use the exact captured/APK values for this app version, rather than assuming the review’s simulation values are wire parameters.

The three-control UI is created in `BaseEqualizerViewModel`. `CustomEQ.obtainDataPacket()` takes a list and loops over its actual length, with no explicit three-filter restriction in that serializer. A separate `core/entity/EQEntity` class has a profile-index byte and a different layout; it is **not** the format used in these tests.

### Relevant decompiled files

Paths below are under `research/nothing-x-source/sources/`:

| File | Useful location |
|---|---|
| `com/nothing/forretress/core/equalizer/EqualizerViewModel.java` | Lines 60–65: exact frequencies and Q values; `getFreq()` / `getQ()` overrides |
| `com/nothing/earbase/equalizer/viewmodel/BaseEqualizerViewModel.java` | Line 167: three UI controls; line 759: filter construction; line 826: preamp and payload construction |
| `com/nothing/earbase/equalizer/entity/CustomEQ.java` | Filter type constants; parser; serializers at lines 62 and 138 |
| `com/nothing/core/ext/TWSDeviceExtKt.java` | Line 557: custom EQ command routing |
| `com/nothing/base/protocol/constant/ProtocolConstant.java` | Command definitions |
| `com/nothing/protocol/model/Message.java` | Packet framing and CRC handling |
| `com/nothing/base/util/Utils.java` | Line 356: CRC16, polynomial `0xA001` |

JADX completed with 373 decompilation errors, including framework and coroutine methods. The listed custom serializer/parser, slider mapping and command routing were readable and matched live captures. We did not treat the entire decompiled app as error-free source.

## Experiments and evidence

### Capture

Android HCI snoop logging was enabled, Bluetooth reconnected, and the owner performed a sequence of flat EQ, isolated +2 changes to bass/mid/treble, and resets. Xiaomi’s developer menu did not expose a bug-report action, so ADB was used to export the report.

The report contained `FS/data/misc/bluetooth/logs/btsnoop_hci.log`. The extracted log contained **6,673 records with no truncated records**, covering approximately 21:59:42–22:07:39 IST. Selected EQ writes and reads were saved separately.

### Filter count and playback

| Count | Wire/readback test | Playback observation |
|---:|---|---|
| 3 | Original flat configuration captured and backed up | Baseline |
| 4 | Added peak at 2 kHz, −3 dB, Q 1; exact readback | Owner later confirmed A/B with fourth filter 0 vs −6 dB |
| 5 | Added fifth peak at 500 Hz, −6 dB, Q 1; exact readback | Owner confirmed fifth-filter effect |
| 6 | Neutral extra filters; exact readback | Not isolated individually |
| 7 | Neutral count test and later full AutoEQ verified | Owner confirmed AutoEQ playback |
| 8 | Neutral count test; eighth-filter 1 kHz, −6 dB comparison verified | Owner confirmed eighth-filter effect |
| 9 | ACK status 0, but readback count 3; requested settings not retained | Not accepted as a valid nine-filter test |
| 10 | Separate test: ACK status 0, readback count 3 | Not accepted as a valid ten-filter test |

Every automated count test restored and read back the original EQ afterward. The failure at nine was followed by one separate ten-filter attempt because the owner specifically wanted ten; no counts above ten were probed.

**A successful ACK is insufficient evidence.** A useful write test requires matching readback, and DSP-effect claims additionally need listening or acoustic measurements.

### Persistence

The page saves expected settings, closes its RFCOMM connection, asks the owner to power the headphones off/on, then reconnects and queries settings. It does not send an EQ write before the persistence read.

| Profile | Log event time | Result |
|---|---|---|
| Five-filter experiment | 22:49:28 IST | All declared settings matched; owner confirmed power cycle |
| Seven-filter AutoEQ | 23:05:04 IST | All filters and −6.1 dB preamp matched; owner confirmed power cycle and playback |

The eight-filter profile’s listening test was confirmed, but a distinct eight-filter power-cycle test was not recorded. Five- and seven-filter persistence should not be silently relabeled as an eight-filter persistence test.

## AutoEQ profile

The initial ten-filter file was inspected but not applied. After the eight-filter boundary was found, the owner exported a new profile from `CMF Headphone Pro Filters.txt`.

**Overall preamp: −6.1 dB.** All active filter values were preserved; no optimization or retuning was performed by the importer.

| Filter | Type | Frequency | Gain | Q |
|---:|---|---:|---:|---:|
| 1 | Peak | 29 Hz | −0.9 dB | 2.0 |
| 2 | Peak | 50 Hz | −5.4 dB | 0.5 |
| 3 | Peak | 60 Hz | +1.0 dB | 1.0 |
| 4 | Peak | 240 Hz | −4.5 dB | 1.5 |
| 5 | Peak | 2,000 Hz | +2.5 dB | 1.2 |
| 6 | Peak | 5,900 Hz | +3.8 dB | 1.1 |
| 7 | Peak | 10,000 Hz | +4.8 dB | 2.0 |
| 8 | OFF | Placeholder 0 Hz | 0 dB | 0 |

Filter 8 is disabled and omitted, so **seven** filters are transmitted. An invalid 0 Hz / Q 0 placeholder is not sent to the headphones.

The `autoeq` state sends these seven filters and −6.1 dB global gain. `autoeq-flat` sends the same frequencies, Q values and types with all individual gains zero, retaining the −6.1 dB global gain. This controls global attenuation during comparison; it does not promise equal perceived loudness between different spectral responses.

Readback uses float32, so values such as −6.1 may print as −6.0999999046. These small differences are representation effects, not retuning or clamping. The encoded requested and read-back values matched.

The target condition is **ANC maximum**. The page does not set ANC or the physical energy slider; set these yourself. The exact acoustic match to the AutoEQ target has not been measured.

## Tools and reproduction

The custom Python tools use the standard library; no pip packages are needed. ADB and JADX are only needed for repeating capture/decompilation, not for normal EQ control.

Run commands from PowerShell:

```powershell
Set-Location 'D:\Projects\CMF-Rev'
python .\tools\python\cmf_probe.py --self-check
python .\tools\python\eq_web_server.py
```

Open `http://127.0.0.1:8765/`. Select CMF Headphone Pro as Windows audio output, keep phone Bluetooth disconnected, and connect on the page. Select Custom mode in Nothing X beforehand if needed.

| Tool | Purpose |
|---|---|
| `tools/python/cmf_probe.py` | Windows RFCOMM transport, packet encoder/parser, CRC, EQ encode/decode; default invocation reads and backs up settings |
| `tools/python/cmf_probe.py --self-check` | Checks the encoder against six captured writes and CRC against a captured query |
| `tools/python/cmf_probe.py --test-four` | Writes a fourth-filter trial, reads it back and restores baseline |
| `tools/python/eq_limit_test.py` | Tests counts 6–10 with neutral extra filters, stopping at first mismatch and restoring after each attempt |
| `tools/python/eq_limit_test.py --counts 10` | Repeats the specific ten-filter test; not needed for normal use |
| `tools/python/autoeq_import.py` | Imports APO-style filter text into `profiles/autoeq-profile.json`; skips OFF entries and rejects more than eight active filters |
| `tools/python/eq_web_server.py` | Loopback-only HTTP server and serialized Bluetooth actions |
| `tools/python/eq-web/` | Test page, JavaScript and styling |

To import a future profile:

```powershell
python .\tools\python\autoeq_import.py 'C:\path\to\new-filters.txt'
```

The server loads the JSON profile at startup, so restart it after importing. The current profile summary in the HTML is static and must be updated if filter count/preamp change.

### Page behavior

- The fourth-, fifth- and eighth-filter A/B buttons change real headphone settings. The browser generates a tone or plays a local audio file; it does not implement software EQ on that sound.
- Test tones are short bursts with low digital amplitude. Begin at a low Windows volume.
- Every applied EQ is followed by a readback comparison.
- `Restore original` restores the three-filter settings backed up at the beginning of the server session. This is not a factory reset or a preset change.
- Closing the page does **not** restore the EQ. The headphones retain the last applied configuration, including across confirmed power cycles.
- The server attempts to restore modified settings on a graceful shutdown when its Bluetooth connection remains available. Forced process termination can prevent cleanup. Do not rely on process shutdown as the restore workflow.
- A reboot check disconnects control without restoring so persistence can be tested. Keep the server process alive, power-cycle the headphones, and reconnect through the page.

### Current implementation limitations and recovery

The server retains its original baseline in memory for the session and writes timestamped backup files. A brand-new server process expects a three-filter baseline. If the headphones retain a seven/eight-filter profile from a previous session, the new server currently rejects it as a starting baseline rather than guessing what `Restore original` should mean.

The original three-filter backup remains available, for example `artifacts/backups/eq-web-backup-20261014-230046.json`. A later backup can contain the AutoEQ profile, so inspect the `eq.count` and settings before selecting a recovery file. Do not assume the most recent backup is the original baseline.

To restore a verified original backup when the server is not holding the control connection, use this PowerShell/Python snippet. Replace the Bluetooth address with your unit’s address if necessary:

```powershell
Set-Location 'D:\Projects\CMF-Rev'
@'
import json
import sys
sys.path.insert(0, 'tools/python')
from cmf_probe import Control, decode_eq, encode_eq
backup = json.load(open('artifacts/backups/eq-web-backup-20261014-230046.json'))
eq = backup['eq']
assert eq['count'] == 3, 'Choose a verified original three-filter backup'
device = Control('2C:BE:EE:A2:FF:CF')
try:
    device.request(0xc001)
    device.request(0xf041, encode_eq(eq))
    actual = decode_eq(device.request(0xc044))
    assert encode_eq(actual) == encode_eq(eq), 'Restore readback mismatch'
    print('Original EQ restored and verified')
finally:
    device.close()
'@ | python
```

After a headphone disconnect, a request may report Windows socket error 10053. The server does not yet automatically reconnect every stale socket. The explicit Prepare reboot check / Connect workflow closes and replaces the connection. For other failures, release the old connection before starting another probe; competing control clients can interfere.

## Evidence files

All paths here are relative to the project folder. Keep private capture material local; the full Android bug report contains more device information than this EQ investigation needs.

| Artifact | Contents |
|---|---|
| `artifacts/captures/cmf-eq-bugreport.zip` | Private Android bug report, approximately 19 MB |
| `artifacts/captures/cmf-eq-btsnoop.log` | Extracted HCI capture, 1,398,927 bytes |
| `tests/fixtures/eq-capture-packets.json` | Selected original EQ packets and timestamps |
| `research/nothing-x-3.10.0.apk` | Installed app copied from phone |
| `research/nothing-x-source/` | Local JADX output |
| `artifacts/reports/four-filter-test-20261014-223525.json` | Four-filter trial, matching readback, successful restoration |
| `artifacts/reports/eq-limit-test-20261014-225209.json` | Counts 6–8 matched; count 9 did not; restorations |
| `artifacts/reports/eq-limit-test-20261014-225247.json` | Separate count 10 failure and restoration |
| `artifacts/logs/eq-web-events.jsonl` | Applied/read-back EQ events and persistence comparisons |
| `profiles/autoeq-profile.json` | Imported seven-filter profile, preamp, disabled-filter metadata |
| `artifacts/reports/autoeq-device-verification.json` | Full matching AutoEQ device readback |
| `artifacts/backups/eq-backup-*.json`, `artifacts/backups/eq-web-backup-*.json` | Timestamped settings backups |
| `artifacts/logs/probe-log-*.json` | Raw transmitted/received control bytes saved when connections close |

The active server keeps its raw connection log in memory until the connection closes. Do not stop it solely to flush logs while relying on its session baseline or reboot-test state.

## What remains unknown

- Whether custom EQ executes inside Dirac or a separate DSP stage.
- Whether another command/encoding exposes more than eight filters.
- Full firmware-accepted gain, frequency, Q and preamp ranges; tested values are not exhaustive bounds.
- Behavior of independently selected low-pass/high-pass filters.
- Whether every stored filter behaves exactly like a particular software biquad implementation.
- Measured acoustic response, clipping/headroom margin, distortion, and exact target-curve agreement.
- Eight-filter reboot persistence as a separate recorded test; seven-filter AutoEQ persistence is confirmed.
- Interaction with other modes, codecs, wired playback, physical slider changes, factory resets, and future firmware updates.
- Whether opening Nothing X merely reads the custom configuration or overwrites it in some flows. Moving its stock sliders should be treated as potentially replacing the custom filter list.

These findings are based on APK inspection, captured traffic, reversible live writes, readback, and owner listening/power-cycle reports. No firmware image was modified, no firmware flash was performed, and no acoustic measurement rig was used.
