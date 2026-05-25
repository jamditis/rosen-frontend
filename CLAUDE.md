# CLAUDE.md - Jay Rosen Internet Archive


## Bug-fixing workflow

When a bug is reported, don't immediately attempt to fix it. Instead:

1. **Write a failing test first** that reproduces the bug
2. **Launch subagents** to work on fixing the bug
3. **Verify the fix** by running the test — a passing test proves the bug is fixed

---

## Project overview

The **Jay Rosen Internet Archive** is a public collection of the works, critiques, and teachings of Jay Rosen, NYU professor of journalism. It covers four decades of journalism criticism, media theory, and public life.

- **Live URL:** https://pressthink.org/j/rosen-archive/
- **Repository:** github.com/jamditis/rosen-frontend
- **Current version:** v3.3.0
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

Data is split into three files for performance, with a full fallback:

| File | Size | Contents | Loads |
|------|------|----------|-------|
| `data/archive-core.json` | 10.8 MB | Lightweight record cards | On page load |
| `data/archive-details.json` | 11.6 MB | Full summaries, quotes, concepts | On demand |
| `data/archive-entities.json` | 1.0 MB | Entity graph for Explorer | On demand |
| `data/archive-data.json` | 25.9 MB | Full combined data (fallback) | Only if split files fail |

Configured in `frontend/constants.js` via `DATA_CONFIG`.

### Source CSV files

| File | Records | Contents |
|------|---------|----------|
| `data/archive_records-public.csv` | 932 | Non-social archive records (702 RECORD, 137 TUMBLR, 83 CLIP, 10 THREAD). Line count is high (~49k) due to multi-line text fields. |
| `data/social_posts.csv` | ~29,130 | Twitter/X and Bluesky posts |
| `data/extracted_entities.csv` | 5,036 | Named entities (people, orgs, concepts) |
| `data/extracted_relationships.csv` | 4,666 | Entity-to-record relationships |

### Regenerating JSON from CSV

```bash
npm install          # first time only (csv-parse, csv-stringify)
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
| Explorer | `#explorer` | `Explorer.js` | Network visualization of entities |
| Entities | `#entities` | `EntityBrowser.js` | Browse/search extracted entities |
| Dissertation | `#dissertation` | `DissertationPage.js` | Mind map + detail panel |
| About | `#about` | `AboutPage.js` | About the archive |
| Analytics | `#analytics` | `AnalyticsDashboard.js` | Archive statistics |

Record deep links: `?record=RECORD_ID` opens a record modal on any route.

## Directory structure

