# Archive desktop foundation

## Scope

Issue #622 adds an optional Windows 95/98-inspired exploration shell to Jay Rosen's Internet Archive. The standard archive stays the default. The desktop is a second front door that reuses canonical routes, records, services, and reporting behavior.

The implemented slices cover the product map, accessible shell, archive and record browsing, people and ideas, the dissertation map, analytics, the visitor guide and authored selected-record trail, the shipped archive-method demonstration, the shipped participation path, maintained tools, concurrent window behavior, low-risk spatial memory, and root-scoped offline behavior. The curator-authored making-of narrative remains gated by the interview and publication workflow added in PR #626.

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
| Community wiki | `#wiki` and `#wiki/:slug` | None | No public desktop entry | Excluded for now; PR #563 records Joe's agreement with launch-review feedback to remove every public wiki affordance until the section's purpose is resolved, while retaining deep links as a reversible unlink |
| Selected findings | authored selected-record trail in `#start` | Selected findings | Open the shared three-record trail in-shell | Ready; uses the exact approved copy, matching logic, canonical records, and record overlay from Start here |
| Archive method demo | `features/winer-method/` | The method | Open the canonical standalone demonstration | Ready; issue #532 shipped in PR #623 while this branch was in progress, and the desktop now links to that maintained route without copying its independent corpus |
| Participate | `features/participate/` | Participate | Open the canonical standalone page | Ready; PR #624 shipped the approved path while this branch was in progress, so the registry exposes that real page without copying it |
| Making-of narrative | provisional draft `features/making-of/` | How it was made | Add only after the interview, editorial, and publication gates | Blocked; PR #626 documents the process but grants no content or publication approval, and deployment rules explicitly withhold the draft |

### Making-of approval boundary

PR #626 adds `docs/narrative/INTERVIEW_GUIDE.md` as the source of truth for reconstructing the personal making-of story. That handoff does not approve the provisional page or any first-person claim. No interview round, story brief, reconstructed prose, fact check, design, or publication gate has been approved in this work, and the user did not ask to begin the interview. The desktop registry therefore keeps `making-of` as blocked metadata with no surface and no launch target. A later integration must follow the guide, receive explicit publication approval, then separately update the path allowlist and both deployment manifests.

### Standalone pages and tools

| Surface | Path | Initial desktop placement | State and reason |
| --- | --- | --- | --- |
| Archive method demonstration | `features/winer-method/` | Start menu and Tools window | Ready; preserved as an independent, experimental standalone page without crowding the wallpaper shortcut field |
| Ways to participate | `features/participate/` | Start menu | Ready; preserved as its canonical standalone, no-JavaScript-capable page |
| Dissertation release page | `dissertation/` | Tools window | Ready |
| Dissertation reader | `dissertation/reader/` | Tools window | Ready |
| Foreword | `dissertation/foreword/` | Tools window | Ready |
| Network-effect essay | `dissertation/network-effect/` | Tools window | Ready |
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

Desktop filter state uses the existing readable query vocabulary, for example `?q=citizen&cat=Criticism#desktop/archive`, and survives copy, reload, route changes, and Back/Forward traversal between history entries with different query-backed filters. Transient analytics result IDs remain deliberately in-memory rather than producing an unbounded URL and clear on history traversal. Record state remains `?record=RECORD_ID`. Copy-link and citation actions deliberately strip the desktop hash and filter query to produce the standard canonical record URL. Browser back and forward traverse desktop window changes and canonical route transitions through the existing history listeners.

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
- The Start button opens a named menu, keeps Explore, Research, and Help destinations together, moves focus to its first item, supports Up/Down/Home/End, closes on Escape, and returns focus to the Start button.
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

Browser validation in a new storage context confirms that the worker controls the root page, a standard visitor caches no desktop assets, the standard archive reloads offline, a first-ever desktop visit warms its optional module graph, and both `?record=...#desktop/archive` and the record-backed guided paths reload offline after their data has been opened once. An offline `#desktop/findings` reload renders all three curated records without console errors. Separate HTTPS reverse-proxy runs at both public host shapes confirm the worker controls `/rosen-frontend/` on GitHub Pages and `/j/rosen-archive/` in production, every cache entry, request, and local link stays inside the applicable subtree, and a cold `#desktop/tools` route reloads offline. Query-string navigations fall back to the cached clean app root. Data that was never opened remains governed by explicit loading/error states: Archive owns its result error, while People & ideas, Start here, and Selected findings explain when their shared canonical records are loading or unavailable without hiding independently useful content. The large analytics SQLite source is never prefetched.

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

