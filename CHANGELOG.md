# Changelog - Jay Rosen Digital Archive

---

*Session Date: December 1, 2025*

## [2.20.0] Major Repository Reorganization for Public Release

### Overview
Comprehensive restructuring of the entire repository in preparation for transitioning from private to public open-source. This is the largest structural change in the project's history.

### New Directory Structure
- **`/frontend/`** - Main React application (moved from root)
- **`/features/`** - All standalone dissertation tools (moved from root-level directories)
- **`/data/`** - Archive data files (renamed from `/csv/`)
- **`/tools/active/`** - Active development tools
- **`/tools/analysis/`** - R scripts and planning (moved from `/data-tools/`)
- **`/archived/`** - Legacy code and archived features

### Files Reorganized
- **229 files** moved to new locations
- **5 new files** added (SECURITY.md, CODE_OF_CONDUCT.md, issue templates)
- **~20 files** deleted (duplicates, debug artifacts)
- **~800KB** saved from duplicate removal

### Standard Open Source Files Added
- `SECURITY.md` - Vulnerability reporting policy
- `CODE_OF_CONDUCT.md` - Contributor Covenant v2.1
- `.github/ISSUE_TEMPLATE/bug_report.md`
- `.github/ISSUE_TEMPLATE/feature_request.md`
- `.github/PULL_REQUEST_TEMPLATE.md`

### Path Changes
| Old Path | New Path |
|----------|----------|
| `/App.js`, `/index.js`, etc. | `/frontend/App.js`, etc. |
| `/components/` | `/frontend/components/` |
| `/services/` | `/frontend/services/` |
| `/comparison-tool/` | `/features/comparison-tool/` |
| `/glossary/` | `/features/glossary/` |
| `/context-1986/` | `/features/context-1986/` |
| `/timeline/` | `/features/timeline/` |
| `/annotated-excerpts/` | `/features/annotated-excerpts/` |
| `/faq/` | `/features/faq/` |
| `/tools/dissertation-reader/` | `/features/dissertation-reader/` |
| `/csv/` | `/data/` |
| `/data-tools/` | `/tools/analysis/` |
| `/future-features/` | `/archived/` |
| `/tools/archive-v1/` | `/archived/archive-v1/` |
| `/tools/web/` | `/archived/web/` |

### Documentation Updated
- `CLAUDE.md` - Complete directory structure rewrite
- `README.md` - Updated project structure section
- `docs/narrative/PROJECT_LOG.md` - Added reorganization entry

---

*Session Date: December 1, 2025*

## Pre-Publication Final Checks Complete

### Project Status: READY FOR PUBLICATION

All development work for the December 2025 dissertation release is complete.

### Merged Pull Requests (12 PRs)
The following PRs were merged and closed:

1. **PR #35** - Migrate PDFs to Git LFS
2. **PR #33** - Review and fix TODO comments
3. **PR #42** - Improve path handling with pathlib
4. **PR #36** - Add GitHub Actions CI/CD
5. **PR #49** - Fix open issues
6. **PR #38** - Add integration tests for backend
7. **PR #43** - Add type hints to backend Python code
8. **PR #37** - Add Gemini API rate limiting
9. **PR #34** - Remove hardcoded row ranges in workflow.py
10. **PR #39** - Fix broken imports after monorepo merge
11. **PR #32** - Relax Python requirement to 3.10+
12. **PR #40, #41** - Add backend .env.example and README

### Validation Results
- **JavaScript Syntax**: All 28 files pass
- **HTML Structure**: All 17 pages valid
- **TODO/FIXME Comments**: None remaining in frontend
- **Accessibility**: Skip links, ARIA labels present on all pages

### Pre-Publication Report
- Created comprehensive report at `release-assets/documentation/pre-publication-report.md`
- Covers all tools, deployment checklist, and items requiring Jay's input

### Documentation Updates
- Updated CLAUDE.md with publication status and CI/CD section
- Updated README.md with status badges and tool counts
- Updated changelog.md (this file)

---

*Session Date: December 1, 2025*

## Major UX Polish & Quality-of-Life Improvements

