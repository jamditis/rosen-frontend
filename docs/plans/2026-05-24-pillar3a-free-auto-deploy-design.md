# Pillar 3a design: free auto-deploy from repo to live archive

**Status**: Draft — awaiting Joe's review
**Date**: 2026-05-24
**Goal**: Replace the houseofjawn-hosted Pillar 3 Flask server with a self-hosting flow that survives Joe stepping back from the project. Sibling spec: `2026-05-24-pillar3-authoring-workflow-design.md`.

---

## Goal verbatim

> "all of the records, relationships, and entities... and we have a working and efficient process for jay rosen (very nontechnical person) to add and process additional content, articles, posts and/or examples of his work and digital output for inclusion in the archive once i am no longer working on the Jay Rosen Internet Archive project (without costing me any money)"

Two hard constraints (same as Pillar 3, but stricter post-handoff):
- Jay can drive it alone, no terminal/SSH/FTP, no rotation reminders, no maintenance windows.
- $0 ongoing cost after Joe steps back, AND no dependency on Joe's personal accounts (Cloudflare, Gmail, GCP project, GitHub PAT) remaining active.

Pillar 3 met the first constraint and the cost half of the second. Pillar 3a addresses the account-dependency half.

---

## Locked decisions (Joe, 2026-05-24)

1. **Architecture**: Apps Script POSTs directly to GitHub's `workflow_dispatch` API. No Cloudflare Worker. The entire processing pipeline runs in a GitHub Action on the public repo.
2. **PR policy**: No PR for routine submissions. The Action pushes directly to `main` from the bot identity. Branch protection on `main` stays in force for human commits; the `rosen-archive-bot` App is added to the branch-protection bypass list so the Action can push without going through review. (Hand-edits to the archive still go through normal PRs as a human.)
3. **Auth from Apps Script to GitHub**: GitHub App (not PAT). Apps Script signs a JWT with the App's private key, exchanges it for a 1-hour installation token per submission.
4. **Sheet structure**: unchanged from Pillar 3. Same columns A–H, same status values, same Apps Script trigger column. Pillar 3a is invisible to Jay.
5. **Categorization failure mode**: degrade to `categories=["uncategorized"]` + low-confidence flag, NEVER strand the row. Hali or Jay can edit later via a normal PR.

---

## Research notes

Three parallel research subagents 2026-05-24 verified the design's load-bearing assumptions. Findings that shaped the design:

### Codebase prior art
- The current `dispatcher.dispatch_url()` uses Google's URL Context API (via the Gemini SDK) as the **primary** scraper, NOT Wayback. Trafilatura/Playwright are fallbacks. `backend/src/rosen_scraper/dispatcher.py:16–79`, `scraper.py:482–515`.
- AI categorization is a direct `genai` library call (`backend/src/rosen_scraper/categorizer.py:1–80`). Survives unchanged in the Action.
- `node data/export-archive-data.js` produces ~50 MB of JSON (archive-data: 26 MB, archive-core: 11 MB, archive-details: 12 MB, archive-entities: 1 MB) in ~10–30s. Too large for a Cloudflare Worker (10ms CPU/req); fits comfortably in a GitHub Action.
- `.github/workflows/post-merge.yml` is a placeholder webhook that does nothing — repurpose-able as the SFTP-on-merge job.

