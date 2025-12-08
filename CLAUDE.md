# CLAUDE.md - Jay Rosen Digital Archive

This file provides context for Claude Code when working on this repository.

---

## 🔄 Resuming Work on This Repository

**IMPORTANT:** You do NOT need to clone this repository every time you work on it!

### Quick Start for New Sessions

**Just navigate to the local directory:**
```
C:\Users\amdit\OneDrive\Desktop\Crimes\playground\rosen-frontend
```

Claude Code will automatically detect:
- ✅ This is a git repository
- ✅ Connected to GitHub (jamditis/rosen-frontend)
- ✅ Current branch and commit history
- ✅ Any uncommitted changes

### Recommended Workflow

**Before starting work:**
```bash
git status              # Check current state
git pull origin main    # Get latest changes from GitHub
```

**After completing work:**
```bash
git add .
git commit -m "Description of changes"
git push origin main    # Or push to feature branch
```

### When to Clone Fresh

Only clone the repository again if:
- 🔴 The local repository is corrupted
- 🔴 Working from a different computer
- 🔴 You want a completely clean slate

### Why This Workflow is Better

- ⚡ **Much faster** - No re-downloading entire repository
- 📚 **Preserves history** - Keeps your full git history and branches
- 💾 **Saves work** - Any uncommitted local changes are preserved
- 🔄 **Easy sync** - Simple `git pull` to get updates from GitHub

**Your local repository is already perfectly set up. Just navigate to the directory and start working!**

---

## Project Status

**STATUS: READY FOR PUBLICATION (December 2025)**

All development work for the December 2025 dissertation release is complete. The archive has been fully validated and is ready for deployment to the production WordPress site.

---

## 🔄 CURRENT SESSION STATUS (December 8, 2025)

**Branch:** claude/dissertation-launch-restructure
**Version:** 2.26.0 (Path Standardization & Navigation)
**Status:** Path fixes and PressThink navigation complete - READY TO COMMIT

### ✅ COMPLETED WORK (December 8, 2025)

**Path Standardization for pressthink.org/j/rosen-archive/ Deployment**

All dissertation pages updated to use absolute paths rooted at `/j/rosen-archive/`:

1. **Files Updated (12 total):**
   - `dissertation/index.html` - favicon, 10 nav links, text-selection import
   - `dissertation/reader/index.html` - favicon, PDF links (2), added shared-styles.css
   - `dissertation/foreword/index.html` - favicon, nav links, footer links, text-selection
   - `dissertation/concepts/index.html` - favicon, nav links
   - `dissertation/glossary/index.html` - tailwind, shared-styles, text-selection
   - `dissertation/comparison/index.html` - tailwind, text-selection
   - `dissertation/context/index.html` - tailwind, shared-styles, text-selection
   - `dissertation/timeline/index.html` - tailwind, shared-styles, text-selection
   - `dissertation/excerpts/index.html` - tailwind, shared-styles, text-selection
   - `dissertation/faq/index.html` - tailwind, shared-styles, text-selection
   - `dissertation/network-effect/index.html` - tailwind, shared-styles, text-selection
   - `dissertation/reader/src/templates/shell.html` - favicon, PDF link

2. **PressThink Navigation Added:**
   - `dissertation/index.html` - Fixed top nav bar with PressThink + Archive links, footer links
   - `dissertation/reader/index.html` - PressThink button in header
   - `dissertation/foreword/index.html` - PressThink in nav and footer

3. **shared-styles.css:**
   - Added to dissertation reader (was missing)

**Next Steps:**
- Commit these changes
- Test on local server to verify all paths work
- Deploy to pressthink.org/j/rosen-archive/

---

### ✅ PREVIOUS WORK (December 6, 2025)

**Pre-Launch Review & Cleanup**

1. **Full Project Validation**
   - Validated all 8 dissertation feature tools in `/features/`
   - Validated dissertation launch site components in `/labs/dissertation-launch/`
   - Data integrity confirmed: 29,828 records, all JSON/CSV files healthy
   - All frontend components (26 JS files) validated - zero errors

2. **Path Standardization for WordPress Deployment**
   - Updated `features/network-effect/` to use absolute WordPress paths
   - Updated `labs/dissertation-launch/landing-page/` navigation links
   - Updated `labs/dissertation-launch/3d-concepts/info-sphere/` navigation links
   - All features now use consistent `/wp-content/rosen-archive/` paths

