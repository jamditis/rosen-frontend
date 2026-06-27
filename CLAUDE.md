# CLAUDE.md - Jay Rosen's Internet Archive


## Bug-fixing workflow

When a bug is reported, don't immediately attempt to fix it. Instead:

1. **Write a failing test first** that reproduces the bug
2. **Launch subagents** to work on fixing the bug
3. **Verify the fix** by running the test — a passing test proves the bug is fixed

---

## Project overview

**Jay Rosen's Internet Archive** is a public collection of the works, critiques, and teachings of Jay Rosen, NYU professor of journalism. It covers four decades of journalism criticism, media theory, and public life.

- **Live URL:** https://pressthink.org/j/rosen-archive/
- **Repository:** github.com/jamditis/rosen-frontend
- **Current version:** v3.4.1
- **Archive curator:** Joe Amditis

### About Jay Rosen

Professor of Journalism at NYU since 1986. Creator of PressThink blog. Known for "the view from nowhere," "audience atomization overcome," and critiques of professional journalism.

### The dissertation: "The Impossible Press" (1986)

- Full title: "The Impossible Press: American Journalism and the Decline of Public Life"
- Advisor: Neil Postman
- Central argument: The phrase "the press informs the public" obscures more than it reveals. Journalism is a transaction, not just an action.
- Released publicly December 2025

## Architecture

**This is a zero-build static site.** No npm/Webpack/Vite needed for production.

### Tech stack

- **React 18** via `esm.sh` CDN (import maps in `index.html`)
- **HTM** for JSX-like template syntax in vanilla JS (`html` tagged template)
- **sql.js** for in-browser SQLite queries
- **Tailwind CSS** pre-built (`frontend/dist/tailwind.css`)
- **Lucide React** for icons
- **ES modules** (native browser imports, no bundler)

### How it works

`index.html` loads an import map pointing React/HTM/Lucide/sql.js to `esm.sh` CDN URLs. The app entry point is `frontend/index.js`, which mounts the React root. All `.js` files use HTM's `html` tagged template instead of JSX.

### Version/cache busting

All JS imports use `?v=3.3.0` query parameters. When changing code, bump the version string across all imports. Use the `/check-versions` skill to find version mismatches.

### Path configuration

- **Local dev:** relative paths (`./data/`, `./frontend/`)
- **Production:** absolute paths (`/j/rosen-archive/`)
- Auto-detected via `window.location.hostname` in `App.js`

## Data

### Archive data (split loading)

Data is split into three files for performance, with a full fallback. Sizes drift as records are added — these are accurate as of 2026-05-25:

| File | Size | Contents | Loads |
|------|------|----------|-------|
| `data/archive-core.json` | ~13 MB | Lightweight record cards | On page load |
| `data/archive-details.json` | ~13 MB | Full summaries, quotes, concepts | On demand |
| `data/archive-entities.json` | ~1.1 MB | Entity graph for Explorer | On demand |
| `data/archive-data.json` | ~28 MB | Full combined data (fallback) | Only if split files fail |

Configured in `frontend/constants.js` via `DATA_CONFIG`.

### Source CSV files

Counts verified against current `data/` on 2026-05-25:

| File | Records | Contents |
|------|---------|----------|
| `data/archive_records-public.csv` | 1,030 | Non-social archive records (800 RECORD, 137 TUMBLR, 83 CLIP, 10 THREAD). Line count is high (~50k+) due to multi-line text fields. Max record id is `RECORD-00901`; next ID for new records is `RECORD-00902`. |
| `data/social_posts.csv` | ~29,700 | Twitter/X and Bluesky posts. Max BSKY id is `BSKY-03121`. |
| `data/extracted_entities.csv` | 5,036 | Named entities (people, orgs, concepts) |
| `data/extracted_relationships.csv` | 4,666 | Entity-to-record relationships |

### Regenerating JSON from CSV

```bash
npm install          # first time only — installs runtime deps (csv-stringify, playwright) and dev deps (csv-parse). csv-stringify is also imported by the data/fixes/*.js maintenance scripts; playwright is used by the WCAG audit + the dissertation reader validator
node data/export-archive-data.js
```

### Dissertation data

Hardcoded in `frontend/components/dissertationData.js`. Contains 70+ nodes (chapters, concepts, thinkers), `NOTABLE_QUOTATIONS`, and `KEY_THEMES`. This content is verified against the original dissertation — do not modify quotes or attributions.

## Frontend routing

Hash-based SPA routing (`frontend/services/router.js`):

| Route | Hash | Component | Description |
|-------|------|-----------|-------------|
| Archive | (default) | `App.js` main view | Record cards with filters |
| Folders | `#folders` | `App.js` folder view | Browse by category folders |
| Entities | `#entities` | `EntityBrowser.js` | Browse/search extracted entities |
| Dissertation | `#dissertation` | `DissertationPage.js` | Mind map + detail panel |
| About | `#about` | `AboutPage.js` | About the archive |
| Analytics | `#analytics` | `AnalyticsDashboard.js` | Archive statistics |

