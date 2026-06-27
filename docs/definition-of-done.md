# Definition of done

A subsystem-by-subsystem grading of Jay Rosen's Internet Archive against four marks — **Complete**, **Partial**, **Stub**, **Missing** — and a named critical path to v4.0.

**Snapshot:** 2026-05-25, post-merge of PR #258. Main at `40ea683`. Source: four read-only scans (architecture, live-site, security, backlog) plus empirical follow-ups on three findings that needed verification.

This doc is the input for the next desk session. Read it, decide the open architectural calls (see [decisions-pending.md](./decisions-pending.md)), then execute the critical path.

---

## Subsystem grades

### 1. Frontend SPA — Complete

All six hash-based routes are wired and render: Archive (`/`), Folders (`#folders`), Entities (`#entities`), Dissertation (`#dissertation`), About (`#about`), Analytics (`#analytics`). Services are wired (`archiveService.js` for data loading + entity maps, `router.js` for hash routing, `sqliteService.js` for in-browser SQL). QueryBuilder (`frontend/components/QueryBuilder.js:638`) actually exports and runs 10+ query templates — issue #135's "dead-end" framing is about result composability with the main filter state, not "doesn't work." No TODO/FIXME markers in component files.

**Open hygiene work (not blocking):** #133 (unify URL routing + filter state), #134 (consolidate record-modal flow), #135 (QueryBuilder composability), #130 (Entity Index caller migration). All are internal architecture polish.

---

### 2. Dissertation tools — Partial (live coverage doesn't match repo structure)

**What's actually live at `pressthink.org/j/rosen-archive/dissertation/`:** reader, foreword, network-effect, glossary, comparison, context, excerpts, faq, concepts, timeline — verified by HTTP fetch on 2026-05-25.