3. **Documentation Cleanup**
   - Fixed broken link in CLAUDE.md (removed reference to non-existent BLUESKY_THREAD_VIEWER_IMPLEMENTATION.md)
   - Deleted empty `docs/GEMINI.md` file
   - Updated `docs/AGENTS.md` to remove hardcoded Windows paths
   - Archived obsolete planning documents to `/archived/docs/planning/`:
     - REPO_REORGANIZATION_PLAN.md (completed work)
     - DISSERTATION_INTEGRATION_PLAN.md (completed work)
     - DISSERTATION_LAUNCH_PLAN.md (completed work)

4. **Backend Validation**
   - Confirmed all referenced scripts exist and are functional
   - No critical TODO/FIXME issues found
   - All configuration files (pyproject.toml, poetry.lock, .env.example) present
   - Code quality validated - all Python files compile successfully

**Launch Readiness:** ✅ All components validated and ready for Monday soft launch

---

### ✅ PREVIOUS WORK (December 4, 2025)

**Dissertation Launch Site (v2.25.0)**

1. **Landing Page** - `labs/dissertation-launch/landing-page/`
   - Hero section with typewriter-style title and key quote
   - "Why This Dissertation Matters" section with three insight cards
   - Navigation grid linking to reader, 3D concept map, glossary
   - About Jay Rosen section with bio and external links
   - Responsive design with Special Elite and Roboto Mono fonts

2. **3D Concept Sphere** - `labs/dissertation-launch/3d-concepts/info-sphere/`
   - Three.js force-directed graph with 45+ concepts
   - 6 color-coded categories (Core Concepts, Movements, Thinkers, etc.)
   - Interactive click-to-focus with smooth camera transitions
   - Info panel showing node details and summaries
   - Custom node rendering with colored spheres and word-wrapped labels

3. **Dissertation Reader Enhancements** - `features/dissertation-reader/`
   - **Text Selection Context Menu**: Highlight text → Share/Cite/Copy buttons
   - **Shareable Quote PNG**: Canvas-generated 1200x630px images for social media
   - **Character limit (500)** for image generation with user feedback
   - **Dark mode fix**: Settings modal text now visible
   - **New header buttons**: PDF download, NotebookLM, Archive
   - **New footer button**: NotebookLM link

4. **Standardization**
   - Unified favicon across all dissertation pages
   - Consolidated PDFs to single file: `THE_IMPOSSIBLE_PRESS_NYU_ROSEN-JAY-1986.pdf`

**GitHub CLI Installed**: `gh` is now available for PR creation

### ✅ PREVIOUS WORK (December 3-4, 2025)

**Archive Status:**
- Total records: 869 (659 original + 138 Tumblr + 62 clippings + 10 threads)
- Entity extraction: 25,972 entities from 10,000 social posts (90.1% success rate)
- Thread records: 10 THREAD-* records with full visualization
- Relationships: 16,539 total (16,197 entity + 342 thread)

**Major Accomplishments:**

1. **Taxonomy Consolidation** - PR #93 MERGED
   - Consolidated 14 overlapping eras → 8 clean eras
   - Added: "COVID-19 Era (2020-2021)" and "Trump II & Beyond (2025-Present)"
   - Normalized 2,992 tag instances (862 case variations fixed)
   - Result: 650/659 records updated (98.6%), 100% schema compliant

2. **Content Imports Completed**
   - Tumblr: 138 posts from studio20nyu.tumblr.com
   - Newspaper Clippings: 62 OCR-processed clippings

3. **Full-Scale Entity Extraction**
   - Processed 10,000 prioritized social media posts
   - 5-worker parallel processing (91.6 min vs 7 hours sequential)

4. **Bluesky Thread Reconstruction & Visualization**
   - Parsed 3,071 Bluesky posts into thread hierarchies
   - Built ThreadModal.js with depth-based color coding

**Key Scripts Created:**
- [backend/scripts/merge_new_records.py](backend/scripts/merge_new_records.py) - Main merge script
- [backend/scripts/reconstruct_bluesky_threads.py](backend/scripts/reconstruct_bluesky_threads.py) - Thread hierarchy builder
- [backend/scripts/generate_thread_records.py](backend/scripts/generate_thread_records.py) - Archive record generator
- [backend/scripts/extract_entities_csv_batch.py](backend/scripts/extract_entities_csv_batch.py) - Parallel entity extraction
- [backend/scripts/analyze_extraction_errors.py](backend/scripts/analyze_extraction_errors.py) - Error categorization
- [frontend/components/ThreadModal.js](frontend/components/ThreadModal.js) - Thread visualization component

### 🔄 LOCAL DEVELOPMENT SETUP

**HTTP Server:**
```bash
# Start server on port 8000
python3 -m http.server 8000

# If port conflict, kill process and restart
lsof -ti:8000 | xargs kill -9
python3 -m http.server 8000 > /tmp/http_server.log 2>&1 &
```

