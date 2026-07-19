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

PR #626 adds `docs/narrative/INTERVIEW_GUIDE.md` as the source of truth for reconstructing the personal making-of story. That handoff does not approve the provisional page or any first-person claim. No interview round, story brief, reconstructed prose, fact check, design, or publication gate has been approved in this work, and the user did not ask to begin the interview. The desktop registry therefore keeps `making-of` as blocked metadata with no surface and no launch target; even Read me omits its label rather than publishing a non-actionable promise. A later integration must follow the guide, receive explicit publication approval, then separately update the path allowlist and both deployment manifests.

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
| `?entity=ENTITY_ID#desktop/entities` | Canonical people-and-ideas browser with one indexed entity selected |
| `#desktop/dissertation` | Canonical dissertation mind map in a desktop window |
| `#desktop/analytics` | Canonical archive analytics in a desktop window |
| `#desktop/readme` | Desktop with the Read me window active |
| `#desktop/tools` | Desktop with the maintained-tools window active |
| `#desktop/:unknown` | Desktop home fallback with an accessible status announcement |

Only in-shell windows use the nested desktop hash. The hash identifies the active window; other open or minimized windows are presentation state, not a parallel content URL. Archive, Folders, Start here, Selected findings, People & ideas, Dissertation, and Analytics use thin in-shell adapters over shared application state or canonical components. Each offers an explicit standard-view exit. About still performs an explicit transition to its canonical route; The method and Participate open their maintained standalone pages. The report action opens the existing report dialog and does not mint a new URL.

Start here receives an `embedded` presentation flag that removes its duplicate page header, main landmark, Back controls, and desktop-entry loop while retaining its approved guide, statistics, navigation, report action, participation callout, and data-derived trail. `SelectedFindings` is exported from the same component file and rendered by both surfaces. Start here and Selected findings share one window family so their repeated section IDs can never coexist. Choosing a guide destination keeps maintained in-shell destinations inside the desktop. Choosing a curated record uses the same `RecordView` overlay and canonical `?record=ID#desktop/start|findings` query/hash contract.

Desktop filter state uses the existing readable query vocabulary, for example `?q=citizen&cat=Criticism#desktop/archive`, and survives copy, reload, route changes, and Back/Forward traversal between history entries with different query-backed filters. A selected person or idea uses the equally readable, route-scoped `?entity=ENTITY_ID#desktop/entities` form; the serializer ignores that parameter outside the canonical standard or desktop entity route. Transient analytics result IDs remain deliberately in-memory rather than producing an unbounded URL and clear on history traversal. Record state remains `?record=RECORD_ID`, and may coexist with entity context while a connected record is open. Copy-link and citation actions deliberately strip the desktop hash, entity context, and filter query to produce the standard canonical record URL. Browser back and forward traverse desktop window changes and canonical route transitions through the existing history listeners.

Selecting a category, tag, or concept inside a record is an intentional transition to filtered Archive. The record finishes closing before that transition and suppresses focus return to its source opener; otherwise focus entering the now-background source window would correctly reactivate that window and undo the requested route after the 300-millisecond close delay.

## Registry contract

One semantic registry owns each desktop object's:

- stable lowercase ID;
- sentence-case label and description;
- semantic icon key;
- menu group and surface placement;
- launch kind and canonical destination;
- availability state and dependency note.

Rendering maps semantic icon keys to the existing Lucide icon components. Registry validation runs at module load and in unit tests. It rejects duplicate or malformed IDs, unknown groups, missing labels or icons, invalid launch definitions, and unsupported availability states. The companion Tools validator also rejects duplicate keys or destinations, incomplete display metadata, unsafe standalone paths, and unknown release labels. Desktop shortcuts and Start menu entries are derived from the same ready set.

## Interaction model

### Desktop and tablet

- A two-column shortcut field uses one roving tab stop. Arrow keys move by visible row or column and stop at spatial edges rather than jumping diagonally; Home and End jump to the bounds; Enter and Space activate.
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

