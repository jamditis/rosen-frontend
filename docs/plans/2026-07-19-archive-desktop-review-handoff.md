# Archive desktop independent review handoff

## Purpose

This handoff is for the independent design and accessibility review required by [issue #622](https://github.com/jamditis/rosen-frontend/issues/622). It does not record an approval. It gives a reviewer a compact, reproducible path through the optional archive desktop and leaves the editorial making-of and live-release gates closed.

Review branch: `codex/issue-622-desktop-foundation`

The standard archive remains the default. The desktop is an optional Windows 95/98-inspired exploration shell over the canonical archive, records, entities, dissertation, analytics, guide, and reporting behavior.

## Start the review build

From the isolated worktree:

```bash
cd /home/jamditis/worktrees/rosen-frontend-622
npm run preview
```

Open the local URL printed by the preview server. Use a fresh browser profile or private context so persisted desktop layout and service-worker state do not bias the first impression.

For the automated evidence and viewport screenshots:

```bash
npm test
npm run test:frontend
npm run preview:audit
```

The expected test results are 1,095 passing repository tests across 224 suites and 281 passing frontend tests across 54 suites. `preview:audit` intentionally exits nonzero for the repository's inherited accessibility baseline. The expected result for this branch is 33 rule-level findings across 31 routes and three viewports (93 states), with zero findings in all 48 desktop rows, including the open Start-menu interaction state. Screenshots are written beneath `preview-audit-results/screenshots/{mobile,tablet,desktop}/`.

## Review sequence

### 1. Optional entry and first impression

1. Begin at `/` and confirm the familiar archive remains the first experience.
2. Enter through Start here or Tools, then inspect `/#desktop` directly.
3. Open Read me and return to the launcher.
4. Open Tools and launch Dissertation release. First use browser Back and confirm the Tools window reconstructs. Relaunch the page and use its 44-pixel “Back to archive” control to confirm the explicit standard-view escape. Repeat with the method demonstration and data visualization to sample the deeper standalone path prefixes.

Evaluate:

- Does the late-1990s desktop grammar make a large archive feel more spatial and approachable?
- Do the teal workspace, restrained bevels, paper content, archive fonts, and ink palette read as one product rather than a novelty skin?
- Are “Standard archive,” Read me, window titles, and Active state clear without relying on icon recognition or color alone?
- Is the permanent exit prominent enough that the alternate shell never feels like a trap?

### 2. Canonical research continuity

Open these states:

- `/#desktop/archive`
- `/?entity=P0005#desktop/entities`
- `/?record=RECORD-00903&entity=P0005#desktop/entities`
- `/#desktop/dissertation`
- `/#desktop/analytics`

On the combined entity/record URL, confirm the record dialog owns focus. Press Escape: Jay Rosen should remain selected and receive heading focus. Open a record from “Records mentioning this entity,” then press Escape again: focus should return to that exact record button.

From `RECORD-00903`, follow Membership Puzzle Project in “People and ideas in this record.” Confirm the entity opens without discarding the source Archive window from the taskbar; Back should reopen the source record.

Evaluate:

- Does the window frame support the research context, or compete with the record and entity content?
- Does record-to-entity movement feel continuous and reversible?
- Are the canonical standard-view exits understandable at every research surface?

### 3. Spatial model and recovery

Open Archive, People & ideas, and Analytics. Exercise:

- focus/raise by clicking a background window;
- focus/raise by keyboarding into a background control;
- minimize, taskbar restore, and close;
- browser Back and Forward across active-window changes;
- Reset desktop layout from Read me or the Start menu.

Evaluate whether the active marker, deterministic cascade, taskbar, and Reset behavior make concurrent windows understandable without drag or resize. No task should depend on hover, double-click, right-click, or animation.

### 4. Responsive interpretation

Review at:

- 375 × 812 portrait;
- 812 × 375 landscape;
- 768 × 1024 tablet;
- 1440 × 900 desktop;
- a 720 × 450 viewport as a 200%-zoom equivalent.

At narrow widths, confirm the metaphor intentionally becomes a two-column touch launcher with one active full-width app, rather than a shrunken freeform desktop. Check fixed taskbar reachability, internal content scrolling, safe-area spacing, orientation changes, and absence of two-dimensional page scrolling.

### 5. Accessibility pass

Keyboard-only:

- traverse shortcuts with Arrow keys, Home, End, Enter, and Space;
- open Start, traverse all groups, verify Arrow-key wrap, and close with Escape;
- reopen Start and leave it with forward and reverse Tab; focus should land on a visible adjacent control, never the removed popup;
- enter and leave record dialogs, entity details, filter drawers, and dissertation details;
- minimize/restore/close windows and use Reset;
- confirm every programmatic focus target has a visible indicator.

Screen reader:

- confirm one main landmark;
- confirm separately named home/background/active window regions on wide layouts and only the active window on narrow layouts;
- confirm window Active and Minimized states are announced textually;
- confirm record dialog, selected entity, live status, errors, and task buttons have useful names.

Preferences and touch:

- test reduced motion;
- test Windows forced colors/high contrast;
- confirm 44-pixel controls and 16-pixel compact form text;
- confirm touch use does not require a mouse convention.

### 6. Offline and failure recovery

Online, open the combined entity/record URL once and wait for it to settle. Switch DevTools to offline and reload.

Confirm:

- the record dialog and selected entity reconstruct;
- the design-token paper palette remains applied;
- the entity record list remains usable;
- Escape and exact opener return still work;
- Standard archive remains reachable;
- a failed third-party font request falls back to the declared local font stacks without a same-origin failure.

Then restore networking and, separately, simulate blocked desktop JavaScript, desktop CSS, core records, entity data, and analytics aggregates. Each state should fail loudly while preserving a reload or standard-view escape.

## Boundaries the review must preserve

- Do not expose the currently unlinked community wiki.
- Do not restore the deprecated data-explorer toy.
- Do not add or review a public making-of page: its interview, fact-check, design, and publication approvals have not occurred.
- Do not treat the inherited 33 audit findings on maintained standard/standalone surfaces as desktop regressions.
- Do not approve a version/cache bump, deployment, or live publication from this review alone.

## Reviewer record

- Reviewer:
- Date:
- Browser and operating system:
- Screen reader or assistive technology, if used:
- Viewports completed:
- Outcome: approve / approve with changes / request changes / blocked
- Must-fix findings:
- Follow-up findings:
- What made the archive easier to understand:
- What felt decorative, confusing, or visually out of character:
- Accessibility notes:
- Evidence links or attached recording:

Approval here satisfies only the independent review gate. Making-of approval, merge, coordinated release version/cache bump, and live-archive verification remain separate decisions.
