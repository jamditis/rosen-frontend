# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Windows 95-themed retro interface** for exploring the Jay Rosen Digital Archive. Built as a nostalgic web application, it combines a vintage OS aesthetic with modern data visualization techniques to provide an engaging way to browse Professor Jay Rosen's body of work on journalism, politics, and media criticism.

**Location:** `C:\Users\amdit\OneDrive\Desktop\Crimes\playground\rosen-scraper\web\95\`
**Live Deployment:** https://centerforcooperativemedia.org/wp-content/amditis/rosen/95/
**Deployment Method:** Direct FTP upload (no build process for production)
**Current Version:** `index.js?v=3` (cache-busting parameter)

## Quick Start

### Development Server
```bash
npm install           # Install dependencies
npm run dev           # Start Vite dev server (http://localhost:3000)
```

### Build for Production
```bash
npm run build         # Build production assets
npm run preview       # Preview production build
```

### Environment Setup
Create `.env.local` with:
```
GEMINI_API_KEY=your_api_key_here
```

## Recent Fixes & Current State (2025-10-20)

### Completed Bug Fixes
All fixes documented in `CHANGELOG.md`. Key improvements:

1. **Window Management** - Fixed cascade behavior when closing windows, now properly uses `openWindowStack` for activation order
2. **Taskbar System** - Each window instance gets its own taskbar button (keyed by `windowId` not `appName`)
3. **Icon System** - Switched from dynamic DOM queries to hardcoded `APP_ICONS` constant for reliability
4. **Impossible Press** - Now opens Google Doc in new tab instead of loading content in window

### Icon Management System
**Important:** All file/folder icons are now managed via the `APP_ICONS` constant at the top of `index.js`:
```javascript
const APP_ICONS = {
    'aboutWindow': 'https://win98icons.alexmeub.com/icons/png/directory_open_file_mydocs-5.png',
    'search': 'https://win98icons.alexmeub.com/icons/png/search_file-1.png',
    'dataExplorer': 'https://win98icons.alexmeub.com/icons/png/chart1-4.png',
    'impossiblePress': 'https://win98icons.alexmeub.com/icons/png/notepad_file_gear-2.png',
    'folder': 'https://win98icons.alexmeub.com/icons/png/directory_closed-4.png',
    'categoryFolder': 'https://win98icons.alexmeub.com/icons/png/document-0.png',
    'recordFile': 'https://win98icons.alexmeub.com/icons/png/web_file-3.png'
};
```
**To change icons:** Update URLs in this constant, not individual rendering functions.

### Impossible Press Behavior
**Current Implementation:**
- Desktop icon/start menu item with app name `impossiblePress`
- `openApp('impossiblePress')` immediately calls `window.open()` with Google Docs URL
- Opens in new tab with `noopener,noreferrer` security attributes
- Does NOT create a window element or show in taskbar
- `loadImpossiblePressContent()` function still exists but is not called (kept for potential future use)

### Known Working Features
- Archive Explorer with folder navigation (C:\ → Archive Collections → Categories → Records)
- Search with fuzzy matching and phrase support
- Data Explorer visualization iframe
- Record viewer with per-instance windows and taskbar buttons
- Collection viewer with category-based filtering
- Window drag/resize/minimize/close functionality
- Start menu and taskbar management

## Architecture Overview

### Core Components

**Main OS Interface (`index.html` + `index.js`):**
- Windows 95-style desktop environment with draggable/resizable windows
- Taskbar with start menu and active application management
- Desktop icons for launching applications
- Window management system with z-index stacking and focus handling

**Data Explorer Visualization (`explorer.html` + `explorer.js`):**
- Interactive canvas-based dot grid visualization (441-625 records)
- Relationship mapping through animated path connections
- Dynamic clustering modes: grid, hub-based, concept-based, theme-based
- Real-time filtering and connection strength analysis

**Applications:**
- **Archive Explorer**: Folder-based navigation through thematic collections
- **Search Archive**: Fuzzy search with weighted relevance scoring using Levenshtein distance
- **Data Explorer**: Graph visualization showing record connections
- **Record Viewer**: Individual record display with metadata
- **Collection Viewer**: Category-based record browsing
- **Impossible Press Reader**: Text viewer for Rosen's 1986 dissertation

### Data Flow

```
Google Sheets (CSV Export)
    → PapaParse (client-side CSV parsing)
    → Data cleaning & normalization
    → In-memory record store (archiveState)
    → UI rendering (windows, search, visualization)
```

**Data Source:** Public CSV endpoint from Google Sheets
**Columns Used:** `id`, `title`, `author`, `publication_date`, `original_publication`, `summary`, `url`, `tags`, `thematic_categories`, `era`, `responds_to`, `key_concepts`, `pull_quote`, `verified`, `collection_id`

### Key Technical Features

**Window Management (`index.js`):**
- Draggable windows with boundary constraints
- Resizable windows with 8-direction resize handles
- Focus management with z-index stacking
- Taskbar integration with minimize/restore functionality
- Clone-based multi-instance support for viewers

**Canvas Visualization (`explorer.js`):**
- Grid-based dot positioning with dynamic sizing based on connection strength
- Three-stage animated path drawing (horizontal-vertical-horizontal segments)
- Real-time parameter controls: max connections, line thickness, pulse amplitude
- Clustering algorithms: grid layout, aggregate hubs, concept grouping, thematic grouping
- Interactive tooltips for dots and connection lines
- PNG export functionality

**Search System (`index.js:performSearch`):**
- Phrase matching with exact quotes
- Fuzzy keyword matching (Levenshtein distance ≤ 1)
- Field-weighted scoring (title: 10, concepts: 8, categories: 8, quote: 5, summary: 3, tags: 2)
- Phrase bonus multiplier (3x weight)

**Data Cleaning (`index.js:clean` object):**
- Header normalization for consistent field access
- Title cleaning (removes publication suffixes after em-dash/pipe)
- Date standardization to `YYYY-MM-DD` format
- Tag parsing from bracketed/quoted/comma-separated formats
- Era assignment based on publication year ranges

## Development Guidelines

### Adding New Windows/Applications

1. **Create window HTML structure** in `index.html`:
```html
<div class="window resizable" id="myApp" style="width: 500px; height: 400px;">
  <div class="window-titlebar">
    <span class="window-title">My App</span>
    <div class="window-controls">
      <div class="window-minimize window-control-button">−</div>
      <div class="window-close window-control-button">✕</div>
    </div>
  </div>
  <div class="window-content">
    <!-- App content here -->
  </div>
