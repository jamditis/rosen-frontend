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

## 🔄 CURRENT SESSION STATUS (December 3, 2025)

**Branch:** main
**Last PR Merged:** #93 (taxonomy-consolidation-dec3)

### ✅ Recently Completed (Dec 3)
1. **Taxonomy Consolidation** - PR #93 MERGED
   - Consolidated 14 overlapping eras → 8 clean eras (added COVID-19 2020-2021 and Trump II 2025-Present)
   - Normalized 2,992 tag instances (862 case variations fixed)
   - Fixed 8 key_concepts case variations
   - Removed colQ_changes column (schema violation)
   - Fixed 31 content_type records, 5 scope records
   - **Result:** 650/659 records updated (98.6%), 100% schema compliant
   - Files: [archive_records-public.csv](data/archive_records-public.csv)

2. **Tumblr Import** - 138 posts processed
   - Source: studio20nyu.tumblr.com export
   - Format: JSON with full metadata
   - IDs: TUMBLR-00001 to TUMBLR-00138
   - File: [backend/tumblr_records.json](backend/tumblr_records.json)

3. **Newspaper Clipping OCR** - 62 clippings processed
   - Gemini Flash 2.0: 58/84 success
   - Tesseract fallback: 16 additional (74/84 total)
   - IDs: CLIP-00001 to CLIP-00062
   - File: [backend/clipping_records.json](backend/clipping_records.json)

4. **Entity Extraction Schema v3.0**
   - Added record context awareness
   - Prevents self-referential entities
   - Updated [backend/entity_extraction_schema_v3.json](backend/entity_extraction_schema_v3.json)

### ✅ RECENTLY COMPLETED (Dec 3 - Session 2)
**Merge new records into main archive CSV - COMPLETED**

**Accomplished:**
1. ✅ Created `backend/scripts/merge_new_records.py` with full validation
2. ✅ Successfully merged 138 Tumblr + 62 clipping records
3. ✅ All 200 new records properly transformed (dates, eras, word counts)
4. ✅ Backup created: `archive_records-public_backup_20251202_221548.csv`
5. ✅ Merge report generated: `backend/merge_report_20251202_221548.json`
6. ✅ Backfilled 2 missing publication dates (book records set to 1999-01-01)
7. ✅ **Final result:** 859 total records, 859 valid, 0 errors

**Files created:**
- [backend/scripts/merge_new_records.py](backend/scripts/merge_new_records.py) - Main merge script
- [backend/scripts/backfill_missing_dates.py](backend/scripts/backfill_missing_dates.py) - Date backfill utility

### 🚧 NEXT IMMEDIATE TASK
**Social Media Threading & Relationship Mapping**

**Current state:**
- Main archive: 859 records (newly merged)
- Social posts: 29,187 (26,116 Twitter + 3,071 Bluesky)
- Existing relationships: 7,500 (incomplete, main archive only)
- Threading: Bluesky 67.7%, Twitter 0%

**What needs to happen:**
1. Reconstruct Bluesky threads (parse AT protocol URIs)
2. Reconstruct Twitter threads (multi-strategy heuristic)
3. Run entity extraction on ~15K substantive posts (7+ words, $50 budget)
4. Generate thread relationships (REPLIES_TO, PART_OF_THREAD)
5. Generate topical relationships (DISCUSSES_SAME_TOPIC)
6. Link social posts to archive records (REFERENCES, RELATED_TO)
7. Merge all into unified `all_relationships.csv`

**Key reference:**
- [backend/UNIFIED_THREADING_AND_RELATIONSHIPS_ROADMAP.md](backend/UNIFIED_THREADING_AND_RELATIONSHIPS_ROADMAP.md) - Full implementation plan

### 📋 Remaining Tasks (After Merge)
1. Test entity extraction on sample records (v3.0 schema)
2. Run batch entity extraction on all 200 new records
3. Regenerate frontend data files

### 📊 Documentation Updated
- [CHANGELOG.md](CHANGELOG.md) - Added [2.23.0] entry
- [docs/narrative/PROGRESS_UPDATE_2025-12-03-part2.md](docs/narrative/PROGRESS_UPDATE_2025-12-03-part2.md) - Full session narrative
- [docs/narrative/PROJECT_LOG.md](docs/narrative/PROJECT_LOG.md) - Added [2.23.0] entry
- [backend/TAXONOMY_ANALYSIS_SUMMARY.md](backend/TAXONOMY_ANALYSIS_SUMMARY.md) - Era consolidation analysis

### 🔧 Key Scripts Created
- [backend/scripts/analyze_taxonomy.py](backend/scripts/analyze_taxonomy.py) - Deep taxonomy analysis
- [backend/scripts/analyze_csv_schema.py](backend/scripts/analyze_csv_schema.py) - Schema validation
- [backend/scripts/analyze_data_standardization.py](backend/scripts/analyze_data_standardization.py) - Format checking
- [backend/scripts/consolidate_taxonomy.py](backend/scripts/consolidate_taxonomy.py) - Main consolidation (USED)

### ⚠️ Important Notes for Next Session
1. DO NOT re-run consolidate_taxonomy.py - changes already applied and merged
2. When creating merge script, preserve the 8-era structure exactly
3. Tumblr dates use M/D/YYYY format (e.g., "09/24/2011")
4. Clipping dates use MM/DD/YYYY format (e.g., "09/14/1991")
5. Both JSON files have compatible field names with CSV schema

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
│   └── dissertation-reader/      # Dissertation PDF viewer
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