### Main Archive (`App.js`)
- **Error Handling**: Added comprehensive error state with user-friendly messaging
  - Displays error message when data loading fails
  - Includes reload button for easy recovery
  - Prevents silent failures
- **Back to Top Button**: Added floating back-to-top button
  - Appears after scrolling 500px
  - Smooth scroll animation
  - Hidden when near top of page
- **Active Filter Count Badge**: Added visual indicator showing number of active filters
  - Red badge on filter button showing count
  - Updates dynamically as filters change
  - Improves filter awareness

### Glossary (`/glossary/`)
- **Search Functionality**: Added real-time concept search
  - Searches across term, short definition, and full definition
  - Combined with category filtering
  - Clear search button
  - Shows result count
  - Accessible with proper ARIA labels

### Explorer Network Visualization (`components/Explorer.js`)
- **Color Legend**: Added category-to-color mapping legend
  - Shows which colors represent which categories
  - Fixed position in bottom-left
  - Alphabetically sorted
  - Improves visualization understanding

### FAQ / "Ask the Dissertation" (`/faq/`)
- **Permalinks**: Added shareable links to individual questions
  - Copy link button on each question
  - URL hash support for direct linking
  - Auto-opens and scrolls to linked question on page load
  - Updates URL when question is opened
- **Expand/Collapse All**: Added bulk control buttons
  - Expand all visible questions at once
  - Collapse all questions with one click
  - Positioned in header for easy access

### Comparison Tool (`/comparison-tool/`)
- **Next/Prev Navigation**: Added floating navigation controls
  - Fixed position at bottom center
  - Shows current position (e.g., "3 / 7")
  - Prev/Next buttons with disabled states
  - Works alongside existing keyboard navigation (arrows, j/k)
  - Updates as user scrolls

### Annotated Excerpts (`/annotated-excerpts/`)
- **Next/Prev Navigation**: Added floating navigation controls
  - Fixed position at bottom center
  - Shows current position (e.g., "5 / 12")
  - Prev/Next buttons with disabled states
  - Works alongside existing keyboard navigation (arrows, j/k)
  - Respects active filters

### Mind Map (`components/MindMap.js`)
- **Keyboard Shortcuts Documentation**: Added help panel
  - Help button (? icon) in control panel
  - Modal showing all keyboard shortcuts:
    - `+` / `-` for zoom
    - `0` for reset zoom
    - Arrow keys for panning
    - `Esc` for closing panel
  - Styled with KBD elements
  - Includes usage tips

### 1986 Context (`/context-1986/`)
- **Table of Contents Navigation**: Added sticky TOC
  - Links to all 4 main sections
  - Highlights active section while scrolling
  - Smooth scroll navigation
  - Sticky positioning below header

### Overall Impact
- **11 major improvements** across 8 different tools/pages
- Significantly improved discoverability and usability
- Better navigation and wayfinding
- Enhanced accessibility
- Professional polish for December 2, 2025 launch

---

*Session Date: December 1, 2025*

## Dissertation Launch Readiness (Dec 2, 2025)

### Content Finalization for Soft Launch
- **Annotated Excerpts Updates** (`/annotated-excerpts/`)
  - Removed `[2025 reflection]` placeholder markers from all 12 excerpts
  - Updated intro note to reflect final commentary status
  - Updated HTML page to match data.js changes
  - All 2025 reflections now production-ready

### Pre-Launch Validation
- **JavaScript Syntax Checks**: Validated all 7 dissertation tools
  - ✅ Comparison Tool - No syntax errors
  - ✅ Glossary - No syntax errors
  - ✅ 1986 Context - No syntax errors
  - ✅ Timeline - No syntax errors
  - ✅ Annotated Excerpts - No syntax errors
  - ✅ FAQ - No syntax errors
  - ✅ Mind Map Components - No syntax errors

- **External Links Verified**
  - NotebookLM link confirmed in FAQ: `https://notebooklm.google.com/notebook/d26d326e-20ec-46dc-b9b4-2c752b90e607`
  - Dissertation PDF reader links consistent: `/wp-content/rosen-archive/features/dissertation-reader/`

