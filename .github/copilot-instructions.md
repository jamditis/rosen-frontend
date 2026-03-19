# Copilot review instructions — rosen-frontend

## Overview

The Jay Rosen Internet Archive — a public collection of the works, critiques, and teachings of Jay Rosen (NYU journalism professor). ~940 archive records + ~29,100 social posts + dissertation tools.

**Live URL:** https://pressthink.org/j/rosen-archive/
**Current version:** v3.3.0

## Architecture

**Zero-build static site.** No npm/Webpack/Vite for production. React 18 is loaded via `esm.sh` CDN import maps in `index.html`. Components use HTM tagged templates (`html\`...\``) instead of JSX.

- **Frontend:** React 18 (CDN) + HTM + sql.js (in-browser SQLite) + Tailwind CSS (pre-built) + Lucide React icons
- **Data:** Split-loaded JSON files (core 11MB + details 12MB + entities 1MB), with 26MB combined fallback
- **Backend pipeline:** Python (Poetry) for scraping, AI analysis, content processing
- **Routing:** Hash-based SPA (`#folders`, `#explorer`, `#entities`, `#dissertation`, `#about`, `#analytics`)
- **Deploy:** FTP upload to pressthink.org WordPress host

### Path configuration

- Local dev: relative paths (`./data/`, `./frontend/`)
- Production: absolute paths (`/j/rosen-archive/`)
- Auto-detected via `window.location.hostname` in `App.js`

## Build and test

```bash
# Frontend — no build step
python3 -m http.server 8000

# Regenerate JSON from CSV
npm install && node data/export-archive-data.js

# Tests (Node.js built-in test runner)
npm test                    # all 8 test files
npm run test:data           # data integrity + CSV quality
npm run test:pipeline       # data pipeline + thread detection
npm run test:frontend       # version consistency + frontend structure

# Backend pipeline
cd backend && poetry install
poetry run python src/workflow.py
```

## Project layout

```
index.html                  Entry point (import map, React mount)
frontend/
  index.js                  React root mount
  App.js                    Main app + routing
  constants.js              Data URLs, colors, entity types, featured works
  html.js                   HTM/React binding
  dist/tailwind.css         Pre-built Tailwind
  components/               UI components (20+ files)
  services/
    archiveService.js       Data loading, search, entity maps
    router.js               Hash-based routing
    sqliteService.js         sql.js SQLite queries
dissertation/               9 standalone presentation tools
data/
  archive-core.json         Lightweight records (split load, on page load)
  archive-details.json      Full summaries/quotes (split load, on demand)
  archive-entities.json     Entity graph (split load, on demand)
  archive-data.json         Combined fallback (26MB)
  export-archive-data.js    JSON generator from CSV
  *.csv                     Source data files
backend/                    Python data pipeline (Poetry)
tests/                      8 test files (data integrity, versions, structure)
.github/workflows/          CI (frontend-validation, backend-tests, backend-linting)
```

## Style rules

- Sentence case only (never Title Case) in UI text, comments, and documentation
- No emojis in code or content
- No direct LLM API calls — use CLI tools (`claude -p`, `gemini -p`) via subprocess
- Design system: Special Elite (display headings), Roboto Mono (body), paper texture background (`#fdfbf7`)
- Category colors follow `constants.js` definitions

## What to flag in reviews

1. **No build step for frontend** — Never introduce npm/webpack/vite for production frontend code. The only npm usage is `node data/export-archive-data.js` for data generation and `npm test` for testing.

2. **HTM, not JSX** — All components must use the `html` tagged template from `./html.js`, not JSX syntax. Import pattern: `import { html } from '../html.js?v=3.3.0'`.

3. **Version strings on all imports** — Every `.js` import must include a `?v=3.3.0` query parameter for cache busting. Missing version strings cause stale cached code in production. Check `index.html` for the current version.

4. **Dissertation content is sacred** — Quotes and content in `frontend/components/dissertationData.js` are verified citations from Jay Rosen's 1986 dissertation. Do not modify, paraphrase, or fabricate quotes.

5. **Split data loading** — Data loads in three parts: `archive-core.json` (on page load), `archive-details.json` and `archive-entities.json` (on demand). Changes to the data schema must update `data/export-archive-data.js` and all three output files.

6. **CSV as source of truth** — JSON files are generated from CSV source files. Do not edit JSON files directly — edit the CSV and regenerate.

7. **Backend uses Poetry** — Python commands must use `poetry run python ...`, not bare `python`.

8. **Git LFS for PDFs** — Large PDF files in `dissertation/` are managed via Git LFS. Adding new PDFs without LFS tracking will bloat the repo.

9. **Archived code is read-only** — `/archived/` contains legacy reference code. Do not modify it.

10. **Production path awareness** — Code that constructs URLs must use the auto-detected base path (relative for local, `/j/rosen-archive/` for production). Hardcoded relative paths will break in production.
