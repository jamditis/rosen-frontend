# Jay Rosen handoff goal — progress and decisions

Living document tracking the multi-session goal of making the archive self-sustaining for Jay Rosen after Joe stops curating. Updated by autonomous work sessions; survives context compaction because it is committed to the repo.

**Goal verbatim:** "all of the records, relationships, and entities in the jamditis/rosen-frontend repo are verified, validated, correct, and integrated into the archive and we have done additional comprehensive sweeps/scrapes/research (with firecrawl or any other tools we have) to make sure all of Jay Rosen's digital content and output are included in the archive and we have a working and efficient process for jay rosen (very nontechnical person) to add and process additional content, articles, posts and/or examples of his work and digital output for inclusion in the archive once i am no longer working on the Jay Rosen Internet Archive project (without costing me any money)"

## Four pillars

1. **Verify** every record / relationship / entity already in the archive.
2. **Sweep** the open web for any Jay Rosen content not yet in the archive.
3. **Build** a nontechnical authoring workflow Jay can drive solo.
4. **Hand off** the operating manual so it survives Joe stepping away.

## Hard constraints (from Joe, 2026-05-24)

- Auto-deploy must NOT consume Joe's GitHub Actions budget.
- Auto-deploy must NOT run on Joe's machines or network.
- Weekly cadence is acceptable — does not need to be per-commit.
- Storage architecture is open (SQLite welcome, not required).
- All decisions get documented here; all problems get filed as GitHub issues so they survive context compaction.
- **Joe is the ultimate decision maker for the archive.** Jay is the eventual end user the handoff serves; design choices and deploy mechanisms are Joe's call, not Jay's preference vote.

## Operating model (post-handoff target)

