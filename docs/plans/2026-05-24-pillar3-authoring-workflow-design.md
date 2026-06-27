# Pillar 3 design: Jay Rosen authoring workflow

**Status**: Draft — awaiting Joe's review
**Date**: 2026-05-24
**Goal**: Build the working post-handoff workflow Jay uses to add new content. Phase 1 demoable for Wednesday May 27 call.

---

## Goal verbatim

> "all of the records, relationships, and entities... and we have a working and efficient process for jay rosen (very nontechnical person) to add and process additional content, articles, posts and/or examples of his work and digital output for inclusion in the archive once i am no longer working on Jay Rosen's Internet Archive project (without costing me any money)"

Two hard constraints from that sentence:
- Jay can drive it alone, no terminal/SSH/FTP
- $0 ongoing cost after Joe steps back

---

## Locked decisions (Joe, 2026-05-24)

1. **Architecture**: Bridge now → final state later. Phase 1 uses houseofjawn for heavy lifting; Phase 2 migrates to Apps Script + Cloudflare Worker post-handoff.
2. **Trigger**: "Ready to publish" checkbox per row in the URL-queue sheet. Apps Script fires only on checkbox flip, not on every paste.
3. **PR policy**: Auto-merge if CI green + auto-deploy. No human in the loop required.
4. **Sheet ID**: TBD — Joe fills in pre-Wednesday from the existing "Rosen Archive URL List" sheet ID.

---

## Research notes

