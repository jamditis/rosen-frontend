# Backend scripts overview

This directory gathers stand-alone scripts and legacy utilities that are **not**
part of the core ingestion pipeline in `src/`. They are grouped by their focus
area so it is easier to find maintenance helpers without wading through the
production package.

- `corrector.py` – Canonical range-safe smart-corrector CLI. It is dry-run by
  default and accepts all historical row selections through `--rows` and `--limit`.
- `backfill/` – Historical Google Sheets backfill scripts (`*date_backfill.py`,
  `bulk_reprocessor.py`, `backfill_worker.py`). They reprocess rows or patch
  missing metadata and should be run manually only when the live pipeline is
  paused.
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