- Jay Rosen owns the WordPress account at pressthink.org.
- Joe has admin access via shared logins (stored in Joe's `pass` at `claude/rosen/wp-admin` and `claude/rosen/wp-parent-admin`); these are interim and should be rotated after handoff.
- Long-term deploy automation uses a dedicated credential (WP application password or host SFTP) that does NOT belong to Joe personally.
- Source code lives at github.com/jamditis/rosen-frontend (public; unmetered Actions; Joe-owned but transferable).
- **Successor maintainer: Rafi Rosen (Jay's son).** Per March 1, 2026 Joe-Rafi meeting in Fathom (folder `1QSsudlskRi8VlybTyBu_Z8E5xL53U1xK`, file `91252984-Impromptu Zoom Meeting-2026-03-01`). Rafi handles the technical pipeline. Jay handles editorial input. Joe committed to remaining available for support post-handoff.
- **Project goals as Joe stated them to Rafi:** (1) collect all of Jay's online work accessible via URL, (2) easy access, (3) protect against link rot, (4) highlight key works, (5) serve as a model for other scholars' digital legacies.
- **Stated architectural rationale:** zero-build, zero recurring cost. Any handoff design that introduces recurring cost violates the original premise.

## Baseline (2026-05-24, main @ 40d8188)

- 331/331 tests pass
- 931 archive records (701 RECORD, 137 TUMBLR, 83 CLIP, 10 THREAD); 0 duplicate IDs, 0 bad dates
- 29,130 social posts (26,114 Twitter + 3,016 Bluesky)
- 5,036 entities, 4,666 relationships; **referential integrity perfect** (0 orphan refs, 0 self-refs, 0 dangling record refs)
- 16 records still verified=false with no URL — matches recovered content on stale branch `claude/gap-fill-early-2000s` (issue #199)
- 96 records carry stale era values predating 2025-12 taxonomy (issue #197)
- 9 issues filed this session: #196-#204

## Open issues opened by this goal

| # | Pillar | Type | Status |
|---|---|---|---|
| #196 | 1 | SCHEMA.md relationship-types list out of date (4 listed, 15 in use) | open |
| #197 | 1 | Era taxonomy drift — 96 records on stale eras | open |
| #198 | 1 | README/CLAUDE.md/data-README cite stale entity/relationship counts | open |
| #199 | 1+2 | 16 records verified=false with no URL — harvest from gap-fill branch | open |
| #200 | 3a | Design free weekly auto-deploy to pressthink.org | open |
| #201 | 3 | Storage architecture proposal (CSV+SQLite+JSON+Sheets) | open |
| #202 | 3 | Rewrite ADDING-RECORDS.md for nontechnical curator | open |
| #203 | 4 | Audit stale branches | open |
| #204 | 4 | Write HANDOFF.md | open |

## Decisions made this session

### D1 — Storage architecture (recommendation, awaiting Joe's approval)

Four-layer composition, no big-bang rewrite:

| Layer | Format | Role | Lives in |
|---|---|---|---|
| Authoring | Google Sheet | Where Jay edits | Jay's Google account |
| Source of truth | CSV | Diffable, PR-reviewable | git repo (unchanged) |
| Validation gate | SQLite | FK + CHECK constraints; reject bad data at write time | regenerated in pipeline |
| Runtime artifact | JSON (already split) | What the static site loads | git + WP hosting (unchanged) |

Filed as #201. The validator step is additive and reversible. Sheets only as authoring (not runtime — the project tried Sheets-at-runtime and abandoned it for latency).

### D2 — Auto-deploy (recommendation, awaiting Joe's approval)

Primary user flow: **Option C — a "Publish" button Jay clicks**. Backup: weekly cron via Option A (GitHub Actions on the public repo, unmetered). Filed as #200.

### D3 — PR #176's 370-row drop (RESOLVED, not a regression)

Confirmed via commit message: 73 source records had been removed; PR #176 pruned the resulting orphans (370 relationships + 172 entity first-mention refs). This was correct cleanup. Documented for posterity in #198 (counts in docs need refresh).

### D4 — Persistence approach for this work

- All findings filed as GitHub issues (survive compaction).
- Working notes consolidated in this doc, also in the repo (survives compaction).
- Telegram updates to Joe on milestone changes.
- Never `gh pr merge` without Joe's explicit go-ahead per global CLAUDE.md.

## Questions for Wednesday call with Rosen

Maintained as a separate doc: `docs/QUESTIONS_FOR_ROSEN_CALL.md`. Joe leads the call; this is the cheat sheet. Background prep also includes mining the prior Fathom transcripts of Joe-Rosen meetings — that work runs in parallel and lands in the questions doc when complete.

## Decisions still needed from Joe

- [ ] Pick auto-deploy mechanism (#200)
- [ ] Approve adding SQLite validator step (#201)
- [ ] Approve Google Sheets as Jay's authoring surface (#201)
- [ ] Identify who owns/pays WordPress hosting and Cloudflare account (#204)
- [ ] Identify who Jay should escalate to if Joe is unreachable (#204)
- [ ] Decide whether to transfer the repo to Jay's account or add Jay as collaborator (#204)
- [ ] Approve mechanical era-migration PR (#197) — autonomous-safe but worth a sanity check

## Work plan for the autonomous session

Doing in this order; each is a separate PR for Copilot review per global CLAUDE.md PR workflow.

1. **Mechanical-safe fix PR:** SCHEMA.md update (#196), era migration (#197), stale doc-counts refresh (#198). All deterministic, no judgment calls.
2. **Stale-branch harvest PR(s):** SEO scaffolding from `claude/gap-fill-early-2000s` as one focused PR. Data recoveries as a follow-up PR after URL re-verification.
3. **Content sweep:** firecrawl + WebSearch pass for any Jay Rosen content not in the archive; produce a candidate list in `data/CANDIDATE_ADDITIONS_<date>.json` with provenance; do NOT merge into the canonical CSV without curator review.
4. **Design docs:** Detailed write-ups for the storage architecture (#201), auto-deploy (#200), and HANDOFF.md (#204). These are design docs, not implementation — implementation waits on Joe's approval of D1/D2.

## Canonical sheet diff (2026-05-24)

The original sheet (`1Q_Fik5KQXdkZ4dujEN8H_47K5oldLkv6-hxERuBAdpg`) has 20 tabs. The `archive_records` tab (gid=928818664) is the curator's source-of-truth for records. Diff against repo `data/archive_records-public.csv`:

| Bucket | Count | Action |
|---|---|---|
| Sheet records (RECORD-*) | 659 | source of truth |
| Repo records (RECORD-* + TUMBLR + CLIP + THREAD) | 931 | superset (TUMBLR/CLIP/THREAD added post-sheet) |
| Sheet IDs not in repo | 93 | investigate |
| → URL also in repo under different ID | 25 | already handled (dedup re-ID) |
| → URL truly not in repo | 68 | investigate further |
| → → `_p.html` print versions of records in repo | 62 | correctly removed by `dedup_records.py` |
| → → `_p.html` print-orphans (regular .html ALSO missing) | 3 | recover via Wayback |
| → → Real content gaps | 5 | add or URL-backfill |

**Real content gaps (5 records, all PressThink/LA Times 2007-2009):**

1. LA Times op-ed "The journalism that bloggers actually do" (2007-08-22) — net new record to add
2. URL backfill for repo RECORD-00699 "Audience Atomization Overcome" — sheet has the URL
3. URL backfill for repo RECORD-00700 "He Said, She Said Journalism" — sheet has the URL
4-5. Curly-quote/straight-quote duplicate entries in the sheet itself (same content)

**Print-orphan recovery (3 records, all PressThink 2003-2005):**

- RECORD-00310 Introduction: Ghost (2003-09-01)
- RECORD-00521 Big Wigs From the Blogging & Journalism Conference (2005-01-26)
- RECORD-00570 Blog Storm Troopers or Pack Journalism at its Best (2005-02-10)

Both pursuits captured in task #13. Entities/relationships gap (sheet has 7,153/8,341 vs repo 5,036/4,666) is largely explained by the removed records but needs a second-pass diff to confirm.

## Original input-queue sheet (discovered 2026-05-24 from Joe)

`https://docs.google.com/spreadsheets/d/1Q_Fik5KQXdkZ4dujEN8H_47K5oldLkv6-hxERuBAdpg/edit?gid=0#gid=0` — the original ingestion queue. Publicly accessible CSV export.

Columns: `id`, `url`, `processed_on`, `Notes`.

Workflow it implemented:
1. Curator pastes a URL into a new row
2. Backend scraper reads new rows, processes each URL, writes status back into `Notes` (SUCCESS / FAILED with reason)
3. Successfully scraped records get added to the main archive CSV with an assigned ID (e.g., PRESSTH-00001)

**This IS the Jay input surface.** Way simpler than the Sheet-of-records design I was sketching:
- Jay pastes URLs (zero schema knowledge required)
- Rafi runs the backend pipeline (already documented in `docs/ENTITY_EXTRACTION_PIPELINE.md`)
- Pipeline handles ID assignment, AI categorization, entity extraction, JSON regen, deploy

Reactivating this requires: (a) confirming the sheet is shared with Jay edit access, (b) updating the backend `unified_entity_processor.py` to read from the live sheet again, (c) writing the simple "Add URL to this sheet" one-pager for Jay.

This is the right next step after the Wednesday Jay call confirms.

## Session log

### 2026-05-24 — Session started

- Pulled origin/main, repo at 40d8188, clean
- Ran test suite: 331/331 pass
- Read all docs (CLAUDE.md, README, ADDING-RECORDS, CONTEXT, AGENTS, data/SCHEMA, data/AUDIT_REPORT, data/ENTITY_AUDIT_REPORT, data/verification-log, docs/ENTITY_EXTRACTION_PIPELINE, DEPLOYMENT, data/README, changelog)
- Inventoried data; integrity is perfect for FKs but era taxonomy and doc counts have drifted
- Filed #196-#204
- Acknowledged Joe's deploy constraints and storage flexibility
- Stored credentials in `pass` (claude/rosen/wp-admin and claude/rosen/wp-parent-admin)
- Dispatched background agent to mine Fathom transcripts → discovered no direct Joe-Jay meetings, but a March 1 Joe-Rafi handoff transcript that changes the entire framing (Rafi is the technical successor; Jay is editorial input only)
- Joe shared the original URL-queue sheet ID; verified it's still accessible as a public CSV export
- Started the era code fix; discovered the scope is 8 files and would silently break the QueryBuilder if shipped unilaterally — reverted and updated #197 with full scope
- Branch `fix/safe-data-quality-sweeps-2026-05-24` holds the docs (no committed code changes); nothing risky pending
- **Natural compact point reached:** all findings are persisted in GitHub issues (#196-#204), this progress doc, and the questions doc. Next mechanical fixes (SCHEMA relationship types, doc count refresh) are safe to continue with after compact. The bigger decisions (era taxonomy fix Option 1 vs Option 2, deploy mechanism, reactivating the URL queue) need Joe's input.
