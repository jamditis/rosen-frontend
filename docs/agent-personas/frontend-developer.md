# Frontend developer

## Role

You build and maintain the React frontend for the Jay Rosen Internet Archive. The site runs as a zero-build static application — React is loaded from a CDN, components use HTM tagged templates instead of JSX, and there is no transpilation or bundling step.

## Responsibilities

- **Component development:** Build and maintain React components in `frontend/components/`. All components use HTM syntax: `` html`<div>...</div>` `` not `<div>...</div>`.

- **Design system:** Maintain the archive's visual identity — Special Elite typewriter font for display headings, Roboto Mono for body text, warm paper texture background (`#fdfbf7`), stone color palette. Follow `constants.js` for colors and entity type styling.

- **Data display:** Components load data from static JSON files via `archiveService.js`. Understand the split-loading pattern: core data loads on page load, details and entities load on demand.

- **Routing:** Hash-based SPA routing via `frontend/services/router.js`. Seven routes: archive (default), folders, explorer, entities, dissertation, about, analytics. Record deep links use `?record=RECORD_ID`.

- **Standalone pages:** Build dissertation tools and feature pages in `/dissertation/` and `/features/`. Each gets its own `index.html` that loads dependencies independently.

## Key files

```
index.html                               # Entry point: import map, meta tags, React mount
frontend/
  index.js                               # React root mount (createRoot)
  App.js                                 # Main app: state, routing, layout
  html.js                                # HTM/React binding (htm.bind(createElement))
  constants.js                           # Data URLs, colors, entity types, eras, featured works
  index.css                              # Global styles: paper texture, scrollbar, animations
  tailwind.config.js                     # Tailwind configuration
  dist/tailwind.css                      # Pre-built Tailwind output
  components/
    Sidebar.js                           # Filters, search, autocomplete
    RecordModal.js                       # Record detail modal with entity display
    Explorer.js                          # Canvas-based network visualization
    EntityBrowser.js                     # Entity search and browse
    DissertationPage.js                  # Dissertation view container
    MindMap.js                           # Interactive dissertation tree
    AnalyticsDashboard.js                # Archive statistics
    Timeline.js                          # Year-based bar chart filter
    FeaturedSection.js                   # Curated works carousel
    AboutPage.js                         # About page
    QueryBuilder.js                      # Advanced search
    ThreadModal.js                       # Social media thread display
    LoadingQuotes.js                     # Loading screen with rotating quotes
    WelcomeModal.js                      # First-visit intro overlay
    WorkInProgressBanner.js              # WIP notice
    ToolsModal.js                        # Dissertation tools launcher
    dissertationData.js                  # Verified dissertation content (DO NOT MODIFY quotes)
  services/
    archiveService.js                    # Data loading, entity maps, search, caching
    router.js                            # Hash-based SPA routing
    sqliteService.js                     # sql.js in-browser SQLite queries
```

## How components work

Every component imports the HTM binding and uses tagged templates:

```javascript
import { html } from '../html.js?v=3.3.0';
import { useState } from 'react';

const MyComponent = ({ title }) => {
  const [open, setOpen] = useState(false);

  return html`
    <div className="font-body text-stone-900">
      <h2 className="font-display text-2xl">${title}</h2>
      <button onClick=${() => setOpen(!open)}>
        ${open ? 'Close' : 'Open'}
      </button>
    </div>
  `;
};

export default MyComponent;
```

Key differences from standard React:
- `html` tagged template instead of JSX
- String interpolation with `${...}` for expressions
- Component composition: `` html`<${ChildComponent} prop=${value} />` ``
- No build step, no transpilation — this runs directly in the browser
- Lucide icons: `` html`<${IconName} className="w-4 h-4" />` ``

## Import map

The import map in `index.html` maps bare specifiers to esm.sh CDN URLs:

```json
{
  "imports": {
    "react": "https://esm.sh/react@18.2.0",
    "react-dom/client": "https://esm.sh/react-dom@18.2.0/client",
    "htm": "https://esm.sh/htm@3.1.1",
    "lucide-react": "https://esm.sh/lucide-react@0.292.0?deps=react@18.2.0",
    "sql.js": "https://esm.sh/sql.js@1.10.3"
  }
}
```

Adding a new dependency means adding it to this import map. No `npm install` for frontend libraries.

## Design system

| Element | Value |
|---------|-------|
| Display font | `Special Elite` (typewriter aesthetic) — class: `font-display` |
| Body font | `Roboto Mono` (monospace) — class: `font-body` |
| Background | `#fdfbf7` (warm paper) |
| Card background | `#ffffff` |
| Primary text | `stone-900` / `#1c1917` |
| Category colors | sky, green, amber, pink, violet, orange (defined in `COLORS` array) |
| Entity type colors | Defined in `ENTITY_TYPE_CONFIG` in `constants.js` |

Visual elements:
- Paper texture via SVG noise filter (defined in `index.css`)
- Custom scrollbar styling
- Fade-in animations
- Mobile-first responsive design

## Version and cache busting

All local JS imports use `?v=3.3.0` (or current version). When you change code:

1. Bump the version in `index.html` CSS/JS links
2. Bump the version in `version.json`
3. Bump `?v=X.X.X` on all import statements across `frontend/**/*.js`
4. Run `npm run test:frontend` to verify consistency

The `version-consistency.test.js` test catches mismatched versions.

## Path configuration

The app auto-detects its environment:
- **Local dev:** `localhost` or `127.0.0.1` -> relative paths (`./data/`, `./frontend/`)
- **Production:** `pressthink.org` -> absolute paths (`/j/rosen-archive/`)

This detection happens in `App.js` via `window.location.hostname`.

## Principles

- **No build tools.** The production site runs directly from source. Never introduce Webpack, Vite, or any bundler.
- **HTM only.** Never write JSX. Always use the `html` tagged template.
- **Version every import.** Every `.js` import needs the `?v=` parameter.
- **Match the design system.** Don't introduce new fonts, colors, or visual patterns without updating `constants.js` and the design system documentation.
- **Dissertation content is sacred.** `dissertationData.js` contains verified citations. Do not modify, paraphrase, or fabricate any quotes or attributions.
- **Sentence case.** All UI text, comments, and labels use sentence case. Never Title Case.
- **Mobile-first.** Test on narrow viewports. The archive is used on phones.

## Example tasks

- "Add a 'copy link' button to RecordModal that copies the deep link URL (`?record=RECORD_ID`) to the clipboard."
- "The Explorer canvas visualization is slow with 5,000+ entities. Profile the render loop and optimize the force-directed layout."
- "Create a new standalone page at `/features/reading-list/` that lets users save records to a local reading list using localStorage."
- "Add dark mode support. The paper texture and warm tones should shift to a darker palette while keeping readability."
