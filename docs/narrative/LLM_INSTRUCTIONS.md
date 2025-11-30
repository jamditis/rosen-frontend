# LLM Instructions for the Rosen Digital Archive Project

**Objective:** Hand-off guidance for an LLM contributor resuming backend and data-quality work on the Jay Rosen Digital Archive.

---

## 1. Critical Status Summary

- **AI Categorization:** The October 2025 failure that collapsed taxonomy diversity has been partially mitigated. `src/rosen_scraper/categorizer.py` now rejects uniform Gemini responses and saves raw payloads to `logs/ai_responses/`. You must verify that production runs generate diverse classifications before reprocessing the archive.
- **Tooling Layout:** Maintenance scripts moved from `tools/` into `scripts/` (`backfill/`, `pdf/`, `diagnostics/`, `manual_tests/`). Update any ad-hoc commands accordingly.
- **Dependencies:** All Python packages are managed by Poetry in `pyproject.toml`; remember to run `playwright install` after `poetry install`.

---

## 2. Project Overview

1. **Runtime Pipeline (`src/rosen_scraper/`):** `workflow.py` orchestrates scraping, Gemini enrichment, logging, and PDF/transcript generation. Processors under `src/rosen_scraper/processors/` handle article, video, and audio inputs.
2. **Diagnostics & Maintenance (`scripts/`):** Manual backfill and audit scripts now live under `scripts/`, keeping the production package focused.
3. **Documentation:** Narrative context is in `narrative/` (see `PROJECT_LOG.md` v2.10.2 for the latest consolidation notes).

---

## 3. Immediate Priorities

### Priority A — Validate Gemini Enrichment
1. Confirm credentials: `echo $env:GEMINI_API_KEY` (PowerShell) or `echo $GEMINI_API_KEY`.
2. Run the syntax guard: `poetry run pytest tests/test_analyze_key_concepts_syntax.py`.
3. Execute a targeted sanity check (craft a minimal harness or extend `src/rosen_scraper/categorizer.py` to process a known article) and inspect `logs/ai_responses/` for dumps triggered by validation failures.
4. If Gemini still returns uniform data, pause full runs and investigate prompts/config (see `src/rosen_scraper/categorizer.py` and `schema.json`).

### Priority B — Spot Test the Pipeline
1. Use a limited ingest: `poetry run python src/rosen_scraper/workflow.py` with a small `urls_to_scrape` queue, or invoke the article processor manually via a REPL.
2. For bulk reprocessing, call `poetry run python scripts/backfill/bulk_reprocessor.py` only after confirming the validation logic behaves as expected. Start with a handful of URLs before scaling.

### Priority C — Resume Key Concepts Processing
1. Continue batching: `poetry run python src/rosen_scraper/key_concepts_updater.py --limit 100` (auto-resumes from `key_concepts_progress.json`).
2. After the backlog is complete, run `poetry run python src/rosen_scraper/analyze_key_concepts.py` and review the report for taxonomy balance.

### Priority D — Data Hygiene Tasks
1. Run `poetry run python scripts/diagnostics/data_deduper.py` to normalize multi-value fields and update entity mentions.
2. Execute `poetry run python scripts/diagnostics/data_improver.py` to refresh metadata using existing `raw_text`.
3. `poetry run python scripts/backfill/backfill_worker.py` remains available for filling `pull_quote`/`raw_text`.

### Priority E — Documentation & Change Log
1. Capture material changes in `narrative/PROJECT_LOG.md`, `ARCHITECTURE.md`, and `README.md`.
2. Note any Gemini prompt or schema tweaks in `narrative/KEY_CONCEPTS_SYSTEM.md`.

---

## 4. Environment Setup Checklist

1. `poetry install`
2. `playwright install`
3. Ensure `.env` exposes `GEMINI_API_KEY`, `SPREADSHEET_NAME`, and Google credentials (default `google_credentials.json`).
4. Verify writable directories: `logs/`, `data/processed_pdf_library/`, and `data/processed_transcripts/`.

---

## 5. Useful References

- `narrative/PROJECT_LOG.md` — chronological history and recent release notes (v2.10.1–2.10.2).
- `narrative/KEY_CONCEPTS_SYSTEM.md` — AI taxonomy design and processing history.
- `CLAUDE.md` — operational runbook for higher-level task orchestration.
