# Jay Rosen's Internet Archive

A public collection of the works, critiques, and teachings of Jay Rosen, NYU professor of journalism. Covers four decades of journalism criticism, media theory, and public life.

**Live site:** https://pressthink.org/j/rosen-archive/

## What this is

The archive has two main parts:

1. **The archive browser** — a searchable, filterable interface for 1,030 records (800 articles, 137 Tumblr posts, 83 newspaper clippings, 10 social-media threads) plus ~29,700 social media posts, indexed by 5,036 named entities and 4,666 relationships
2. **The dissertation tools** — 4 interactive surfaces for exploring Jay's 1986 doctoral dissertation, *The Impossible Press*: the reader, the foreword, the network-effect film analysis, and the FAQ (an earlier set of 6 tools — comparison, concepts, context, excerpts, glossary, timeline — was retired and lives in `archived/dissertation-tools/` for reference, alongside a separate `source/` bundle that is not a standalone tool)

Everything runs as a static site with no server-side code. The frontend loads JSON data files directly in the browser.

## Running it locally

```bash
python3 -m http.server 8000
```

Open http://localhost:8000. That's it — no build step, no `npm install` needed just to serve the site (npm install is only needed when you regenerate JSON from the source CSVs — see next section).

## How the site works

- `index.html` is the entry point. It loads React, HTM, and other libraries from `esm.sh` CDN via an import map.
- `frontend/` contains the React app. All components use HTM tagged templates (`` html`...` ``) instead of JSX.
- `data/` contains the archive data as JSON files, generated from CSV source files.
- `dissertation/` contains 4 live presentation tools (`reader/`, `foreword/`, `network-effect/`, `faq/`), each in its own subdirectory with an `index.html`. An earlier set of 6 tools (comparison, concepts, context, excerpts, glossary, timeline) is retired to `archived/dissertation-tools/`; that path also holds a `source/` bundle (PDF + transcribed markdown + a build helper), which is not a standalone tool.
- `frontend/dist/tailwind.css` is a pre-built Tailwind CSS file. No build needed unless you change styles.

## Updating the archive data

The site reads from JSON files that are generated from CSV source files:

| Source file | What it contains |
|-------------|-----------------|
| `data/archive_records-public.csv` | Main archive records (1,030 records) |
| `data/social_posts.csv` | Twitter/X and Bluesky posts (~29,700) |
| `data/extracted_entities.csv` | Named entities (5,036) |
| `data/extracted_relationships.csv` | Entity relationships (4,666) |

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

The site is hosted at `pressthink.org/j/rosen-archive/` via FTP to a WordPress server. The full deploy manifest — what to upload, what to exclude, and the cache-busting steps — lives in `DEPLOYMENT.md`. The short version:

1. Edit source files as needed.
2. If data changed: `npm install` (first time only), then `node data/export-archive-data.js`.
3. Bump the version string in `index.html`, `version.json`, `frontend/sw.js` `CACHE_VERSION`, and every `?v=` query parameter on versioned imports — both JS (`./frontend/index.js?v=…`) and CSS (`./frontend/index.css?v=…`, `./frontend/dist/tailwind.css?v=…`). The service worker serves static JS cache-first with `ignoreSearch: true`, so a `?v=` bump alone does not invalidate it — only a `CACHE_VERSION` change drops the stale service-worker cache. `tests/version-consistency.test.js` enforces that `sw.js` `CACHE_VERSION` matches `version.json` and the `index.html` `?v=`, but it checks the shared `?v=` only across `index.html` and `frontend/**.js`; it does NOT scan the dissertation subpages, archived tools, or feature pages. Stale `?v=` values outside that scope will pass CI but leave cached assets live in production, so sweep the whole tree by hand on a version bump.
4. Upload only the files that changed via FTP to `/wp-content/rosen-archive/`.

**Do not upload:** CSVs, backup files, screenshots, the `backend/`, `tests/`, `docs/`, `archived/`, `.github/`, `.claude/`, or `node_modules/` trees. See `DEPLOYMENT.md` for the full exclusion list.

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
dissertation/                 4 live dissertation tools (6 earlier ones, plus a source bundle, in archived/dissertation-tools/)
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