**What's in the repo's `dissertation/` directory (actively maintained):** reader, foreword, network-effect, faq (4 of 10; faq restored in #411).

**What's in the repo's `archived/dissertation-tools/`:** comparison, concepts, context, excerpts, glossary, timeline + a source bundle (6 retired tools + 1 source bundle).

**The mismatch:** the six "retired" tools were uploaded to WordPress once (when they were active) and are still served because nothing has overwritten them. They function in browsers — `context/script.js`, for example, populates JS-empty divs at runtime — but they live in `archived/` in the repo, which means the deploy manifest (`DEPLOYMENT.md`) doesn't include them. Any edit in `archived/` won't reach production via the current FTP workflow. (`faq` is the exception: it was restored to `dissertation/faq/` in #411, so it is live and on the deploy manifest, not archived.)

**False positives from the live-site scan agent:** WebFetch reported `/dissertation/context/` as "empty outline" and `/faq/` as "blank default view." Both are JS-populated SPAs and work fine in a real browser. The agent couldn't run JavaScript. Issue #260 has been updated to reflect this.

**Foreword "February 2026" line** (`dissertation/foreword/index.html:533`): this is primary-source text from Rosen's December 2025 foreword. CLAUDE.md rule 3 forbids editing. Leave alone or add an editorial footnote noting the writing date.

**Gap-closing action:** decide the "retired tools" question (4 options, in [decisions-pending.md](./decisions-pending.md)): restore all to `dissertation/`, leave them archived and accept drift, remove them from production, or restore a high-value subset and retire the rest.

---

### 3. Backend pipeline — Complete

Walked `backend/src/` and `backend/scripts/`. Ten core modules wired: `workflow.py` (orchestrator), `dispatcher.py` (content router), `scraper.py` (URL Context → requests → Playwright cascade), `categorizer.py` (Gemini), `csv_data_service.py`, the entity layer (`entity_extractor.py`, `deduplicator.py`, `registry.py`), and the AI augmentation layer (`key_concepts_updater.py`, `entity_extraction_batch_processor.py`, `relationship_augmentation.py`). Smart data corrector under `scripts/diagnostics/smart_corrector/` has quality validators and cost tracking. 30+ maintenance/analysis scripts present. Poetry-managed.

**Open hygiene work (not blocking):** #187 (consolidate 5 corrector scripts), #188 (reconcile 4 entity-extraction entry points), #189 (consolidate backfill scripts), #190 (archive one-off `fix_*`/`merge_*` scripts), #132 (deepen the whole family). All are maintainability work — code runs today.

---

### 4. Submission server (Pillar 3a) — Partial (architecturally migrated, blocked on credentials)

Two paths exist simultaneously:

**Legacy:** Flask app at `backend/submission_server/` (`app.py`, `processor.py`, `db.py`, templates). Functional. Has SSRF guard, constant-time bearer-token auth, CSV formula escaping, parameterized SQL. Per closed issue #136. Now deprecated.

**Current:** GitHub Actions workflow at `.github/workflows/submit-record.yml` (deployed 2026-05-25) calls `backend/scripts/process_submission.py` directly. 12-step pipeline: scrape, categorize, dedupe, CSV append, regen JSONs, test, git push, SFTP upload, sheet writeback. Design doc: `docs/plans/2026-05-24-pillar3a-free-auto-deploy-design.md`. Per PRs #223, #225.

**Blocker:** issue #226 — the `rosen-archive-bot` GitHub App + 11 repo secrets are not configured. Until they are, the workflow exists but can't run end-to-end. Joe's call (and credentials) needed.

**Security debt before public exposure:** no rate limiting on submission endpoints (filed as #262, follow-up to closed #136). Flask-Limiter + Flask-WTF CSRF were in the original #136 recommendation but never shipped.

**Gap-closing action:**
1. Joe creates the GitHub App + adds the 11 secrets (#226).
2. Add Flask-Limiter to the legacy server before any public exposure (#262), OR confirm the legacy server is truly retired and the new workflow handles rate limiting at the GitHub Actions layer.
3. Smoke test: scrape-fail path, dedup short-circuit, full success.

---

### 5. Authoring surface (Pillar 3b) — Missing

Design doc only: `docs/plans/2026-05-24-pillar3-authoring-workflow-design.md`. Zero implementation. Today's authoring paths are Google Sheets (Jay's edits) and the submission workflow (Joe's URLs). Per session notes, "not scoped."

**Open question for Joe (in decisions-pending.md):** is a non-technical Jay-facing UI for editing record descriptions/notes in scope post-handoff, or is the Sheet sufficient long-term?

---

### 6. Tests — Complete (recently realigned)

17 test files, ~4,048 lines. Frontend/data layer (8 core files: `csv-quality`, `data-integrity`, `data-pipeline`, `frontend-structure`, `process-record`, `thread-algorithm`, `thread-detection`, `version-consistency`) plus newer additions (`entity-index`, `http-cached-loader`, `fetch-error-handling`, `linkify`, `schema-no-bom`, `service-worker-cache`, `view-state`). Backend pytest realigned via PRs #249/#251/#252 after the May `src/` refactor; #250 gated credentialed + Selenium tests so CI skips cleanly.

**Coverage caveats:**
- `tests/version-consistency.test.js` enforces `index.html` + `frontend/**.js` ONLY. Dissertation pages, `archived/`, and `features/` subpages are NOT enforced on version bumps. Sweep them by hand. Tracked in the v3.3.0 session-state memory.
- The submission server queue + batch logic has no test coverage per open issue #175.

**Gap-closing action:** add a test wrapper around `submission_server/db.py` queue operations (#175). Low priority — code is small and was just audited by the security pass.

---

### 7. CI workflows — Complete

`.github/workflows/` has frontend-validation (HTML/JS syntax + CDN checks + TODO/FIXME scan), backend-tests (pytest), backend-linting (ruff + black + mypy), claude-code-review, claude.yml, post-merge.yml, submit-record.yml (Pillar 3a end-to-end), sweep-stuck-rows.yml (queue maintenance), CodeQL. Frontend Validation was re-enabled by the May 21 era (PR #147); issue #186 closed once it ran green.

**One repo-hygiene call (low-priority):**
- #154: `post-merge.yml` no longer ships a placeholder URL — the whole job is now gated on the `DASHBOARD_WEBHOOK_URL` repository variable, so it spends no Actions minutes until that variable is set. #154 stays open only to track wiring the real sync endpoint.

---

### 8. Security posture — Partial (one real fix needed before public submissions)

**Secure today:**
- `.env`, `.env.local`, `backend/.env*`, `google_credentials.json`, `*.key`, `*.pem`, `secrets.json` all covered by `.gitignore` (verified empirically — `*.local` at line 15 matches `.env.local`; the security audit's claim that dotfile globbing excluded it was wrong).
- CDN imports version-pinned (`react@18.2.0`, `htm@3.1.1`, etc.) — SRI not available in import maps; accepted limitation.
- Backend SQL: all parameterized. Subprocess calls: list-form (no shell-string injection). No dynamic-code execution patterns found.
- Submission server: SSRF guard (`url_safety.py`), constant-time auth, CSV formula escaping, scheme-restricted URL validation.

**Real fixes needed (one PR titled `security: harden .htaccess headers`):**
- Add Content-Security-Policy header. Suggested policy in [issue #261](https://github.com/jamditis/rosen-frontend/issues/261). Diff is staged in `.htaccess` (working tree, uncommitted).
- Add X-Frame-Options, Referrer-Policy, Permissions-Policy.
- Verify HSTS at Cloudflare/host layer before adding at .htaccess (avoid duplicate header).

**Security debt to track:**
- #262: rate limiting missing on submission server (Flask-Limiter). Ship before public flip.
- #167: GitHub Actions pinned to floating tags (`@v1`, `@v4`), not commit SHAs. Elevated risk given `submit-record.yml` has write access. Defer until Pillar 3a closes; address as part of the handoff.

---

### 9. Data integrity — Partial (gap-fill is the long pole)

**Current baselines** (verified by `data/export-archive-data.js` regen on 2026-05-25):
- 1,030 records (800 RECORD + 137 TUMBLR + 83 CLIP + 10 THREAD), max RECORD id 00901
- 29,696 social posts, max BSKY-03121
- 5,036 entities, 4,666 relationships
- 4 JSON artifacts (core 10.8MB, details 11.6MB, entities 1.0MB, fallback 25.9MB) all dated 2026-05-25

**Known gaps:**
- #208: 146 PressThink posts missing (modern-URL crawl needed)
- #209: 84 HuffPost posts missing (Wayback CDX)
- #242: 9 verified=false records pending Wayback recovery (6 HuffPost + 2 CJR + 1 Prospect)
- #207/#211: 204 records have zero extracted relationships — root cause is empty `raw_text` field; rerun extraction after gap-fill lands raw_text for them
- #199: 16 records with no recoverable URL — finalize "unrecoverable" list vs harvest from gap-fill branches
- #210: 10 title-duplicate groups + URL canonicalization policy needed (decisions-pending.md item 1)
- #197: 96 records on stale-era values not in canonical 8

**Records intentionally permanently unrecoverable** (per CLAUDE.md):
- RECORD-00663: The Baffler issue 12, March 1999 — print-only, Baffler's web archive only goes to ~2010
- RECORD-00667: Pew Center for Civic Journalism, ~2000 — defunct in 2003, no entries in surviving indexes

**Gap-closing action:** the gap-fill cluster is the largest "complete" delta. Order: HuffPost (highest yield) → PressThink → Wayback recoveries → re-extract relationships once raw_text lands → resolve dupes → finalize unrecoverable list.

---

## Critical path to v4.0

In execution order. Joe owns step 1; everything else flows from his decisions.

1. **Joe resolves six architectural decisions.** See [decisions-pending.md](./decisions-pending.md). URL canonicalization, Pillar 3a deploy mechanism, Pillar 3b scope, social-platform backfill priority, SQLite-validator timing, and dissertation tools restoration. AskUserQuestion-ready, single sitting.

2. **Pillar 3a credentials + smoke test.** Issue #226. Joe creates the GitHub App, adds the 11 secrets, runs three smoke tests (scrape-fail, dedup, full success). ~30 min after approval.

3. **Security hardening PR.** Issue #261 (corrected scope: .htaccess only — the gitignore item is moot). One PR, mechanical. Diff already staged in working tree.

4. **Data gap-fill burndown.** Issues #208, #209, #242, #207. Order: HuffPost → PressThink → Wayback → re-extract. ~4 hours of execution + review.

5. **Resolve data quality issues per Joe's URL policy.** Issue #210 (merge or mark dupes after canonical policy lands), #197 (era taxonomy realignment), #199 (finalize unrecoverable list).

6. **Submission server rate limiting.** Issue #262. Ship before any public exposure of the submission endpoint.

7. **JAY_ADDING_RECORDS.md screenshot.** Issue #241. Joe captures annotated screenshot of the queue Sheet.

8. **HANDOFF.md finalization.** Issue #204. Document all Pillar 3a decisions, Rafi/Hali contacts, failure modes, escalation paths.

9. **Handoff ceremony.** Transfer repo ownership or set up Jay/Hali write access. Recreate GitHub App + Apps Script under their accounts. Rotate SFTP creds off Joe.

---

## Nice-to-have / future

Defer until v4.0 ships. None block "complete."

- Repo hygiene cluster: #166 (prune archived/), #167 (Action SHA pinning), #168 (stale branches), #169 (emoji filename), #259 (impossible-press.md relocation). Batch into one PR.
- Backend script consolidation: #187–#190, #132. Maintainability only.
- Frontend internal architecture: #130, #133, #134, #135.
- SSR/OG for record deep links: #263. Better social-share unfurls. Defer until Pillar 3a + gap-fill land.
- SQLite validator implementation: #201. Approved-as-future, design complete, ship after Pillar 3a stabilizes.
- Dissertation reader build pipeline: #229 marked "keep disabled, leave files in place" per Joe's 2026-05-25 call.

---

## Inferred definition of done (v4.0)

The Archive is "shipped" when all seven hold:

1. **Pillar 1 (existing records) verified.** All 1,030 current Archive records (800 RECORD, 137 TUMBLR, 83 CLIP, 10 THREAD) have verified URLs or documented unrecoverable status. Zero orphaned records. Relationships + entities pass FK integrity.
2. **Pillar 2 (gap-fill) >95% coverage of accessible Rosen content.** HuffPost 84/84, PressThink 146/146, Wayback recoveries done, 204 zero-relationship records re-extracted. Bluesky + Twitter current; Mastodon + Threads per Joe's decision.
3. **Pillar 3a live and tested.** GitHub App installed, 11 secrets in place, smoke tests pass, Jay's first new record propagates Sheet → live in 2–5 minutes. Rate limiting in place.
4. **Security baseline.** .htaccess hardened (CSP + 4 standard headers). Actions pinned to SHAs. SFTP creds off Joe's personal accounts. No leaked secrets in git history.
5. **Data integrity.** Zero duplicate record IDs after #210 resolution. All eras in canonical 8. SCHEMA.md matches actual field set.
6. **Public-facing.** Live at pressthink.org/j/rosen-archive/, cached and performant. JAY_ADDING_RECORDS.md screenshot-illustrated. About page reflects final scope.
7. **Handoff complete.** Jay/Hali own the repo (or have full write access). Rafi has technical point-of-contact docs. Joe is available for major-incident calls only. No irreversible dependencies on Joe's accounts.

---

## Empirical corrections to earlier reports

Three findings from the 2026-05-25 scan turned out to be wrong on verification — recorded here so the next session doesn't re-investigate:

1. **`.env.local` IS gitignored.** Verified: `git check-ignore -v .env.local` returns `.gitignore:15:*.local`. Git's gitignore globbing treats `*` as matching dotfiles (unlike shell glob). The security audit's claim was wrong.
2. **/dissertation/context/ and /faq/ are NOT broken.** Both are JS-populated SPAs whose HTML contains `<!-- Populated by JavaScript -->` placeholder divs. WebFetch can't run JavaScript and reported the placeholder state. The pages work in any real browser. Confirm via Playwright if needed.
3. **/dissertation/foreword/ "February 2026" line is primary source.** Rosen's foreword was written December 2025; "plan to release in February, 2026" is his statement from that perspective. CLAUDE.md rule 3 forbids editing primary-source text. Add an editorial footnote if context is needed; do not rewrite.

Issues #260 and #261 have been updated to reflect these corrections.
