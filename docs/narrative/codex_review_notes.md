# Codex Review Notes (2025-10-13)

## Snapshot
- End-to-end pipeline lives in `src/rosen_scraper/workflow.py`, moving rows from Google Sheets (`urls_to_scrape` → `test_runs`) through scraping, Gemini-based enrichment, and PDF/transcript generation.
- Content acquisition cascades through Google URL Context (`src/rosen_scraper/scraper.py`) with `requests` and Playwright fallbacks, while categorization flows through Gemini (`src/rosen_scraper/categorizer.py`).
- Observability relies on the structured logging/poison-pill system in `src/rosen_scraper/logger.py` and `src/rosen_scraper/poison_pill_handler.py`; operational history is well documented in `narrative/`.
- Frontend in `frontend/` is a static, accessibility-focused explorer that assumes clean taxonomy data coming from the Sheets-backed pipeline.

## Strengths
- Multi-layer scraping cascade plus Google URL Context keeps extraction resilient and minimizes unnecessary Playwright runs.
- Logging stack captures performance metrics, poison pill summaries, and session reports—good foundation for auditing long runs.
- Extensive narrative/architecture docs shorten onboarding and explain historical decisions.
- Frontend emphasizes accessibility, progressive enhancement, and detailed concept narration aligned with research goals.

## Risks & Issues
- **Blocking bug:** `src/rosen_scraper/analyze_key_concepts.py:30` has a malformed default string for `SPREADSHEET_NAME`, so the script will not execute. This likely broke recent taxonomy analysis runs.
- **Categorization regression:** `frontend/README.md:79` documents that all 725 rows now share identical thematic values, eras, scopes, and tags—pointing to a systemic Gemini failure. Downstream UI filters will remain broken until the enrichment pipeline produces diverse classifications again.
- **API fragility:** `src/rosen_scraper/categorizer.py` and `src/rosen_scraper/scraper.py` bail out when `GEMINI_API_KEY` is missing or when Gemini errors, causing silent skips. There is no retry/backoff strategy or local fallback, so transient Gemini issues can erase outputs.
- **Testing gap:** The `test_*.py` files are interactive smoke scripts; there is no automated pytest coverage guarding core behaviors (ID generation, schema conformance, poison pill routing, Google Sheets I/O).
- **Dependency & deployment friction:** `pyproject.toml` is unpinned, mixes `google-generativeai` and `google-genai`, and references `playwright-stealth` without any imports. Playwright also requires a post-install step (`playwright install`) that is undocumented.
- **Logic duplication:** `scripts/backfill/bulk_reprocessor.py` re-implements ID generation, enrichment, and sheet-writing logic found in `src/workflow.py`, inviting drift between batch and streaming paths.
- **Config surface:** Sensitive settings come from `.env`, but defaults and validation are inconsistent (e.g., hard-coded credential filenames, global singleton loggers). This impedes running multiple workers or staging environments.
- **Data safety:** There is no checksum or schema validation before writing rows back to Sheets, so malformed Gemini JSON could silently corrupt production data.

## Recommendations
1. Repair `src/rosen_scraper/analyze_key_concepts.py` and add a lightweight syntax/unit test to prevent similar regressions.
2. Investigate the Gemini classification collapse: log raw model responses, add guardrails that detect uniform outputs, and block writes when enrichment looks suspicious. Consider versioning prompts/config in Git.
3. Introduce a configuration layer (e.g., pydantic settings or dynaconf) that validates API keys, sheet IDs, and file paths at startup; fail fast with actionable messages.
4. Wrap Gemini calls with retry/backoff, explicit error classes, and optional caching so transient outages do not wipe runs. Evaluate batching requests or using a local model fallback for taxonomy tagging.
5. Consolidate shared helpers (ID generation, enrichment, sheet writes) into a dedicated module to keep the streaming workflow and `scripts/backfill/bulk_reprocessor.py` in sync.
6. Pin dependency versions, document the Playwright install step, and clarify whether both `google-generativeai` and `google-genai` are required; drop unused packages like `playwright-stealth` unless they ship soon.
7. Stand up a pytest suite with fixtures that mock Gemini and Google Sheets. Focus first on ID generation, poison pill classifications, data enrichment, and schema adherence.
8. Add data validation: enforce taxonomy membership, ensure arrays are serialized consistently, and check for key fields before posting results to Sheets or the frontend.

## Questions / Follow-Ups
- How are Gemini API keys rotated and monitored for quota usage? Would Secret Manager or key expiry alarms help?
- Do we need an offline or cached mode for re-processing historical rows without incurring fresh Gemini costs?
- Should we archive raw Gemini responses (with PII scrubbing) for audit/debug purposes?
- Is there appetite for separating the Google Sheets adapter from core logic to support future database or JSON exports?

## Opportunities
- Introduce a task queue (e.g., Redis + RQ or Celery) so multiple workers can process URLs concurrently with backpressure.
- Snapshot final datasets to versioned storage (S3/Drive) after each run, giving rollback options beyond Google Sheets history.
- Surface poison pill summaries and session metrics via a simple status dashboard, improving monitoring during long ingestions.
- Expand frontend tooling to consume cached JSON exports, enabling local demos even when Sheets access is restricted.
