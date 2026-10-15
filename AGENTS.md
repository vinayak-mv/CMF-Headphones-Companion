# Repository Guidelines

## Project Structure & Module Organization

This workspace investigates CMF Headphone Pro EQ over Windows Bluetooth Classic RFCOMM. A Rust application is planned; no Cargo project exists yet. Reserve the root for its future `Cargo.toml` and `src/`.

- `tools/python/cmf_probe.py`: packet encoding, CRC validation, Bluetooth control, and inspection CLI.
- `tools/python/eq_web_server.py`: local HTTP server and verified EQ writes; `tools/python/eq-web/` contains its HTML, CSS, and JavaScript UI.
- `tools/python/autoeq_import.py`: Equalizer APO text import into `profiles/autoeq-profile.json`.
- `tools/python/eq_limit_test.py`: hardware filter-count experiments.
- `docs/EQ-investigation.md`: protocol findings, evidence, reproduction, and recovery instructions; `README.md` provides quick setup.
- `tests/fixtures/`: offline packet fixture.
- `research/` and `vendor/`: decompiled sources, copied APK, and bundled tools with notices.
- `artifacts/`: local captures, backups, logs, and reports. These three directories are ignored by Git.

## Build, Test, and Development Commands

Run from the repository root in PowerShell. Python tools use only the standard library; there is no build step or frontend package installation.

- `python .\tools\python\eq_web_server.py`: serve the UI at `http://127.0.0.1:8765/`.
- `python .\tools\python\cmf_probe.py --self-check`: validate serialization against captured packets without connecting to hardware.
- `python .\tools\python\cmf_probe.py --mac <device-address>`: read device settings.
- `python .\tools\python\autoeq_import.py 'C:\path\to\filters.txt'`: replace the local profile JSON from filter text.
- `python .\tools\python\eq_limit_test.py --counts 6 7 8`: run hardware trials that write settings and restore the baseline.

## Coding Style & Naming Conventions

Use four-space Python indentation, `snake_case` functions and variables, and uppercase constants. Follow surrounding quote and formatting conventions. Keep browser code dependency-free and reuse existing DOM/API patterns. No formatter or linter configuration is present. Avoid mass-formatting decompiled sources or bundled tools.

## Testing Guidelines

Do not run automated tests, locally or in CI, unless the user explicitly changes this instruction. GitHub Actions builds the Windows app without running tests.

For hardware changes, record firmware, requested settings, matching readback, and verified restoration; an ACK alone is insufficient. Save reports under `artifacts/reports/` with names like `eq-limit-test-YYYYMMDD-HHMMSS.json`.

## Commit & Pull Request Guidelines

This checkout has no Git metadata, so existing commit conventions cannot be established. Use concise imperative subjects, such as `Fix EQ readback validation`. PRs should explain behavior changes, commands run, hardware evidence when applicable, and screenshots for UI changes.

## Device Safety & Private Artifacts

Confirm the target Bluetooth address and preserve the original three-filter baseline before writes. Follow recovery instructions in `docs/EQ-investigation.md`; closing the browser does not restore EQ. Keep the server bound to loopback. Review private artifacts before sharing; preserve ignored backups separately.