### All 7 Dissertation Tools Ready for Launch
1. Interactive Mind Map (in main archive)
2. "Then and Now" Comparison Tool (7 entries)
3. Glossary (16 key concepts)
4. 1986 in Journalism Context
5. Timeline (14 entries)
6. Annotated Excerpts (12 passages)
7. FAQ / "Ask the Dissertation" (46 Q&A pairs)

### Backend: New Content Type Integration (Phase 1)
- **Processors Added** (`backend/src/rosen_scraper/processors/`)
  - `twitter_processor.py` - Twitter/X thread extraction with Nitter proxy + Playwright fallback
  - `tumblr_processor.py` - Tumblr post processing for exports and live URLs
  - `clipping_processor.py` - PDF newspaper clipping OCR and metadata extraction

- **Dispatcher Updated** (`backend/src/rosen_scraper/dispatcher.py`)
  - Added routing for Twitter/X URLs (`twitter.com`, `x.com`)
  - Added routing for Tumblr URLs (`.tumblr.com`)
  - Added routing for PDF files (newspaper clippings)
  - All new processors integrated with AI analysis pipeline

- **Schema Updated** (`backend/schema.json`)
  - Added "Tumblr Post" to `content_format` taxonomy
  - Added "Newspaper Clipping" to `content_format` taxonomy
  - "Tweet/Thread" already present in schema

**Status:** Backend integration complete. Ready to process Twitter, Tumblr, and newspaper clipping content. Frontend display updates pending.

---

*Session Date: December 1, 2025*

## CI/CD Workflows Added

### GitHub Actions Setup
- **Backend Tests Workflow** (`.github/workflows/backend-tests.yml`)
  - Runs pytest on push/PR when backend code changes
  - Uses Python 3.13 as specified in pyproject.toml
  - Installs Poetry and project dependencies
  - Installs Playwright browsers for testing
  - Caches Poetry dependencies for faster runs

- **Backend Linting Workflow** (`.github/workflows/backend-linting.yml`)
  - Runs ruff, black, and mypy on backend code
  - Checks code style and type hints
  - Non-blocking (continue-on-error) to avoid breaking builds during adoption

- **Frontend Validation Workflow** (`.github/workflows/frontend-validation.yml`)
  - Basic smoke tests for frontend code
  - Validates HTML syntax
  - Checks JavaScript files for syntax errors
  - Verifies main entry points exist
  - Checks for broken CDN links

### Identified in PR #8 code review

---

*Session Date: December 1, 2025*

## BYOK Chat Feature Archived

### Feature Archival
- **BYOK Chat Moved**: Relocated interactive Claude chat feature to `/future-features/byok-chat/`
  - `chat.html` and `chat.js` preserved for potential future implementation
  - Added README.md documenting the archived feature and reactivation steps

### FAQ Page Updates (`/faq/`)
- **Simplified Banner**: Removed BYOK option, now only shows NotebookLM link
- **Removed Modal**: Removed API key input modal from FAQ page
- **Cleaned Script**: Removed all BYOK-related JavaScript handlers

### Documentation Updates
- **CLAUDE.md**: Updated directory structure, moved BYOK to "Archived" section
- **README.md**: Updated project structure and feature descriptions

---

*Session Date: November 30, 2025*

## UX Improvements & Project Management Setup

### Terminology Standardization
- **FAQ Content**: Replaced all 24 instances of "the dissertation" with "*The Impossible Press*" throughout FAQ data
  - Questions use plain title: "What does The Impossible Press say about..."
  - Answers use italicized `<em>` tags for proper formatting
  - Possessive forms rephrased for clarity

### Branding Consistency
- **Header Standardization**: Updated all standalone tools to use "Jay Rosen Digital Archive" branding
  - FAQ, Glossary, Timeline, Comparison Tool, Annotated Excerpts, 1986 Context pages
  - Consistent logo, title, and subtitle across all entry points

### Homepage Improvements
- **Featured Works Tooltips**: Converted descriptions to hover tooltips for cleaner layout
- **Folder View Filtering**: Categories now only show if they have 10+ records
- **Loading Quotes**: Added dissertation excerpts during data loading states
- **Tools Modal**: Added quick-access modal for archive tools

