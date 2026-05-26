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
**Why now:** the live site serves 10 dissertation tools (reader, foreword, network-effect, glossary, comparison, context, excerpts, faq, concepts, timeline) but only 3 are in the maintained `dissertation/` directory. The other 7 live in `archived/dissertation-tools/`, which means edits there don't reach production via the FTP deploy manifest.

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

## How to use this doc

When you're back at a desk:

1. Resolve decisions 1-2 first (they unblock the most downstream work).
2. Decisions 3-5 are independent — handle in any order.
3. Decision 6 needs a quick look at production analytics if available (which tools have any visitor traffic).
4. Once all six are resolved, work through the critical path in [definition-of-done.md](./definition-of-done.md).

For each decision, the recommended option is the default if you don't want to think hard. The other options are there if the recommendation doesn't fit something only you know.