**Path Configuration:**
- Local development uses relative paths (`./data/`, `./frontend/`)
- Production (WordPress) uses absolute paths (`/wp-content/rosen-archive/`)
- Files configured: `index.html`, `frontend/constants.js`

**Data Regeneration:**
```bash
# Regenerate split data files from CSV
npm install  # if needed
node data/export-archive-data.js
```

### ⚠️ KNOWN ISSUES TO ADDRESS

1. **Twitter Thread Reconstruction Not Run**
   - Script created: [backend/scripts/reconstruct_twitter_threads.py](backend/scripts/reconstruct_twitter_threads.py)
   - Status: Ready but no Twitter posts in current dataset (social_posts.csv only has Bluesky)
   - Action needed: Run when Twitter data becomes available

2. **Generic Thread Titles**
   - Current: Threads have placeholder titles like "[Bluesky Thread]"
   - Needed: Content-based titles from first post or thread summary
   - Script to update: [backend/scripts/generate_thread_records.py](backend/scripts/generate_thread_records.py)

3. **Background Entity Extraction Jobs**
   - Multiple background Python processes still running (check with BashOutput tool)
   - May need cleanup or monitoring

### 📊 Documentation Updated
- [CHANGELOG.md](CHANGELOG.md) - Multiple version entries
- [docs/narrative/PROGRESS_UPDATE_2025-12-03-part2.md](docs/narrative/PROGRESS_UPDATE_2025-12-03-part2.md)
- [backend/TAXONOMY_ANALYSIS_SUMMARY.md](backend/TAXONOMY_ANALYSIS_SUMMARY.md)

---

## Project Overview

The **Jay Rosen Digital Archive (JRDA)** is a comprehensive monorepo containing:
1. **Frontend Application** - Zero-build React app for exploring Jay Rosen's work
2. **Backend Data Pipeline** - Python system for scraping, AI analysis, and archiving content
3. **Dissertation Materials** - Full PDFs and transcription of the 1986 dissertation
4. **Data Tools** - R scripts and analysis tools
5. **Legacy Frontends** - Previous iterations of the archive interface

### Key Person: Jay Rosen
- Professor of Journalism at NYU since 1986
- Author of groundbreaking work on public journalism, press criticism, and media theory
- Creator of PressThink blog
- Known for concepts like "the view from nowhere," "audience atomization overcome," and critiques of professional journalism

### The Dissertation: "The Impossible Press" (1986)
- Full title: "The Impossible Press: American Journalism and the Decline of Public Life"
- Advisor: Neil Postman
- Central argument: The phrase "the press informs the public" obscures more than it reveals. Journalism is a transaction, not just an action. Professional standards cannot solve structural problems in the press-public relationship.
- **Releasing publicly: December 2025**

---

## Architecture: Zero-Build Static Deployment

**This is NOT a typical React/Node project.** The production version requires no build step.

### Why Zero-Build?
- Can be deployed via FTP to any static web host
- Works on WordPress domains (upload to subdirectory)
- No npm, Webpack, Vite, or build tools required
- All dependencies loaded via CDN

### Tech Stack
- **React 18** via `https://esm.sh/react@18.2.0`
- **HTM** for JSX-like syntax in vanilla JS
- **Tailwind CSS** via CDN with custom config
- **PapaParse** for CSV parsing
- **Lucide React** for icons
- **ES Modules** (native browser imports)

### Dual Architecture
The repo contains two versions:
1. **TypeScript (`.tsx`, `.ts`)** - For development/type checking
2. **Vanilla JS (`.js`)** - For production deployment

The `index.html` loads the JS version. When editing, ensure changes are reflected in both versions if modifying core functionality.

---

## Directory Structure

