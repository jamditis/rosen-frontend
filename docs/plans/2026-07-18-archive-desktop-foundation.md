# Archive desktop foundation

## Scope

Issue #622 adds an optional Windows 95/98-inspired exploration shell to Jay Rosen's Internet Archive. The standard archive stays the default. The desktop is a second front door that reuses canonical routes, records, services, and reporting behavior.

The implemented slices cover the product map, accessible shell, archive and record browsing, people and ideas, the dissertation map, analytics, the visitor guide and authored selected-record trail, the shipped archive-method demonstration, the shipped participation path, maintained tools, concurrent window behavior, low-risk spatial memory, and root-scoped offline behavior. The curator-authored making-of narrative remains approval-gated.

## Product intent

The desktop metaphor earns its place by making a large collection spatial and legible:

- folders suggest groups that can be opened and revisited;
- shortcuts keep distinct research paths visible at once;
- a Start menu acts as a complete index when the canvas is unfamiliar;
- a taskbar keeps the route back to the standard archive visible;
- compact system chrome places the archive in the personal-computing era that shaped many of its debates.

The design uses late-1990s interaction grammar without copying Microsoft branding or assets. A muted teal workspace and beveled controls establish the frame. Warm paper, the archive fonts, and ink colors keep the content recognizably part of the Rosen Archive. Controls retain plain labels, 44-pixel touch targets, strong focus indicators, and current web conventions.

## Prototype search

On 2026-07-18, after updating `origin/main`, a bounded search covered:

- the current tree outside generated archive data and archived documentation;
- all reachable git history with pickaxe terms for Windows 95/98, Win95/98, desktop shell/metaphor, retro desktop, and nostalgia;
- all reachable branch and tag names with the same terms.

No prior prototype or implementation was found. The only matching ref was the new `codex/issue-622-desktop-foundation` work branch. The issue remains the product brief unless a new artifact is attached.

## Maintained destination inventory

`Ready` destinations are exposed by the initial desktop registry. `Planned` destinations stay in registry metadata without becoming dead controls. `Excluded` destinations are documented so a later contributor does not revive them by accident.

| Destination | Canonical location | Desktop object | Initial behavior | State and reason |
| --- | --- | --- | --- | --- |
| Archive records | default route | Archive | Open the shared record collection in-shell | Ready; canonical search, filters, result renderer, and record modal stay intact |
| Folders | `#folders` | Folders | Open shared folder results in-shell | Ready |
| Visitor guide | `#start` | Start here | Open the canonical visitor guide in-shell | Ready; the shared component retains an explicit standard-view exit |
| Entities and relationships | `#entities` | People & ideas | Open the canonical entity browser in-shell | Ready |
| Dissertation mind map | `#dissertation` | Dissertation | Open the canonical interactive mind map in-shell | Ready |
| Archive analytics | `#analytics` | Analytics | Open the canonical aggregates, query builder, and opt-in SQLite tools in-shell | Ready |
| About | `#about` | About the archive | Exit to standard view | Ready |
| Problem report | existing `BugReportModal` action | Report a problem | Open the existing report dialog over the desktop | Ready |
| Desktop orientation | `#desktop/readme` | Read me | Open an in-shell reading window | Ready; desktop-only content |
| Maintained tool index | `#desktop/tools` | Tools | Open an in-shell tool window | Ready |
| Community wiki | `#wiki` and `#wiki/:slug` | None | No public desktop entry | Excluded for now; the current archive intentionally keeps this deep-link route out of public navigation pending editorial direction |
| Selected findings | authored selected-record trail in `#start` | Selected findings | Open the shared three-record trail in-shell | Ready; uses the exact approved copy, matching logic, canonical records, and record overlay from Start here |
| Archive method demo | `features/winer-method/` | The method | Open the canonical standalone demonstration | Ready; issue #532 shipped in PR #623 while this branch was in progress, and the desktop now links to that maintained route without copying its independent corpus |
| Participate | `features/participate/` | Participate | Open the canonical standalone page | Ready; PR #624 shipped the approved path while this branch was in progress, so the registry exposes that real page without copying it |
| Making-of narrative | draft `features/making-of/` | How it was made | Add only after curator approval | Blocked; deployment rules explicitly withhold the draft |

### Standalone pages and tools

