# CMF Headphone Pro EQ investigation

Tested on firmware **1.0.1.49** with Nothing X **3.10.0**, 14 October 2026.

The headphone accepts **eight custom EQ filters** through `0xF041`; nine and ten did not retain their requested settings. The owner confirmed eighth-filter playback effect. A seven-filter AutoEQ profile with **−6.1 dB preamp** was verified and survived a power cycle.

Read [the full investigation](docs/EQ-investigation.md) for packet format, command distinctions, APK findings, experiments, evidence, reproduction instructions, and remaining unknowns.

## Run the local page

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

The root is available for the Rust app's `Cargo.toml` and `src/` when its
structure is chosen. No Rust application has been initialized yet.

Run `python .\tools\python\cmf_probe.py --self-check` for offline protocol
validation. Generated files go into `artifacts/` regardless of the working
directory. Existing backup filenames and contents have been preserved.

`.gitignore` excludes local artifacts, research exports, bundled tools, caches,
and Rust build output. Preserve the local backups; ignored files are not
protected by Git. Agent-specific settings remain in `.claude/`.
