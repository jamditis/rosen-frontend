# Deployment guide

The archive is hosted at `pressthink.org/j/rosen-archive/`. Deploy by uploading changed files via FTP to `/wp-content/rosen-archive/`.

## Files to deploy

Upload these files and directories from the repo root:

```
index.html                          # Main archive page
favicon.ico                         # Site favicon
favicon.svg                         # SVG favicon (referenced by index.html, the FAQ, and both data tools)
og-image.png                        # Social sharing card (referenced by the OG/Twitter meta tags)
shared-styles.css                   # Common styles for standalone tools
version.json                        # Version metadata
metadata.json                       # Archive metadata
.htaccess                           # Apache config: CSP + security headers, gzip, caching, the FAQ 301 (re-upload whenever it changes)

frontend/                           # React application
  index.js                          # App entry point
  index.css                         # Global styles
  App.js                            # Main app component + routing
  html.js                           # HTM/React binding
  constants.js                      # Data URLs, colors, entity types
  sw.js                             # Service worker
  components/                       # All component files
  services/                         # archiveService, router, sqliteService
  utils/                            # Design tokens
  vendor/                           # Self-hosted sql.js wasm (sql-wasm-1.10.3.wasm)
  design-system/                    # CSS tokens, demo

data/                               # Published archive data and shared taxonomy
  archive-core.json                 # Lightweight record cards (loads on page load)
  archive-details.json              # Full summaries (loads on demand)
  archive-data.json                 # Combined fallback
  archive-entities.json             # Entity graph
  archive-analytics.json            # Prebuilt analytics aggregates (~1KB, loads on analytics view)
  search-index.json                 # Prebuilt MiniSearch full-text index (~1MB, loads lazily on first search)
  wiki-seed.json                    # Community wiki seed pages (loads on the #wiki view)
  schema.json                       # Data dictionary, linked from the open-data download UI
  eras.js                           # Canonical era taxonomy shared with the frontend
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
  foreword/                         # Foreword page
  network-effect/                   # Network film analysis

faq/                                # FAQ: archive + dissertation (linked from the Explore Tools menu; moved from dissertation/faq/ in #567)

dissertation-launch/                # Dissertation launch landing
  index.html

features/                           # Standalone feature pages
  shared/text-selection.js
  status-report/                    # Status report generator

tools/                              # Development/exploration tools
  active/tailwind.css               # Shared Tailwind build both tools load as ../tailwind.css
  active/dataexplorer/              # Tabular data explorer
  active/dataviz/                   # Data visualization

ADDING-RECORDS.md                   # Instructions for adding new records
```

## Retired routes removed by a full deploy

After every listed file uploads successfully, `backend/scripts/deploy_full_site.py`
removes these retired dissertation directories from the production server:

```
dissertation/comparison/
dissertation/concepts/
dissertation/context/
dissertation/excerpts/
dissertation/glossary/
dissertation/timeline/
```

This cleanup is idempotent. Missing directories are treated as already removed.
The live `dissertation/` pages, the top-level `faq/`, and `tools/active/` are not
part of the cleanup list.

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
- `features/making-of/` (draft, PR #592). Held pending curator approval of its handoff chapter. Do not upload it, even in a full `features/` sync, until sign-off. Its `og-image.html` is a build-time render template, not a page.

## Deploy after adding records

If you've added records to the CSV and regenerated JSON, only upload:

- `data/archive-core.json`
- `data/archive-data.json`
- `data/archive-details.json`
- `data/archive-analytics.json`
- `data/search-index.json` (MiniSearch full-text index; regenerated with every record change, so it must ship or full-text search serves the previous index)

Other files only change when the site code changes.

## Version cache busting

After uploading, bump the `?v=X.X.X` query parameter on all JS/CSS imports in `index.html` to bust the Cloudflare cache. Update `version.json` to match, and bump `frontend/sw.js` `CACHE_VERSION` to the same value. The service worker serves static JS cache-first with `ignoreSearch: true`, so the `?v=` bump alone does not invalidate it — only a `CACHE_VERSION` change drops the stale service-worker cache, so returning visitors keep running old JS until it bumps. `tests/version-consistency.test.js` enforces that the three stay in lockstep.

## FTP credentials

Contact the project maintainer.