</div>
```

2. **Wire up event handlers** in `init()` function (`index.js`)
3. **Add to desktop/start menu** with icon references
4. **Implement app-specific logic** in dedicated function

### Modifying Data Visualization

**Key configuration constants in `explorer.js`:**
- `MIN_RECORDS_TO_DISPLAY` / `MAX_RECORDS_TO_DISPLAY`: Grid size limits
- `DOT_RADIUS`: Base dot size (5px)
- `MAX_CONNECTIONS_TO_SHOW`: Connection limit per primary dot
- `CATEGORY_COLORS`: Color palette for thematic categories
- `CLUSTER_MODE`: Layout algorithm ('grid', 'aggregate', 'concept', 'theme')

**To add new clustering modes:**
1. Add mode to `clusterModeSelect` options in `explorer.html`
2. Implement logic in `calculateClusteredPositions()` function
3. Update `processData()` to handle new mode

### Styling Guidelines

**Win95 Aesthetic Requirements:**
- Use `#C0C0C0` for window backgrounds
- Maintain 2px border illusion (light top/left, dark bottom/right)
- Use `#000080` for active title bars and hover states
- Apply inset borders for input fields and content areas
- Use system fonts: 'Inter' for modern touch, 'Courier New' for monospace

## Known Limitations & Considerations

**Canvas Rendering:**
- Uses internal resolution of 900x1150px regardless of display size
- Hit testing requires coordinate scaling between display and canvas space
- Animation loop only runs when needed (locked view, animating lines, or changing radii)

**Data Loading:**
- CSV fetch happens on page load with no loading UI in main interface
- Search and collections wait for `archiveState.isDataReady` flag
- Failed data loads only log to console (no user-facing error in main UI)

**Browser Compatibility:**
- Requires modern browser with ES2022 support
- Canvas 2D rendering required for visualization
- PapaParse CDN dependency for CSV parsing

**Performance Considerations:**
- Full dataset processing on every clustering mode change
- Connection strength calculated via nested loops (O(n²) complexity)
- Large connection counts (>30) can cause visual clutter

## File Structure

```
web/95/
├── index.html          # Main desktop interface
├── index.js            # Desktop OS logic and app implementations
├── explorer.html       # Data visualization interface
├── explorer.js         # Canvas-based graph visualization
├── explorer.css        # Visualization-specific styles
├── package.json        # Dependencies and scripts
├── vite.config.ts      # Vite configuration with Gemini API key injection
├── tsconfig.json       # TypeScript compiler settings
├── metadata.json       # AI Studio app metadata
└── impossible-press.md # Dissertation text content (680KB)
```

## Integration Notes

**Parent Project Context:**
This is the frontend interface for the larger Rosen Archive project (`rosen-scraper`). The backend Python pipeline processes and stores data in Google Sheets, which this interface consumes via public CSV export.

**Data Schema Alignment:**
Field names match the backend `schema.json` definitions. Any schema changes in the Python pipeline require corresponding updates to `ALLOWED_COLUMNS` constant and data cleaning logic.

**Deployment:**

**Primary Deployment Method:** Direct FTP upload to https://centerforcooperativemedia.org/wp-content/amditis/rosen/95/

**Files to Upload:**
- `index.html` (26,648 bytes)
- `index.js` (37,935 bytes - **verify file size after upload to confirm correct version**)
- `explorer.html`, `explorer.js`, `explorer.css` (if visualization updated)
- `CHANGELOG.md` (optional, for documentation)

**Cache Management:**
- Cache-busting parameter in script tag: `<script src="index.js?v=3">`
- Increment version number when deploying changes: `?v=4`, `?v=5`, etc.
- After upload, user must clear browser cache or use hard refresh (Ctrl+F5)
- Incognito mode useful for testing without cache interference
- Network tab in DevTools shows actual loaded file size for verification

**Common Deployment Issues:**
1. **Old JavaScript Loading**: Check Network tab file size matches local file (37,935 bytes for current version)
2. **Icon Rendering Issues**: Ensure `APP_ICONS` constant exists at top of uploaded `index.js`
3. **Empty Archive Explorer**: Hardcoded icon URLs should prevent this; check console for errors
4. **Window Cascade Bug**: Fixed in current version; verify `closeApp()` uses `openWindowStack`

**Alternative Deployment:** This app can also be deployed via AI Studio (https://ai.studio/apps/drive/1PQaxSMkguLDoQCmU87-PPApSF0u-BGhK). The Gemini API key is injected at build time via Vite's `define` config for potential AI-powered features.