| Surface | Path | Initial desktop placement | State and reason |
| --- | --- | --- | --- |
| Archive method demonstration | `features/winer-method/` | Start menu and Tools window | Ready; preserved as an independent, experimental standalone page without crowding the wallpaper shortcut field |
| Ways to participate | `features/participate/` | Start menu | Ready; preserved as its canonical standalone, no-JavaScript-capable page |
| Dissertation release page | `dissertation/` | Tools window | Ready |
| Dissertation reader | `dissertation/reader/` | Tools window | Ready |
| Foreword | `dissertation/foreword/` | Reach through the dissertation release page | Ready |
| Network-effect essay | `dissertation/network-effect/` | Reach through the dissertation release page | Ready |
| Archive and dissertation FAQ | `faq/` | Tools window | Ready |
| Data visualization | `tools/active/dataviz/dataviz.html` | Tools window, marked beta | Ready and currently exposed by `ToolsModal` |
| Data explorer dot grid | `tools/active/dataexplorer/data_explorer_grid.html` | None | Excluded; issue #339 records the decision to remove this “toy” from public navigation |
| Launch status report | `features/status-report/` | None | Maintained operational page, not a visitor exploration destination |
| Dissertation launch redirect | `dissertation-launch/` | None | Deferred after a failed feature-audit result; not a destination to reproduce |

## URL and navigation contract

The desktop extends the existing hash vocabulary:

| URL | Meaning |
| --- | --- |
| `#desktop` | Desktop launcher and orientation window |
| `#desktop/archive` | Searchable canonical archive collection in a desktop window |
| `#desktop/folders` | Canonical thematic folders in a desktop window |
| `#desktop/start` | Canonical Start here visitor guide in a desktop window |
| `#desktop/findings` | Authored three-record selected-findings trail in a desktop window |
| `#desktop/entities` | Canonical people-and-ideas browser in a desktop window |
| `#desktop/dissertation` | Canonical dissertation mind map in a desktop window |
| `#desktop/analytics` | Canonical archive analytics in a desktop window |
| `#desktop/readme` | Desktop with the Read me window active |
| `#desktop/tools` | Desktop with the maintained-tools window active |
| `#desktop/:unknown` | Desktop home fallback with an accessible status announcement |

Only in-shell windows use the nested desktop hash. The hash identifies the active window; other open or minimized windows are presentation state, not a parallel content URL. Archive, Folders, Start here, Selected findings, People & ideas, Dissertation, and Analytics use thin in-shell adapters over shared application state or canonical components. Each offers an explicit standard-view exit. About still performs an explicit transition to its canonical route; The method and Participate open their maintained standalone pages. The report action opens the existing report dialog and does not mint a new URL.

Start here receives an `embedded` presentation flag that removes its duplicate page header, main landmark, Back controls, and desktop-entry loop while retaining its approved guide, statistics, navigation, report action, participation callout, and data-derived trail. `SelectedFindings` is exported from the same component file and rendered by both surfaces. Start here and Selected findings share one window family so their repeated section IDs can never coexist. Choosing a guide destination keeps maintained in-shell destinations inside the desktop. Choosing a curated record uses the same `RecordView` overlay and canonical `?record=ID#desktop/start|findings` query/hash contract.

Desktop filter state uses the existing readable query vocabulary, for example `?q=citizen&cat=Criticism#desktop/archive`, and survives copy, reload, and route changes. Record state remains `?record=RECORD_ID`. Copy-link and citation actions deliberately strip the desktop hash and filter query to produce the standard canonical record URL. Browser back and forward traverse desktop window changes and canonical route transitions through the existing history listeners.

## Registry contract

One semantic registry owns each desktop object's:

- stable lowercase ID;
- sentence-case label and description;
- semantic icon key;
- menu group and surface placement;
- launch kind and canonical destination;
- availability state and dependency note.

Rendering maps semantic icon keys to the existing Lucide icon components. Registry validation runs at module load and in unit tests. It rejects duplicate or malformed IDs, unknown groups, missing labels or icons, invalid launch definitions, and unsupported availability states. Desktop shortcuts and Start menu entries are derived from the same ready set.

## Interaction model

### Desktop and tablet

- A two-column shortcut field uses one roving tab stop. Arrow keys move by row or column; Home and End jump to the bounds; Enter and Space activate.
- Live app windows remain concurrently open in a deterministic cascade. Each is a labelled non-modal region, not a dialog, and none hides the shortcut field or background windows from assistive technology.
- Activating a taskbar window raises it, updates the URL, and exposes a visible textual Active marker in addition to the title-bar treatment. Keyboard focus entering a background window raises it without moving focus away from the chosen control.
- Minimize, restore, and close are ordinary 44-pixel buttons. Minimizing or closing the active window selects the next visible window; minimized task buttons include a textual state label.
- The Start button opens a named menu, moves focus to its first item, supports Up/Down/Home/End, closes on Escape, and returns focus to the Start button.
- The taskbar always exposes “Standard archive.”
- Closing the last in-shell window returns to `#desktop` and restores focus to its shortcut when possible.

