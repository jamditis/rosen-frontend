# Archived feature-audit machinery

This directory preserves historical evidence from the completed June 2026 feature audit.

Do not run these scripts against current code. Their selectors, paths, dependencies, and phase assumptions describe the audited snapshot.

Current maintenance tooling remains one level up:

- `../build.mjs` rebuilds the feature catalog and CSV.
- `../validate-csv.mjs` checks the generated CSV.
- `../harness/` contains only harness files that current regression tests still inspect.

The archived scripts retain their helper snapshot and relative evidence roots. They are mechanically runnable for investigation, but results against current code are not historical audit evidence. Use the original audited commit when exact reproduction is necessary.
