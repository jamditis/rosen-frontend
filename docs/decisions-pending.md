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

## 5. SQLite-validator rollout timing

**Issue:** [#201](https://github.com/jamditis/rosen-frontend/issues/201)
**Blocks:** nothing today; affects future-Joe / future-Jay maintainability
**Status:** design is complete, code not started

**Options:**

- **A. Build the validator as a CI step now (Phase 1 only)** *(recommended)*
  - Catches FK/CHECK violations on PRs before they merge
  - Schema drift (#196, #197 patterns) becomes impossible-to-merge rather than audit-found
  - Additive: doesn't change source-of-truth, doesn't touch the runtime
- **B. Wait until after Pillar 3a stabilizes**
  - One thing at a time; avoid concurrent infrastructure changes
  - Pillar 3a smoke testing might surface schema issues the validator would catch
- **C. Skip entirely; rely on audit scripts**
  - Current state. Lowest ongoing cost. Drift surfaces only when someone runs the audits.

**Recommendation:** A — build the CI validator step now (small, contained, won't conflict with Pillar 3a work in any meaningful way). Defer the source-of-truth + Sheets-front-door work to post-handoff per the original #201 plan.

---

## 6. Dissertation tools live-vs-repo restoration

**Surfaced during 2026-05-25 scans (not yet filed as an issue)**
**Blocks:** the "dissertation tools" subsystem grade in definition-of-done (currently Partial)
**Why now:** the live site serves 10 dissertation tools (reader, foreword, network-effect, glossary, comparison, context, excerpts, faq, concepts, timeline) but only 4 are in the maintained `dissertation/` directory. The other 6 live in `archived/dissertation-tools/`, which means edits there don't reach production via the FTP deploy manifest.

**Partial action taken (2026-06-16):** faq was restored to the maintained `dissertation/faq/` directory in #411 — a partial option-D move. The remaining six tools are still archived; this decision stays open for them.

**Options:**

- **A. Restore all 7 to `dissertation/` and resume active maintenance**
  - Live and repo align; updates flow naturally
  - Each tool re-enters the maintenance budget — content updates, accessibility fixes, version-bump sweeps
- **B. Leave the 7 in `archived/` and accept they drift on production**
  - Lowest ongoing cost
  - Risk: someone "fixes" `archived/dissertation-tools/faq/data.js`, expects it to update production, and is confused when nothing happens
- **C. Remove the 7 from the production server too** *(recommended for some, not all)*
  - Match repo and live both to the 3 maintained tools
  - Loses functioning tools that visitors may already link to
  - Lowest mental-model surface area
- **D. Mixed: restore 2-3 high-value ones (faq, glossary, context), retire the rest**
  - Curated middle ground
  - Requires per-tool judgment call (which are pulling visitors, which are dead links)

**Recommendation:** D — restore the high-value subset and remove the rest from production. Suggests faq + glossary + context have the most user value (Q&A, vocabulary, historical framing) and the others (timeline, concepts, comparison, excerpts) duplicate content already in reader. Confirm with Joe's read of which tools Rosen and Jay want kept.

---

## 7. Wire or shelve the ports-and-adapters entity-loading stack

**Issue:** [#503](https://github.com/jamditis/rosen-frontend/issues/503) (spun from #487; refs [#130](https://github.com/jamditis/rosen-frontend/issues/130))
**Blocks:** closing the #130 entity-loader migration; the repo carrying two entity-loading stacks, one of them dead
**Why now:** PR #504 (#487) consolidated the cache config (`cacheConfig.js`) and the timeout-race helper (`frontend/utils/raceTimeout.js`) that both stacks share, so the drift hazard between them is already gone. What is left is a duplication of intent, and it only grows as more code lands on either path. Added 2026-07-08.

**The setup (verified against the code):** two entity-loading stacks coexist.

- **Production path (live).** `archiveService.fetchEntitiesData` plus the mutable module-global `buildEntityMaps` (the `entityById` / `entityToRecords` / `recordToEntities` Maps). Its two consumers are `EntityBrowser.js:41` and `RecordModal.js:98`. On a fetch or parse failure its `catch` returns `{ entities: [], recordEntityMap: {} }`, so a failure renders as an empty Archive with no error shown. That contradicts the repo's own contract elsewhere: `fetchAnalytics` and `fetchCoreData` (#290) throw on failure "rather than a misleading empty view."
- **Ports-and-adapters path (dead).** `services/loaders/entityDataLoader` (port) with `createHttpCachedLoader` (production adapter) and `createInMemoryLoader` (test adapter), composed by `createEntityIndex({ loader })` in `services/entityIndex.js`. Built as step 1 of #130 and test-covered (`tests/entity-index.test.js`, `tests/http-cached-loader.test.js`), but nothing outside its own tests imports it. The port rejects on a fetch or parse failure and does not resolve with empty arrays to mask that failure, with one gap the wiring must close: `toEntityDataPayload` (`httpCachedLoader.js:242`) defaults a non-array `entities` to `[]` and a missing `recordEntityMap` to `{}`, so a 200 that parses but has drifted from the expected shape still builds an empty index rather than rejecting. Schema validation on the parsed payload is the remaining fail-loud gap, which wiring option A should add.

The two stacks differ on one behavior that matters, which makes this more than hygiene: the live path masks a load failure as an empty Archive, and the port surfaces it.

**Options:**

- **A. Wire it** *(recommended)*
  - Compose `createEntityIndex({ loader: createHttpCachedLoader({ ... }) })` at the App composition root, migrate `EntityBrowser.js` and `RecordModal.js` onto the index, and delete archiveService's entity half (`buildEntityMaps`, the entity branch of `fetchEntitiesData`, the module-global entity Maps).
  - Closes the #130 migration and removes the silent-failure path in one move.
  - Behavior change: an entity-load failure surfaces as an error state instead of an empty browser, so the two consumers must render that error state (the #290 dashboard error state is the pattern to copy).
  - Blast radius is bounded but not trivial: two consumer files, each calling several entity accessors that read the module Maps (`getRecordsByEntity`, `getEntityById`, `getEntitiesByRecord`, `calculateEntityConnectionStrength`, `areEntitiesLoaded`), all of which move onto the index query API. The index itself is already tested.
- **B. Shelve it**
  - Delete `loaders/` and `entityIndex` and their tests. Removes the dead code and the "two ways to load entities" confusion.
  - Risk: it deletes the silent-failure fix along with the dead code. If chosen, first port the throw-on-failure guard into `fetchEntitiesData` so the empty-Archive-masks-failure behavior does not survive the cleanup.
- **C. Fix in place, then shelve**
  - Adopt the port's throw contract inside `archiveService.fetchEntitiesData` (throw instead of returning empty, consumers render an error state), keep the single production path, and delete `loaders/` and `entityIndex`.
  - The middle path: it keeps one stack and captures the one behavior worth keeping, at the cost of not closing the #130 ports-and-adapters migration.

**Recommendation:** A, with C as the launch-safe fallback. The silent-failure bug decides A and C over B: both surface a failed load, and only plain B would delete that fix along with the dead code. A over C is the narrower question of whether to close the #130 ports-and-adapters migration now: A closes it and keeps the tested port, C keeps a single `archiveService` path and defers the migration. Pick A while the blast radius is small and the port is already built and tested; fall back to C if launch stability outranks closing #130 this week. The one path to reject is plain B, which ships the empty-Archive-masks-failure behavior forward.

**If A, the steps:**
1. Compose the index at the App root: `createEntityIndex({ loader: createHttpCachedLoader({ ... }) })`, taking the adapter's option names from `httpCachedLoader.js`. `createEntityIndex` awaits `loader.loadEntityData()` on construction (`entityIndex.js:27`), so composing it eagerly here fetches `archive-entities.json` on every App load, a regression from today's on-demand fetch that runs only when `EntityBrowser` or `RecordModal` opens. Preserve on-demand loading: build the index behind a memoized promise created on first entity-view use, or compose only the loader at the root and construct the index where it is consumed.
2. Migrate `EntityBrowser.js` and `RecordModal.js` off `fetchEntitiesData` and off the module-Map accessors onto the index query API: `getRecordsByEntity` becomes `recordsOf`, `getEntityById` becomes `entity`, `getEntitiesByRecord` becomes `entitiesOf`, and `calculateEntityConnectionStrength` becomes `strength` (same `{ strength, sharedEntities, prominenceScore }` shape). `areEntitiesLoaded` drops out, since awaiting the index replaces the loaded check. Render an explicit error state when the load rejects (mirror the #290 error state). One accessor has no index equivalent yet: `EntityBrowser` renders its browse list, type counts, and filter from the full `data.entities` array (`EntityBrowser.js:41-43`), but the index Query exposes only point lookups plus `types()`, with no all-entities query. Add an `entities()`/`allEntities()` query to the index before migrating the browser, or keep passing it the loader payload for the list; otherwise the migration leaves `EntityBrowser` without the list it renders from.
3. Delete archiveService's entity half: `buildEntityMaps`, the entity branch of `fetchEntitiesData`, the module-global entity Maps, the five accessor exports above, and `findSharedEntities`, a sixth map-backed export (`archiveService.js:128`) whose only caller is the `calculateEntityConnectionStrength` this step removes; leaving it would strand an export that throws once its backing Maps are gone. Leave the details, search, and analytics paths alone.
4. Add a consumer-level test that a rejected entity load renders the error state, not an empty browser. The index itself is already covered by `tests/entity-index.test.js`.

---

## How to use this doc

When you're back at a desk:

1. Resolve decisions 1-2 first (they unblock the most downstream work).
2. Decisions 3-5 are independent — handle in any order.
3. Decision 6 needs a quick look at production analytics if available (which tools have any visitor traffic).
4. Decision 7 is self-contained: the block above has the verified code state, the options, and a recommendation, so no extra research is needed to make the call.
5. Once all seven are resolved, work through the critical path in [definition-of-done.md](./definition-of-done.md).

For each decision, the recommended option is the default if you don't want to think hard. The other options are there if the recommendation doesn't fit something only you know.
