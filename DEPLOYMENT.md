# Deployment guide

The archive is hosted at `pressthink.org/j/rosen-archive/`. Deploy by uploading changed files via FTP to `/wp-content/rosen-archive/`.

## Files to deploy

Upload these files and directories from the repo root:

```
index.html                          # Main archive page
favicon.ico                         # Site favicon
shared-styles.css                   # Common styles for standalone tools
version.json                        # Version metadata
metadata.json                       # Archive metadata

frontend/                           # React application
  index.js                          # App entry point
  index.css                         # Global styles
  App.js                            # Main app component + routing
  html.js                           # HTM/React binding
  constants.js                      # Data URLs, colors, entity types
  sw.js                             # Service worker
  components/                       # All component files
  components/shared/                # Reusable UI primitives
  services/                         # archiveService, router, sqliteService
  utils/                            # Design tokens
  vendor/                           # Self-hosted sql.js wasm (sql-wasm-1.10.3.wasm)
  design-system/                    # CSS tokens, demo

data/                               # Archive data (JSON only)
  archive-core.json                 # Lightweight record cards (loads on page load)
  archive-details.json              # Full summaries (loads on demand)
  archive-data.json                 # Combined fallback
  archive-entities.json             # Entity graph
  archive-analytics.json            # Prebuilt analytics aggregates (~1KB, loads on analytics view)
  feeds/                            # RSS/OPML feeds
    rss.xml
    articles.xml
    archive.opml
    subscriptions.opml
    index.json
    categories/*.xml
    eras/*.xml

dissertation/                       # Dissertation tools
  index.html                        # Landing page
  reader/                           # Full text reader
  faq/                              # FAQ (linked from the Explore Tools menu)
  foreword/                         # Foreword page
  network-effect/                   # Network film analysis

dissertation-launch/                # Dissertation launch landing
  index.html

features/                           # Standalone feature pages
  shared/text-selection.js
  status-report/                    # Status report generator

tools/                              # Development/exploration tools
  active/dataexplorer/              # Tabular data explorer
  active/dataviz/                   # Data visualization

ADDING-RECORDS.md                   # Instructions for adding new records
```

## What NOT to deploy

Do not upload these to the production server:

- `backend/` — Python data pipeline (development only)
- `data/*.csv` — Source CSV files (build artifacts, not for production)
- `tests/` — Test suite
- `docs/` — Project documentation
- `archived/` — Legacy code
- `.github/` — CI/CD workflows
- `.claude/` — Claude Code config
- `node_modules/` — npm dependencies
- `.env`, `google_credentials.json` — Credentials
- `package.json`, `package-lock.json` — npm config
- `CLAUDE.md`, `README.md` — Development docs

## Deploy after adding records

If you've added records to the CSV and regenerated JSON, only upload:

- `data/archive-core.json`
- `data/archive-data.json`
- `data/archive-details.json`
- `data/archive-analytics.json`

Other files only change when the site code changes.

## Version cache busting

After uploading, bump the `?v=X.X.X` query parameter on all JS/CSS imports in `index.html` to bust the Cloudflare cache. Update `version.json` to match, and bump `frontend/sw.js` `CACHE_VERSION` to the same value. The service worker serves static JS cache-first with `ignoreSearch: true`, so the `?v=` bump alone does not invalidate it — only a `CACHE_VERSION` change drops the stale service-worker cache, so returning visitors keep running old JS until it bumps. `tests/version-consistency.test.js` enforces that the three stay in lockstep.

## FTP credentials

Contact the project maintainer.
