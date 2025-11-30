
# Changelog - Jay Rosen Digital Archive

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