Record deep links: `?record=RECORD_ID` opens a record modal on any route.

## Directory structure

Verified against repo state on 2026-05-25. Component, test, and workflow lists are not enumerated exhaustively — run `ls` for the current set.

```
/
├── index.html                       # Entry point (import map, React mount)
├── shared-styles.css                # Common CSS for standalone tools
├── favicon.ico
├── version.json                     # Version metadata (matches index.html ?v=)
├── package.json                     # Node scripts: test, test:data, test:pipeline, test:frontend, export-data
├── README.md                        # Project intro, quick-start, key directories
├── CLAUDE.md                        # This file — agent context, architecture, conventions
├── AGENTS.md                        # Short, generic repo conventions for ambient agents
├── CONTEXT.md                       # Domain vocabulary (Archive, Record, Entity, etc.)
├── ADDING-RECORDS.md                # Non-technical curator guide for adding records
├── DEPLOYMENT.md                    # FTP deploy manifest (what to upload, what to exclude)
│
├── frontend/                        # Main React application
│   ├── index.js                     # React root mount
│   ├── index.css                    # Global styles (paper texture, scrollbar)
│   ├── App.js                       # Main app component + routing
│   ├── constants.js                 # Data URLs, featured works, colors, entity types
│   ├── html.js                      # HTM/React binding
│   ├── sw.js                        # Service worker (cache strategy)
│   ├── tailwind.config.js           # Tailwind config
│   ├── dist/tailwind.css            # Pre-built Tailwind output (~40 KB)
│   ├── components/                  # ~20 top-level React components (cards, modals, sidebar, dissertation views, analytics, explorer, query builder)
│   ├── services/
│   │   ├── archiveService.js        # Data loading, entity maps, search
│   │   ├── router.js                # Hash-based routing
│   │   └── sqliteService.js         # sql.js SQLite queries
│   ├── utils/                       # Design tokens and small helpers
│   └── design-system/               # CSS tokens and demo pages
│
├── dissertation/                    # Dissertation presentation tools (4 live)
│   ├── index.html                   # Dissertation landing page
│   ├── reader/                      # Full text reader with selection sharing
│   ├── foreword/                    # Foreword page
│   ├── network-effect/              # Network film analysis
│   └── faq/                         # Dissertation FAQ
│   # Note: an earlier set of 6 standalone tools (comparison, concepts,
│   # context, excerpts, glossary, timeline) was retired and now lives
│   # in archived/dissertation-tools/ for reference, alongside a non-tool
│   # source/ bundle (dissertation PDF + transcribed markdown + helper).
│
├── dissertation-launch/             # Standalone dissertation launch landing page
│
├── features/                        # Standalone feature pages
│   ├── shared/                      # Shared feature assets (text-selection.js)
│   └── status-report/               # Archive status report generator
│
├── data/                            # Archive data files + export scripts
│   ├── archive-data.json            # Full combined JSON (~28 MB)
│   ├── archive-core.json            # Lightweight records (~13 MB)
│   ├── archive-details.json         # Full details (~13 MB)
│   ├── archive-entities.json        # Entity graph (~1.1 MB)
│   ├── archive_records-public.csv   # Source records (1,030 rows)
│   ├── social_posts.csv             # Social media posts (~29,700 rows)
│   ├── extracted_entities.csv       # Named entities (5,036 rows)
│   ├── extracted_relationships.csv  # Entity relationships (4,666 rows)
│   ├── export-archive-data.js       # JSON generator script
│   ├── schema.json                  # Data schema
│   └── README.md                    # Data dictionary
│
├── backend/                         # Python data pipeline (Poetry-managed)
│   ├── src/                         # Scraper, processors, categorizer
│   ├── scripts/                     # Maintenance scripts
│   ├── tests/                       # Python test suite (pytest)
│   ├── submission_server/           # Pillar 3a: Flask submission server + scheduler + SFTP push
│   ├── docs/                        # Backend-specific docs
│   ├── pyproject.toml               # Poetry dependencies
│   ├── schema.json                  # Backend data schema
│   ├── README.md                    # Backend pipeline overview
│   └── (various report JSONs, taxonomy analyses, integrate/update scripts)
│
├── tools/active/                    # Development tools
│   ├── dataexplorer/                # Tabular data explorer
│   └── dataviz/                     # Data visualization tool
│
├── tests/                           # Frontend/data test suite — Node.js built-in runner (24 *.test.js files plus a validate-dissertation-page.js helper script; 25 files total)
│
├── archived/                        # Reference only, not deployed (see DEPLOYMENT.md)
│   ├── dissertation-tools/          # 6 retired dissertation tools (comparison, concepts, context, excerpts, glossary, timeline) + a source/ bundle (PDF + markdown + helper script); kept pending the decisions-pending.md call. The faq tool was restored to dissertation/faq/ in #411.
│   └── scripts/                     # Provenance-only one-off scripts, broken at import from here by design (each has a README). backend-oneoffs/ (#190) and data-oneoffs/ (#380). The rest of archived/ was pruned in #166.
│
├── docs/                            # Project documentation
│   ├── agent-personas/              # Contributor role definitions (5 personas)
│   ├── narrative/                   # Project history (project-history, architecture, data-pipeline, changelog)
│   ├── plans/                       # Dated design + implementation plans
│   ├── research/                    # Dated discovery/inventory writeups (e.g. Pillar 2 sweeps)
│   ├── archived/                    # Older one-off audits/designs kept for reference
│   ├── screenshots/                 # PNGs referenced from other docs
│   └── (top-level audits: DATA_QUALITY_AUDIT_*, ENTITY_EXTRACTION_PIPELINE, HANDOFF, JAY_ADDING_RECORDS, JAY_ROSEN_HANDOFF_GOAL_PROGRESS, LAUNCH_VALIDATION_REPORT, QUESTIONS_FOR_ROSEN_CALL, issue-210-duplicate-findings)
│
├── .github/workflows/               # CI/CD (9 workflows)
│   ├── frontend-validation.yml      # HTML/JS syntax, CDN link checks
│   ├── backend-tests.yml            # pytest
│   ├── backend-linting.yml          # ruff, black, mypy
│   ├── codeql.yml                   # CodeQL security scan
│   ├── post-merge.yml               # Post-merge dashboard sync
│   ├── submit-record.yml            # Pillar 3a — submit record
│   ├── sweep-stuck-rows.yml         # Pillar 3a — sweep stuck submission rows
│   ├── claude-code-review.yml       # Claude code review
│   └── claude.yml                   # Claude integration
│
└── .claude/
    ├── commands/                    # Slash commands
    └── skills/                      # Domain skills
```

