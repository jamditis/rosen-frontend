# Repository Guidelines

---

## 🚀 INTEGRATION PROJECT (October 28, 2025)

**IMPORTANT:** Before making any changes to this repository, read the integration plan:
- **`C:\Users\amdit\OneDrive\Desktop\Crimes\playground\INTEGRATION_PLAN.md`** (60-page plan)
- **`narrative/PROJECT_LOG.md`** - Entry [2.14.0]
- **`narrative/QUICK_START.md`** - Todo list

**Current Focus:** Integrating newspaper archive (84 articles) with main archive (765+ records) and Windows 95 frontend.

---

## Project Structure & Module Organization
- Runtime pipeline lives in `src/`, with orchestrators (`workflow.py`), scraping/categorization modules, and processors for article/video/audio content.
- One-off maintenance utilities reside in `tools/` (`backfill/`, `pdf/`, `diagnostics/`, `manual_tests/`). Nothing there is imported by production code.
- Frontend assets are in `frontend/`; narrative and operational docs live in `narrative/`.
- Tests that run under pytest are in `tests/`; legacy smoke scripts remain in `tools/manual_tests/`.

## Build, Test, and Development Commands
- `pip install -r requirements.txt` — install pinned backend dependencies; run `playwright install` afterward for browser binaries.
- `pytest` or `pytest path/to/test.py` — execute automated tests (currently only syntax guard). Extend coverage here.
- `python src/workflow.py` — run the end-to-end scraping/enrichment pipeline (requires Google credentials and Gemini keys).
- Maintenance scripts are invoked from `tools/`, e.g., `python tools/backfill/backfill_worker.py`.

## Coding Style & Naming Conventions
- Python code uses 4-space indentation. Follow PEP 8 unless project-specific patterns dictate otherwise.
- Module names are lowercase with underscores; classes use PascalCase; functions/variables use snake_case.
- JSON and Markdown files should stay ASCII unless existing content requires UTF-8 (e.g., narrative logs).

## Testing Guidelines
- Pytest is the preferred framework. Name new tests `test_*.py` and place them in `tests/`.
- When adding functionality, include unit tests or integration stubs that can run without external services (mock Gemini/Sheets where possible).
- Manual scripts in `tools/manual_tests/` are legacy; migrate useful coverage into pytest suites.

## Commit & Pull Request Guidelines
- Follow conventional, descriptive commit messages (`feat:`, `fix:`, `chore:`) similar to recent history.
- Pull requests should describe scope, testing performed, and link to relevant issues or narrative entries. Include before/after details for data or schema changes.

## Credentials & Configuration
- Use `.env` for secrets (`GEMINI_API_KEY`, Google service account paths). Never commit real credentials.
- After installing dependencies on a new machine, run `playwright install` and verify Google credentials in `google_credentials.json` are accessible.
