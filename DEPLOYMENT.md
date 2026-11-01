# Deployment guide

This is an internal guide for the archive's maintainers. If you're just exploring the project, start with the [root README](README.md) — you don't need anything here to browse the site or use the data.

The archive is hosted at `pressthink.org/j/rosen-archive/`. Automated deploys
use certificate-verified explicit FTPS to the chrooted path
`j/rosen-archive/`; the code rejects broader FTPS roots before connecting.
Read the [release procedure](#release-procedure) for destinations, triggers, and
completion evidence.

Production Actions must set `ROSEN_TRANSFER_PROTOCOL=ftps`, port 21,
`ROSEN_SFTP_SITE_PATH=j/rosen-archive`, and
`ROSEN_SFTP_REMOTE_PATH=j/rosen-archive/data`. The legacy SFTP adapter remains
available for other environments, but its absolute paths must end in those same
archive-root and data-directory suffixes. A missing protocol selector defaults
to SFTP for backward compatibility and will not reach Edgar's FTPS service.

Set `ROSEN_SFTP_TRANSACTION_PATH` to a pre-approved, HTTP-inaccessible remote
directory named `.rosen-archive-transactions` outside the archive root. The
FTPS chroot value is `.rosen-archive-transactions`; SFTP can use an absolute
private path. The deploy uses this directory only for recoverable recall-pair
rollback state. First publication and byte-identical redeploys do not require
rollback files, but changed existing artifacts fail safely if the private path
is unavailable.

## Files to deploy

Upload these files and directories from the repo root:

```
index.html                          # Main archive page
sw.js                               # Root-scope service-worker bridge (loads frontend/sw.js)
favicon.ico                         # Site favicon
favicon.svg                         # SVG favicon (referenced by index.html, the FAQ, and dataviz)
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
  vendor/                           # Self-hosted browser runtimes
    sql-wasm-1.10.3.wasm
    semantic/v1/                    # Pinned semantic model, runtime, checksums, and license notices
  design-system/                    # Semantic CSS tokens, interface recipes, demo

data/                               # Published archive data and shared taxonomy
  archive-core.json                 # Lightweight record cards (loads on page load)
  archive-details.json              # Full summaries (loads on demand)
  archive-data.json                 # Combined fallback
  archive-entities.json             # Entity graph
  archive-analytics.json            # Prebuilt analytics aggregates (~1KB, loads on analytics view)
  search-index.json                 # Curated-record MiniSearch index (~1.2MB gzip, loads lazily on first search)
  social-search-index.json          # Social-body MiniSearch index (~2.1MB gzip, loads lazily on first search)
  archive-embeddings.bin               # Quantized similar-in-theme vectors; upload before the sidecar
  archive-embeddings.json              # ID index plus SHA-256 binding to the binary
  archive-social-embeddings.bin        # Quantized social meaning-search vectors; upload before the sidecar
  archive-social-embeddings.json       # Social ID index plus SHA-256 binding to the binary
  relationship-adjacency-0.json     # Public-safe relationship assertions, shard 0
  relationship-adjacency-1.json     # Public-safe relationship assertions, shard 1
  relationship-adjacency-2.json     # Public-safe relationship assertions, shard 2
  relationship-adjacency-3.json     # Public-safe relationship assertions, shard 3
  relationship-adjacency-4.json     # Public-safe relationship assertions, shard 4
  relationship-adjacency-5.json     # Public-safe relationship assertions, shard 5
  relationship-adjacency-6.json     # Public-safe relationship assertions, shard 6
  relationship-adjacency-7.json     # Public-safe relationship assertions, shard 7
  relationship-adjacency-8.json     # Public-safe relationship assertions, shard 8
  relationship-adjacency-9.json     # Public-safe relationship assertions, shard 9
  relationship-adjacency-a.json     # Public-safe relationship assertions, shard a
  relationship-adjacency-b.json     # Public-safe relationship assertions, shard b
  relationship-adjacency-c.json     # Public-safe relationship assertions, shard c
  relationship-adjacency-d.json     # Public-safe relationship assertions, shard d
  relationship-adjacency-e.json     # Public-safe relationship assertions, shard e
  relationship-adjacency-f.json     # Public-safe relationship assertions, shard f
  relationship-adjacency-manifest.json # Record-to-shard index and integrity hashes. Upload after all shards.
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

tools/                              # Deployed standalone tools
  active/tailwind.css               # Shared Tailwind build loaded by dataviz as ../tailwind.css
  active/dataviz/                   # Data visualization

ADDING-RECORDS.md                   # Instructions for adding new records
```

## Release procedure

The archive has an established deployment path. Maintainers do not need access
to the hosting control panel or ownership of the hosting account to use it.
Identify the destination before deciding whether a release is complete:

| Destination | Trigger | Completion evidence |
| --- | --- | --- |
| [GitHub Pages](https://jamditis.github.io/rosen-frontend/) | Automatic Pages deployment after a push or merge to `main` | Successful Pages deployment and the expected public `version.json` |
| [PressThink archive](https://pressthink.org/j/rosen-archive/) | `deploy.yml`: Weekly Friday at 09:17 UTC, or manual dispatch against reviewed `main` | Successful FTPS transfer, successful live verification, and the expected public `version.json` |
| PressThink record submission | `submit-record.yml` (also re-dispatched by `sweep-stuck-rows.yml`) | Successful workflow, published record live on `pressthink.org/j/rosen-archive/`, and sheet writeback complete |
| PressThink Bluesky publication | Bluesky stewardship publisher workflow | Successful publication, accepted receipt, and healthy ingestion status |

The current `deploy.yml` does not have a push trigger. The
`post-merge.yml` dashboard notification runs only when
`DASHBOARD_WEBHOOK_URL` is configured; it is not the full-site FTPS deploy.
Check the live workflow definitions and repository settings when diagnosing
automation. A successful automatic Pages release establishes that destination's
status; check PressThink separately.

For an authorized full-site PressThink release:

1. Confirm that the intended PR is merged, its actionable review threads are
   resolved, and GitHub CI is green for the release head. This is a public
   repository: Run CI on GitHub-hosted runners and reserve fleet CI for private
   repositories.
2. Dispatch the existing workflow. It joins the release queue, refreshes
   `main`, materializes current Git LFS files, runs checks, uploads through
   FTPS, and verifies the public site:

   ```sh
   gh workflow run deploy.yml --repo jamditis/rosen-frontend --ref main -f dry_run=false
   gh run list --repo jamditis/rosen-frontend --workflow deploy.yml --limit 5
   gh run view RUN_ID --repo jamditis/rosen-frontend --log-failed
   ```

3. Read back `https://pressthink.org/j/rosen-archive/version.json` and compare
   both release markers with the workflow's checked-out release. A dispatch
   acknowledgement or a merged PR alone does not establish completion.
4. For a source-discovery incident, also check the stewardship receipt and
   ingestion health. Close the incident only after that path has recovered.

### Transfer failures

Classify a failure at the step that failed. Record the workflow, run ID,
destination, server response, and completed-file count. A transfer error does
not invalidate the deployment pathway or establish the status of another
destination. If an alternate path was used, check the canonical `deploy.yml`
path once before classifying its result.

For example, FTP response `452 Transfer aborted. No space left on device`
means that this upload was refused by the server. It does not establish
whether the cause is an account quota, filesystem capacity, or another hosting
constraint. The deploy writes a temporary file before renaming it. Check the
completed-file count and public version before claiming that files changed.
Do not repeat the same failing transfer without changed evidence, delete
hosting data, or change quotas as an incidental deployment step. Preserve
failed publisher receipts; a healthy receipt requires a successful release.

The dissertation PDF and semantic `.onnx` and `.wasm` binaries are stored
through Git LFS. The Actions deploy checkout materializes the current tree
before upload. Before a manual FTP deploy, run
`git lfs pull --include="dissertation/reader/*.pdf,frontend/vendor/semantic/v1/**"`.
Confirm the reader PDF is 18,500,765 bytes and run
`node --test tests/semantic-self-host.test.js`; never upload LFS pointer files.

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

## Retired routes and files removed by a full deploy

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

It separately removes this internal prototype directory after a successful
replacement deploy:

```
tools/active/dataexplorer/
```

It also removes this obsolete frontend module while leaving the surrounding
`frontend/components/` directory intact:

```
frontend/components/RiverOfNews.js
```

This cleanup is idempotent. Missing directories and files are treated as already removed.
The remaining `dissertation/` pages, the top-level `faq/`, the shipped
`features/` pages, and `tools/active/dataviz/` are not part of the cleanup list.

The source under `tools/active/dataexplorer/` remains in the repository as an
internal prototype. It still depends on a published Google Sheet and is neither
linked nor deployed; a full-site deploy removes any stale production copy.
Reconsider public deployment only after it reads local archive artifacts and
receives a fresh product and security review.

The unreachable River of News source is preserved under
`archived/frontend-prototypes/` as design history. Its relative-time model does
not fit the historical corpus, its global CSS is no longer shipped, and the
full-site deploy removes any stale public module after replacement uploads.

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
- `tools/active/dataexplorer/` — Internal prototype retained for possible migration to local archive artifacts; the full deploy prunes any stale public copy.

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
- `data/social-search-index.json` (social-body MiniSearch index; regenerated with every social-record change)
- `data/relationship-adjacency-0.json` through `data/relationship-adjacency-f.json`, followed by `data/relationship-adjacency-manifest.json` (public-safe record relationship lookup; upload the manifest last)

Then run the full-site deploy so the corresponding record shells are rebuilt
and reconciled. Do not publish record JSON alone: new or edited share metadata
would remain stale until the next full deploy.

## Version cache busting

Before committing and uploading a release, run `npm run bump-version -- X.X.X` to stamp the `?v=X.X.X` query parameter on versioned JS/CSS references in the root app, FAQ, dissertation, and standalone feature pages. Commit those stamps with the release so the full-site upload contains them. The command also updates `version.json` and bumps `frontend/sw.js` `CACHE_VERSION` to the same value. The stable root `sw.js` bridge imports that implementation so it can control the whole archive subtree. The service worker caches static JS and CSS under exact versioned request URLs and drops old cache namespaces when a release activates. Both version markers are required so returning visitors cannot mix module releases. Upload dependencies first; upload root `index.html`, `frontend/sw.js`, root `sw.js`, and `version.json` last, in the order produced by `backend/scripts/deploy_full_site.py`. `tests/version-consistency.test.js` enforces that the complete marker surface and cache version stay in lockstep.

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

## Transfer credentials

Production uses the repository's encrypted Actions secrets. Never commit or
paste credentials into workflow files, logs, issues, or pull requests.
