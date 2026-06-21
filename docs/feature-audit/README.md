# Feature audit — rosen-frontend

A full feature inventory of the archive app, written as user stories with code-derived expected behavior, and a single canonical spreadsheet tracking each feature through testing and fixes.

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

`build.mjs` rebuilds the catalog fields from the 8 `stories-0*.json` parts but **preserves** tracking fields (test/fix/retest) by matching on `id`, so it is safe to re-run after any phase. To record a test result or a fix, edit `feature-stories.json` (or the part files for catalog changes) and re-run `build.mjs`.

Each story's `id` lives in the part file itself (it is not derived from array position), so inserting, reordering, or deleting a story never renumbers its siblings and tracking can never re-attach to the wrong feature. `build.mjs` enforces this: it throws if any story is missing an `id`, carries an `id` whose prefix does not match its part, or duplicates another `id`. A new story needs the next free `id` for its part prefix (`harness/inject-ids.mjs` is the one-off that originally stamped them).

## Phases

All four phases are complete.

1. **Catalog** — done. 166 stories across 4 areas, written by reading every feature's source.
2. **Test** — done. Every story exercised in real Chromium (playwright-core + system chromium); 23 came back fail/partial, the rest pass/n/a. Results in `verdicts-*.json`.
3. **Fix** — done. Of the 23: **14 fixed**, 6 deferred, 3 wontfix. Decisions + rationale in `fixes-phase3.json` (and the `fix_status` / `fix_applied` columns).
4. **Re-test** — done. All 14 fixes re-verified in real Chromium via `harness/retest-phase4.mjs` (**14/14 pass**); the 9 deferred/wontfix are marked `n/a` (their Phase 2 finding stands). Results in `retest-phase4.json` / `retest-deferred.json`.

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

### Re-running

```bash
# from repo root, with the harness server up:
python3 docs/feature-audit/harness/serve.py 8000 .          # background it
node docs/feature-audit/harness/retest-phase4.mjs           # re-verify the 14 fixes
node docs/feature-audit/apply-verdicts.mjs fix              # fixes-*.json   -> master
node docs/feature-audit/apply-verdicts.mjs retest           # retest-*.json  -> master
node docs/feature-audit/build.mjs                           # master -> CSV
```

## Note on `code_smell`

114 of 166 stories carry a `code_smell` from the reading pass. These are **candidates, not confirmed bugs** — they are verified against real behavior in phase 2 before any fix. Some are minor (style/reuse), some are real defects (e.g. duplicate `id="conclusion"` in the reader, FAQ `figures` category with no pill, unescaped SQL interpolation in the query builder).