### Mobile and narrow zoom layouts

- The spatial canvas becomes a two-column touch launcher with normal document flow.
- Only the active in-shell app is rendered as a full-width content panel; other open/minimized apps remain reachable through the horizontally scrollable task list and Start menu.
- The taskbar respects safe-area insets and remains usable at 200% zoom.
- No action depends on drag, hover, right-click, double-click, sound, or animation.

Reduced-motion mode removes decorative transitions. Windows deliberately use bounded cascading placement rather than drag or resize. That keeps content on-screen, avoids a pointer-only interaction, and makes a separate keyboard geometry mode unnecessary. If freeform placement is added later, equivalent keyboard movement/resizing and clamping must ship in the same change.

## Windowing and spatial memory

The desktop persists only a schema-versioned presentation envelope in `jrda-desktop-layout`:

- allowlisted open shell-app IDs;
- each window's minimized boolean;
- a repaired, duplicate-free z-order.

Schema 1 never stores record data, filters, queries, active content, scroll positions, or authored material. Unknown IDs, malformed JSON, duplicates, and future schema versions fall back safely. Cards and Folders are one window family because they are two layouts of the canonical Archive app and would otherwise duplicate filter-control IDs. Start here and Selected findings form a second family because one is the full guide and the other is its focused approved trail.

The URL remains authoritative for the active window. Activating or restoring a window creates understandable browser history; Back and Forward therefore revisit and, when necessary, reopen that historical window. A visible Reset desktop layout command in both Start and Read me closes all app windows, clears the saved envelope, and returns to `#desktop`. Restored visible Archive, Folders, Start here, Selected findings, or People & ideas windows notify `App.js` to load the one shared corpus even when another app is URL-active; only a URL-active record app can show the canonical record overlay.

## Loading, failure, and offline behavior

The desktop route is lazy-loaded. A standard archive visit adds only the route vocabulary, lazy import declaration, and two entry controls; it does not request desktop JavaScript or CSS. A cold desktop deep link does not fetch the archive corpus.

The desktop stylesheet is requested only after the desktop component mounts. A failed dynamic import renders a plain archive-styled fallback with a working route to the standard archive. A failed desktop stylesheet leaves semantic content usable.

The root page now registers a stable root `sw.js` bridge, which imports the cache-versioned `frontend/sw.js` implementation with fresh-import checking. Its implicit scope is `/` in local preview and the deployed archive subtree on GitHub Pages and production. The install manifest covers the complete eager standard-app module graph and the real root `index.html`; it does not contain desktop modules. On the first desktop mount, `DesktopShell` asks the active worker to warm the nine optional desktop assets for the next visit.

Browser validation in a new storage context confirms that the worker controls the root page, a standard visitor caches no desktop assets, the standard archive reloads offline, a first-ever desktop visit warms its optional module graph, and both `?record=...#desktop/archive` and the record-backed guided paths reload offline after their data has been opened once. An offline `#desktop/findings` reload renders all three curated records without console errors. Query-string navigations fall back to the cached clean app root. Data that was never opened remains governed by the existing explicit loading/error states; the large analytics SQLite source is never prefetched.

## Baseline before implementation

Measured from `origin/main` commit `cefac66` on 2026-07-18 with service workers blocked:

- `frontend/App.js`: 41,899 bytes;
- `frontend/services/viewState.js`: 6,574 bytes;
- `frontend/services/router.js`: 2,129 bytes;
- initial standard route after its background details preload settles: 57 same-origin resources and 27,443,486 uncompressed local bytes;
- the last figure includes the existing delayed `archive-details.json` preload, which accounts for 13,520,143 bytes;
- no desktop-specific request exists in the baseline.

Post-change checks must show no `DesktopShell.js`, desktop registry, or desktop CSS request on the standard route. The desktop branch inherited version `3.7.5` when it rebased over PR #624; it does not introduce a separate version bump.

## Foundation acceptance

- `#desktop`, `#desktop/readme`, and `#desktop/tools` parse, serialize, reload, and survive browser history.
- Unknown desktop app IDs produce a useful home fallback.
- Registry validation, uniqueness, destination validity, and shortcut/Start-menu parity are tested.
- The standard route remains the default and does not download desktop-only assets.
- Start here and Tools expose clearly labelled desktop entry points.
- Keyboard, touch, focus return, reduced motion, 375×812, tablet, and 1440×900 layouts receive focused tests or audit coverage.
- The desktop audit route has no new axe violations.