```
/
├── index.html                    # Main entry point (loads frontend/)
├── shared-styles.css             # Common CSS for all standalone tools
├── favicon.ico                   # Site favicon
│
├── frontend/                     # Main React application
│   ├── index.js                  # React root mount
│   ├── index.css                 # Global styles (paper texture, scrollbar)
│   ├── App.js                    # Main application component
│   ├── constants.js              # Config: data URLs, featured works, colors
│   ├── html.js                   # HTM JSX helper binding
│   ├── tailwind.config.js        # Tailwind CSS configuration
│   ├── dist/                     # Pre-built CSS
│   │   └── tailwind.css          # Compiled Tailwind styles
│   ├── components/               # React components
│   │   ├── Sidebar.js            # Filters, search, autocomplete
│   │   ├── FeaturedSection.js    # Curated works carousel
│   │   ├── Timeline.js           # Year-based bar chart filter
│   │   ├── RecordModal.js        # Detail view modal
│   │   ├── Explorer.js           # Canvas network visualization
│   │   ├── WelcomeModal.js       # Intro overlay
│   │   ├── DissertationPage.js   # Dissertation view container
│   │   ├── MindMap.js            # Interactive tree visualization
│   │   ├── DetailPanel.js        # Dissertation node details
│   │   └── dissertationData.js   # Full dissertation content (70+ nodes)
│   └── services/
│       └── archiveService.js     # Data fetching, parsing, caching
│
├── features/                     # Standalone feature tools
│   ├── comparison-tool/          # "Then and Now" 1986 vs 2025 comparisons
│   ├── glossary/                 # Interactive concept glossary
│   ├── context-1986/             # Historical context page
│   ├── timeline/                 # Dissertation → later work timeline
│   ├── annotated-excerpts/       # Key passages with commentary
│   ├── faq/                      # FAQ interface (Ask the Dissertation)
│   └── dissertation-reader/      # Full text reader with selection sharing
│
├── labs/                         # Experimental/prototype features
│   └── dissertation-launch/      # Dissertation launch site (v2.25.0)
│       ├── landing-page/         # Main landing page
│       └── 3d-concepts/          # 3D concept sphere visualization
│
├── data/                         # Archive data files
│   ├── archive-data.json         # Main archive data (25MB)
│   ├── archive_records-public.csv
│   ├── extracted_entities.csv
│   ├── extracted_relationships.csv
│   └── README.md                 # Data dictionary
│
├── backend/                      # Python data pipeline
│   ├── src/                      # Core source code (processors, scraper, categorizer)
│   ├── scripts/                  # Maintenance and utility scripts
│   ├── tests/                    # Test suite
│   ├── pyproject.toml            # Poetry dependencies
│   ├── poetry.lock               # Locked dependencies
│   └── schema.json               # Data schema
│
├── dissertation/                 # Dissertation source materials
│   ├── *.pdf                     # Original PDF scans (stored via Git LFS)
│   ├── FINAL-ROSEN_...md         # Transcribed markdown
│   └── build_unified_pdf.py      # PDF builder script
│
├── tools/                        # Development and analysis tools
│   ├── active/                   # Currently maintained tools
│   │   ├── dataexplorer/         # Data explorer grid
│   │   └── dataviz/              # Data visualization tool
│   └── analysis/                 # R scripts and planning docs
│       ├── RStudio/              # R analysis scripts
│       └── planning/             # Project planning documentation
│
├── archived/                     # Legacy and archived code
│   ├── archive-v1/               # Original archive interface
│   ├── web/                      # Promotional website
│   └── byok-chat/                # BYOK Claude chat (archived feature)
│
├── docs/                         # Documentation
│   ├── agent-personas/           # AI persona definitions
│   └── narrative/                # Project logs and history
│
├── release-assets/               # Promotional materials and documentation
│   └── documentation/            # Pre-publication reports and status docs
│
├── .github/                      # GitHub configuration
│   ├── workflows/                # CI/CD pipelines
│   │   ├── frontend-validation.yml
│   │   ├── backend-tests.yml
│   │   └── backend-linting.yml
│   ├── ISSUE_TEMPLATE/           # Issue templates
│   └── PULL_REQUEST_TEMPLATE.md  # PR template
│
├── README.md                     # User documentation
├── CHANGELOG.md                  # Development history
├── CLAUDE.md                     # This file
├── SECURITY.md                   # Security policy
├── CODE_OF_CONDUCT.md            # Community standards
├── CONTRIBUTING.md               # Contribution guidelines
└── LICENSE                       # Project license
```

---

## Data Sources

### Main Archive Data
- Pre-processed JSON stored in `/data/archive-data.json`
- URLs configured in `frontend/constants.js`
- Cached in localStorage (1-hour TTL)
- Structure: ID, Title, Author, Publication_Date, URL, Summary, Categories, Concepts, Verified

### Dissertation Data
- Hardcoded in `frontend/components/dissertationData.js`
- Contains 70+ nodes covering the full dissertation structure:
  - Root, Introduction, 2 Parts, 8 Chapters, Conclusion
  - Detailed concept nodes for each chapter
  - Key figure nodes with page references
- Rich content: summaries, pull quotes, key concepts, key figures, page ranges
- Also includes `NOTABLE_QUOTATIONS` (9 entries) and `KEY_THEMES` (7 entries) arrays

---

## Design System

### Fonts
- **Display:** `Special Elite` (typewriter aesthetic)
- **Body:** `Roboto Mono` (monospace for readability)

