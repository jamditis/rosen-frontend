# Repository guidelines

This guide is derived from `CLAUDE.md`. Keep `CLAUDE.md` as the detailed
source of truth and update this file when agent-facing workflow changes.

## Project overview

Jay Rosen's Internet Archive is a zero-build static site for the public
archive of Jay Rosen's work, critiques, teaching, and dissertation materials.
Production runs at `https://pressthink.org/j/rosen-archive/`.

The production frontend uses React 18, HTM, sql.js, Lucide React, native ES
modules, and pre-built Tailwind CSS. Do not introduce Webpack, Vite, JSX, or a
production build step.

## Bug-fixing workflow

When fixing bugs:

1. Write a failing test that reproduces the bug.
2. Implement the smallest fix that makes the test pass.
3. Run the targeted test, then the relevant broader test command.
4. Only claim the bug is fixed after verification passes.

## Issue selection

Some issues are tracked for human visibility only and are not engineering tasks.

- Enumerate candidate work with `gh issue list --search 'is:open -label:"do-not-automate"'` so these issues never enter selection. Skip any `do-not-automate` issue you reach another way.
- Never select, work on, or open a pull request against a `do-not-automate` issue, and never change its state.
- These issues also open with a "DO NOT AUTOMATE" banner in the body. If you have already opened one, stop and move on.

## Key commands

```bash
python3 -m http.server 8000
npm install
npm test
npm run test:data
npm run test:pipeline
npm run test:frontend
npm run preview
npm run preview:audit
node data/export-archive-data.js
```

`npm run preview` serves the static bundle at `http://127.0.0.1:8000/` for a
production-fidelity preview. It binds to loopback by default. Override the port
with `PREVIEW_PORT=8765 npm run preview`; override the bind address with
`PREVIEW_HOST=0.0.0.0 npm run preview` only when LAN access is intentional.

`npm run preview:audit` starts the preview server, walks key routes at mobile
and desktop viewports, runs `axe-core` for WCAG 2.1 AA, and writes
`preview-audit-results/axe-report.html` plus per-route screenshots. It exits
non-zero if violations are found.

Backend pipeline work lives in `backend/` and uses Poetry:

```bash
cd backend
poetry install
playwright install
poetry run python src/workflow.py
```

## Structure

- `index.html` is the site entry point and import map.
- `frontend/` contains the main React/HTM app.
- `frontend/components/` contains UI components and shared primitives.
- `frontend/services/` contains routing, archive loading, and SQLite services.
- `data/` contains source CSVs, generated JSON, and export scripts.
- `dissertation/` contains standalone dissertation presentation tools.
- `features/` contains standalone feature pages.
- `backend/` contains the Python scraping and data pipeline.
- `tests/` contains Node test files.
- `archived/` is reference-only legacy code. Do not modify it unless explicitly requested.

## Frontend conventions

- Use HTM tagged templates, not JSX.
- Import `html` from the versioned local `html.js` path.
- Keep every `.js` import versioned with the current `?v=` query string from `index.html`.
- Match the existing design system: `Special Elite` display type, `Roboto Mono` body type, warm paper background, paper texture, and category colors from `frontend/constants.js`.
- Use sentence case in UI text, comments, and documentation.
- Standalone pages belong under `dissertation/` or `features/`, each in its own subdirectory with an `index.html`.

## Data and content rules

- Source archive records live in `data/archive_records-public.csv`.
- Regenerate JSON with `node data/export-archive-data.js` after data changes.
- If CSV structure changes, update `data/export-archive-data.js` in the same change.
- Dissertation quotes and attributions in `frontend/components/dissertationData.js` are verified content. Do not modify, paraphrase, or fabricate them.
- Large dissertation PDFs are managed with Git LFS.

## Deployment notes

Production deploys by FTP to `pressthink.org/j/rosen-archive/`.

When deployment files change:

1. Regenerate JSON if data changed.
2. Bump the version in lockstep across `index.html`, `version.json`, every relevant `?v=` import string, and `frontend/sw.js` `CACHE_VERSION`. The service worker serves static JS cache-first and matches with `ignoreSearch: true`, so a `?v=` bump alone does not invalidate it — only a `CACHE_VERSION` change drops the stale cache. Skip it and returning visitors keep running old JS (security fixes included) until some later deploy happens to bump it.
3. Upload only changed production files.
4. Do not upload CSVs, backup files, screenshots, or the whole repo.

## Known project constraints

- `archive.pressthink.org` intentionally uses `http://` for affected records because the subdomain has a TLS certificate issue.
- Bluesky embeds use `embed.bsky.app`; update `ThreadModal.js` and `RecordModal.js` if that embed host changes.
- Browser `localStorage` caching is disabled because the live data set can exceed storage limits.
- Social/thread records may have generic titles until content-based title generation is implemented.