## Archive and record adapter

`DesktopArchivePanel` is a presentation adapter, not a second archive application. `App.js` continues to own the one data fetch, record array, filters, MiniSearch index, sorting, pagination, folder derivation, record selection, and modal navigation. `ArchiveResults` is the shared record/folder renderer used by both the standard route and desktop window. `RecordView` remains the one detail overlay.

The adapter provides:

- live cards and folder layouts from canonical filtered results;
- the existing search, categories, eras, content types, sorting, pagination, loading, empty, and error behavior;
- direct `#desktop/archive` and `#desktop/folders` links;
- filter queries that survive reload and copy/paste;
- the existing record details, related works, previous/next behavior, citation, and share actions;
- one-click transition to the equivalent standard Cards or Folders view;
- focus entry/return for record details and the narrow-layout filter drawer;
- no corpus fetch for desktop home, Read me, or Tools, and exactly one core fetch for a cold desktop Archive/Folders link.

## Validation after implementation

Measured from the integrated current-main build with service workers blocked and each route settled to network idle:

- the standard route requests 77 resources totaling 27,562,047 decoded local bytes and requests zero desktop assets;
- the one foundation-era standard-route module is `ArchiveResults.js`, extracted from `App.js` so standard and desktop results share one renderer; Phase 4 adds no new standard-route request;
- `frontend/App.js` is 42,204 bytes, `ArchiveResults.js` is 8,714 bytes, `StartHerePage.js` is 23,155 bytes, the thin `DesktopStartPanel.js` adapter is 1,477 bytes, `frontend/services/viewState.js` is 6,969 bytes, and `frontend/services/router.js` is 2,769 bytes;
- a cold `#desktop` deep link requests 78 resources totaling 642,734 decoded bytes, including nine desktop assets totaling 88,294 decoded bytes but no archive corpus;
- cold `#desktop/start` and `#desktop/findings` links each make one `archive-core.json` request, no duplicate corpus request, and settle at 14,042,923 decoded bytes without triggering the background details preload;
- `#desktop`, Archive, Start here, Selected findings, People & ideas, Dissertation, Analytics, and the explicit concurrent-window state have zero automated accessibility violations at mobile, tablet, and desktop target sizes, as do selected-entity, dissertation-detail, and open-record states;
- keyboard checks cover shortcut arrow navigation and activation, Start-menu focus entry/Escape/reset, background-window focus raising, minimize/restore/close and focus return, taskbar restoration, filter-drawer entry/Escape return, record-modal entry/return, guided in-shell navigation, browser Back to the exact guided title, unknown-app fallback, and mobile reflow without horizontal overflow;
- opening a curated record focuses the canonical dialog close control, emits `?record=dissertation-1986#desktop/start`, and returns focus to the exact authored-trail card on Escape;
- entity browsing makes one core and one entity-index request, dissertation makes no data request, and analytics fetches only the small aggregate until an explicit query loads SQLite;
- dissertation nodes are keyboard reachable, its shortcuts act only while the map owns focus, and its detail panel returns focus to the exact SVG node;
- an analytics composable query returns its 20 canonical record IDs to `#desktop/archive` without leaving the shell;
- the complete test suite passes 1,062 tests across 222 suites on rebased version `3.7.5`; the focused frontend suite passes 201 tests across 46 suites, and the production deploy-manifest suite passes all 36 focused tests;
- the production deployment dry run contains 156 files, including the root worker, implementation worker, `DesktopStartPanel.js`, window-state module, participation page, version file, and final root index in the required order;
- a fresh browser confirms the root worker installs `jrda-cache-3.7.5` and `jrda-data-3.7.5`, a standard visit caches zero desktop assets, first desktop use warms exactly nine unique versioned assets, and an offline `#desktop/findings` reload renders all three canonical records with no console errors;
- browser checks confirm one active full-width window at 375×812, 812×375 landscape, and a 720×450 200%-zoom equivalent; all have internal content scrolling, no horizontal overflow, and zero automated accessibility findings.

The repository-wide preview audit covers 20 route states at mobile, tablet, and desktop sizes (60 rendered states) and reports the unchanged 33 rule-level baseline findings. `#start`, the participation page, every desktop destination including Start here and Selected findings, the explicit concurrent-window layout, and the Winer method demonstration each contribute zero findings at every viewport. The remaining findings are confined to previously maintained standard archive, standalone dissertation, reader, FAQ, and status-report surfaces.
