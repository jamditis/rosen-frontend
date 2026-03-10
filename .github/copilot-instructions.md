# rosen-frontend

## Project overview
Jay Rosen Internet Archive — interactive archive of media critic Jay Rosen's work.
Zero-build React frontend (loaded via CDN/esm.sh), Poetry backend for data pipeline,
deployed as static files to WordPress via FTP.

## Tech stack
### Frontend
- Zero-build React via CDN (esm.sh + HTM) — no webpack, no bundler
- Vanilla JS, no TypeScript
- Python `http.server` for local development (no build step)

### Backend (data pipeline)
- Python, Poetry
- Exports archive data to JSON consumed by the frontend

### Testing
- npm test (data integrity + frontend validation)
- Poetry + pytest (backend pipeline)

## Coding guidelines
- No build step — the frontend loads React from CDN. Do not add bundlers.
- No emojis
- Sentence case only
- No direct LLM API calls

## Project structure
- `index.html` — entry point, loads React from CDN
- `data/` — archive data and export scripts
- `backend/src/` — Python data pipeline
- `backend/tests/` — pytest tests
- `.github/workflows/` — CI (frontend validation, backend tests, linting)

## Resources
- Dev server: `python3 -m http.server 8000`
- Data export: `node data/export-archive-data.js`
- Backend: `cd backend && poetry run python src/workflow.py`
- Tests: `npm test` and `cd backend && poetry run pytest`
- Deploy: FTP upload to WordPress (static files)