## Design system

### Fonts
- **Display:** `Special Elite` (typewriter aesthetic)
- **Body:** `Roboto Mono` (monospace)

### Colors
- **Background:** `#fdfbf7` (warm paper)
- **Cards:** `#ffffff`
- **Text:** `stone-900` / `#1c1917`
- **Category accents:** sky, green, amber, pink, violet, orange
- **Entity type colors:** defined in `ENTITY_TYPE_CONFIG` in `constants.js`

### Visual elements
- Paper texture via SVG noise filter
- Custom scrollbar styling
- Fade-in animations
- Mobile-first responsive design

## Local development

Two options for serving the static bundle locally — both give the same production-fidelity preview (relative URLs are auto-selected by `App.js` when `window.location.hostname === 'localhost'`):

```bash
npm run preview                       # Node-based static server at http://localhost:8000/
python3 -m http.server 8000           # Equivalent — Python option, no Node required
```

Override the port with `PREVIEW_PORT=8765 npm run preview`. The server binds to `127.0.0.1` by default so it is not exposed on the LAN; override with `PREVIEW_HOST=0.0.0.0 npm run preview` when LAN access is intentional. No build step needed; the app runs directly from source files via ES module imports. Tailwind CSS is pre-built at `frontend/dist/tailwind.css`.

### Preview audit (WCAG 2.1 AA)

```bash
npm run preview:audit                 # Mobile + desktop, key routes, axe-core scan
```

Spawns the preview server, walks 9 key routes (archive, explorer, entities, about, analytics, record modal, dissertation, dissertation reader, status report) at 375x812 and 1440x900 viewports, runs `axe-core` for WCAG 2.1 AA, and writes `preview-audit-results/axe-report.html` plus per-route screenshots under `preview-audit-results/screenshots/{viewport}/`. Exits non-zero if any violations are found.

## Testing

Tests use Node.js built-in test runner (`node --test`). The suite under `tests/` currently spans 24 files covering data integrity, CSV quality, pipeline, thread algorithm/detection, frontend structure, view-state, route vocabulary, linkify, entity-index, service-worker cache, HTTP cached loader, fetch error handling, schema BOM, data-explorer security, version consistency, and process-record:

```bash
npm test                   # Run the full suite
npm run test:data          # Data integrity + CSV quality
npm run test:pipeline      # Data pipeline + thread detection
npm run test:frontend      # Version consistency + frontend structure
```

## Deployment

The site is hosted at `pressthink.org/j/rosen-archive/`. Deploy by uploading changed files via FTP to `/wp-content/rosen-archive/`. The complete file-by-file deploy manifest (what to upload, what to exclude) lives in `DEPLOYMENT.md`. The end-to-end record-add workflow for non-technical curators lives in `ADDING-RECORDS.md`.

