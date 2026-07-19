# Archive desktop foundation

## Scope

Issue #622 adds an optional Windows 95/98-inspired exploration shell to Jay Rosen's Internet Archive. The standard archive stays the default. The desktop is a second front door that reuses canonical routes, records, services, and reporting behavior.

The implemented slices cover the product map, accessible shell, archive and record browsing, people and ideas, the dissertation map, analytics, maintained tools, and root-scoped offline behavior. Multi-window behavior, persisted layout, and approval-gated editorial integrations remain later slices.

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
| Visitor guide | `#start` | Start here | Exit to standard view | Ready; added by PR #621 |
| Entities and relationships | `#entities` | People & ideas | Open the canonical entity browser in-shell | Ready |
| Dissertation mind map | `#dissertation` | Dissertation | Open the canonical interactive mind map in-shell | Ready |
| Archive analytics | `#analytics` | Analytics | Open the canonical aggregates, query builder, and opt-in SQLite tools in-shell | Ready |
| About | `#about` | About the archive | Exit to standard view | Ready |
| Problem report | existing `BugReportModal` action | Report a problem | Open the existing report dialog over the desktop | Ready |
| Desktop orientation | `#desktop/readme` | Read me | Open an in-shell reading window | Ready; desktop-only content |
| Maintained tool index | `#desktop/tools` | Tools | Open an in-shell tool window | Ready |
| Community wiki | `#wiki` and `#wiki/:slug` | None | No public desktop entry | Excluded for now; the current archive intentionally keeps this deep-link route out of public navigation pending editorial direction |
| Selected findings | current selected-record trail in `#start` | Selected findings | Later in-shell adapter | Planned; Phase 4 should use real record links and approved copy |
| Archive method demo | issue #532 | The method | Add after its real route ships | Planned; another worktree is currently implementing it |
| Participate | issue #347 | Participate | Add only after approval | Blocked; issue #347 says `DO NOT AUTOMATE` and awaits a design asset plus scope/funding decisions |
| Making-of narrative | draft `features/making-of/` | How it was made | Add only after curator approval | Blocked; deployment rules explicitly withhold the draft |

### Standalone pages and tools

| Surface | Path | Initial desktop placement | State and reason |
| --- | --- | --- | --- |
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
| `#desktop/entities` | Canonical people-and-ideas browser in a desktop window |
| `#desktop/dissertation` | Canonical dissertation mind map in a desktop window |
| `#desktop/analytics` | Canonical archive analytics in a desktop window |
| `#desktop/readme` | Desktop with the Read me window active |
| `#desktop/tools` | Desktop with the maintained-tools window active |
| `#desktop/:unknown` | Desktop home fallback with an accessible status announcement |

Only in-shell windows use the nested desktop hash. Archive, Folders, People & ideas, Dissertation, and Analytics use thin in-shell adapters over shared application state or canonical components. Each offers an explicit standard-view exit. Launching Start here or About performs an explicit transition to that destination's existing canonical route. The report action opens the existing report dialog and does not mint a new URL.

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
- A non-modal content window occupies the main workspace. It is a labelled section, not a dialog, and does not hide the shortcut field from assistive technology.
- The Start button opens a named menu, moves focus to its first item, supports Up/Down/Home/End, closes on Escape, and returns focus to the Start button.
- The taskbar always exposes “Standard archive.”
- Closing an in-shell window returns to `#desktop` and restores focus to its shortcut when possible.

### Mobile and narrow zoom layouts

- The spatial canvas becomes a two-column touch launcher with normal document flow.
- An active in-shell app becomes a full-width content panel rather than a shrunken floating window.
- The taskbar respects safe-area insets and remains usable at 200% zoom.
- No action depends on drag, hover, right-click, double-click, sound, or animation.

Reduced-motion mode removes decorative transitions. The foundation does not implement movable, resizable, minimized, or persisted windows; those behaviors belong to Phase 5 after equivalent keyboard controls are designed.

## Loading, failure, and offline behavior

The desktop route is lazy-loaded. A standard archive visit adds only the route vocabulary, lazy import declaration, and two entry controls; it does not request desktop JavaScript or CSS. A cold desktop deep link does not fetch the archive corpus.

