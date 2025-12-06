# Repository Guidelines for AI Agents

> **Note:** This file provides coding guidelines for AI assistants working on this repository.
> For comprehensive project context, see [CLAUDE.md](../CLAUDE.md) in the repository root.

---

## Project Structure & Module Organization

- **Backend runtime pipeline** lives in `backend/src/`, with orchestrators (`workflow.py`), scraping/categorization modules, and processors for article/video/audio content.
- **Maintenance utilities** reside in `backend/tools/` (`backfill/`, `pdf/`, `diagnostics/`, `manual_tests/`). Nothing there is imported by production code.
- **Frontend assets** are in `frontend/`; feature tools are in `features/`.
- **Tests** that run under pytest are in `backend/tests/`; legacy smoke scripts remain in `backend/tools/manual_tests/`.

## Build, Test, and Development Commands

**Backend:**
```bash
cd backend
poetry install                    # Install dependencies
playwright install                # Install browser binaries
pytest                           # Run tests
python src/workflow.py           # Run scraping pipeline
```

**Frontend:**
```bash
python3 -m http.server 8000      # Start local dev server
```

## Coding Style & Naming Conventions

- Python code uses 4-space indentation. Follow PEP 8.
- Module names are lowercase with underscores; classes use PascalCase; functions/variables use snake_case.
- JSON and Markdown files should stay ASCII unless existing content requires UTF-8.

## Testing Guidelines

- Pytest is the preferred framework. Name new tests `test_*.py` and place them in `backend/tests/`.
- When adding functionality, include unit tests that can run without external services (mock Gemini/Sheets where possible).

## Commit & Pull Request Guidelines

- Follow conventional commit messages (`feat:`, `fix:`, `chore:`).
- Pull requests should describe scope, testing performed, and link to relevant issues.

## Credentials & Configuration

- Use `.env` for secrets (`GEMINI_API_KEY`, Google service account paths). Never commit real credentials.
- See `backend/.env.example` for required environment variables.