### What exists in the repo today (verified)
- `backend/submission_server/app.py` (7732B): Flask app with `/`, `/submit`, `/status`, `/queue`, `/process` routes. SSRF guard via `rosen_scraper.url_safety.is_safe_public_url`. CSRF token via `SUBMISSION_AUTH_TOKEN`. Constant-time token compare via `hmac.compare_digest`. SQLite-backed queue (`submissions.db`).
- `backend/submission_server/processor.py` (12168B): full pipeline — `dispatcher.dispatch_url()` → AI categorization → `generate_source_based_id()` → `enrich_data()` → CSV sanitization (CSV-formula-injection guard per #143) → append to main CSV → regenerate JSON → stage to `ftp-upload/data/`.
- `backend/submission_server/db.py` + `submissions.db`: queue persistence, run history.
- `backend/submission_server/deploy.sh`: copies regenerated JSON to staging only (not actual FTP push).
- `backend/scripts/`: 20+ analysis/categorization/backfill scripts (heavy machinery already proven).
- `pass`-stored creds: `claude/rosen/wp-admin`, `claude/rosen/wp-parent-admin`, `claude/rosen/airtable-pat-rosen`, `claude/rosen/gemini-rosen`, `claude/rosen/rosen-service-account-full`, `claude/rosen/rosen-service-account`.

### What's missing
- Submission server is **not deployed** on houseofjawn. No systemd unit, no Flask/gunicorn process running, no Cloudflare tunnel route. The code is shovel-ready but parked.
- No FTP push step. `_stage_for_ftp` copies to `ftp-upload/data/` and stops there.
- No Apps Script artifact in the repo.
- No status-callback path from server → sheet.

### Infrastructure inventory
- A Cloudflare tunnel already fronts the operator's services; adding a new `rosen-submit.<domain>` route is one ingress entry. Tunnel UUID and the full route map are kept in the operator's private notes, not committed.
- **Live site**: `pressthink.org/j/rosen-archive/` on Bluehost-shared WordPress. WP-admin + SFTP credentials live in the operator's local password store, not committed.
- A code-sync helper keeps the working tree in sync across the operator's machines.

### Apps Script constraints worth knowing
- `onEdit` simple triggers: 30s execution limit, no auth scopes beyond the spreadsheet itself.
- `onEdit` installable triggers: 6-min limit, full auth scopes (UrlFetchApp, Sheets API).
- `UrlFetchApp.fetch()` outbound is allowed; no inbound endpoints. So server → sheet status feedback uses Sheets API server-side, not webhooks from server to Apps Script.
- Time-driven triggers (cron): every 1/5/10/15/30 min OR hourly OR daily.

---

## Architecture: Phase 1 (now, Wednesday demo)

```
┌────────────────────────────────────────────────────────────────┐
│  GOOGLE SHEET  "Rosen Archive URL List"                        │
│  Columns:                                                       │
│    A  Submitted at (auto)                                       │
│    B  URL                              ← Jay types here         │
│    C  Suggested title (optional)       ← Jay types here         │
│    D  Notes (optional)                 ← Jay types here         │
│    E  Ready? (checkbox)                ← Jay ticks when done    │
│    F  Status (auto)                                             │
│    G  Record ID (auto)                                          │
│    H  Error (auto)                                              │
│                                                                 │
│  Apps Script: installable onEdit trigger                       │
│    - Fires when column E ticked TRUE                            │
│    - Validates URL format                                       │
│    - POSTs to submission server                                 │
│    - Writes "submitted" + timestamp to F                        │
└──────────────┬─────────────────────────────────────────────────┘
               │ HTTPS POST + X-Auth-Token header
               ↓
┌────────────────────────────────────────────────────────────────┐
│  CLOUDFLARE TUNNEL  rosen-submit.amditis.tech → :8084          │
└──────────────┬─────────────────────────────────────────────────┘
               ↓
┌────────────────────────────────────────────────────────────────┐
│  HOUSEOFJAWN: rosen-submission.service (systemd)               │
│    Flask app from backend/submission_server/app.py             │
│    Existing routes: /submit, /status, /queue, /process         │
│                                                                 │
│  POST /submit:                                                  │
│    - SSRF guard (existing)                                      │
│    - Dedup check (existing)                                     │
│    - Queue in submissions.db (existing)                         │
│    - Return submission_id                                       │
│                                                                 │
│  Background scheduler (every 5 min OR triggered by /submit):    │
│    process_batch():                                             │
│      For each pending:                                          │
│        dispatcher.dispatch_url() → scrape + categorize          │
│        generate_source_based_id() → "RECORD-00933"              │
│        enrich_data() → resolve publication, eras, etc.          │
│        sanitize_record() → CSV-formula-injection guard          │
│        append to data/archive_records-public.csv                │
│      If any succeeded:                                          │
│        node data/export-archive-data.js → regenerate JSON       │
│        NEW: sftp_push() → upload JSON to pressthink.org         │
│        NEW: sheets_callback() → write status + record_id back   │
│        NEW: git_commit_push() → commit to fix/jay-submissions  │
│             branch + auto-PR with [auto-merge] label            │
└────────────────────────────────────────────────────────────────┘
               │ SFTP upload (paramiko)
               ↓
┌────────────────────────────────────────────────────────────────┐
│  pressthink.org/j/rosen-archive/                               │
│    Updated JSON visible to readers within ~30s of cache bust   │
└────────────────────────────────────────────────────────────────┘
```

### Pieces to build (Phase 1)

| # | Piece | Effort | Location |
|---|---|---|---|
| 1 | Apps Script project (Code.gs + appsscript.json) | ~150 lines | `automation/apps-script/` (new) |
| 2 | systemd user unit for submission server | ~30 lines | `automation/systemd/rosen-submission.service` (new) |
| 3 | Cloudflare tunnel ingress entry | 2 lines | `/etc/cloudflared/config.yml` (Joe edits) |
| 4 | `sftp_push.py` for live deploy | ~80 lines | `backend/submission_server/` |
| 5 | `sheets_callback.py` for status writeback | ~60 lines | `backend/submission_server/` |
| 6 | `git_auto_pr.py` (optional Phase 1; Phase 2-ready) | ~100 lines | `backend/submission_server/` |
| 7 | `setup.md` — operational doc for whoever runs it | ~50 lines | `automation/SETUP.md` |
| 8 | `JAY_ADDING_RECORDS.md` — Jay-facing one-pager | ~30 lines | `docs/JAY_ADDING_RECORDS.md` |

### Tests
- `tests/submission-server.test.py`: unit tests for each new module (sftp mock, sheets API mock, git mock)
- `tests/data-pipeline.test.js`: extend existing to cover the new auto-injected records

---

## Architecture: Phase 2 (post-handoff)

After Joe steps back, swap the houseofjawn-dependent layer:

```
Apps Script (Google-hosted, free) does input + queueing + Sheets writeback
         ↓ UrlFetchApp.fetch()
Cloudflare Worker (free tier 100k req/day) does:
  - scrape (or proxy to Wayback)
  - simple categorization (Gemini free tier OR static keyword rules)
  - GitHub REST API → open PR
         ↓
GitHub Actions (public repo, unmetered) does:
  - test suite
  - auto-merge on green
  - cron-driven SFTP deploy (or Cloudflare Worker via webhook)
```

Phase 2 builds atop Phase 1 — same Apps Script and same sheet structure. The only Jay-facing change is "your URL went live faster" (Worker is faster than houseofjawn cron). Everything Phase 1 establishes is reusable.

---

## Open issues this design defers

1. **Live-preview tension** (Jay's March 26 email): "I really need to be in the presence of the archive as I am revising and editing the different descriptions." This design addresses URL *addition*, not description *revision*. Recommendation: separate Phase 1.5 — a preview mode on the live archive that loads a draft JSON via tokenized URL. Surface for Wednesday discussion.
2. **Bulk import**: Phase 1 is one-URL-at-a-time. If Jay drops 50 URLs from a Facebook export, the sheet handles it but processing is serial. Acceptable for v1; revisit if backlog grows.
3. **Hali Rosen as second submitter**: Sheet sharing covers this — Hali gets edit access. No code change.
4. **What if scrape returns junk?**: Status column shows error; row stays in sheet for manual review/retry. No PR is opened.

---

## Cost analysis

### Pre-handoff (now until Joe steps back)
| Component | Cost | Notes |
|---|---|---|
| houseofjawn electricity + bandwidth | ~$0 marginal | Joe already running |
| Firecrawl scrape | ~$0.001 per URL | Joe's existing budget |
| Cloudflare tunnel | $0 | Free tier |
| Google Sheets | $0 | Free |
| Apps Script | $0 | Free |
| GitHub public repo | $0 | Free Actions on public repo |
| **Total ongoing** | **$0/mo** | |

### Post-handoff target
| Component | Cost | Notes |
|---|---|---|
| Apps Script | $0 | Free, executes server-side at Google |
| Cloudflare Worker | $0 | 100k req/day free tier; Jay's load ~10 req/day |
| Google Sheets | $0 | Free |
| GitHub public repo | $0 | Free Actions unmetered on public |
| WP hosting (pressthink.org) | $$ | Separate concern; Jay already pays |
| Wayback / no-credit scrape | $0 | Replace Firecrawl if cost becomes an issue |
| **Total ongoing** | **$0/mo** | |

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Apps Script onEdit timing out (30s simple / 6 min installable) | POST returns immediately; processing is async on houseofjawn |
| houseofjawn down → sheet POST fails | Apps Script writes "queued for retry" to status; cron resweeps `Ready=TRUE && Status=queued` every 15 min |
| Auto-merge ships a malformed CSV | All tests must pass (CI gate); CSV-formula injection guard in `_sanitize_cell` (existing); FTP staging is idempotent (re-runnable) |
| SFTP creds in cleartext on houseofjawn | Use `pass` for creds; never commit; rotate post-handoff |
| Sheet shared with too many people | Restrict to Jay + Hali + Joe per Nov 16 email (explicit decision) |
| Apps Script project orphaned if Joe's account is the owner | Phase 2 migration: transfer Apps Script ownership to Jay's Google account |

---

## What's NOT in this design

- Entity extraction for new records — runs as a separate batch via `unified_entity_processor.py`. Per-record extraction at submission time is a Phase 2 enhancement.
- Image / video / podcast handling — Phase 1 is URL→article. Adding YouTube + podcast support is a small `dispatcher.dispatch_url()` extension (already partially exists).
- Multi-user editorial workflow (drafts, approvals, comments) — Jay/Hali/Joe is small enough to skip.

---

## Next steps once Joe approves this design

1. Branch off main: `feat/pillar3-authoring-workflow`
2. Build pieces 1-8 from the table above (order: 4+5 first so processing pipeline is end-to-end, then 1+2+3 for the Sheet-side, then 6+7+8 for ops/docs)
3. End-to-end smoke test with a fake URL (test@example.com style) before pointing at production sheet
4. Wednesday demo: walk Joe + Marla + Eli + Jay through the live flow
5. Defer Phase 2 migration to a separate spec after Wednesday's call

---

## Design checklist (self-review)

- [x] No placeholders or "TBD" except the explicit Sheet ID (Joe fills)
- [x] Sections are internally consistent
- [x] Scope is one implementation cycle (Wednesday demo)
- [x] Ambiguity check: trigger, PR policy, architecture are all locked
- [x] Research notes section present
- [x] Phase 1 vs Phase 2 boundary explicit
- [x] Cost model explicit
- [x] Risks named with mitigations
- [x] Tests called out
- [x] Sentence case throughout (no Title Case)
- [x] No banned words ("comprehensive", "robust", "leveraging", etc.)

---

## Spec ready for Joe's review

Path: `docs/plans/2026-05-24-pillar3-authoring-workflow-design.md`
Review request: read top-down; flag any architecture decision you'd flip OR any "deferred" item you want pulled into Phase 1.