### Colors
- **Background:** `#fdfbf7` (paper)
- **Cards:** `#ffffff`
- **Text:** `stone-900` / `#1c1917`
- **Accents:** sky, green, amber, pink, violet, orange (for categories)

### Visual Elements
- Paper texture via SVG noise filter
- Custom scrollbar styling
- Smooth fade-in animations
- Responsive breakpoints (mobile-first)

---

## Key Components Explained

### frontend/services/archiveService.js
- Fetches JSON data from `/data/archive-data.json`
- Parses and normalizes records
- Implements localStorage caching with TTL
- Injects the dissertation record into all queries

### frontend/components/Explorer.js
- HTML5 Canvas network visualization
- Nodes represent archive records
- Connections based on shared concepts/categories
- Manhattan-style curved paths
- Export to PNG capability

### frontend/components/MindMap.js
- Tree visualization of dissertation structure
- Click to select nodes
- Double-click to expand/collapse
- Dynamic layout calculation

### features/comparison-tool/
- **Completely standalone** - can be deployed separately
- No dependencies on main archive code
- Side-by-side 1986 vs 2025 comparisons
- 7 entries covering key dissertation themes

---

## Common Tasks

### Local Development
```bash
python3 -m http.server 8000  # Open http://localhost:8000
```

### Updating Archive Data
1. Edit CSV: `data/archive_records-public.csv`
2. Regenerate JSON: `node data/export-archive-data.js`
3. Cache busting: Increment `CACHE_VERSION` in `frontend/services/archiveService.js`

### Deployment
Deploy via FTP: `index.html`, `frontend/`, `features/`, `data/` directories to WordPress subdirectory.

---

## December 2025 Dissertation Release

**STATUS: ALL TOOLS COMPLETE AND VALIDATED**

9 dissertation presentation tools implemented in `/features/` directory. See `release-assets/documentation/pre-publication-report.md` for full status.

---

## Important Notes for Claude

1. **No build step required** - Don't suggest npm commands or build processes for frontend
2. **Match existing style** - Use Roboto Mono, Special Elite fonts, paper texture
3. **Standalone tools go in /features/** - Each feature has its own subdirectory
4. **Update documentation** - Keep README.md, CHANGELOG.md, and this file current
5. **Dissertation content is sacred** - Quotes and content from `frontend/components/dissertationData.js` are accurate citations
6. **WordPress deployment** - Final tools will be uploaded via FTP to a WordPress domain
7. **Backend uses Poetry** - Python dependencies managed via Poetry, not pip directly
8. **Dissertation source in /dissertation/** - Full PDFs (managed via Git LFS) and transcription available there
9. **Git LFS required** - Repository uses Git LFS for large PDF files; install before cloning
10. **Always check PROJECT_LOG.md** - Review `docs/narrative/PROJECT_LOG.md` before major edits for context
11. **Archived code in /archived/** - Legacy tools and archived features kept for reference

---

## Backend Data Pipeline

Located in `/backend/`, the Python pipeline processes and archives content.

### Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install poetry
poetry install
playwright install
```

### Configuration
Copy `backend/.env.example` to `backend/.env` and fill in your values:
```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:
```
SPREADSHEET_NAME="Your Google Sheet Name"
GEMINI_API_KEY="your_gemini_api_key"
```

Place Google Cloud credentials in `backend/google_credentials.json`.

### Commands
```bash
python src/workflow.py                      # Main pipeline (now supports Twitter, Tumblr, PDFs)
python tools/diagnostics/data_deduper.py    # Clean data
python tools/backfill/backfill_worker.py    # Fill missing fields
```

### Content Type Processors

Backend supports: Articles, Videos, Twitter/X, Tumblr, Newspaper Clippings (PDFs with OCR). See `backend/src/rosen_scraper/processors/` for implementations.

---

## CI/CD Pipelines

GitHub Actions workflows automatically validate code on push/PR:

| Workflow | Purpose | Triggers |
|----------|---------|----------|
| `frontend-validation.yml` | Validates HTML syntax, JS syntax, CDN links | Frontend file changes |
| `backend-tests.yml` | Runs pytest on backend code | Backend file changes |
| `backend-linting.yml` | Runs ruff, black, mypy | Backend file changes |

All workflows run automatically on pull requests to ensure code quality before merging.

---

## GitHub Issues & Labels

Available labels: `backend`, `frontend`, `bug`, `enhancement`, `documentation`. Always label issues appropriately.

---

## Contact & Attribution

- **Archive Curator:** Joe Amditis
- **Subject:** Jay Rosen, NYU Professor of Journalism
- **Repository:** jamditis/rosen-frontend
