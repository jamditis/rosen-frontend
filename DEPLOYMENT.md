# Deployment guide

This is an internal guide for the archive's maintainers. If you're just exploring the project, start with the [root README](README.md) — you don't need anything here to browse the site or use the data.

The archive is hosted at `pressthink.org/j/rosen-archive/`. Deploy by uploading changed files via FTP to `/wp-content/rosen-archive/`.

## Files to deploy

Upload these files and directories from the repo root:

```
index.html                          # Main archive page
sw.js                               # Root-scope service-worker bridge (loads frontend/sw.js)
favicon.ico                         # Site favicon
favicon.svg                         # SVG favicon (referenced by index.html, the FAQ, and both data tools)
og-image.png                        # Social sharing card (referenced by the OG/Twitter meta tags)
shared-styles.css                   # Common styles for standalone tools
version.json                        # Version metadata
metadata.json                       # Archive metadata
.htaccess                           # Apache config: CSP + security headers, gzip, caching, the FAQ 301 (re-upload whenever it changes)
r/                                  # Generated record-specific metadata shells for ?record= deep links

frontend/                           # React application
  index.js                          # App entry point
  index.css                         # Global styles
  App.js                            # Main app component + routing
  html.js                           # HTM/React binding
  constants.js                      # Data URLs, colors, entity types
  sw.js                             # Service worker
  components/                       # All component files
  desktop/                          # Optional lazy desktop shell, adapters, registry, window state, and CSS
  services/                         # archiveService, router, sqliteService
  utils/                            # Design tokens
  vendor/                           # Self-hosted sql.js wasm (sql-wasm-1.10.3.wasm)
  design-system/                    # Semantic CSS tokens, interface recipes, demo

data/                               # Published archive data and shared taxonomy
  archive-core.json                 # Lightweight record cards (loads on page load)
  archive-details.json              # Full summaries (loads on demand)
  archive-data.json                 # Combined fallback
  archive-entities.json             # Entity graph
  archive-analytics.json            # Prebuilt analytics aggregates (~1KB, loads on analytics view)
  search-index.json                 # Prebuilt MiniSearch full-text index (~1MB, loads lazily on first search)
  wiki-seed.json                    # Community wiki seed pages (loads on the #wiki view)
  schema.json                       # Data dictionary, linked from the open-data download UI
  SCHEMA.md                         # Human-readable data guide, linked from Ways to Participate
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
    THE_IMPOSSIBLE_PRESS_NYU_ROSEN-JAY-1986.pdf  # Original dissertation PDF (Git LFS; checkout must materialize it)
  foreword/                         # Foreword page
  network-effect/                   # Network film analysis

faq/                                # FAQ: archive + dissertation (linked from the Explore Tools menu; moved from dissertation/faq/ in #567)

dissertation-launch/                # Dissertation launch landing
  index.html

features/                           # Standalone feature pages
  participate/                     # Ways to Participate landing page
  shared/text-selection.js
  winer-method/                     # Independent public-source archive-method demonstration

tools/                              # Development/exploration tools
  active/tailwind.css               # Shared Tailwind build both tools load as ../tailwind.css
  active/dataexplorer/              # Tabular data explorer
  active/dataviz/                   # Data visualization

ADDING-RECORDS.md                   # Instructions for adding new records
```

The dissertation PDF is stored through Git LFS. The Actions deploy checkout
materializes it automatically. Before a manual FTP deploy, run
`git lfs pull --include="dissertation/reader/*.pdf"` and confirm the reader PDF
is 18,500,765 bytes; never upload the 133-byte LFS pointer.

The full-site deploy uploads every standalone `index.html` under its deployed
directories only after all walked assets and the shared data manifest. This
keeps dissertation, FAQ, feature, and tool entry points on the previous release
until their JavaScript, CSS, and data dependencies are live. Generated
`r/*.html` record shells follow all frontend and data dependencies. The root
`index.html`, implementation worker, root-scope worker bridge, and
`version.json` then retain their final four release flips.

`backend/scripts/deploy_full_site.py` rebuilds `r/*.html` from the committed
`index.html` and `data/archive-data.json` before collecting the upload. These
small generated shells replace only the page metadata; Apache serves them
internally for valid `?record=ID` requests while the browser keeps the public
deep-link URL and loads the same React app. After every upload succeeds, the
deploy also removes safe `r/ID.html` files that no longer correspond to a
generated non-social record. Unrelated files and directories under `r/` are
left untouched.