```
/
├── index.html                       # Entry point (import map, React mount)
├── shared-styles.css                # Common CSS for standalone tools
├── favicon.ico
├── package.json                     # Node scripts (test, export-data, build:css)
│
├── frontend/                        # Main React application
│   ├── index.js                     # React root mount
│   ├── index.css                    # Global styles (paper texture, scrollbar)
│   ├── App.js                       # Main app component + routing
│   ├── constants.js                 # Data URLs, featured works, colors, entity types
│   ├── html.js                      # HTM/React binding
│   ├── tailwind.config.js           # Tailwind config
│   ├── dist/tailwind.css            # Pre-built Tailwind output
│   ├── components/
│   │   ├── AboutPage.js             # About the archive
│   │   ├── AnalyticsDashboard.js    # Archive statistics charts
│   │   ├── DetailPanel.js           # Dissertation node detail sidebar
│   │   ├── dissertationData.js      # Dissertation content (70+ nodes)
│   │   ├── DissertationPage.js      # Dissertation view container
│   │   ├── EntityBrowser.js         # Entity search and browse
│   │   ├── Explorer.js              # Canvas network visualization
│   │   ├── FeaturedSection.js       # Curated works carousel
│   │   ├── LoadingQuotes.js         # Loading screen with rotating quotes
│   │   ├── MindMap.js               # Interactive dissertation tree
│   │   ├── QueryBuilder.js          # Advanced search query builder
│   │   ├── RecordModal.js           # Record detail modal
│   │   ├── Sidebar.js               # Filters, search, autocomplete
│   │   ├── ThreadModal.js           # Social media thread visualization
│   │   ├── Timeline.js              # Year-based bar chart filter
│   │   ├── ToolsModal.js            # Dissertation tools launcher
│   │   ├── WelcomeModal.js          # First-visit intro overlay
│   │   ├── WorkInProgressBanner.js  # WIP notice banner
│   │   └── shared/                  # Reusable UI primitives
│   │       ├── Button.js
│   │       ├── Card.js
│   │       ├── ErrorState.js
│   │       ├── Header.js
│   │       ├── index.js             # Barrel export
│   │       ├── LoadingState.js
│   │       └── Modal.js
│   └── services/
│       ├── archiveService.js        # Data loading, entity maps, search
│       ├── router.js                # Hash-based routing
│       └── sqliteService.js         # sql.js SQLite queries
│
├── dissertation/                    # Dissertation presentation tools (9 tools)
│   ├── index.html                   # Dissertation landing page
│   ├── reader/                      # Full text reader with selection sharing
│   ├── glossary/                    # Interactive concept glossary
│   ├── comparison/                  # "Then and Now" 1986 vs 2025
│   ├── context/                     # Historical context page
│   ├── excerpts/                    # Annotated key passages
│   ├── faq/                         # "Ask the Dissertation" FAQ
│   ├── concepts/                    # 3D concept sphere (Three.js)
│   ├── foreword/                    # Foreword page
│   └── network-effect/              # Network film analysis
│
├── features/                        # Standalone feature pages
│   ├── shared/                      # Shared feature assets
│   └── status-report/               # Archive status report generator
│
├── data/                            # Archive data files + export scripts
│   ├── archive-data.json            # Full combined JSON (26 MB)
│   ├── archive-core.json            # Lightweight records (11 MB)
│   ├── archive-details.json         # Full details (12 MB)
│   ├── archive-entities.json        # Entity graph (1.1 MB)
│   ├── archive_records-public.csv   # Source records
│   ├── social_posts.csv             # Social media posts
│   ├── extracted_entities.csv       # Named entities
│   ├── extracted_relationships.csv  # Entity relationships
│   ├── export-archive-data.js       # JSON generator script
│   └── README.md                    # Data dictionary
│
├── backend/                         # Python data pipeline
│   ├── src/                         # Scraper, processors, categorizer
│   ├── scripts/                     # Maintenance scripts
│   ├── tests/                       # Python test suite
│   ├── pyproject.toml               # Poetry dependencies
│   └── schema.json                  # Data schema
│
├── tools/active/                    # Development tools
│   ├── dataexplorer/                # Tabular data explorer
│   └── dataviz/                     # Data visualization tool
│
├── tests/                           # Frontend/data test suite (Node.js)
│   ├── csv-quality.test.js
│   ├── data-integrity.test.js
│   ├── data-pipeline.test.js
│   ├── frontend-structure.test.js
│   ├── process-record.test.js
│   ├── thread-algorithm.test.js
│   ├── thread-detection.test.js
│   └── version-consistency.test.js
│
├── archived/                        # Legacy code (reference only)
│   ├── archive-v1/                  # Original archive interface
│   ├── web/                         # Win95-themed promotional site
│   ├── byok-chat/                   # Archived BYOK Claude chat
│   └── academic-testimonials/       # Archived testimonials
│
├── docs/                            # Project documentation
│   ├── agent-personas/              # Contributor role definitions
│   │   ├── contributor-guide.md     # Project overview + how to contribute
│   │   ├── data-pipeline-engineer.md # Python backend, scraping, AI analysis
│   │   ├── frontend-developer.md    # React/HTM components, design system
│   │   ├── data-curator.md          # Archive records, CSV, data quality
│   │   └── code-reviewer.md         # Review standards + project conventions
│   └── narrative/                   # Project history and reference docs
│       ├── project-history.md       # Linear narrative of the project
│       ├── architecture.md          # Current technical architecture
│       ├── data-pipeline.md         # Pipeline contributor guide + warnings
│       └── changelog.md             # Version history (v0.0.1 through v4.0.0)
│
├── DEPLOYMENT.md                    # FTP deploy manifest (what to upload)
│
├── .github/workflows/               # CI/CD
│   ├── frontend-validation.yml      # HTML/JS syntax, CDN link checks
│   ├── backend-tests.yml            # pytest
│   ├── backend-linting.yml          # ruff, black, mypy
│   ├── claude-code-review.yml       # Claude code review
│   └── claude.yml                   # Claude integration
│
└── .claude/
    ├── settings.local.json          # Claude Code settings
    ├── commands/                     # Slash commands
    └── skills/                      # Domain skills (7 skills)
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

Override the port with `PREVIEW_PORT=8765 npm run preview`. No build step needed; the app runs directly from source files via ES module imports. Tailwind CSS is pre-built at `frontend/dist/tailwind.css`.

### Preview audit (WCAG 2.1 AA)

```bash
npm run preview:audit                 # Mobile + desktop, key routes, axe-core scan
```

Spawns the preview server, walks 9 key routes (archive, explorer, entities, about, analytics, record modal, dissertation, dissertation reader, status report) at 375x812 and 1440x900 viewports, runs `axe-core` for WCAG 2.1 AA, and writes `preview-audit-results/axe-report.html` plus per-route screenshots under `preview-audit-results/screenshots/{viewport}/`. Exits non-zero if any violations are found.

## Testing

Tests use Node.js built-in test runner (`node --test`):

```bash
npm test                   # Run all 8 test files
npm run test:data          # Data integrity + CSV quality
npm run test:pipeline      # Data pipeline + thread detection
npm run test:frontend      # Version consistency + frontend structure
```

## Deployment

### Production: WordPress FTP

The site is hosted at `pressthink.org/j/rosen-archive/`. Deploy by uploading changed files via FTP.

To deploy:
1. Edit source files as needed
2. Regenerate JSON if data changed: `node data/export-archive-data.js`
3. Bump the version in `index.html`, `version.json`, and all `?v=` import strings
4. Upload changed files via FTP

Do not upload CSVs, backup files, screenshots, or the entire repo — only the files that changed. After upload, increment `?v=` query parameters on all JS/CSS imports to bust CloudFlare cache.

### Updating archive data

1. Edit source CSV: `data/archive_records-public.csv`
2. Regenerate JSON: `node data/export-archive-data.js`
3. Upload updated JSON files via FTP
4. Bump version strings for cache busting

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

## Known issues

- Social media records (~29,000) have generic titles ("Tweet by Jay Rosen", "Post by Jay Rosen"). Fixing this would require AI-based title generation from post content.
- Browser localStorage can fill up on the live site due to data size. Caching is disabled as a workaround.
- Thread records have placeholder titles ("[Bluesky Thread]") — needs content-based title generation.
- 2 records have no recoverable URL or digital copy: RECORD-00663 (The Baffler issue 12, March 1999 — print-only; Baffler's web archive only goes back to ~2010) and RECORD-00667 (Pew Center for Civic Journalism, ~2000 — defunct in 2003; speeches/research/civic catalog indexes enumerated May 2026 with no Rosen entries; likely a print monograph). Recovery would need library microfilm or contact with the publications. RECORD-00673 (The Nation), 00693, 00694 (HuffPost) were URL-recovered via Wayback CDX search in May 2026. See issues #199 and #207.
- `archive.pressthink.org` subdomain has a TLS certificate issue. Records using that subdomain correctly use `http://` URLs — browsers handle these fine but HTTPS fetch will fail.
- Bluesky thread links use `embed.bsky.app` (unauthenticated) rather than `bsky.app`. If Bluesky changes the embed subdomain, update `ThreadModal.js` and `RecordModal.js`.
