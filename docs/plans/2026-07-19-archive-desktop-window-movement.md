# Archive desktop window movement

## Scope and status

This follow-up extends the merged optional archive desktop from PR #628. It
addresses Joe's July 19 review finding that windows need direct movement and a
clearer, more intentional stacking model. It does not reopen issue #622, change
the standard archive default, expose gated features, add resize/maximize, or
publish to the WordPress host.

Working branch: `codex/archive-desktop-window-movement`

Working tree: `/home/jamditis/worktrees/rosen-frontend-desktop-window-movement`

The completed implementation is one coherent interaction slice:

- native title-bar pointer drag on wide layouts;
- reliable pointer capture and click/drag threshold behavior;
- first-click activation without breaking controls inside background windows;
- a visible click/tap and keyboard Move alternative;
- recoverable viewport clamping and wide/compact reflow;
- schema-2 logical-position persistence with schema-1 migration;
- no movement entries in browser history;
- restrained truthful status/help copy only where it explains real state.

## Bounded reference review

| Reference | Pattern and archive fit | Risk | Decision |
| --- | --- | --- | --- |
| [98.css](https://jdan.github.io/98.css/) | Semantic controls beneath period styling, explicit labels, distinct active chrome, pressed controls, and contextual status fields. | Tiny period targets and color-only state would regress the existing shell. | Adapt the grammar with 44-pixel controls, text labels, and redundant state; do not add the dependency. |
| [Microsoft Windows User Experience](https://archive.org/details/microsoftwindows00micr_0) and Microsoft's [keyboard UI guidance](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/dnacc/guidelines-for-keyboard-user-interface-design) | Title-bar drag, Move commands, arrow-key adjustment, implicit activation, recoverability, and visibly distinct inactive windows form one system model. | A custom move mode can trap focus or conflict with assistive-technology shortcuts. | Adapt title drag plus a plainly labelled Move control; keep keyboard handling local to that control. |
| [WCAG 2.2: Dragging movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements) | Dragging needs a single-pointer alternative in addition to keyboard support. | Keyboard-only equivalence would still exclude touch users who cannot drag. | Ship click/tap arrow controls in the same change as drag. |
| [Pointer capture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture) | Pointer capture keeps movement attached when the pointer outruns the title bar. | Re-render, focus, and activation races can interrupt capture. | Capture before activation, keep transient movement in CSS variables, and commit state once on completion. |
| [GUIdebook Windows 98 gallery](https://guidebookgallery.org/screenshots/win98) | Visual cross-check for title bars, taskbar activation, help, properties, and progress/status areas. | Screenshots do not prove behavior; original dimensions and assets are not appropriate accessibility defaults. | Use only as a coherence check. |
| [1999 Windows 98 manual](https://www.worldcolleges.info/sites/default/files/windows98.pdf) | Tip of the day was dismissible and optional; Help and task switching were consistently available. | Startup tips interrupt reading and steal focus. | Add movement guidance to Read me; defer any optional tip panel and reject an automatic modal. |
| [Cameron's World](https://www.cameronsworld.net/) | Small badges, candid webmaster language, and handmade inconsistency can carry a strong authored voice. | Collage density, found prose, motion, and audio would overwhelm archive reading. | Adapt sparingly later; do not copy assets or prose. |
| [WINDOWS93](https://www.windows93.net/) | Confident layering and optional discovery make the metaphor feel alive. | Deliberate chaos and novelty apps weaken orientation and trust. | Defer an archive-specific Easter egg; reject chaotic usability. |
| [Web Design Museum's 1990s exhibition](https://www.webdesignmuseum.org/exhibitions/web-design-in-the-90s) | A comparison corpus for dense navigation, badges, counters, browser chrome, and help language. | Screenshots carry selection bias and third-party trade dress. | Use patterns only. |
| [Viewable With Any Browser](https://anybrowser.org/campaign/index.html) | A tiny badge can make a truthful public promise and retain text alternatives and graceful degradation. | Image-only text, flashing art, tiny targets, hotlinking, and untested claims erode trust. | A repo-authored static archive promise badge remains a later option; no fake browser gate. |
| [CERN's restored first website](https://info.cern.ch/hypertext/WWW/TheProject.html) | Plain linked structure makes the information space and its purpose legible without ornament. | A literal imitation would lose the desktop's spatial value. | Preserve plain labels, direct routes, and canonical-link clarity under the visual treatment. |
| [Space Jam's preserved 1996 site](https://www.spacejam.com/1996/) | Dense image navigation and unmistakably authored period identity demonstrate the era's confidence. | Animated decoration, image-only navigation, and copied artwork would be distracting and inaccessible. | Reference only; reject its navigation and motion patterns here. |

### Icon provenance and decision

Joe stated in this session on July 19, 2026: “The icons that I gave you are
fully free to use. Anyone can use them for any purposes.” The requested source
is Alex Meub's [Windows 98 Icon Viewer](https://win98icons.alexmeub.com/), whose
download contains 1,757 PNG renditions plus ICO, ICL, and ANI files but no
license or attribution notice. The same binary corpus appears in
[`trapd00r/win95-winxp_icons`](https://github.com/trapd00r/win95-winxp_icons),
also without a license. Alex Meub is established as the gallery publisher, not
as the underlying asset copyright owner.

Microsoft's current [copyright guidance](https://www.microsoft.com/en-us/legal/intellectualproperty/copyright/permissions)
conflicts with a default free-redistribution assumption: it says Microsoft
product icons generally may not be used in online locations or software without
permission. At least one archive asset also contains an embedded Microsoft
copyright string.

Decision for this interaction PR: defer the extracted icon replacement. Joe's
statement is recorded as project-owner authorization, but it does not by itself
establish the viewer publisher's authority over Microsoft-origin files. A later
coherent icon slice can proceed with either separate rights-holder permission or
newly authored repo-native pixel icons. It must include exact per-file source,
hash, third-party notice, density, offline, forced-colors, transfer-budget, and
deployment review. No asset will be hotlinked or copied opportunistically here.

## Browser reproduction

Baseline: `origin/main` at `e8e8b00`, Chromium, fresh context, local production
preview.

| Viewport | Reproduction | Finding |
| --- | --- | --- |
| 1440×900 | Seeded Archive, People & ideas, and Analytics as visible windows. Their frame tops were about 76.7, 90.7, and 104.7 pixels and their left edges about 375.2, 389.2, and 403.2 pixels. | The 14-pixel cascade exposes bevel strips, not readable title bars. Activation exists, but the visible layout does not communicate a controllable stack. |
| 1440×900 | Clicked the small exposed part of Archive's background title bar. | Archive correctly rose, the URL became `#desktop/archive`, title focus moved correctly, and z-order repaired without duplicates. The underlying behavior works but is difficult to discover and intentionally control. |
| 720×450 | Reflowed the same three-window state after activation. | Compact mode correctly rendered one full-width active app and retained the others in the task list. Freeform placement must stay disabled here. |
| 375×812 | Reflowed again in portrait. | The active app remained the only visible window with no horizontal escape. Stored wide-layout positions must remain inert and recoverable. |

## State and geometry decisions

- Schema 2 stores only bounded integer logical offsets `{ x, y }` on known
  window entries. They are offsets from the centered/top layout baseline, not
  viewport coordinates. Schema 1 migrates each repaired z-order entry to a
  32-pixel cascade offset, replacing the shipped 14-pixel bevel slivers with
  readable background title bars. Future schemas still fail closed.
- Normalization rejects strings, partial pairs, `NaN`, infinities, and values
  outside a fixed logical safety bound. Transitions preserve positions,
  including the Archive/Folders and Start/Selected findings family swaps.
- New windows receive the next deterministic cascade offset once. Geometry is
  then stored independently from z-order, so raising a window never moves it.
- Position participates in the bounded wide-window height calculation so a
  lower frame stays above the taskbar, but the reading pane has a 240-pixel
  floor. Movement therefore cannot collapse the document surface.
- Drag stores its start rectangle and logical position, activates once, captures
  the pointer, crosses a five-pixel threshold, updates only inline CSS variables
  while moving, and commits the final clamped position once on pointer up or
  cancellation. It never calls navigation while moving.
- The title bar ignores drag initiation from minimize, Move, and close controls.
  The visible Move control deliberately raises a background window and opens a
  labelled directional-control panel on its first activation.
- The non-drag panel provides 44-pixel up/down/left/right and center controls.
  The same focused panel accepts arrow keys. Escape or Done closes the mode and
  returns focus to Move. Completion messages go to the existing polite status
  region; pointer pixels are never announced.
- Wide-layout clamping keeps the full title bar inside the visual viewport and
  above the permanent taskbar. It runs after restored layout, stylesheet/element
  resize, window resize, orientation change, and `visualViewport` resize.
- Compact mode applies neither cascade nor user offsets, closes Move mode, and
  preserves the stored wide position for expansion. Resize/maximize remain
  deferred.
- Reset closes every app and removes schema-2 positions with the same durable
  Start-button focus return already covered by the foundation.

## Completed test-first sequence

1. Add failing state tests for schema-1 migration, schema-2 allowlisting,
   malformed/extreme positions, family preservation, movement transitions, and
   four-edge clamping.
2. Add failing structure contracts for pointer capture, threshold/commit
   behavior, Move controls, split CSS variables, compact suppression, truthful
   Read me text, and the browser checks below.
3. Extend the permanent 1440×900 browser flow to drag a background window,
   prove stable geometry on raise, prove active-window drag does not change URL
   or history length, exercise Move by keyboard and single-pointer click, verify
   announcement/focus, and Reset removal.
4. Seed a schema-2 moved layout and reflow it through 720×450 and 375×812 before
   returning wide. Require one visible active compact app, restored clamped wide
   geometry, taskbar reachability, no horizontal overflow, no pointer-only task,
   zero desktop axe findings, and no runtime errors.

## Implementation outcome

- Visible windows keep a stable DOM order while z-index follows the repaired
  `zOrder`. Raising a background window therefore no longer remounts the title
  bar that owns pointer capture.
- Cascade positions stay unique beyond the fourth window and reuse the first
  unoccupied slot after a close, so a newly opened frame never exactly covers
  an older frame by default.
- A five-pixel pointer threshold separates activation clicks from movement.
  Transient drag geometry stays in CSS variables, and one schema-2 state update
  is committed at completion. Browser history changes only when the active app
  changes.
- Each title bar exposes a 44-pixel Move button. Its non-modal panel supports
  click, tap, arrow keys, Shift-modified fine movement, Center, Done, and Escape,
  with explicit focus return and polite completion messages.
- Clamping preserves the full title bar horizontally and at the top edge, keeps
  a useful portion of the body above the taskbar when space permits, and gives
  the title bar priority in an impossibly short work area so recovery is never
  lost.
- Compact layouts suppress freeform geometry without overwriting the saved wide
  positions. Re-expansion restores the same stack and clamped offsets.
- Active/inactive chrome is redundant in border, shadow, title treatment, text,
  and focus indication. Status bars now report truthful archive context such as
  record/filter/page counts, device-local layout memory, or lazy query state.
- The permanent preview audit scans for an actually exposed background title-bar
  point, verifies drag and non-drag movement, asserts history and saved state,
  and exercises 1440×900, 720×450, and 375×812 reflow in one route.

## Verification evidence

Release stamp: `3.7.7`, synchronized by `npm run bump-version -- 3.7.7`
across 151 cache-busting markers, `version.json`, and the service-worker cache.

| Check | Result |
| --- | --- |
| Desktop state and structure regressions | Green, including schema-1 migration, schema-2 validation, family preservation, movement, four-edge and short-work-area clamping, pointer capture, stable DOM layering, non-drag controls, focus, history, compact suppression, and truthful status contracts. |
| `npm run test:frontend` | 293 tests passed. |
| `npm test` | 1,113 tests passed. |
| Deployment pytest (`test_deploy_full_site.py`, `test_sftp_push.py`) | 50 tests passed using a temporary pytest/Paramiko environment because Poetry was unavailable on the host. |
| Desktop browser shard, 1440×900 | All routes and interaction assertions completed; every desktop row had zero axe violations. The report retained 9 pre-existing findings on standard routes. |
| Tablet browser shard, 768×1024 | All routes and interaction assertions completed; every desktop row had zero axe violations. The report retained 11 pre-existing findings on standard routes. |
| Mobile browser shard, 375×812 | All routes and interaction assertions completed; every desktop row had zero axe violations. The report retained 13 pre-existing findings on standard routes. |

The three audit reports therefore retain the known 33-finding standard-route
baseline while adding no desktop finding. Generated reports and screenshots
remain in ignored `preview-audit-results/` evidence rather than release files.

## Deliberate deferrals

- window resize and maximize;
- Microsoft-origin icon redistribution;
- automatic Tip of the day;
- wallpaper preferences;
- Easter eggs, animation, audio, marquee/ticker text, fake network activity,
  visitor counters, or decorative app windows;
- any production upload or external publication.