## Retired routes removed by a full deploy

After every listed file uploads successfully, `backend/scripts/deploy_full_site.py`
removes these retired directories from the production server:

```
dissertation/comparison/
dissertation/concepts/
dissertation/context/
dissertation/excerpts/
dissertation/glossary/
dissertation/timeline/
features/status-report/
```

This cleanup is idempotent. Missing directories are treated as already removed.
The remaining `dissertation/` pages, the top-level `faq/`, the shipped
`features/` pages, and `tools/active/` are not part of the cleanup list.

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

The automated `submit-record.yml` path uploads the regenerated JSON set first,
then rebuilds and uploads the affected `r/ID.html` shell from the live
production `index.html`. If that record becomes social, the obsolete shell is
removed instead. This keeps record metadata current without exposing frontend
assets from a release that has not had a full deploy.

For a manual record-data update, upload the regenerated JSON set:

- `data/archive-core.json`
- `data/archive-data.json`
- `data/archive-details.json`
- `data/archive-entities.json`
- `data/archive-analytics.json`
- `data/search-index.json` (MiniSearch full-text index; regenerated with every record change, so it must ship or full-text search serves the previous index)

Then run the full-site deploy so the corresponding record shells are rebuilt
and reconciled. Do not publish record JSON alone: new or edited share metadata
would remain stale until the next full deploy.

## Version cache busting

Before committing and uploading a release, run `npm run bump-version -- X.X.X` to stamp the `?v=X.X.X` query parameter on versioned JS/CSS references in the root app, FAQ, dissertation, and standalone feature pages. Commit those stamps with the release so the full-site upload contains them. The command also updates `version.json` and bumps `frontend/sw.js` `CACHE_VERSION` to the same value. The stable root `sw.js` bridge imports that implementation so it can control the whole archive subtree. The service worker serves static JS cache-first with `ignoreSearch: true`, so a `?v=` bump alone does not invalidate it — only a `CACHE_VERSION` change drops the stale service-worker cache, so returning visitors keep running old JS until it bumps. `tests/version-consistency.test.js` enforces the complete marker surface and cache version stay in lockstep.

The design-system `legacy-token-bridge.css` uses a distinct pathname so the
previous worker cannot substitute its cached `tokens.css` for it. Keep the
bridge immediately before `tokens.css` in documents that consume shared
recipes; it supplies safe semantic fallbacks during the first navigation after
a worker update, and the current canonical token file overrides it afterward.

## GitHub Pages release-candidate check

GitHub Pages publishes the repository root from `main` at
`https://jamditis.github.io/rosen-frontend/`. It serves the same zero-build
files that the FTP deploy uploads; the path resolver supplies the Pages
subdirectory instead of the PressThink subdirectory. After a visual change
merges, use that site as the release-candidate preview before assembling or
uploading an FTP package. Check the changed routes at mobile and desktop
widths, then package the same committed files without rebuilding or rewriting
them.

### Optional desktop release check

`frontend/desktop/` is part of the recursively deployed `frontend/` directory,
but its modules and stylesheet are intentionally absent from the service
worker's install-time app shell. A standard archive visit must not request or
cache them. After a visitor opens `#desktop`, the mounted shell asks the active
worker to warm the allowlisted `DESKTOP_ASSETS` for a later offline visit.

For a coordinated release that changes the desktop:

1. run the normal version bump so desktop imports, `version.json`, and
   `frontend/sw.js` use the same new version;
2. run `npm test` and `npm run preview:audit`;
3. run `python backend/scripts/deploy_full_site.py --dry-run` (or the Poetry
   equivalent from `backend/`) and confirm the complete `frontend/desktop/`
   runtime set is present;
4. in a fresh browser profile, confirm the standard route requests no desktop
   assets, then visit `#desktop`, reload it offline, and verify the permanent
   “Standard archive” exit still works.

Do not add `features/making-of/` to either deployment path or a desktop launch
target until its separate editorial and publication gates are explicitly
approved.

## FTP credentials

Contact the project maintainer.