The desktop stylesheet is requested only after the desktop component mounts. A failed dynamic import renders a plain archive-styled fallback with a working route to the standard archive. A failed desktop stylesheet leaves semantic content usable.

The root page now registers a stable root `sw.js` bridge, which imports the cache-versioned `frontend/sw.js` implementation with fresh-import checking. Its implicit scope is `/` in local preview and the deployed archive subtree on GitHub Pages and production. The install manifest covers the complete eager standard-app module graph and the real root `index.html`; it does not contain desktop modules. On the first desktop mount, `DesktopShell` asks the active worker to warm the seven optional desktop assets for the next visit.

Browser validation in a new storage context confirms that the worker controls the root page, a standard visitor caches no desktop assets, the standard archive reloads offline, a first-ever desktop visit warms its optional module graph, and `?record=...#desktop/archive` reloads offline after the record details have been opened once. Query-string navigations fall back to the cached clean app root. Data that was never opened remains governed by the existing explicit loading/error states; the large analytics SQLite source is never prefetched.

## Baseline before implementation

Measured from `origin/main` commit `cefac66` on 2026-07-18 with service workers blocked:

- `frontend/App.js`: 41,899 bytes;
- `frontend/services/viewState.js`: 6,574 bytes;
- `frontend/services/router.js`: 2,129 bytes;
- initial standard route after 1.5 seconds: 57 same-origin resources and 27,443,486 uncompressed local bytes;
- the last figure includes the existing delayed `archive-details.json` preload, which accounts for 13,520,143 bytes;
- no desktop-specific request exists in the baseline.

Post-change checks must show no `DesktopShell.js`, desktop registry, or desktop CSS request on the standard route. The current feature-PR convention keeps version `3.7.3`; coordinated release work will bump imports, `version.json`, and the service-worker cache together.

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

Measured from the completed archive adapter with service workers blocked:

- the standard route requests 58 same-origin resources after 1.5 seconds, excluding the document;
- local decoded transfer is 27,455,174 bytes, 11,688 bytes over the original baseline and 6,573 bytes over the shell-only checkpoint;
- the one added standard-route request is `ArchiveResults.js`, extracted from `App.js` so standard and desktop results share one renderer;
- `frontend/App.js` is 39,232 bytes, `ArchiveResults.js` is 8,714 bytes, `frontend/services/viewState.js` is 6,969 bytes, and `frontend/services/router.js` is 2,769 bytes;
- the standard route does not request `DesktopShell.js`, `desktopRegistry.js`, or `desktop.css`;
- a cold `#desktop` deep link does not request core archive data; `#desktop/archive` makes one `archive-core.json` request and no duplicate corpus request;
- `#desktop`, `#desktop/archive`, `#desktop/entities`, `#desktop/dissertation`, and `#desktop/analytics` have zero automated accessibility violations at their validated target sizes, as do selected-entity, dissertation-detail, and open-record states;
- keyboard checks cover shortcut arrow navigation and activation, Start-menu focus entry and Escape return, window close focus return, filter-drawer entry/Escape return, record-modal entry/return, unknown-app fallback, and mobile reflow without horizontal overflow;
- entity browsing makes one core and one entity-index request, dissertation makes no data request, and analytics fetches only the small aggregate until an explicit query loads SQLite;
- dissertation nodes are keyboard reachable, its shortcuts act only while the map owns focus, and its detail panel returns focus to the exact SVG node;
- an analytics composable query returns its 20 canonical record IDs to `#desktop/archive` without leaving the shell;
- the complete test suite passed 1,000 tests across 211 suites at the Phase 3 checkpoint, and the production deploy-manifest suite passes all 36 focused tests after the root service-worker bridge was added.

The repository-wide preview audit reports 49 rule-level findings. Before this work it reported 35 across mobile and desktop; the new tablet viewport accounts for 16 equivalent findings, while shared record-card/modal improvements remove two desktop findings. Both desktop routes contribute zero findings in every viewport. Remaining findings belong to the previously audited standard, entity, analytics, dissertation, reader, FAQ, and status surfaces.