### Adding a New Comparison (comparison-tool)
Edit `features/comparison-tool/data.js`:
```javascript
{
  id: 'unique-id',
  theme: 'Display Theme Name',
  then: {
    year: 1986,
    chapter: 'Chapter N: Title',
    pages: 'XXX-YYY',
    quote: 'Direct quote from dissertation...',
    context: 'Explanation of the 1986 context...'
  },
  now: {
    year: 2025,
    headline: 'Short headline',
    observation: 'Current reality description...',
    examples: ['Example 1', 'Example 2', 'Example 3']
  },
  connection: 'How 1986 insight connects to 2025 reality...'
}
```

### Adding Dissertation Content
Edit `frontend/components/dissertationData.js`:
- Add nodes to `DISSERTATION_NODES` array
- Add quotes to `NOTABLE_QUOTATIONS`
- Add themes to `KEY_THEMES`

### Updating Archive Data
1. Update the source data and regenerate `/data/archive-data.json`
2. Wait for cache to expire (1 hour) OR
3. Increment `CACHE_VERSION` in `frontend/services/archiveService.js`

### Local Development
```bash
# Start local server (Python)
python -m http.server 8000

# Or with Node
npx serve .

# Open http://localhost:8000
```

### Deployment
1. Upload `index.html`, `shared-styles.css`, `favicon.ico` from root
2. Upload entire `frontend/` directory
3. Upload entire `features/` directory
4. Upload `data/` directory with archive data
5. Ensure server serves `.js` with MIME type `application/javascript`

---

## December 2025 Dissertation Release

**STATUS: ALL TOOLS COMPLETE AND VALIDATED**

The dissertation is being released publicly with multiple presentation formats:

### Implemented and Ready
1. **Interactive Mind Map** - Tree visualization of dissertation structure (in main archive)
2. **"Then and Now" Comparison Tool** - 7 side-by-side 1986 vs 2025 comparisons (`/features/comparison-tool/`)
3. **Glossary** - 16 key concepts, filterable, with detail panel (`/features/glossary/`)
4. **1986 in Journalism** - Historical context, media landscape, what didn't exist (`/features/context-1986/`)
5. **Timeline** - 14 entries from dissertation to 2025, filterable by type (`/features/timeline/`)
6. **Annotated Excerpts** - 12 key passages with 2025 commentary (`/features/annotated-excerpts/`)
7. **FAQ / Ask the Dissertation** - 46 Q&A pairs, searchable, NotebookLM integration (`/features/faq/`)
8. **Dissertation Reader** - Landing page with PDF download, ToC, citation info (`/features/dissertation-reader/`)
9. **Network Explorer** - Canvas visualization of archive record relationships (in main archive)

### Archived (developed but not active)
10. **BYOK Chat Interface** - Interactive Claude chat using user's own API key (`/archived/byok-chat/`)

### Future Development (requires external content)
- Audio commentary / office hours (requires Jay to record)
- "What I got wrong" essay (requires Jay to write)
- "The chapter I'd add today" essay (requires Jay to write)
- Reading group format with discussion prompts
- Collaborative annotation (Hypothesis integration)
- Video essay (requires video production)

### Pre-Publication Report
See `release-assets/documentation/pre-publication-report.md` for the full status report.

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

### NEW: Content Type Processors (Dec 1, 2025)

The backend now supports three additional content types beyond articles and videos:

**Processors Location:** `backend/src/rosen_scraper/processors/`

1. **Twitter/X Processor** (`twitter_processor.py`)
   - Extracts threads and individual tweets
   - Nitter proxy with 4 fallback instances + Playwright fallback
   - Handles both `twitter.com` and `x.com` URLs
   - Full thread extraction with numbering and quote tweets

2. **Tumblr Processor** (`tumblr_processor.py`)
   - Processes Tumblr export files (JSON, HTML) and live URLs
   - Supports 8 post types: text, quote, link, photo, video, audio, answer, chat
   - OCR-ready for archive exports
   - Generates `TUMBLR-XXXXX` IDs

3. **Newspaper Clipping Processor** (`clipping_processor.py`)
   - OCR text cleanup (artifacts, line breaks, hyphenation)
   - Metadata extraction (publication, date, author, page)
   - Supports 12 major publications (NYT, WSJ, WP, LAT, etc.)
   - Generates publication-specific IDs (`NYT-XXXXX`, `WSJ-XXXXX`, `CLIP-XXXXX`)
   - Confidence scoring for extracted metadata

**Dispatcher Integration:**
- `dispatcher.py` automatically routes URLs to appropriate processors
- All new processors integrated with AI analysis pipeline
- Schema updated with "Tumblr Post" and "Newspaper Clipping" content formats

**Status:** ✅ Backend fully operational. Can process Twitter, Tumblr, and PDF content. Frontend display updates pending.

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

When creating GitHub issues, always apply appropriate labels:

### Available Labels
| Label | Color | Description |
|-------|-------|-------------|
| `backend` | Purple (#5319E7) | Backend Python pipeline |
| `frontend` | Green (#0E8A16) | Frontend React/JS application |
| `bug` | Red (default) | Something isn't working |
| `enhancement` | Blue (default) | New feature or request |
| `documentation` | Blue (default) | Improvements or additions to documentation |

### Labeling Guidelines
- **Always label issues** - Every issue should have at least one label
- **Use component labels** - Add `backend` or `frontend` to indicate which part of the codebase
- **Use type labels** - Add `bug`, `enhancement`, or `documentation`
- **Multiple labels are good** - e.g., `backend, bug` for a backend bug

### Creating Issues via CLI
```bash
# Good - with labels
gh issue create --title "Fix broken import" --body "..." --label "backend,bug"

# If labels don't exist yet, create them first
gh label create "backend" --description "Backend Python pipeline" --color "5319E7"
```

---

## Contact & Attribution

- **Archive Curator:** Joe Amditis
- **Subject:** Jay Rosen, NYU Professor of Journalism
- **Repository:** jamditis/rosen-frontend