The root page now registers a stable root `sw.js` bridge, which imports the cache-versioned `frontend/sw.js` implementation with fresh-import checking. Its implicit scope is `/` in local preview and the deployed archive subtree on GitHub Pages and production. The install manifest covers the complete eager standard-app module graph, the explicitly linked design-token stylesheet, and the real root `index.html`; it does not contain desktop modules. Linking the token sheet directly from the document keeps its prefix-safe URL stable when a cached `index.css` response is used for an offline query-string navigation. On the first desktop mount, `DesktopShell` asks the active worker to warm the nine optional desktop assets for the next visit.

Browser validation in a new storage context confirms that the worker controls the root page, a standard visitor caches no desktop assets, the standard archive reloads offline, a first-ever desktop visit warms its optional module graph, and both `?record=...#desktop/archive` and the record-backed guided paths reload offline after their data has been opened once. An offline `#desktop/findings` reload renders all three curated records without console errors. Separate HTTPS reverse-proxy runs at both public host shapes confirm the worker controls `/rosen-frontend/` on GitHub Pages and `/j/rosen-archive/` in production, every cache entry, request, and local link stays inside the applicable subtree, and a cold `#desktop/tools` route reloads offline. Query-string navigations fall back to the cached clean app root. Data that was never opened remains governed by explicit loading/error states: Archive owns its result error; People & ideas distinguishes a failed shared record load from a failed entity-index load; Start here and Selected findings explain when their canonical records are loading or unavailable without hiding independently useful content; and Analytics announces both aggregate loading and failure with a direct reload action. The large analytics SQLite source is never prefetched.

## Baseline before implementation

Measured from `origin/main` commit `cefac66` on 2026-07-18 with service workers blocked:

- `frontend/App.js`: 41,899 bytes;
- `frontend/services/viewState.js`: 6,574 bytes;
- `frontend/services/router.js`: 2,129 bytes;
- initial standard route after its background details preload settles: 57 same-origin resources and 27,443,486 uncompressed local bytes;
- the last figure includes the existing delayed `archive-details.json` preload, which accounts for 13,520,143 bytes;
- across five fresh 1440×900 Chromium contexts with service workers blocked and explicit garbage collection after that settle, the median standard route uses 43,801,952 bytes of JavaScript heap, 1,514 DOM nodes, and 285 JavaScript event listeners;
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

Re-measured during the final adversarial pass on 2026-07-18 from fresh 1440×900 Chromium contexts with service workers blocked. Network samples wait 2.5 seconds after initial network idle and settle again, count same-origin responses, and total their uncompressed local response bodies; heap samples use five fresh contexts per route and explicit garbage collection:

- the standard route requests 60 same-origin resources totaling 27,495,964 uncompressed local bytes after its existing background details preload and requests zero desktop assets;
- the equivalent five-sample garbage-collected standard-route median is 43,864,652 bytes of JavaScript heap, 62,700 bytes (0.14%) above the pre-desktop baseline, with four additional DOM nodes (1,518 total) and the same 285 event listeners. A cold desktop home uses 3,472,780 bytes, 296 nodes, and 151 listeners because it does not load the corpus, while record-backed Start here uses 25,425,912 bytes, 674 nodes, and 174 listeners and still remains below the settled standard route because it does not trigger the details preload; all 15 samples have zero page errors;
- the one foundation-era standard-route module is `ArchiveResults.js`, extracted from `App.js` so standard and desktop results share one renderer; Phase 4 adds no new standard-route request;
- `frontend/App.js` is 47,085 bytes, `ArchiveResults.js` is 8,714 bytes, `StartHerePage.js` is 23,222 bytes, the thin `DesktopStartPanel.js` adapter is 1,519 bytes, `frontend/services/viewState.js` is 7,626 bytes, and `frontend/services/router.js` is 3,568 bytes;
- a cold `#desktop` deep link requests 66 same-origin resources totaling 673,953 uncompressed local bytes, including nine desktop assets totaling 98,250 source bytes but no archive corpus;
- cold `#desktop/start` and `#desktop/findings` links each request 68 same-origin resources totaling 14,074,168 uncompressed local bytes, make one `archive-core.json` request, and do not trigger `archive-details.json`; cold `#desktop/entities` requests 69 same-origin resources totaling 15,945,310 uncompressed local bytes and makes exactly one core plus one entity-index request;
- the three-viewport preview audit permanently forbids `archive-details.json` on desktop home, Start here, Selected findings, People & ideas, and selected-entity entry states, while requiring exactly one warmup request on the standard, desktop Archive, and desktop Folders rows and exactly one on-demand request for the combined entity/record state. A separate window-state browser check confirms that opening Archive and returning to Start keeps the visible background Archive opt-in and produces exactly one details warmup;
- `#desktop`, Archive, Start here, Selected findings, People & ideas, Dissertation, Analytics, and the explicit concurrent-window state have zero automated accessibility violations at mobile, tablet, and desktop target sizes, as do selected-entity, dissertation-detail, and open-record states;
- keyboard checks cover shortcut arrow navigation and activation, Start-menu focus entry/Escape/reset, background-window focus raising, minimize/restore/close and focus return, taskbar restoration, filter-drawer entry/Escape return, record-modal entry/return, guided in-shell navigation, browser Back to the exact guided title, unknown-app fallback, and mobile reflow without horizontal overflow. The permanent concurrent-window row also activates Archive from the taskbar, minimizes it into Analytics, then requires Back to remount and visibly focus Archive before Forward reconstructs the exact Analytics URL and title at all three widths; this caught and repaired a same-window-count race that had left focus in the now-background Analytics window or on `body`. Separate pointer checks confirm a background title-bar control acts on the first click without changing the active URL, then restores focus to the active window, while keyboard focus still raises that background window before its control acts;
- opening a curated record focuses the canonical dialog close control, emits `?record=dissertation-1986#desktop/start`, and returns focus to the exact authored-trail card on Escape;
- People & ideas preserves research context in both directions at 375 and 1440 pixels: selecting Jay Rosen emits `?entity=P0005#desktop/entities`, and opening a connected record extends that state to `?record=RECORD-00903&entity=P0005#desktop/entities`; Escape removes only the record query, keeps Jay Rosen's entity panel open, and returns focus to the exact invoking record button, while copying the record still yields the clean standard `?record=RECORD-00903` canonical URL with zero overflow or accessibility findings;
- the combined entity/record URL is now a permanent three-viewport audit row in both the desktop and equivalent standard route. A cold direct load refreshes Jay Rosen's derived record and co-occurrence panels when the core corpus arrives instead of freezing them at zero, assigns foreground focus only after the asynchronously resolved record dialog exists, and records zero accessibility findings or horizontal overflow. Escape from this opener-less state focuses the selected entity heading; opening a record from the hydrated panel and closing it still preserves the more precise invoking record button rather than letting delayed window or entity focus overwrite it;
- foreground focus suppression is tied to an actually rendered record overlay, not merely the presence of a query parameter. At all three target widths, a defensive `?record=RECORD-00903#desktop/analytics` load renders no dialog, keeps the harmless unmatched parameter intact, focuses the active Analytics title, and has no horizontal overflow;
- record details expose up to eight prominence-ranked entries from the already-loaded canonical entity index as 44-pixel “People and ideas in this record” targets. Following Membership Puzzle Project from `RECORD-00903` closes the overlay before activating `?entity=O0164#desktop/entities`, leaves the source Archive window in the taskbar, and focuses the named entity heading; reload and Forward reconstruct that state, Back reopens the exact source record in Archive, closing a deep-linked entity returns to its visible entity card or the stable entity search fallback, and the equivalent standard and desktop flows at 375 and 1440 pixels have zero changed-surface accessibility findings or overflow;
- selected entity details no longer sit after the browser's first 100 result cards on narrow screens: at 375 and 768 pixels the newly opened Jay Rosen region is placed in the current viewport before the long list, receives a visible programmatic heading focus, closes with Escape, and returns to the exact invoking entity card; the 1440-pixel list-left/detail-right layout remains intact, co-occurrence navigation retains the original stable return point, and all three rendered states have zero overflow or accessibility findings;
- the same record path respects browser history authority: Back closes the record, returns to `#desktop/archive`, keeps Archive active, and focuses its title instead of letting stale opener focus reactivate People & ideas; Forward reopens the same canonical record in People & ideas and focuses the dialog close control, while an ordinary Escape from the active entity window still returns focus to its exact invoking record button;
- choosing “Audience & Public Engagement” from that record now settles at `?cat=Audience+%26+Public+Engagement#desktop/archive`, leaves People & ideas open in the taskbar, focuses the active Archive title, and reports 3,745 filtered records instead of letting delayed focus return bounce the URL back to the source window; desktop, 375-pixel mobile, and reduced-motion checks all produce the same route with zero overflow;
- entity browsing makes one core and one entity-index request, dissertation makes no data request, and analytics fetches only the small aggregate until an explicit query loads SQLite;
- dissertation nodes are keyboard reachable, its shortcuts act only while the map owns focus, and its non-modal detail panel moves focus to Close only after retained content renders, exposes a named keyboard-scrollable reading pane with AA metadata contrast, returns focus to the exact SVG node, then marks its off-screen closing state `aria-hidden` and inert so no hidden control can retake focus;
- desktop archive filters, sorting, pagination, canonical embedded controls, and dissertation nodes meet the 44-pixel target contract in rendered phone and desktop checks; the embedded mind map clamps fit, wheel, button, and keyboard zoom to that physical minimum while the standard presentation keeps its existing fit range. A complete rendered target sweep caught the shared entity-detail close control at 16×44 pixels in all three desktop entity states; the canonical control now provides a 44×44 hit area in both standard and desktop views. The permanent audit measures every visible non-compact interactive target inside all 51 desktop rows and fails below 44×44 pixels, while native checkbox/radio/range inputs retain their larger associated-label or track hit areas;
- fit-to-view and fit-to-cluster transitions settle immediately under `prefers-reduced-motion: reduce`, archive pagination uses an immediate results jump in that mode while retaining smooth scrolling otherwise, the shared record helper bypasses the browser View Transition API entirely (zero calls versus one with no preference), closing a record omits its otherwise 300-millisecond exit delay, and shared record/detail surfaces reduce their remaining CSS transition and animation durations to 0.01 milliseconds whether they render inside or outside the desktop subtree; the same browser run confirms immediate and animated detail-panel focus entry, mobile nodes at 45.2 pixels high, no undersized controls, no horizontal overflow, and no accessibility findings on the changed Archive, Folders, Dissertation, or standard dissertation surfaces;
- visual review at 768 pixels caught canonical guide cards responding to the page viewport instead of their narrower desktop window; stable grid hooks and an inline-size container now keep both intent cards and selected findings in a readable single column at a 478-pixel panel, then restore three approximately 290–300-pixel columns in the 987-pixel desktop panel, with zero overflow or accessibility findings at either size;
- integrated screenshot review caught record-heavy desktop windows expanding to the full multi-thousand-pixel height of their canonical content; wide windows now stay wholly above the fixed taskbar at desktop and tablet targets, keep title and status chrome visible, and scroll the content pane with contained overscroll, while the compact launcher deliberately restores normal document flow;
- an analytics composable query returns its 20 canonical record IDs to `#desktop/archive` without leaving the shell;
- the complete test suite passes 1,102 tests across 225 suites on rebased version `3.7.5`; the focused frontend suite passes 286 tests across 55 suites, and the production deploy-manifest suite passes all 40 focused tests;
- canonical hash-route transitions now repair focus only when the invoking control was unmounted and the browser fell back to `body`. Stable entry targets cover About, Start here, Dissertation, Analytics, and the standard application main, while a paint-time connected-focus guard yields to the more precise desktop-window, selected-entity, and record-dialog contracts. Those entry targets expose a three-pixel high-contrast `:focus-visible` outline with a system Highlight fallback under forced colors; the audit verifies the computed keyboard outline rather than only checking `document.activeElement`. At 375 and 1,440 pixels, Start → About focuses and visibly outlines the About heading, and browser Back reconstructs `#desktop`, the closed Start menu, and foreground home-title focus; Start → a curated record still finishes on the dialog close control, and About → standard archive focuses the main landmark. The permanent three-viewport audit now keyboard-activates that Start path plus every canonical adapter's standard-view exit—Archive, Folders, Start here, Selected findings, People & ideas, Dissertation, and Analytics—verifies both canonical entry focus and its computed visible outline, then requires browser Back to reconstruct the exact nested desktop URL and foreground window title with zero desktop findings and no changed 13/11/9 baseline;
- live keyboard checks at 375, 768, and 1,440 pixels confirm both public entry controls—Start here's “Explore the archive desktop” and the Tools modal's “Archive desktop”—focus the desktop home title, while browser Back visibly focuses the exact canonical source view. The Start-here entry/Back sequence is permanent in all three audit shards;
- every ready standalone app and every link surfaced in Tools resolves to a real packaged file and retains a location-relative route back to the archive root at local, GitHub Pages, and production path depths. That destination-level sweep caught and repaired the dissertation landing page's lone PressThink-only header exit; its native return control resolves to the local archive root, owns a visible focus indicator, measures 144×44 pixels at 375 and 1,440 pixels, and adds no accessibility finding to that page's inherited baseline. It also found six inherited standalone returns between 20 and 41.8 pixels and a stale responsive selector that hid the reader's real archive exit below desktop width; Method, Reader, Foreword, Network effect, FAQ, and Dataviz now keep that exit visible and at least 44 pixels, and the reader's adjacent settings control matches that touch target. Exposing the reader control revealed a separate 52-pixel mobile min-content overflow; its content flexes inside the viewport and uses bounded compact headings now, with zero page overflow at 320, 375, 767, and 768 pixels. The permanent three-viewport desktop-home audit launches both The method and Participate through Start, verifies each explicit location-relative return target, follows browser Back, and confirms the closed popup plus foreground home focus after each path. The Tools audit similarly launches the dissertation page and confirms that `#desktop/tools`, all seven links, and foreground title focus reconstruct with zero desktop finding; the reader audit separately verifies its visible 44-pixel return and zero overflow;
- the production deployment dry run contains 157 files, including the root worker, implementation worker, complete `frontend/desktop/` runtime, participation page, and version file; its final release flips are the root index, implementation worker, root bridge, and `version.json` in that order. The human deployment guide now inventories the optional shell and gives the coordinated version, package, default-route, and offline checks for a desktop release while preserving the making-of publication gate;
- a fresh browser confirms the root worker installs `jrda-cache-3.7.5` and `jrda-data-3.7.5`, a standard visit caches zero desktop assets, first desktop use warms exactly nine unique versioned assets, and an offline `#desktop/findings` reload renders all three canonical records with no console errors;
- a separate first-visit People & ideas check loads the canonical core corpus and entity graph, then reloads `#desktop/entities` offline under the root worker with 100 of 8,152 indexed entities visible; at 375 pixels, selecting Jay Rosen still focuses the named detail heading in the current viewport before the long list, with zero page errors, horizontal overflow, or accessibility findings, and opening a connected canonical record remains available while the same nine optional shell assets are warmed. The route-scoped `?entity=O0164#desktop/entities` link also reconstructs Membership Puzzle Project offline and Back reopens its exact cached source record; a syntactically valid but nonexistent entity ID is safely removed without rendering a phantom detail panel. A fresh offline reload of `?record=RECORD-00903&entity=P0005#desktop/entities` at 375 and 1440 pixels retains exact dialog/entity/opener focus, 20 visible Jay Rosen record links, zero overflow or axe findings, exactly nine optional desktop assets and one token stylesheet in the cache, and the computed `#f5f1e8` paper token with no same-origin request or console errors; the unavailable third-party Google font request falls back to the declared local font stacks;
- an HTTPS deployment-prefix simulation at `jamditis.github.io/rosen-frontend/` confirms a `/rosen-frontend/` registration scope and `/rosen-frontend/sw.js` controller; all cache entries, same-origin requests, and local links remain under the prefix, all seven maintained tool links resolve beneath it, the optional cache contains exactly the nine desktop assets, and `#desktop/tools` reloads offline with its standard-archive exit intact and no console errors;
- the equivalent `pressthink.org/j/rosen-archive/` simulation confirms the production `/j/rosen-archive/` scope and controller, the same seven prefixed tool links and nine optional assets, no escaped cache entries or requests, and a clean offline Tools reload;
- the local resolver and classic worker both recognize bare `::1` and the browser-serialized `[::1]` IPv6 loopback as preview hosts. A real `[::1]` browser run loads the optional stylesheet from `/frontend/desktop/desktop.css` with no production-prefix escape, and the complete 32-route mobile audit over IPv6 retains its 13 inherited findings with zero audit errors or desktop findings;
- browser checks confirm one active full-width window at 375×812, 812×375 landscape, and a 720×450 200%-zoom equivalent; all have internal content scrolling, no horizontal overflow, and zero automated accessibility findings. The permanent audit also fails on more than one pixel of document overflow in every one of the 51 desktop rows across phone, tablet, and desktop widths;
- every text input, select, and textarea inside the compact desktop or its shared report dialog computes to at least 16 pixels, preventing iOS focus zoom from displacing the fixed taskbar or dialog controls;
- a live tablet-to-desktop-to-phone resize sequence keeps the open filter drawer's search field focused and visible, preserves it when the filters become a static desktop sidebar, ignores drawer-only Escape handling at that width, then restores the open drawer without overflow or accessibility findings; the reverse static-sidebar-to-phone crossing automatically opens the drawer around the exact focused filter, while an ordinary drawer opening waits for its visibility frame before moving focus and Escape at tablet width closes it and returns focus to Filters;
- when compact reflow hides the desktop shortcut field around an active app, focus on a shortcut transfers to that app's visible window title; a live 1440-to-375 check retains the active Archive URL/window with zero overflow or accessibility findings instead of leaving focus inside `display:none` content;
- a live history/focus sequence confirms Back reactivates the exact prior window, restores the historical readable filter query instead of letting current in-memory filters overwrite it, clears non-URL analytics result IDs, and lets URL authority reopen an active window after it was minimized or closed; record Escape returns to the exact invoking card, concurrent windows introduce no duplicate IDs, and narrow reflow exposes only the active window; a separate reset check confirms the persisted layout key is removed rather than replaced by an empty envelope, with focus returning to the reset app's shortcut;
- visual review at 320 and 375 pixels keeps the fixed Start icon and the complete “Standard archive” label visible, wrapping the exit label instead of ellipsizing it while leaving the task list horizontally scrollable; both widths have zero page overflow and zero automated accessibility findings;
- the complete 15-item Start menu fits or scrolls above the taskbar at desktop, 375×812 portrait, and 812×375 landscape sizes; its roving tab stop makes the short-landscape scroll region keyboard accessible, End and wrapped Arrow navigation reach the expected items, Escape returns to Start, forward Tab closes to Start, and reverse Tab closes to the prior visible control rather than stranding focus in the unmounted popup. All three states have zero automated accessibility findings. The Start button publishes the required `aria-haspopup` and `aria-expanded` menu-button state while omitting the optional `aria-controls` relationship that axe cannot resolve for this conditionally mounted popup, eliminating the remaining critical incomplete in both closed and open menu states;
- forced-colors checks at desktop and phone widths remove the decorative wallpaper mark, use system canvas colors for shortcut and menu microcopy, preserve the textual Active marker and structural borders, show a three-pixel keyboard focus outline, and report zero accessibility findings with or without the Start menu open;
- the browser accessibility tree exposes one main landmark and separately named home, background, and active window regions on desktop, with focus on the URL-active title; minimizing removes that region while retaining a named restore task, and the phone tree exposes only the active window plus the permanent standard-view exit, with exactly one level-one Archive desktop heading in launcher, active-app, and unknown-route states;
- direct Read me checks at 375 and 1440 pixels confirm the blocked making-of integration remains registry-only: neither “How it was made” nor a generic future-connections placeholder enters the rendered page, while reset remains visible and both layouts have zero overflow or accessibility findings;
- browser fault injection confirms an aborted lazy `DesktopShell.js` request produces one named fallback main with a 44-pixel standard-archive exit; an aborted desktop stylesheet still exposes the Read me heading, standard exit, and reset action; and an aborted canonical core-data request gives People & ideas, Start here, and Selected findings their context-specific alert, 44-pixel reload action, and permanent standard-view escape while retaining independently useful entity or guide content. The desktop and mobile fault states add no accessibility findings and have no horizontal overflow.
- aborting only `archive-entities.json` while core records remain healthy now produces the shared entity browser's explicit “Unable to load people and ideas” alert instead of a misleading zero-entity result. The canonical standard route and the 375-pixel desktop adapter both retain a 44-pixel reload action, and the desktop keeps its standard-view exit; neither state overflows or adds an accessibility finding. Record details deliberately retain their existing category-based related-work fallback when only entity data is unavailable;
- aborting only the small `archive-analytics.json` aggregate produces a live alert on both the canonical Analytics route and its 375-pixel desktop adapter, with AA error colors, a 44-pixel reload action, zero overflow, and zero accessibility findings; the desktop error also retains its permanent standard-view exit;
- the desktop problem-report action retains the canonical modal, traps forward and reverse Tab navigation, returns focus to the exact shortcut after Escape, and hands a disappearing Start-menu trigger to the durable Start button before opening so menu-launched reports also enter the first field and close to visible connected focus. It hides decorative icons and renders every real focusable control at least 44 pixels at phone and desktop widths; its off-screen, non-tabbable spam honeypot remains intentionally outside that interaction scan.
- the checked-in independent-review handoff gives an outside reviewer a reproducible first-impression, canonical research, spatial-memory, responsive, accessibility, offline, and failure-recovery sequence plus explicit approval fields. It does not self-approve the work and keeps making-of, merge, version/cache bump, deployment, and live verification as separate gates;

