# Feature audit — rosen-frontend

A full feature inventory of the archive app, written as user stories with code-derived expected behavior, and a single canonical spreadsheet tracking each feature through testing and fixes.

## Status: what still runs today

All four audit phases finished. The folder is not uniformly frozen, so before you run anything here, check which column it is in.

| Path | Status | Run it when |
|------|--------|-------------|
| `build.mjs`, `validate-csv.mjs` | **Live tooling** | You edit a `stories-0*.json` part or a tracking field. Regenerating today reproduces the committed `feature-stories.json` and `.csv` byte for byte, so an unexpected diff means someone hand-edited a generated file. |
| `harness/lib.mjs`, `harness/test-main.mjs`, `harness/test-svc.mjs`, `harness/test-modals.mjs`, `harness/test-distools.mjs` | **Live tooling, and pinned by tests** | See the warning below. These remain active until normal regression tests replace their current checks. |
| `archive/` | **Historical evidence** | Read it to reproduce or understand the completed June 2026 phases. Do not run these scripts against current code. |
| `verdicts-*.json`, `fixes-phase3.json`, `retest-*.json`, `stories-0*.json` | **Evidence, and it ages** | Read as a record of what was true in June 2026, not as a description of the code now. See "The verdicts age" below. |

**Warning before you move anything.** Current tests read the five active harness files by exact path. Relocating them before their checks move into normal regression coverage will break the suite.

Know what that pin does and does not buy you. It holds the names it already knows; it never diffs the harness against the components. Treat these five files as maintained code, not historical evidence, and update them with the UI until normal regression tests replace their checks.

### The verdicts age

The tracking columns are a snapshot taken in June 2026, not a live check. Nothing re-runs them, and the app has not stopped moving, so a finding here can stop being true without anything in this folder noticing. Read a verdict as a lead to confirm against the code, never as the current state.

To see how far the code has drifted from the snapshot:

```bash
git log --oneline --since=2026-06-21 -- frontend/ dissertation/ | wc -l
```

Nine stories still carry `deferred` or `wontfix`. Anything worth acting on belongs in its own GitHub issue, where it can be closed and where a stale one is visible; ANL-13 is #584 and RDR-21 is #782. Once the rest are either filed or dismissed, this folder is evidence and nothing else.

## The canonical spreadsheet

`feature-stories.csv` is the deliverable — open it in any spreadsheet app. It has one row per feature (166 total) with these columns:

| Column | Meaning |
|--------|---------|
| `id` | Stable ID, area-prefixed (`MAIN-01`, `MODAL-03`, `RDR-07`, …) |
| `area` | Archive browser / Data & services / Dissertation tools / Standalone tools |
| `subarea` | Finer grouping (Search & filter, Record modal, Reader — Navigation, …) |
| `feature` | Short feature name |
| `user_story` | As a … I want … so that … |
| `expected_behavior` | What the code actually does, derived from reading it |
| `source_files` | Where it lives |
| `test_notes` | How to exercise it in a browser |
| `code_smell` | Concern noted while reading (a candidate, not a confirmed bug) |
| `test_status` | phase 2: pass / fail / blocked / partial / n/a |
| `errors_found` | phase 2: observed errors |
| `severity` | phase 2: high / medium / low |
| `fix_status` | phase 3: fixed / wontfix / deferred / n/a |
| `fix_applied` | phase 3: what changed |
| `retest_status` | phase 4: pass / fail / partial |
| `notes` | anything else |

## Source of truth and regeneration

`feature-stories.json` is the master. The CSV is generated from it — never hand-edit the CSV.

```bash
node docs/feature-audit/build.mjs       # rebuild master from parts + render CSV
node docs/feature-audit/validate-csv.mjs # confirm the CSV round-trips cleanly
```

This is the one workflow in the folder still expected to run. `build.mjs` rebuilds the catalog fields from the 8 `stories-0*.json` parts but **preserves** tracking fields (test/fix/retest) by matching on `id`, so it is safe to re-run after any phase. To record a test result or a fix, edit `feature-stories.json` (or the part files for catalog changes) and re-run `build.mjs`.

Each story's `id` lives in the part file itself (it is not derived from array position), so inserting, reordering, or deleting a story never renumbers its siblings and tracking can never re-attach to the wrong feature. `build.mjs` enforces this: it throws if any story is missing an `id`, carries an `id` whose prefix does not match its part, or duplicates another `id`. A new story needs the next free `id` for its part prefix. The archived `harness/inject-ids.mjs` records how the original ids were stamped.

## Phases

All four phases are complete.

1. **Catalog** — done. 166 stories across 4 areas, written by reading every feature's source.
2. **Test** — done. Every story exercised in real Chromium (playwright-core + system chromium); 23 came back fail/partial, the rest pass/n/a. Results in `verdicts-*.json`.
3. **Fix** — done. Of the 23: **14 fixed**, 6 deferred, 3 wontfix. Decisions + rationale in `fixes-phase3.json` (and the `fix_status` / `fix_applied` columns).
4. **Re-test** — done. All 14 fixes re-verified in real Chromium via `archive/harness/retest-phase4.mjs` (**14/14 pass**); the 9 deferred/wontfix are marked `n/a` (their Phase 2 finding stands). Results in `retest-phase4.json` / `retest-deferred.json`.

### What was fixed (Phase 3)

| Bug class | Stories | Fix |
|-----------|---------|-----|
| Hardcoded production paths (404 in local/Pages) | MODAL-16, ENT-10 | New `resolveSitePath()` in `pathResolver.js`; ToolsModal + DissertationPage route through it |
| Duplicate heading ids in the reader | RDR-02, RDR-19, RDR-03 | De-duplicated ids (kept `conclusion` on the canonical h1); guarded by `tests/reader-unique-ids.test.js` |
| Reader scroll-spy orphan highlight | RDR-03 | Scroll-spy observes only ToC-linked headings |
| Reader citation copied the label | RDR-18 | Citation wrapped in its own span; copy strips the label |
| Reader resume drift + timed dismiss | RDR-08 | Resume scrolls to the saved section element; prompt dismisses on scroll, not a 10s timer |
| FAQ copy-link reported success as failure | DIS-18 | Capture `currentTarget` before the async clipboard call |
| FAQ figures category unreachable | DIS-20 | Added the "Key thinkers" pill |
| Dissertation landing text-selection dead | DIS-08 | Wrapped content in a `<main>` landmark (also a11y) |
| Hero CTA opened in same tab | DIS-01 | Added `target="_blank" rel="noopener"` |
| status-report colour coding silently failed | TOOL-02, TOOL-08 | Added the missing Tailwind utilities page-locally |
| status-report dead import | TOOL-06 | Removed unused `CATEGORY_DISTRIBUTION` import |

### Historical phase machinery

Dormant. The completed phase scripts now live under `archive/`. They remain as historical evidence, not current maintenance commands.

Do not run these scripts against current code. Their paths, selectors, dependencies, and assumptions describe the June 2026 audit snapshot. Check out the audited commit if you need to reproduce a phase.

```bash
# Inspect the preserved scripts without treating them as current tooling.
find docs/feature-audit/archive -maxdepth 2 -type f | sort
```

## Note on `code_smell`

114 of 166 stories carry a `code_smell` from the reading pass. These are **candidates, not confirmed bugs** — they are verified against real behavior in phase 2 before any fix. Some are minor (style/reuse), some are real defects (e.g. duplicate `id="conclusion"` in the reader, FAQ `figures` category with no pill, unescaped SQL interpolation in the query builder).