- the standard route requests 77 resources totaling 27,568,554 decoded bytes after its existing background details preload and requests zero desktop assets;
- the one foundation-era standard-route module is `ArchiveResults.js`, extracted from `App.js` so standard and desktop results share one renderer; Phase 4 adds no new standard-route request;
- `frontend/App.js` is 42,938 bytes, `ArchiveResults.js` is 8,714 bytes, `StartHerePage.js` is 23,199 bytes, the thin `DesktopStartPanel.js` adapter is 1,519 bytes, `frontend/services/viewState.js` is 6,969 bytes, and `frontend/services/router.js` is 2,769 bytes;
- a cold `#desktop` deep link requests 78 resources totaling 657,413 decoded bytes, including nine desktop assets totaling 96,466 decoded bytes but no archive corpus;
- cold `#desktop/start` and `#desktop/findings` links each make one `archive-core.json` request, no duplicate corpus request, and settle at 14,057,602 decoded bytes without triggering the background details preload;
- `#desktop`, Archive, Start here, Selected findings, People & ideas, Dissertation, Analytics, and the explicit concurrent-window state have zero automated accessibility violations at mobile, tablet, and desktop target sizes, as do selected-entity, dissertation-detail, and open-record states;
- keyboard checks cover shortcut arrow navigation and activation, Start-menu focus entry/Escape/reset, background-window focus raising, minimize/restore/close and focus return, taskbar restoration, filter-drawer entry/Escape return, record-modal entry/return, guided in-shell navigation, browser Back to the exact guided title, unknown-app fallback, and mobile reflow without horizontal overflow; separate pointer checks confirm a background title-bar control acts on the first click without changing the active URL, then restores focus to the active window, while keyboard focus still raises that background window before its control acts;
- opening a curated record focuses the canonical dialog close control, emits `?record=dissertation-1986#desktop/start`, and returns focus to the exact authored-trail card on Escape;
- entity browsing makes one core and one entity-index request, dissertation makes no data request, and analytics fetches only the small aggregate until an explicit query loads SQLite;
- dissertation nodes are keyboard reachable, its shortcuts act only while the map owns focus, and its non-modal detail panel moves focus to Close only after retained content renders, exposes a named keyboard-scrollable reading pane with AA metadata contrast, returns focus to the exact SVG node, then marks its off-screen closing state `aria-hidden` and inert so no hidden control can retake focus;
- desktop archive filters, sorting, pagination, canonical embedded controls, and dissertation nodes meet the 44-pixel target contract in rendered phone and desktop checks; the embedded mind map clamps fit, wheel, button, and keyboard zoom to that physical minimum while the standard presentation keeps its existing fit range;
- fit-to-view and fit-to-cluster transitions settle immediately under `prefers-reduced-motion: reduce`, archive pagination uses an immediate results jump in that mode while retaining smooth scrolling otherwise, the shared record helper bypasses the browser View Transition API entirely (zero calls versus one with no preference), closing a record omits its otherwise 300-millisecond exit delay, and shared record/detail surfaces reduce their remaining CSS transition and animation durations to 0.01 milliseconds whether they render inside or outside the desktop subtree; the same browser run confirms immediate and animated detail-panel focus entry, mobile nodes at 45.2 pixels high, no undersized controls, no horizontal overflow, and no accessibility findings on the changed Archive, Folders, Dissertation, or standard dissertation surfaces;
- visual review at 768 pixels caught canonical guide cards responding to the page viewport instead of their narrower desktop window; stable grid hooks and an inline-size container now keep both intent cards and selected findings in a readable single column at a 478-pixel panel, then restore three approximately 290–300-pixel columns in the 987-pixel desktop panel, with zero overflow or accessibility findings at either size;
- integrated screenshot review caught record-heavy desktop windows expanding to the full multi-thousand-pixel height of their canonical content; wide windows now stay wholly above the fixed taskbar at desktop and tablet targets, keep title and status chrome visible, and scroll the content pane with contained overscroll, while the compact launcher deliberately restores normal document flow;
- an analytics composable query returns its 20 canonical record IDs to `#desktop/archive` without leaving the shell;
- the complete test suite passes 1,078 tests across 223 suites on rebased version `3.7.5`; the focused frontend suite passes 269 tests across 54 suites, and the production deploy-manifest suite passes all 40 focused tests;
- the production deployment dry run contains 157 files, including the root worker, implementation worker, `DesktopStartPanel.js`, window-state module, participation page, and version file; its final release flips are the root index, implementation worker, root bridge, and `version.json` in that order;
- a fresh browser confirms the root worker installs `jrda-cache-3.7.5` and `jrda-data-3.7.5`, a standard visit caches zero desktop assets, first desktop use warms exactly nine unique versioned assets, and an offline `#desktop/findings` reload renders all three canonical records with no console errors;
- an HTTPS deployment-prefix simulation at `jamditis.github.io/rosen-frontend/` confirms a `/rosen-frontend/` registration scope and `/rosen-frontend/sw.js` controller; all cache entries, same-origin requests, and local links remain under the prefix, all seven maintained tool links resolve beneath it, the optional cache contains exactly the nine desktop assets, and `#desktop/tools` reloads offline with its standard-archive exit intact and no console errors;
- the equivalent `pressthink.org/j/rosen-archive/` simulation confirms the production `/j/rosen-archive/` scope and controller, the same seven prefixed tool links and nine optional assets, no escaped cache entries or requests, and a clean offline Tools reload;
- browser checks confirm one active full-width window at 375×812, 812×375 landscape, and a 720×450 200%-zoom equivalent; all have internal content scrolling, no horizontal overflow, and zero automated accessibility findings.
- every text input, select, and textarea inside the compact desktop or its shared report dialog computes to at least 16 pixels, preventing iOS focus zoom from displacing the fixed taskbar or dialog controls;
- a live tablet-to-desktop-to-phone resize sequence keeps the open filter drawer's search field focused and visible, preserves it when the filters become a static desktop sidebar, ignores drawer-only Escape handling at that width, then restores the open drawer without overflow or accessibility findings; the reverse static-sidebar-to-phone crossing automatically opens the drawer around the exact focused filter, while an ordinary drawer opening waits for its visibility frame before moving focus and Escape at tablet width closes it and returns focus to Filters;
- when compact reflow hides the desktop shortcut field around an active app, focus on a shortcut transfers to that app's visible window title; a live 1440-to-375 check retains the active Archive URL/window with zero overflow or accessibility findings instead of leaving focus inside `display:none` content;
- a live history/focus sequence confirms Back reactivates the exact prior window, restores the historical readable filter query instead of letting current in-memory filters overwrite it, clears non-URL analytics result IDs, and lets URL authority reopen an active window after it was minimized or closed; record Escape returns to the exact invoking card, concurrent windows introduce no duplicate IDs, and narrow reflow exposes only the active window; a separate reset check confirms the persisted layout key is removed rather than replaced by an empty envelope, with focus returning to the reset app's shortcut;
- visual review at 320 and 375 pixels keeps the fixed Start icon and the complete “Standard archive” label visible, wrapping the exit label instead of ellipsizing it while leaving the task list horizontally scrollable; both widths have zero page overflow and zero automated accessibility findings;
- the complete 15-item Start menu fits or scrolls above the taskbar at desktop, 375×812 portrait, and 812×375 landscape sizes; its roving tab stop makes the short-landscape scroll region keyboard accessible, End and wrapped Arrow navigation reach the expected items, Escape returns to Start, and all three states have zero automated accessibility findings;
- forced-colors checks at desktop and phone widths remove the decorative wallpaper mark, use system canvas colors for shortcut and menu microcopy, preserve the textual Active marker and structural borders, show a three-pixel keyboard focus outline, and report zero accessibility findings with or without the Start menu open;
- the browser accessibility tree exposes one main landmark and separately named home, background, and active window regions on desktop, with focus on the URL-active title; minimizing removes that region while retaining a named restore task, and the phone tree exposes only the active window plus the permanent standard-view exit, with exactly one level-one Archive desktop heading in launcher, active-app, and unknown-route states;
- browser fault injection confirms an aborted lazy `DesktopShell.js` request produces one named fallback main with a 44-pixel standard-archive exit; an aborted desktop stylesheet still exposes the Read me heading, standard exit, and reset action; and an aborted canonical core-data request gives People & ideas, Start here, and Selected findings their context-specific alert, 44-pixel reload action, and permanent standard-view escape while retaining independently useful entity or guide content. The desktop and mobile fault states add no accessibility findings and have no horizontal overflow.
- the desktop problem-report action retains the canonical modal, traps forward and reverse Tab navigation, returns focus to the exact shortcut after Escape, hides decorative icons, and renders every real focusable control at least 44 pixels at phone and desktop widths; its off-screen, non-tabbable spam honeypot remains intentionally outside that interaction scan.

The repository-wide preview audit covers 26 route states at mobile, tablet, and desktop sizes (78 rendered states) and reports the unchanged 33 rule-level baseline findings. The command retains that complete run by default and accepts `PREVIEW_AUDIT_VIEWPORT=mobile|tablet|desktop` for equivalent per-viewport shards on bounded runners. `#start`, the participation page, the open canonical dissertation detail panel, all 39 desktop-shell rows—including the useful unknown-app fallback, Start here, Selected findings, Read me, Tools, the explicit concurrent-window layout, the canonical record overlay, and the open report dialog—and the Winer method demonstration each contribute zero findings. The remaining findings are confined to previously maintained standard archive, standalone dissertation, reader, FAQ, and status-report surfaces.