The repository-wide preview audit covers 32 route states at mobile, tablet, and desktop sizes (96 rendered states) and reports the unchanged 33 rule-level baseline findings. During each row's application-loading and interaction phase it also captures unhandled page errors, caught application `console.error` output, same-origin failed requests, and same-origin HTTP error responses with route-scoped listeners and fails them as audit errors. Console/network capture pauses only while axe is injected because axe performs its own synthetic CSS-import requests, then resumes for the remaining interaction checks; page-error capture remains active throughout, and all listeners are removed before the next route. Unavailable third-party fonts remain outside the local-runtime gate. The command retains that complete run by default and accepts `PREVIEW_AUDIT_VIEWPORT=mobile|tablet|desktop` for equivalent per-viewport shards on bounded runners. `#start`, the participation page, the standard selected-entity and combined selected-entity/record deep links, the open canonical dissertation detail panel, all 51 desktop-shell rows—including the useful unknown-app fallback, the open complete Start menu with keyboard focus-return and real Tools-launch checks, Archive and Folders, Start here, Selected findings, the selected-entity and combined selected-entity/record deep links, Read me, Tools, the explicit concurrent-window layout, the canonical record overlay, and the open report dialog—and the Winer method demonstration each contribute zero findings. The remaining findings are confined to previously maintained standard archive, standalone dissertation, reader, FAQ, and status-report surfaces.
