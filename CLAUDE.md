# CLAUDE.md - Jay Rosen Digital Archive

This file provides context for Claude Code when working on this repository.

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
- Being released publicly in December 2025

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
├── index.html                    # Main entry point
├── index.js                      # React root mount
├── index.css                     # Global styles (paper texture, scrollbar)
├── App.js                        # Main application component
├── constants.js                  # Config: Sheet URLs, featured works, colors
├── html.js                       # HTM JSX helper binding
│
├── components/
│   ├── App.js                    # Root container & state management
│   ├── Sidebar.js                # Filters, search, autocomplete
│   ├── FeaturedSection.js        # Curated works carousel
│   ├── Timeline.js               # Year-based bar chart filter
│   ├── RecordModal.js            # Detail view modal
│   ├── Explorer.js               # Canvas network visualization
│   ├── WelcomeModal.js           # Intro overlay
│   ├── DissertationPage.js       # Dissertation view container
│   ├── MindMap.js                # Interactive tree visualization
│   ├── DetailPanel.js            # Dissertation node details
│   └── dissertationData.js       # Full dissertation content (70+ nodes)
│
├── services/
│   └── archiveService.js         # Data fetching, parsing, caching
│
├── comparison-tool/              # "Then and Now" 1986 vs 2025 comparisons
├── glossary/                     # Interactive concept glossary
├── context-1986/                 # Historical context page
├── timeline/                     # Dissertation → later work timeline
├── annotated-excerpts/           # Key passages with commentary
├── faq/                          # FAQ + BYOK Chat interface
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
│   ├── *.pdf                     # Original PDF scans
│   ├── *.md                      # Transcribed markdown
│   └── build_unified_pdf.py      # PDF builder script
│
├── data-tools/                   # Analysis and planning tools
│   ├── RStudio/                  # R scripts for analysis
│   └── planning/                 # Project planning docs
│
├── docs/                         # Documentation
│   ├── agent-personas/           # AI persona definitions
│   └── narrative/                # Project logs and history
│
├── tools/                        # Additional presentation tools
│   ├── dataexplorer/             # Data explorer grid (active development)
│   ├── dataviz/                  # Data visualization tool (active development)
│   ├── dissertation-reader/      # Dissertation reader app (active development)
│   ├── archive-v1/               # Original archive app (reference)
│   └── web/                      # Promotional website
│
├── release-assets/               # Promotional materials
├── shared-styles.css             # Common CSS for all standalone tools
├── README.md                     # User documentation
├── changelog.md                  # Development history
└── CLAUDE.md                     # This file
```

---

## Data Sources

### Main Archive Data
- Stored in Google Sheets, published as CSV
- URLs configured in `constants.js`
- Cached in localStorage (1-hour TTL)
- Sheet structure: ID, Title, Author, Publication_Date, URL, Summary, Categories, Concepts, Verified

### Dissertation Data
- Hardcoded in `components/dissertationData.js`
- Contains 13 nodes: root, intro, 2 parts, 8 chapters, conclusion
- Rich content: summaries, pull quotes, key concepts, key figures, page ranges
- Also includes `NOTABLE_QUOTATIONS` and `KEY_THEMES` arrays

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

### archiveService.js
- Fetches CSV from Google Sheets
- Parses and normalizes records
- Implements localStorage caching with TTL
- Injects the dissertation record into all queries

### Explorer.js
- HTML5 Canvas network visualization
- Nodes represent archive records
- Connections based on shared concepts/categories
- Manhattan-style curved paths
- Export to PNG capability

### MindMap.js
- Tree visualization of dissertation structure
- Click to select nodes
- Double-click to expand/collapse
- Dynamic layout calculation

### comparison-tool/
- **Completely standalone** - can be deployed separately
- No dependencies on main archive code
- Side-by-side 1986 vs 2025 comparisons
- 7 entries covering key dissertation themes

---

## Common Tasks

### Adding a New Comparison (comparison-tool)
Edit `comparison-tool/data.js`:
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
Edit `components/dissertationData.js`:
- Add nodes to `DISSERTATION_NODES` array
- Add quotes to `NOTABLE_QUOTATIONS`
- Add themes to `KEY_THEMES`

### Updating Archive Data
1. Update the Google Sheet
2. Wait for cache to expire (1 hour) OR
3. Increment `CACHE_VERSION` in `archiveService.js`

### Local Development
```bash
# Start local server (Python)
python -m http.server 8000

# Or with Node
npx serve .

# Open http://localhost:8000
```

### Deployment
1. Upload all `.html`, `.css`, `.js` files
2. Include `components/` and `services/` directories
3. Include `comparison-tool/` if deploying that feature
4. Ensure server serves `.js` with MIME type `application/javascript`

---

## December 2025 Dissertation Release Plans

The dissertation is being released publicly with multiple presentation formats:

### Implemented
1. **Interactive Mind Map** - Tree visualization of dissertation structure (in main archive)
2. **"Then and Now" Comparison Tool** - 7 side-by-side 1986 vs 2025 comparisons (`/comparison-tool/`)
3. **Glossary** - 16 key concepts, filterable, with detail panel (`/glossary/`)
4. **1986 in Journalism** - Historical context, media landscape, what didn't exist (`/context-1986/`)
5. **Timeline** - 14 entries from dissertation to 2025, filterable by type (`/timeline/`)
6. **Annotated Excerpts** - 12 key passages with 2025 commentary (`/annotated-excerpts/`)
7. **FAQ / Ask the Dissertation** - 25+ pre-generated Q&A pairs, searchable (`/faq/`)
8. **BYOK Chat Interface** - Interactive Claude chat using user's own API key (`/faq/chat.html`)

### Planned (requires external content/production)
9. Audio commentary / office hours (requires Jay to record)
10. "What I got wrong" essay (requires Jay to write)
11. "The chapter I'd add today" essay (requires Jay to write)
12. Reading group format with discussion prompts
13. Collaborative annotation (Hypothesis integration)
14. Video essay (requires video production)

---

## Important Notes for Claude

1. **No build step required** - Don't suggest npm commands or build processes for frontend
2. **Match existing style** - Use Roboto Mono, Special Elite fonts, paper texture
3. **Standalone tools go in subdirectories** - Like `comparison-tool/`
4. **Update documentation** - Keep README.md, changelog.md, and this file current
5. **Dissertation content is sacred** - Quotes and content from `dissertationData.js` are accurate citations
6. **Jay Rosen's voice** - 2025 commentary should be placeholder text for Jay to revise, or clearly marked as draft
7. **WordPress deployment** - Final tools will be uploaded via FTP to a WordPress domain
8. **Backend uses Poetry** - Python dependencies managed via Poetry, not pip directly
9. **Dissertation source in /dissertation/** - Full PDFs and transcription available there

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
Create `.env` in `/backend/`:
```
SPREADSHEET_NAME="Your Google Sheet Name"
GEMINI_API_KEY="your_gemini_api_key"
```

Place Google Cloud credentials in `backend/google_credentials.json`.

### Commands
```bash
python src/workflow.py                      # Main pipeline
python tools/diagnostics/data_deduper.py    # Clean data
python tools/backfill/backfill_worker.py    # Fill missing fields
```

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