### Data Quality
- **Untitled Records**: Fixed handling of empty/blank records in archive service
- **Timeline Updates**: Corrected dates and improved categorization

### GitHub Project Management
- **Labels Created**: `backend` (purple), `frontend` (green)
- **Milestones Created**:
  - December 2025 Dissertation Release (due Dec 31)
  - Backend Stabilization (6 issues)
  - Developer Experience (10 issues)
- **Issues Created**: 16 issues (#9-#24) tracking all PR review recommendations
- **Documentation**: Added GitHub Issues & Labels section to CLAUDE.md

---

*Session Date: November 29, 2025 (Continued - Session 3)*

## Repository Consolidation: Merged rosen-archive

Merged the `jamditis/rosen-archive` repository into this monorepo for unified development.

### New Directories Added
- **`/backend/`** - Python data pipeline for scraping, AI analysis, and archiving
  - `src/` - Core source code (processors, scraper, categorizer)
  - `scripts/` - Maintenance and utility scripts
  - `tests/` - Test suite
  - `pyproject.toml` & `poetry.lock` - Poetry dependencies
  - `schema.json` - Data schema definitions

- **`/dissertation/`** - Dissertation source materials
  - PDF scans of original dissertation
  - Transcribed markdown
  - `build_unified_pdf.py` - PDF builder script

- **`/data-tools/`** - Analysis tools
  - `RStudio/` - R scripts for data analysis and visualization
  - `planning/` - Project planning documents

- **`/docs/`** - Documentation
  - `agent-personas/` - AI persona definitions
  - `narrative/` - Project logs and history

- **`/tools/`** - Additional presentation tools (renamed from `/legacy/`)
  - `dataexplorer/` - Data explorer grid (active development)
  - `dataviz/` - Data visualization tool (active development)
  - `dissertation-reader/` - Dissertation reader app (active development)
  - `archive-v1/` - Original archive application (reference)
  - `web/` - Promotional website

- **`/release-assets/`** - Promotional materials and documentation

### Configuration Updates
- Merged `.gitignore` files to include Python, R, and credential patterns
- Updated `README.md` with monorepo structure and backend documentation
- Updated `CLAUDE.md` with new directory structure and backend setup instructions
- Added MIT `LICENSE` file

---

*Session Date: November 29, 2025 (Continued - Session 2)*

## Dissertation Mind Map Enhancements & Accessibility

### Mind Map Layout & Interaction (`/components/MindMap.js`)
- **Layout Change**: Converted from top-down to left-to-right tree layout for better horizontal screen utilization
- **Single-Click Expansion**: Nodes now expand/collapse on single click (previously double-click)
- **Auto-Fit View**: Mind map automatically zooms and pans to show all visible nodes when expanding/collapsing
- **Node Cluster Focus**: Selecting a node auto-fits to show the selected node, its parent, and children
- **Expand/Collapse All**: Added buttons to expand or collapse all nodes at once
- **Re-center Button**: Added button to reset view to show all currently visible nodes
- **Touch Support**: Added touch event handlers for mobile panning (drag to pan)
- **Keyboard Navigation**: Arrow keys to pan, +/- to zoom, ESC to close panel, 0 to reset zoom

### Detail Panel Improvements (`/components/DetailPanel.js`)
- **Wider Panel**: Increased from 384px to 420px for better content display
- **Improved Padding**: Added extra right padding to prevent text clipping
- **Text Wrapping**: Added `break-words` to all text elements to handle long content
- **Close on ESC**: Panel closes when pressing ESC key
- **Close on Click Outside**: Clicking empty space in mind map deselects node and closes panel
- **Smooth Close Animation**: Panel content persists during slide-out animation

### Dissertation Data Updates (`/components/dissertationData.js`)
- **Page Citations**: Added accurate page numbers (pageStart/pageEnd) to all 70+ dissertation nodes
- **Figure References**: Added pageRef citations to all key figure nodes
- **Quote Citations**: Added page references to NOTABLE_QUOTATIONS array

### Accessibility Improvements (WCAG 2.1)
- **ARIA Labels**: All icon-only buttons now have `aria-label` attributes
- **Focus Indicators**: Visible focus rings (`focus:ring-2`) on all interactive elements
- **Dialog Semantics**: Detail panel uses `role="dialog"`, `aria-modal`, `aria-labelledby`
- **Focus Management**: Close button auto-focuses when detail panel opens
- **Screen Reader Support**: Zoom level announced via `aria-live` region
- **Keyboard Accessible**: Full keyboard navigation without requiring a mouse

### Mobile Responsiveness
- **Touch Targets**: Increased button sizes on mobile (44px+ minimum tap target)
- **Responsive Controls**: Buttons and controls use responsive padding (`p-3 sm:p-2.5`)
- **Full-Width Panel**: Detail panel fills screen on mobile, fixed width on desktop
- **Flexible Bottom Bar**: Bottom controls wrap on small screens with `flex-wrap`
- **Hidden Tips**: Tip text hidden on smaller screens to save space

### Bug Fixes
- Fixed horizontal overflow causing page content to shift right
- Fixed text clipping in detail panel on narrow screens
- Added `overflow-x: hidden` to prevent horizontal scrollbar

---

*Session Date: November 29, 2025 (Continued)*

## FAQ Expansion & Mobile Responsiveness

### FAQ Expansion (`/faq/data.js`)
- Expanded from 25 to 46 Q&A pairs (21 new questions added)
- New Basics questions: dissertation structure, how to read it, what's original
- New Concepts questions: news as drama, stereotypes, five factors, technological utopianism, sensationalism
- New Key Figures questions: Robert Park, Gabriel Tarde, Thomas Jefferson on scale
- New Arguments questions: what the dissertation is NOT arguing, proposed solutions
- New Contemporary questions: AI and journalism, political polarization, Substack/creators, solutions journalism, election coverage
- New Later Work questions: audience atomization overcome, "Getting the Connections Right" book, "What Are Journalists For?" book
- Updated FAQ_KEYWORDS for all new items

### Mobile Responsiveness Improvements
- **Glossary**: Detail panel now becomes full-screen modal on mobile/tablet (under 1024px)
- **Glossary**: Added body scroll lock when modal is open on mobile
- **Comparison Tool**: Improved header navigation for mobile (hidden on very small screens)
- **Shared Styles**: Added mobile improvements (larger touch targets for pills, iOS safe area insets, scroll lock utility)
- All tools now properly responsive across mobile, tablet, and desktop

---

*Session Date: November 29, 2025*

## Dissertation Presentation Tools Suite

### "Then and Now" Comparison Tool (`/comparison-tool/`)
- Side-by-side presentation of 1986 dissertation insights alongside 2025 realities
- 7 core comparisons: Attention Economy, Pseudo-Environment, Communication Without Community, News as Drama, Technological Utopianism, The Impossible Press, Making Things Public
- Scroll-based animations, navigation dots, keyboard navigation (j/k or arrow keys)

### Glossary (`/glossary/`)
- Interactive visual glossary of 16 key concepts from the dissertation
- Filterable by category: How We Know, The Public, Press Criticism, Structural Forces
- Click-to-expand detail panel with definitions, quotes, contemporary relevance
- Key figures section: Lippmann, Dewey, Postman, Park

### 1986 in Journalism (`/context-1986/`)
- Historical context: media landscape when dissertation was written
- 6 detailed sections: Broadcast Dominance, Cable Rising, Print Still Strong, No Internet, Reagan Era, Journalism's Professional Peak
- "What Didn't Exist" section highlighting technologies invented after 1986
- Key events of 1986 with media significance

### Timeline (`/timeline/`)
- Visual timeline from 1986 to 2025 showing intellectual evolution
- 14 entries covering milestones, publications, key concepts, career events
- Filterable by type (milestone, publication, concept, career, period)
- Recurring themes section showing continuity across decades

### Annotated Excerpts (`/annotated-excerpts/`)
- 12 key passages with full annotation
- Each excerpt includes: original text, 1986 context, 2025 reflection (placeholder for Jay), contemporary example, connection to later work
- Filterable by tags: Foundational, Prescient, Epistemology, Public Sphere
- Navigation dots and keyboard navigation

### FAQ / Ask the Dissertation (`/faq/`)
- 25+ pre-generated Q&A pairs covering basics, concepts, arguments, key thinkers, contemporary relevance
- Searchable and filterable by category
- Links to NotebookLM for deeper exploration
- BYOK (Bring Your Own Key) option for interactive Claude chat

### BYOK Chat Interface (`/faq/chat.html`)
- Interactive chat with Claude using user's own API key
- API key stored locally in browser, never transmitted to our servers
- System prompt includes full dissertation context and key concepts
- Conversation history maintained during session

### Shared Infrastructure
- Created `shared-styles.css` for consistent styling across all tools
- All tools: zero-build static files for FTP upload to WordPress
- All tools match archive theme (Roboto Mono, Special Elite, paper texture)

---

*Session Date: November 19, 2025*
## 15:34 - Initial Build & Core Infrastructure
- Investigate and fix the "No records found" display error occurring when filtering for Twitter/X or Bluesky records in the Jay Rosen Digital Archive. Ensure these records display correctly, and that the filters for social media types return the expected results.

*Session Date: November 18, 2025*

## 17:00 - Initial Build & Core Infrastructure
- **Initialized React Application**: Migrated static HTML/JS prototype to a robust React application structure.
- **Data Service**: Implemented `archiveService.ts` with PapaParse to fetch and normalize CSV data from Google Sheets.
- **Components**: Created core layout components including `Sidebar.tsx` (filters), `RecordModal.tsx` (detail view), and `WelcomeModal.tsx`.
- **Styling**: Configured Tailwind CSS with custom fonts (`Special Elite` and `Roboto Mono`) and paper texture background.

## 17:45 - Feature Expansion: Timeline & Autocomplete
- **Featured Section**: Added `FeaturedSection.tsx` to display curated works with carousel functionality.
- **Timeline**: Implemented `Timeline.tsx` using a bar chart visualization to filter records by year.
- **Autocomplete**: Added smart search suggestions in the Sidebar for instant record finding.
- **Types**: Extended TypeScript interfaces to support new features.

## 18:15 - Visual Refinements
- **Timeline Fixes**: Resolved CSS layout issues where timeline bars were collapsing. Added tooltips and axis labels.
- **Header Styling**: Updated `App.tsx` to make the header opaque on scroll to prevent content bleed-through.
- **Z-Index Hierarchy**: Adjusted z-index values globally to ensure the Header stays above content but below Modals and the Mobile Sidebar.

## 18:45 - Explorer Visualization
- **New View Mode**: Integrated a new "Explorer" view mode alongside Grid and Folder views.
- **Network Graph**: Ported the provided HTML5 Canvas network visualization into a React component (`Explorer.tsx`).
- **Interactive Logic**: Implemented Manhattan-style path routing, node pulsing, and dynamic clustering logic within the canvas.
- **Integration**: Updated `App.tsx` to toggle between standard views and the full-screen Explorer.

## 19:30 - Content Enrichment & Dissertation
- **Data Injection**: Manually injected Jay Rosen's 1986 Dissertation record into the dataset.
- **Featured Update**: Promoted the 1986 Dissertation to the top of the Featured Works list.
- **Metadata**: Enhanced the data model to include an `author` field for all records.

## 20:00 - Export Functionality Polish
- **Clean Card Design**: Redesigned the PNG export feature in the Explorer.
- **Dynamic Sizing**: Implemented dynamic height calculation for export cards to handle variable title lengths without text bleeding.
- **Metadata Focus**: Refined export content to show ID, Title, Author, Date, and Publication, removing the verbose summary for a cleaner social-share look.

## 20:15 - Production Preparation
- **Export Fixes**: Adjusted canvas export logic to ensure long titles do not overflow the card boundaries.
- **Static Deployment**: Updated `index.html` with Babel Standalone and a comprehensive `importmap`. This allows the project to be uploaded directly to a static web host (FTP) without a Node.js build step.
