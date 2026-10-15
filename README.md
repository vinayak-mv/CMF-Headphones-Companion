# CMF Headphone Pro EQ investigation

Tested on firmware **1.0.1.49** with Nothing X **3.10.0**, 14 October 2026.

The headphone accepts **eight custom EQ filters** through `0xF041`; nine and ten did not retain their requested settings. The owner confirmed eighth-filter playback effect. A seven-filter AutoEQ profile with **−6.1 dB preamp** was verified and survived a power cycle.

Read [the full investigation](docs/EQ-investigation.md) for packet format, command distinctions, APK findings, experiments, evidence, reproduction instructions, and remaining unknowns.

## Run the local page

The Rust desktop editor lives in `src/` and `ui/`. Its compact window has
Controls, Equalizer, and Profiles tabs; no page scrolling is needed. GitHub
Actions builds the Windows executable without automated tests. Push changes
and download `cmf-eq-windows-x64` from the workflow's artifacts.

The desktop app now includes a read-only Windows Bluetooth Classic
connection. Pair the headphones in Windows Bluetooth settings, power them
on, then use **Controls → Refresh**, select the headphone name and Bluetooth
address, and click **Connect headphones**. Close the Python probe/server or
Nothing X if it holds the control connection. The app resolves the Nothing
service through SDP rather than assuming RFCOMM channel 28.

Connection reads protocol/firmware, custom EQ, battery, ANC and spatial-audio
state. Optional read failures remain unknown and appear in status details.
Settings refresh while the app is visible; **Profiles → Read device** also
refreshes them. **Review device EQ → Use in editor** explicitly copies the
readback into the draft. Connection and reconnect never apply the draft.
Disconnect closes the control connection without changing headphone EQ.

EQ Apply/Restore, ANC/spatial writes and Windows volume remain unavailable.
The new Rust transport still requires a GitHub Actions build and live-device
verification; the earlier Python hardware findings are not verification of
this Rust connection implementation.

The commands below run the older Python investigation page.

```powershell
Set-Location 'D:\Projects\CMF-Rev'
python .\tools\python\eq_web_server.py
```

Open `http://127.0.0.1:8765/`. Keep the phone disconnected, use the headphones as Windows audio output, and set ANC to maximum for this AutoEQ profile.

The tools currently target this unit’s Bluetooth address. A fresh server expects the original three-filter baseline; see the full document’s recovery instructions if the headphones retain AutoEQ from an earlier session. Closing the browser does not restore EQ.

Private Android bug reports, Bluetooth captures and the copied APK are local investigation artifacts. Review them before sharing this folder.

## Workspace layout

The planned Windows Rust app is specified in
[Rust app specification](docs/RUST-APP-SPEC.md): ANC, battery, spatial audio,
Windows playback volume, and eight-band parametric EQ with AutoEQ import.

- `tools/python/`: working Python EQ prototype and its static web UI.
- `profiles/`: active EQ profile configuration.
- `tests/fixtures/`: captured packet fixture used by the offline self-check.
- `docs/`: protocol investigation and recovery instructions.
- `artifacts/`: local backups, logs, reports, and private captures.
- `research/`: copied Nothing X APK and decompiled reference sources.
- `vendor/`: bundled Android platform-tools and JADX, including their notices.

`Cargo.toml`, `src/`, and `ui/` contain the Rust/Tauri app. `.github/workflows/`
contains its Windows build workflow.

Automated tests and self-checks are not run unless explicitly requested.
Generated Python files go into `artifacts/` regardless of the working
directory. Existing backup filenames and contents have been preserved.

`.gitignore` excludes local artifacts, research exports, bundled tools, caches,
and Rust build output. Preserve the local backups; ignored files are not
protected by Git. Agent-specific settings remain in `.claude/`.