### Platform realities (2026)
- Cloudflare Workers free tier: 100k req/day, **10ms CPU per request**, 50 subrequests per invocation. The 10ms CPU cap rules out HTML parsing inside the Worker — confirms the Worker would be a thin proxy with little value-add. ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/))
- GitHub REST API: 5,000 req/hr authenticated. Creating a file + PR atomically requires 3 calls (branch ref → PUT contents → POST `/pulls`); using `workflow_dispatch` instead is a single call. ([Rate limits](https://docs.github.com/en/rest/overview/rate-limits-for-the-rest-api))
- Public-repo Actions remain unmetered in 2026. The Mar 2026 pricing changes ($0.002/min platform fee + larger-runner charges) explicitly do not apply to public-repo standard runners. ([2026 pricing changes](https://resources.github.com/actions/2026-pricing-changes-for-github-actions/))
- Wayback recency lag is severe in 2026 (87% drop in news-homepage capture frequency, 7–9 day SPN feedback lag). Wayback is acceptable as a fallback only, not as a primary scraper. ([Archivarix 2026 review](https://archivarix.com/en/blog/webarchive-2026/))
- Gemini free tier on 2.5 Flash / Flash-Lite supports structured JSON output at no surcharge; ~1,500 RPD covers Jay's load (~10/day) ~150x over. ([Gemini free tier](https://ai.google.dev/gemini-api/docs/rate-limits))
- Security pitfall: `pull_request_target` runs in base context with full secrets. Any deploy job holding the SFTP secret MUST trigger on `push: main` only. ([Wiz GHA security](https://www.wiz.io/blog/github-actions-security-guide))

### Ownership + handoff
- Cloudflare Workers cannot be transferred between accounts. Recreate-and-rebind only. ([Transfer worker thread](https://community.cloudflare.com/t/transfer-worker-under-a-different-account/611136))
- GitHub repos transfer cleanly between accounts. Repository-level secrets, PRs, Actions run history all persist. Old URLs redirect.
- Fine-grained PATs auto-revoke after 1 year of non-use. GitHub Apps do not. ([Token expiration](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation))
- Bound Apps Script does NOT transfer with the Sheet. New owner must create a fresh Apps Script project and paste the code. ([Apps Script transfer thread](https://support.google.com/a/thread/137654217/))
- Google personal accounts are deleted after 2 years of inactivity since Dec 2023. Service account JSONs die with the parent GCP project, which dies with the owning Google account. Workspace accounts are exempt. ([Inactive Google Account policy](https://support.google.com/accounts/answer/12418290?hl=en))
- Apps Script can POST to GitHub's `/dispatches` endpoint via `UrlFetchApp` — documented, widely-used pattern that eliminates the need for any intermediary runtime. ([Jared Whalen tutorial](https://www.jaredwhalen.com/blog/deploy-gh-action-from-sheets))

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  GOOGLE SHEET  "Rosen Archive URL List" (same sheet as P3)    │
│  Columns A–H unchanged                                         │
│                                                                │
│  Apps Script v2 (Pillar-3a):                                   │
│    - onEdit installable trigger (same as P3)                   │
│    - Validate URL, write A=timestamp, F='submitted'            │
│    - Generate GitHub App JWT (RS256), exchange for install     │
│      token, POST workflow_dispatch                             │
└──────────────┬─────────────────────────────────────────────────┘
               │ HTTPS POST
               │ /repos/jamditis/rosen-frontend/actions/workflows/
               │   submit-record.yml/dispatches
               │ Authorization: Bearer <install-token>
               │ Body: { ref: "main",
               │         inputs: { url, title, notes,
               │                   sheet_id, sheet_tab, sheet_row } }
               ↓
┌────────────────────────────────────────────────────────────────┐
│  GITHUB ACTION  submit-record.yml (on: workflow_dispatch)     │
│    concurrency: { group: submit-record,                        │
│                   cancel-in-progress: false }  ← serializes    │
│                                                                │
│    1. Write F='processing' to sheet (best-effort)              │
│    2. Dedup check vs current CSV                               │
│    3. dispatcher.dispatch_url(url)  ← existing Python          │
│         primary: Google URL Context (Gemini SDK)               │
│         fallback: trafilatura/playwright                       │
│         fallback: Wayback CDX lookup                           │
│    4. Categorize  ← existing Gemini path; on failure use       │
│       categories=["uncategorized"] + low_confidence=true       │
│    5. generate_source_based_id() → RECORD-NNNNN                │
│    6. enrich_data() + _sanitize_cell()                         │
│    7. Append to data/archive_records-public.csv                │
│    8. node data/export-archive-data.js → regen 4 JSONs         │
│    9. Run test suite (pytest + node tests). On fail: skip      │
│       commit, write F='error' with test output to H, exit      │
│   10. git commit + push to main (App identity)                 │
│   11. SFTP push 4 JSONs to pressthink.org                      │
│   12. Write F='live', G=RECORD-NNNNN to sheet                  │
│       (or F='error', H=reason on any failure above)            │
└──────────────┬─────────────────────────────────────────────────┘
               │ SFTP (paramiko in Action)
               ↓
┌────────────────────────────────────────────────────────────────┐
│  pressthink.org/j/rosen-archive/                              │
└────────────────────────────────────────────────────────────────┘
```

End-to-end latency: ~10–15 min. Breakdown: GitHub Action queue + cold-runner ~1–3 min; actual work ~1.5 min (scrape ~10s, categorize ~5s, regen ~20s, commit/push ~5s, SFTP ~10s, sheet writeback ~2s).

---

## Pieces to build

| # | Piece | Effort | Location |
|---|---|---|---|
| 1 | Apps Script v2 (GitHub App JWT + workflow_dispatch) | ~250 lines | `automation/apps-script/Code.gs` (replace) |
| 2 | `submit-record.yml` workflow | ~120 lines | `.github/workflows/submit-record.yml` (new) |
| 3 | `sweep-stuck-rows.yml` workflow | ~80 lines | `.github/workflows/sweep-stuck-rows.yml` (new) |
| 4 | `backend/scripts/process_submission.py` — Action-facing entry point that wraps existing `dispatcher.dispatch_url()` + CSV append + JSON regen | ~150 lines | `backend/scripts/process_submission.py` (new) |
| 5 | `backend/scripts/sweep_stuck.py` — sweeper logic | ~80 lines | `backend/scripts/sweep_stuck.py` (new) |
| 6 | Update `automation/SETUP.md` — Pillar 3a setup section | ~80 lines | `automation/SETUP.md` (extend) |
| 7 | Update `docs/JAY_ADDING_RECORDS.md` — no user-facing change but reflect the new latency expectation | ~10 lines | `docs/JAY_ADDING_RECORDS.md` (extend) |
| 8 | `automation/HANDOFF.md` — what changes when Joe steps back | ~150 lines | `automation/HANDOFF.md` (new) |

### Tests

- `tests/test_process_submission.py` — unit tests for the Action-facing entry point. Mock dispatcher, mock Gemini, mock SFTP, mock Sheets API.
- `tests/test_sweep_stuck.py` — unit tests for sweeper. Mock sheet contents, assert correct re-dispatch behavior.
- Existing `tests/data-pipeline.test.js` extends to cover the new auto-injected records (already does — the records are CSV rows like any other).

---

## Data contract: workflow_dispatch inputs

`submit-record.yml` declares exactly these inputs (max 10 per GitHub, using 6):

| Input | Required | Source | Notes |
|---|---|---|---|
| `url` | yes | Sheet column B | Validated `http(s)://` in Apps Script AND in workflow (defense in depth) |
| `title` | no | Sheet column C | Jay's optional override; falls back to scraper title |
| `notes` | no | Sheet column D | Internal-only; not published |
| `sheet_id` | yes | `SpreadsheetApp.getActiveSpreadsheet().getId()` | For writeback target |
| `sheet_tab` | yes | active sheet name | For writeback target |
| `sheet_row` | yes | row number | For writeback target |

The workflow's run history IS the audit log — every dispatch shows up with inputs visible.

---

## Status model (preserves Pillar 3 UX)

| Status (col F) | Written by | Meaning |
|---|---|---|
| `submitted` | Apps Script | Dispatched to GitHub; Action picking up |
| `processing` | Action (step 1) | Action acquired the workflow run |
| `live` | Action (step 12) | Committed to repo AND SFTP'd to pressthink.org |
| `archived` | Action (step 10) | Committed to git but SFTP push failed; auto-retry on next submission |
| `duplicate` | Action (step 2) | URL already in archive; G holds existing RECORD-NNNNN |
| `error` | Action (any failure) | Couldn't process; H has the reason in plain English |
| `no URL` / `invalid URL` | Apps Script | Validation failed pre-dispatch |

---

## Secrets + auth

### GitHub App `rosen-archive-bot`

Permissions:
- `Contents: write` (push commits to main)
- `Actions: write` (re-dispatch workflows from the sweeper)
- `Metadata: read` (required default)

Installation: rosen-frontend repo only. App owner: Joe today. Apps cannot be transferred between GitHub accounts; handoff requires Jay or Hali to create a fresh App on their own account (see "Handoff steps" below). The repo, secrets, and Apps Script code carry over; only the App identity changes.

### Apps Script script properties

- `GITHUB_APP_ID` — numeric App ID
- `GITHUB_APP_INSTALL_ID` — installation ID for the rosen-frontend repo
- `GITHUB_APP_PRIVATE_KEY` — PEM-format RSA private key from the App settings

JWT flow per submission:
1. `Utilities.computeRsaSha256Signature(header + '.' + payload, GITHUB_APP_PRIVATE_KEY)` builds a JWT signed RS256 (10-min expiry, `iss` = App ID).
2. POST `/app/installations/{install_id}/access_tokens` with `Authorization: Bearer <JWT>` returns an installation token (1-hour TTL).
3. Use installation token as `Authorization: Bearer <token>` on the workflow_dispatch POST.

No token caching needed — Jay submits ~10/day, well inside the 5,000/hr rate limit. Generate fresh per submission.

### GitHub repo secrets

| Secret | Used by | Source |
|---|---|---|
| `ROSEN_SFTP_HOST` | `submit-record.yml` SFTP step | `pass show claude/rosen/wp-admin` |
| `ROSEN_SFTP_USER` | same | same |
| `ROSEN_SFTP_KEY` | same | same (private key preferred) |
| `ROSEN_SFTP_REMOTE_PATH` | same | same (target dir on pressthink.org) |
| `ROSEN_SFTP_KNOWN_HOSTS` | same | same (host-key for strict checking) |
| `GEMINI_API_KEY` | scrape + categorize steps | `pass show claude/rosen/gemini-rosen` |
| `SHEETS_SA_KEY` | sheet writeback step | `pass show claude/rosen/rosen-service-account-full` |

All seven are GitHub repo secrets, NOT environment secrets — repo secrets persist through ownership transfer, environment secrets don't.

---

## Failure modes + recovery

| What fails | What Jay sees | Recovery |
|---|---|---|
| Apps Script can't reach GitHub (network, auth) | `error` + H="Could not reach GitHub: …" | Untick + retick |
| Workflow doesn't fire (App permission lost, dispatch dropped) | `submitted` forever | `sweep-stuck-rows.yml` detects > 30 min stale, re-dispatches |
| Scrape returns nothing | `error` + H="Scrape returned no content (URL may be unreachable)" | Try Wayback URL in column B |
| Gemini categorization fails | `live` with `categories=["uncategorized"]` flag, `low_confidence=true` | Hali/Jay edits the record later via normal PR; never strands the row |
| CSV append + JSON regen fails | `error` + H="Internal pipeline error: …" + link to Action run log | Check Action log; usually transient (Gemini rate-limit, dispatcher edge case) |
| Test suite fails (step 9) | `error` + H="Tests failed after CSV write; row not committed. See: <run URL>" | The CSV append happens in the runner's workspace only — no commit means no live impact. Open a normal PR to fix the data, then resubmit. |
| Git push fails | `error` + H="Could not commit to repo: …" | Check Action log; usually a force-push race or branch-protection misconfig |
| SFTP push fails | `archived` + H="Live push failed; will retry next submission" | Auto-retry on next submission (SFTP push is idempotent — see sftp_push.py atomic-tmp-rename pattern) |
| Sheet writeback fails (Sheets API down) | Status stays at previous value | Action retries writeback once; final state visible in Action run log |

---

## Stuck-row sweeper

`sweep-stuck-rows.yml` runs on cron `0 */6 * * *` (every 6 hours).

Reads the sheet via the service account, finds rows where `Status='submitted'` and `submitted_at > 30 min ago`, re-dispatches `submit-record.yml` for each. Catches:
- Apps Script POSTs that never reached GitHub (rare but possible)
- Workflow runs that died mid-flight (runner OOM, GitHub outage)
- Any class of "stuck" failure not enumerated above

Cheap on a public repo (unmetered Actions), bounded (~4 sweep runs/day idle, more when there's work), idempotent (the dedup check at step 2 of `submit-record.yml` prevents double-processing).

---

## Cost analysis

| Component | Today | Post-handoff (Jay/Hali) |
|---|---|---|
| Apps Script | $0 | $0 |
| GitHub public repo | $0 | $0 |
| GitHub Actions on public repo | $0 (unmetered) | $0 (unmetered) |
| Google Sheets | $0 | $0 |
| Gemini API (categorization) | $0 (Joe's free tier) | $0 (Jay/Hali free tier) |
| Wayback fallback | $0 | $0 |
| SFTP to Bluehost | $0 marginal (Jay already pays for WP hosting) | same |
| **Total ongoing** | **$0/mo** | **$0/mo** |

No paid services in the critical path. The only $$ in this stack is Jay's existing Bluehost WP hosting, which exists independent of this design.

---

## Migration from Pillar 3

Pillar 3 (Flask on houseofjawn) and Pillar 3a can coexist during migration:

1. Build `submit-record.yml` + `sweep-stuck-rows.yml` + GitHub App + repo secrets — without changing the production Apps Script
2. Create a TEST sheet with TEST Apps Script that points at the new GitHub App
3. End-to-end smoke test against the test sheet (5 fake URLs: `test@example.com`-style)
4. Once green: update the PRODUCTION Apps Script script properties to point at the new GitHub App (or replace the Code.gs entirely)
5. Run both Pillar 3 and Pillar 3a in parallel for one week (Flask continues to work for any test traffic; new sheet ticks hit Action)
6. Decommission `rosen-submission.service` on houseofjawn (`sudo systemctl disable --now rosen-submission`)
7. Update `automation/SETUP.md` to mark Pillar 3 as historical

---

## Handoff steps (when Joe steps back)

Estimated time: ~2 hours, all one-time. Walk through with Jay or Hali in person or over a call.

1. **Repo**: Transfer `jamditis/rosen-frontend` to Jay or Hali (or to a `jay-rosen-archive` GitHub org owned by them). Settings → Transfer ownership. Repo secrets carry over. Old URLs redirect.
2. **GitHub App**: Apps cannot be transferred. Create a new App `rosen-archive-bot` owned by Jay/Hali. Same permissions. Install on the (transferred) repo. Update Apps Script script properties to new `GITHUB_APP_ID` + `GITHUB_APP_INSTALL_ID` + `GITHUB_APP_PRIVATE_KEY`.
3. **Apps Script**: Bound Apps Script does NOT transfer with the Sheet. Have Jay open the queue sheet → Extensions → Apps Script → File → New → Project. Paste contents of `automation/apps-script/Code.gs` from the repo. Set script properties. Run `setup()` once to install the trigger.
4. **GCP project + service account** (for sheet writeback): if Jay or Hali has a Google Workspace account (university, personal Workspace), create a fresh GCP project under that account. Enable Sheets API. Create a service account. Download JSON. Update `SHEETS_SA_KEY` repo secret. Share the queue sheet with the new service account's email (Editor).
5. **Gemini API key**: Jay or Hali generates their own Gemini API key from `aistudio.google.com`. Update `GEMINI_API_KEY` repo secret.
6. **SFTP credentials**: already Jay's. Just confirm they're current in `pass` → update `ROSEN_SFTP_*` repo secrets if rotated.
7. **Decommission Pillar 3**: `sudo systemctl disable --now rosen-submission` on houseofjawn. Remove the Cloudflare tunnel entry for `rosen-submit.amditis.tech`. Delete the DNS record.

After step 7, nothing on Joe's machines, Cloudflare account, or Gmail account is in the critical path.

---

## Out of scope

- Per-record entity extraction (runs as separate batch job; `unified_entity_processor.py`)
- Image / video / podcast handling (Phase 2 of `dispatcher.dispatch_url()`; existing scaffolding supports it)
- Multi-user editorial workflow (Sheet sharing covers Jay + Hali)
- Live-preview / in-archive editing (Jay's separate March 26 request — own pillar)
- Bulk import UX (Sheet already handles bulk paste; serial processing is fine for v1)
- Hand-edit-the-archive workflow (still works via normal PR; not Pillar 3a's concern)

---

## Open issues this design defers

1. **What happens if Jay's Google account is deleted post-handoff?** The Sheet survives (Jay's). The bound Apps Script does not (depends on the same account). Workaround: have Hali also be Owner of the Sheet AND maintain a backup copy of the Apps Script code in her account. Document in `HANDOFF.md`.
2. **What happens if the GitHub App's private key leaks?** Revoke + regenerate from the App settings, update Apps Script script property. ~5 min recovery. Document in `HANDOFF.md`.
3. **What happens if Bluehost rotates SFTP creds without telling whoever owns the repo secret?** Deploys silently break (Action shows `archived` status instead of `live`). Sweep job catches it. Hali updates the repo secret. Document in `HANDOFF.md`.
4. **Should `sweep-stuck-rows.yml` also catch `processing` rows that never reached `live`?** Yes — extend the sweeper to also handle `processing > 1hr` (the Action should never take that long; if it does, something hung). Spec'd into `sweep_stuck.py`.

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Apps Script `UrlFetchApp` JWT signing fails | `Utilities.computeRsaSha256Signature` is documented and stable; fall back to a PAT with calendar reminder for rotation if JWT proves brittle (revise design) |
| GitHub Action queue latency exceeds Jay's tolerance | Bench actual cold-runner times pre-handoff; if > 15 min, consider a hot-runner approach (self-hosted runner on Jay's laptop when on, GitHub-hosted when off) |
| Cron sweeper races with primary dispatch (double-processing) | Dedup check at step 2 of `submit-record.yml` short-circuits on duplicate URL; status writeback is idempotent |
| Service account JSON expires or is rotated | Use the longest-lived service account key Google supports; document rotation in `HANDOFF.md`; sheet writeback failures are visible in Action logs |
| Gemini free tier degrades (rate-limit, model deprecation, billing-required) | Categorization fallback to `["uncategorized"]` means submissions still succeed; no hard dependency on Gemini being healthy |
| GitHub deprecates Apps in favor of new auth (e.g. OIDC for external services) | Re-evaluate at deprecation announcement; design swap is < 1 day's work since the only dependency is the dispatch POST |
| Auto-push-to-main introduces a bad CSV row | Existing CSV-formula-injection guard (`_sanitize_cell`) prevents the worst class of corruption; node test suite runs as a workflow step BEFORE the commit, so test-suite failure aborts |

---

## What's NOT in this design

- Cloudflare Workers (eliminated by the ownership research; see "Research notes / Ownership + handoff")
- Cloudflare tunnel routes (Pillar 3 used this; Pillar 3a doesn't need it)
- houseofjawn dependency (eliminated)
- systemd units (eliminated)
- SQLite queue (the sheet itself is the queue)
- Auto-merge / branch protection theater (no PR for routine submissions)

---

## Next steps once Joe approves this design

1. Branch off main: `feat/pillar3a-free-auto-deploy` (separate from this design-doc branch)
2. Build pieces 1–8 from the table above (order: 4 + 5 first so the Action-facing entry point is testable, then 2 + 3 for the workflows, then 1 for the Apps Script v2, then 6 + 7 + 8 for the ops/handoff docs)
3. End-to-end smoke test with a TEST sheet + 5 fake URLs (`test@example.com`-style) before pointing the production sheet at it
4. Demo to Joe (handoff dry-run) once everything is green
5. Schedule the actual handoff with Jay or Hali

---

## Design self-review checklist

- [x] No placeholders or "TBD" — all decisions are locked or explicitly deferred to `HANDOFF.md`
- [x] Sections are internally consistent (architecture matches data contract matches status model matches secrets)
- [x] Scope is one implementation cycle (Pillar 3a end-to-end, not the broader retirement plan)
- [x] Ambiguity check: trigger, PR policy, auth, failure modes, sweeper behavior are all explicit
- [x] Research notes section present with citations
- [x] Phase boundary explicit (migration from Pillar 3, handoff to Jay/Hali)
- [x] Cost model explicit (both pre- and post-handoff)
- [x] Risks named with mitigations
- [x] Tests called out
- [x] Sentence case throughout (no Title Case)
- [x] No banned words ("comprehensive", "robust", "leveraging", "sophisticated", etc.)
- [x] Handoff section addresses every account-dependency surfaced in the ownership research

---

## Spec ready for Joe's review

Path: `docs/plans/2026-05-24-pillar3a-free-auto-deploy-design.md`
Review request: read top-down; flag any architecture decision to flip OR any "deferred" item to pull into scope.
