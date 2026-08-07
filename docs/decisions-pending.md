# Decisions pending

The architectural calls Joe still owes. AskUserQuestion-ready — each block has the question, the options with tradeoffs, and a recommended option. Copy any block straight into the AskUserQuestion tool, or work through them in a single sitting.

**Snapshot:** 2026-05-25, post-merge of PR #258. Companion to [definition-of-done.md](./definition-of-done.md).

Order is roughly by how many other things each decision unblocks. Resolve in order if possible.

---

## 1. URL canonicalization for the archive

**Issue:** [#210](https://github.com/jamditis/rosen-frontend/issues/210)
**Blocks:** #207 (re-extract relationships on 204 records — needs canonical URLs first), #210 itself (10 dupe groups), any new gap-fill PRs going forward
**Why now:** every PressThink record going forward needs a policy. The longer this drifts, the more records get the inconsistent treatment.

**The setup:** Most PressThink essays exist at two URLs — `archive.pressthink.org/<old-mt-slug>` (the 2003-2009 Movable Type install) and `pressthink.org/<modern-slug>` (post-migration WordPress). The `archive.pressthink.org` subdomain has a known TLS cert issue and is referenced as `http://`. Some records use the archive URL even when the modern URL exists.

**Options:**

- **A. Default to `pressthink.org` modern URL; `archive.pressthink.org` is fallback in notes** *(recommended)*
  - Modern URL is what readers click; archive URL preserved as historical reference
  - Requires a one-pass HTTP 200 verifier to confirm each modern URL exists before swapping
  - Per-record curator override allowed (some old essays were rewritten and the archive version is what Rosen intends to be cited)
- **B. Default to `archive.pressthink.org` (archival fidelity)**
  - Preserves the URL as published in its original era
  - User-facing TLS cert friction; `http://` look in browsers
  - Easier to defend "this is what Rosen actually wrote then"
- **C. Hybrid: canonical = modern, `raw_text` + notes = both**
  - Maximum recoverability; doubles per-record curator effort
  - Best if you can run a bot to populate both fields automatically

**Recommendation:** A — modern as canonical with archive as fallback in notes. Document in `data/SCHEMA.md`. Run a one-time sweep to flip the 22 records in the 10 dupe groups (#210) per the new policy.

---

## 2. Pillar 3a deploy mechanism

**Issue:** [#200](https://github.com/jamditis/rosen-frontend/issues/200) + [#226](https://github.com/jamditis/rosen-frontend/issues/226)
**Blocks:** Pillar 3a smoke test, handoff readiness, every future record Jay adds
**Constraints (from #200):** no Actions on Joe's account (ban history), no Joe-owned infra, must work for non-technical Jay, weekly cadence OK, free long-term

**Options:**

- **A. GitHub Actions cron on the public repo, weekly** *(safe baseline)*
  - Public-repo Actions are unmetered by GitHub policy
  - Zero new infra; runs on GitHub-hosted runners
  - Risk: still shows in Joe's usage UI; future policy change is possible
- **B. Cloudflare Worker on Jay's account, webhook-triggered**
  - Off Joe's accounts entirely; Workers free tier is huge for this load
  - New infra; Workers don't have a stock SFTP client (needs ssh2 wrapper or SFTP-as-a-service)
- **C. "Publish" button Jay clicks** *(simplest mental model)*
  - Static HTML page → free serverless function → run pipeline → SFTP
  - Zero noise (only fires when Jay says); easiest for non-technical user
  - Requires Jay to remember to click after adding records
- **D. C + A together** *(recommended)*
  - Button is the primary user flow
  - Weekly cron is the safety net for "Jay forgot to click"
  - Both can coexist with negligible additional work

**Recommendation:** D (C + A). Button is the daily-driver; cron is the safety net.

---

## 3. Pillar 3b authoring surface scope

**Issue:** none open (session-tracked as "not scoped")
**Blocks:** handoff scoping; Jay's long-term editing capability beyond Sheets
**Why now:** if it's in scope, design needs to start before handoff so Jay isn't left waiting; if it's out of scope, HANDOFF.md documents the Sheet workflow as final

**Options:**

- **A. Out of scope — Google Sheets is the long-term authoring surface** *(recommended)*
  - Zero new code; Jay already uses Google
  - Sheet → CSV pipeline (already designed per #201) handles validation
  - Future Joe can add a UI later if Jay asks
- **B. In scope — design a Jay-facing UI for record edits**
  - Better non-technical UX for nuanced fields (notes, summary, related_to)
  - Requires hosting, auth, conflict resolution against Sheet-driven changes
  - Adds another surface to handoff
- **C. In scope, minimal — admin UI inside the existing SPA**
  - Reuses the frontend stack
  - Authenticates with a GitHub OAuth flow (Jay logs in once)
  - Still requires write path back to the CSV (commits via the same submit-record.yml machinery)

**Recommendation:** A — keep the Sheet as the authoring front door. Document it as such in HANDOFF.md. Revisit only if Jay specifically asks for a UI.

---

## 4. Social-platform backfill priority

**Issue:** referenced by [#208](https://github.com/jamditis/rosen-frontend/issues/208), [#209](https://github.com/jamditis/rosen-frontend/issues/209)
**Blocks:** Pillar 2 "complete" sign-off; how to spend the next gap-fill burndown session
**Current state:** Twitter/X current, Bluesky has 28% gap (filled in part by PR #220 — 50 posts), Mastodon shipped per PR #221, Threads not started

**Options:**

- **A. Bluesky first, accept Threads as deferred, Mastodon already done** *(recommended)*
  - Bluesky has the largest yield and the easiest API (already used by PR #220 sweep)
  - Threads API has Meta friction and low expected yield for Rosen's posting pattern
  - Locks in "social platforms current" for Pillar 2
- **B. All three (Bluesky + Mastodon + Threads), full coverage**
  - Most archival-complete; longest timeline
  - Threads API work is the long pole and may not be worth the marginal records
- **C. Pause social entirely, finish post/article gap-fill (#208 + #209) first**
  - Articles are higher-value than social posts per record
  - Social platforms continue accumulating new content so any pause means a re-sweep later anyway

**Recommendation:** A — Bluesky next, Threads deferred to "future" tier, Mastodon marked done.

---

## 5. Era taxonomy — decided

**Issue:** [#201](https://github.com/jamditis/rosen-frontend/issues/201)
**Status:** Decided by Joe on 2026-07-09.
**Decision:** Adopt the canonical 8-era taxonomy in `data/eras.js` across the repository. Do not use the alternative taxonomy proposed in #197.
**Related implementation:** The separate SQLite validator remains approved as future work after Pillar 3a stabilizes. This taxonomy decision does not change that timing.

---

## 6. Wire or shelve the ports-and-adapters entity-loading stack

**Issue:** [#503](https://github.com/jamditis/rosen-frontend/issues/503) (spun from #487; refs [#130](https://github.com/jamditis/rosen-frontend/issues/130))
**Blocks:** closing the #130 entity-loader migration; the repo carrying two entity-loading stacks, one of them dead
**Why now:** PR #504 (#487) consolidated the cache config (`cacheConfig.js`) and the timeout-race helper (`frontend/utils/raceTimeout.js`) that both stacks share, so the drift hazard between them is already gone. What is left is a duplication of intent, and it only grows as more code lands on either path. Added 2026-07-08.

**Updated 2026-08-07: the fact this decision turned on is no longer true.** The brief below was written on 2026-07-08 and rested on the live path masking a failed entity load as an empty Archive. PR [#628](https://github.com/jamditis/rosen-frontend/pull/628) (commit `e8e8b00`, merged 2026-07-19) fixed that, eleven days later and for its own reasons. `fetchEntitiesData` now returns an explicit `error` string on failure (`archiveService.js:575-579`), and `EntityBrowser` reads it into `loadError` and renders it in a `role="alert"` panel (`EntityBrowser.js:56-59, 259-265`). Re-verified against the working tree at `d4d1ce1`, and `tests/fail-loud-routes.test.js:56-71` pins both halves in CI, so this is a receipt rather than a claim. The correctness argument that decided A and C over B is gone, and what is left is the hygiene question the issue title asked in the first place. The revised reading is under **Recommendation**; the setup and options below are kept, corrected in place, because their cost estimates still hold.

**The setup (verified against the code):** two entity-loading stacks coexist.

- **Production path (live).** `archiveService.fetchEntitiesData` plus the mutable module-global `buildEntityMaps` (the `entityById` / `entityToRecords` / `recordToEntities` Maps). Its two consumers are `EntityBrowser.js` and `RecordModal.js`. On a fetch or parse failure its `catch` returns `{ entities: [], recordEntityMap: {}, error }` and `EntityBrowser` renders that error, so the browser no longer presents an outage as an empty Archive. `RecordModal` is the consumer that stays quiet, and it does so on purpose. It awaits `fetchEntitiesData()` and drops the return value (`RecordModal.js:141`), then reads the module Maps, which the failed load never populated. Its entity chips sit behind a `length > 0` guard (`RecordModal.js:547`) and disappear. Its related-records list does not: when no entity connection scores above zero, `RecordModal.js:172-179` falls back to matching on shared categories, and the "N shared entities" badge is hidden for those records because `connectionStrength` is zero (`RecordModal.js:575`). That fallback is deliberate, is explained in the comment above the error return (`archiveService.js:571-574`), and is pinned in CI by `tests/fail-loud-routes.test.js:57`, whose name is "returns a shaped failure that preserves record-modal fallback behavior". So the modal degrades gracefully rather than emptying out. What it does not do is say anything: the chips vanish with no explanation, and the related list quietly changes meaning from entity-based to category-based relevance, which looks exactly like a healthy record with weak connections.
- **Ports-and-adapters path (dead).** `services/loaders/entityDataLoader` (port) with `createHttpCachedLoader` (production adapter) and `createInMemoryLoader` (test adapter), composed by `createEntityIndex({ loader })` in `services/entityIndex.js`. Built as step 1 of #130 and test-covered (`tests/entity-index.test.js`, `tests/http-cached-loader.test.js`), but nothing outside its own tests imports it. The port rejects on a fetch or parse failure and does not resolve with empty arrays to mask that failure, with one gap the wiring must close: `toEntityDataPayload` (`httpCachedLoader.js:242`) defaults a non-array `entities` to `[]` and a missing `recordEntityMap` to `{}`, so a 200 that parses but has drifted from the expected shape still builds an empty index rather than rejecting. Schema validation on the parsed payload is the remaining fail-loud gap, which wiring option A should add.

What the two stacks still differ on, after #628, is smaller than it was. The live path surfaces a failed load in the entity browser and degrades silently in the record modal; the port rejects, so a consumer has to handle the failure to render at all, and the graceful category fallback would have to be written on top of that rather than falling out of empty Maps. Both are equally blind to a 200 that parses but has drifted from the expected shape: the port defaults a non-array `entities` to `[]` (`httpCachedLoader.js:242`), and the live path guards with `Array.isArray` (`archiveService.js:76, 83`) and sets no `error`, so `EntityBrowser` takes its `else if (data?.entities)` branch and shows an empty browser with no alert. The rest of the difference is design: the port injects its loader and hands back a frozen query, and the live path keeps three mutable module-global Maps that any importer can read at any time, populated or not.

**Options:**

- **A. Wire it** *(recommended in July, superseded)*
  - Compose `createEntityIndex({ loader: createHttpCachedLoader({ ... }) })` at the App composition root, migrate `EntityBrowser.js` and `RecordModal.js` onto the index, and delete archiveService's entity half (`buildEntityMaps`, the entity branch of `fetchEntitiesData`, the module-global entity Maps).
  - Closes the #130 migration. July also credited it with removing the silent-failure path; #628 removed that path from the live code first, so this is the architectural case on its own now.
  - Behavior change: an entity-load failure reaches the consumers as a rejection instead of a shaped payload, so both have to handle it, and the record modal's category fallback has to be rewritten to fire on a rejection rather than on empty Maps.
  - Blast radius is bounded but not trivial: two consumer files, each calling several entity accessors that read the module Maps (`getRecordsByEntity`, `getEntityById`, `getEntitiesByRecord`, `calculateEntityConnectionStrength`, `areEntitiesLoaded`), all of which move onto the index query API. The index itself is already tested.
- **B. Shelve it**
  - Delete `loaders/` and `entityIndex` and their tests. Removes the dead code and the "two ways to load entities" confusion. 549 lines of source and 737 lines of test, none of it imported outside its own tests.
  - Risk, as originally written: it deletes the silent-failure fix along with the dead code. #628 has since put that fix in the live path's entity browser, so plain B no longer ships the masking behavior forward. It leaves the record modal degrading without a signal, which is defensible: that degradation is deliberate and CI-pinned, and B changes nothing about it.
- **C. Fix in place, then shelve**
  - Do B, and also give `RecordModal` a way to say the entity index is down, using the `error` field `fetchEntitiesData` already returns.
  - The middle path: it keeps one stack and closes the last place a reader cannot tell an outage from a quiet record. It does not close the #130 ports-and-adapters migration.
  - Since #628 this is a much smaller change than it was in July. It is one consumer reading a field that already exists, not a new throw contract and two new error states. It has to be written as a note alongside the category fallback, not as a replacement for it, and `tests/fail-loud-routes.test.js:57` should keep passing.

**Recommendation (revised 2026-08-07): C, and B is no longer the wrong answer.** The July recommendation was A, and the reason was the silent-failure bug. #628 fixed that bug, so the argument that carried A no longer carries anything, and A has to justify itself on architecture alone: a five-step migration through two components a reader is looking at right now, to reach a design that is better but that nothing is currently blocked on. C removes 1,286 lines that only their own tests import, and adds a signal in the one place a reader still cannot tell an outage from a quiet record.

C over B is the narrow part, and it is narrow. July said the path to reject was plain B, because B would ship the masking behavior forward. It no longer would. What is left for C to argue is that the record modal's category fallback, which is deliberate and CI-pinned, changes what the related list means without telling anyone, and that a line of copy is a cheap price for saying so. That is a judgment call about one component, not a correctness argument, and B is a reasonable call to make instead.

What would flip it back to A: wanting #130 closed for its own sake. The port is built, tested, and does not rot in place, so that call keeps as long as anyone wants to make it. What would not flip it back is correctness, which is the change since July.

**If A, the steps:** (July's, still the right shape, with two corrections. Step 3's error state already exists in `EntityBrowser` and can be moved rather than written, and its `EntityBrowser.js:41-43` citation is stale: #628 rewrote that file, and the browse list now comes from the `entities` state at `EntityBrowser.js:37`, filled at `:62-63` and scoped at `:74-76`. The missing all-entities query on the index is still real. Step 5's consumer-level error-state test also exists now, at `tests/fail-loud-routes.test.js:64-70`; the loader-level malformed-payload test does not.)
1. Compose the index at the App root: `createEntityIndex({ loader: createHttpCachedLoader({ ... }) })`, taking the adapter's option names from `httpCachedLoader.js`. `createEntityIndex` awaits `loader.loadEntityData()` on construction (`entityIndex.js:27`), so composing it eagerly here fetches `archive-entities.json` on every App load, a regression from today's on-demand fetch that runs only when `EntityBrowser` or `RecordModal` opens. Preserve on-demand loading: build the index behind a memoized promise created on first entity-view use, or compose only the loader at the root and construct the index where it is consumed.
2. Add schema validation to the loader payload so a drifted-but-parseable response fails loud. `toEntityDataPayload` (`httpCachedLoader.js:242`) currently defaults a non-array `entities` to `[]` and a missing `recordEntityMap` to `{}`, so a 200 that parses but has drifted from the expected shape builds an empty index instead of rejecting. Validate the parsed payload there (reject on a non-array `entities` or a missing `recordEntityMap`) before it reaches `createEntityIndex`, so the port's throw-on-failure contract covers shape drift, not just fetch and JSON-parse failures. Without this step, steps 1 and 3 still let a malformed-but-parseable payload produce the silent-empty entity browser this decision removes.
3. Migrate `EntityBrowser.js` and `RecordModal.js` off `fetchEntitiesData` and off the module-Map accessors onto the index query API: `getRecordsByEntity` becomes `recordsOf`, `getEntityById` becomes `entity`, `getEntitiesByRecord` becomes `entitiesOf`, and `calculateEntityConnectionStrength` becomes `strength` (same `{ strength, sharedEntities, prominenceScore }` shape). `areEntitiesLoaded` drops out, since awaiting the index replaces the loaded check. Render an explicit error state when the load rejects (mirror the #290 error state). One accessor has no index equivalent yet: `EntityBrowser` renders its browse list, type counts, and filter from the full `data.entities` array (`EntityBrowser.js:41-43`), but the index Query exposes only point lookups plus `types()`, with no all-entities query. Add an `entities()`/`allEntities()` query to the index before migrating the browser, or keep passing it the loader payload for the list; otherwise the migration leaves `EntityBrowser` without the list it renders from.
4. Delete archiveService's entity half: `buildEntityMaps`, the entity branch of `fetchEntitiesData`, the module-global entity Maps, the five accessor exports above, and `findSharedEntities`, a sixth map-backed export (`archiveService.js:128`) whose only caller is the `calculateEntityConnectionStrength` this step removes; leaving it would strand an export that throws once its backing Maps are gone. Leave the details, search, and analytics paths alone.
5. Add a consumer-level test that a rejected entity load renders the error state, not an empty browser, and a loader-level test that a 200 with a malformed-but-parseable payload (a non-array `entities`) rejects instead of yielding an empty index. The index itself is already covered by `tests/entity-index.test.js`.

---

## How to use this doc

When you're back at a desk:

1. Resolve decisions 1-2 first (they unblock the most downstream work).
2. Decisions 3-5 are independent — handle in any order.
3. Decision 6 is self-contained: the block above has the verified code state, the options, and a recommendation, so no extra research is needed to make the call.
4. Once all six are resolved, work through the critical path in [definition-of-done.md](./definition-of-done.md).

For each decision, the recommended option is the default if you don't want to think hard. The other options are there if the recommendation doesn't fit something only you know.
