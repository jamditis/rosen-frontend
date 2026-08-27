# Backend scripts overview

This directory gathers stand-alone scripts and legacy utilities that are **not**
part of the core ingestion pipeline in `src/`. They are grouped by their focus
area so it is easier to find maintenance helpers without wading through the
production package.

- `corrector.py` – Canonical range-safe smart-corrector CLI. It is dry-run by
  default and accepts all historical row selections through `--rows` and `--limit`.
- `backfill/` – Backfill scripts that patch missing fields after ingestion
  (`date_backfill.py`, `backfill_missing_dates.py`, `backfill_worker.py`,
  `bulk_reprocessor.py`). Run them by hand only when the live pipeline is
  paused. Every entry point runs under `python -m`; there are no `run_*.py`
  path wrappers left. See `backfill/README.md`.
- `pdf/` – Batch PDF experiments and accessibility tooling that supplement the
  main `src/pdf_generator.py` (e.g., `regenerate_pdfs.py`, `enhanced_pdf_generator/`).
- `diagnostics/` – One-off analysis utilities (concept reports, schema builders,
  Google Sheets audits, Gemini tests). Useful for investigations but not called
  from production code.
- `manual_tests/` – Legacy smoke-test scripts that predate the pytest suite.
  Keep them for reference or ad hoc spot checks; prefer adding formal tests in
  `tests/` for new coverage.

Nothing in `scripts/` is imported by the runtime pipeline, so moving these scripts
out of `src/` keeps the primary package lean while preserving institutional
knowledge for future debugging sessions.
