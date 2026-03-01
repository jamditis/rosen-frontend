# Jay Rosen Internet Archive

A public collection of the works, critiques, and teachings of Jay Rosen, NYU professor of journalism. Covers four decades of journalism criticism, media theory, and public life.

**Live site:** https://pressthink.org/j/rosen-archive/

## What this is

The archive has two main parts:

1. **The archive browser** — a searchable, filterable interface for ~940 records (articles, videos, blog posts, threads) plus ~29,000 social media posts
2. **The dissertation tools** — 9 interactive tools for exploring Jay's 1986 doctoral dissertation, *The Impossible Press*

Everything runs as a static site with no server-side code. The frontend loads JSON data files directly in the browser.

## Running it locally

```bash
python3 -m http.server 8000
```

Open http://localhost:8000. That's it — no build step, no npm install needed to run the site.

## How the site works

- `index.html` is the entry point. It loads React, HTM, and other libraries from `esm.sh` CDN via an import map.
- `frontend/` contains the React app. All components use HTM tagged templates (`` html`...` ``) instead of JSX.
- `data/` contains the archive data as JSON files, generated from CSV source files.
- `dissertation/` contains 9 standalone tools for the dissertation (reader, glossary, comparison, etc.), each in its own subdirectory with an `index.html`.
- `frontend/dist/tailwind.css` is a pre-built Tailwind CSS file. No build needed unless you change styles.

## Updating the archive data

The site reads from JSON files that are generated from CSV source files:

| Source file | What it contains |
|-------------|-----------------|
| `data/archive_records-public.csv` | Main archive records (940 records) |
| `data/social_posts.csv` | Twitter/X and Bluesky posts (~29,100) |
| `data/extracted_entities.csv` | Named entities (~5,061) |
| `data/extracted_relationships.csv` | Entity relationships (~5,084) |

To regenerate the JSON after editing a CSV:

```bash
npm install          # first time only
node data/export-archive-data.js
```

This produces the split JSON files the frontend reads:
- `data/archive-core.json` — lightweight record cards (loads on page load)
- `data/archive-details.json` — full summaries, quotes, concepts (loads on demand)
- `data/archive-entities.json` — entity graph for the Explorer view (loads on demand)
- `data/archive-data.json` — full combined fallback file

## Deploying to production

The site is hosted at `pressthink.org/j/rosen-archive/` via FTP to a WordPress server.

To deploy changes:

1. Edit source files as needed
2. If data changed: `node data/export-archive-data.js`
3. Bump the version string in `index.html`, `version.json`, and all `?v=` import parameters across JS files (this busts CloudFlare cache)
4. Upload changed files via FTP to `pressthink.org/j/rosen-archive/`

**Do not upload:** CSVs, backup files, screenshots, or the entire repo — only the files that changed.

## Running tests

```bash
npm test                   # all tests
npm run test:data          # data integrity + CSV quality
npm run test:pipeline      # data pipeline + thread detection
npm run test:frontend      # version consistency + frontend structure
```

Tests use Node.js built-in test runner.

## Key directories

```
index.html                    Entry point
frontend/                     React application
  components/                 UI components
  services/                   Data loading, routing, SQLite
  dist/tailwind.css           Pre-built styles
data/                         CSV sources + generated JSON
dissertation/                 9 standalone dissertation tools
features/                     Standalone feature pages
backend/                      Python data pipeline (scraping, AI analysis)
tools/active/                 Dev tools (data explorer, data viz)
tests/                        Frontend and data test suite
archived/                     Legacy code (reference only)
docs/                         Project documentation
.github/workflows/            CI/CD (frontend validation, backend tests, linting)
```

## Important notes

- **No build step.** The frontend runs directly from source files via ES modules. Never add npm/webpack/vite to the production frontend.
- **Version all imports.** Every `.js` import uses a `?v=X.X.X` query parameter for cache busting. Check `index.html` for the current version.
- **HTM, not JSX.** Components use `` html`...` `` tagged templates. Import from `../html.js`.
- **Dissertation content is verified.** Quotes in `frontend/components/dissertationData.js` are verified citations — don't modify them.
- **Backend uses Poetry.** Run backend commands with `poetry run python ...` from the `backend/` directory.
- **Path auto-detection.** The app detects local vs production paths automatically in `App.js` based on hostname.

## For more detail

See `CLAUDE.md` for comprehensive technical documentation including the full architecture, design system, data schema, known issues, and development rules.

---

*Originally curated by Joe Amditis.*