Short version:

1. Edit source files as needed.
2. Regenerate JSON if data changed: `node data/export-archive-data.js`.
3. Bump the version in `index.html`, `version.json`, all `?v=` import strings, and `frontend/sw.js` `CACHE_VERSION` to bust the Cloudflare cache. The service worker serves static JS cache-first with `ignoreSearch: true`, so a `?v=` bump alone does not invalidate it — only a `CACHE_VERSION` change drops the stale service-worker cache. `tests/version-consistency.test.js` enforces that `sw.js` `CACHE_VERSION` matches `version.json`.
4. Upload only the files that changed via FTP.

Pillar 3a (in-flight) automates this for record submissions via `backend/submission_server/` and the `submit-record.yml` / `sweep-stuck-rows.yml` workflows — see those files for the current state.

## Backend data pipeline

Located in `backend/`. Python pipeline for scraping, AI analysis, and content archiving.

### Setup
```bash
cd backend
poetry install
playwright install
```

### Configuration
```bash
cp backend/.env.example backend/.env
# Edit .env with SPREADSHEET_NAME, GEMINI_API_KEY
# Place Google Cloud credentials in backend/google_credentials.json
```

### Key commands
```bash
poetry run python src/workflow.py                      # Main pipeline
poetry run python tools/diagnostics/data_deduper.py    # Dedup data
poetry run python tools/backfill/backfill_worker.py    # Fill missing fields
```

Supports: Articles, Videos, Twitter/X, Tumblr, Newspaper Clippings (PDF OCR).

## Rules for Claude

1. **No build step for frontend.** Never suggest npm/webpack/vite for the production frontend. The only npm usage is `node data/export-archive-data.js` for data generation and `npm test` for testing.
2. **Match the design system.** Use Roboto Mono body text, Special Elite for display headings, paper texture background. Follow `constants.js` color definitions.
3. **Dissertation content is sacred.** Quotes and content in `dissertationData.js` are verified citations. Do not modify, paraphrase, or fabricate quotes.
4. **Use HTM, not JSX.** All components use the `html` tagged template from `./html.js`. Import it as `import { html } from '../html.js?v=3.3.0'`.
5. **Version all imports.** Every `.js` import must include the `?v=3.3.0` query parameter. Check `index.html` for the current version.
6. **Standalone pages go in `/dissertation/` or `/features/`.** Each gets its own subdirectory with an `index.html`.
7. **Keep data regeneration working.** If you modify CSV structure, update `data/export-archive-data.js` to match.
8. **Backend uses Poetry.** Not pip directly. Run commands with `poetry run python ...`.
9. **Git LFS for PDFs.** Large PDF files in `dissertation/` are managed via Git LFS.
10. **Don't modify archived code.** `/archived/` is reference only.
11. **Sentence case everywhere.** Never use Title Case in UI text, comments, or documentation.
12. **Skip `do-not-automate` issues.** Issues labeled `do-not-automate` are tracked for human visibility only. Enumerate candidate work with `gh issue list --search 'is:open -label:"do-not-automate"'` so they never enter selection. Never select, work on, or open a pull request against one, and never change its state; stop if you have already opened one (each also carries a "DO NOT AUTOMATE" banner).

## Known issues

- Social media records (~29,700) have generic titles ("Tweet by Jay Rosen", "Post by Jay Rosen"). Fixing this would require AI-based title generation from post content.
- Browser localStorage can fill up on the live site due to data size. The ~13 MB `archive-core.json` exceeds localStorage's ~5 MB cap, so the core-data cache uses IndexedDB (`frontend/services/idbCache.js`, #275) — it structured-clones the parsed object on read (no `JSON.parse`) and persists across tab close. The old localStorage/sessionStorage path remains as a fallback for browsers where IndexedDB is blocked (Safari Private, Firefox strict tracking protection).
- Thread records have placeholder titles ("[Bluesky Thread]") — needs content-based title generation.
- Roughly 200 records have zero extracted relationships, most because their `raw_text` column is empty (issues #207 / #211). Extraction can be rerun once the raw_text gap-fill in issue #208 (PressThink sweep) and #209 (HuffPost sweep) lands.
- 16 records still have `verified=false`. Recovery work is tracked in issue #199 (sub-batches in issue #242 and PR #244/#253). A small set is genuinely unrecoverable — print-only or vanished publications (e.g. The Baffler issue 12 from 1999; the defunct Pew Center for Civic Journalism's print monograph from ~2000).
- `archive.pressthink.org` subdomain has a TLS certificate issue. Records using that subdomain correctly use `http://` URLs — browsers handle these fine but HTTPS fetch will fail.
- Bluesky thread links use `embed.bsky.app` (unauthenticated) rather than `bsky.app`. If Bluesky changes the embed subdomain, update `ThreadModal.js` and `RecordModal.js`.
