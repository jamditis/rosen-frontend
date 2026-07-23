# Pillar 3a status and remaining setup

Last updated 2026-06-16.

Pillar 3a (sheet checkbox → GitHub Action scrapes, categorizes, commits a record,
writes status back) is written in code but was never stood up: no secrets were
set, the GitHub App key was never on disk, and the queue sheet had no submission
tab. This file tracks what is done and what is left. The full install procedure
is in `docs/setup/pillar-3a-runbook.md` (the Pillar 3a runbook); this is the
current-state delta.

## Deploy reality: no SFTP

pressthink.org has no FTP/SFTP access. Files go live through the WordPress
file-explorer plugin (manual upload), not a server account. So:

- Leave every `ROSEN_SFTP_*` secret **unset**. `backend/submission_runtime/sftp_push.py`
  returns a successful no-op when they are missing (`{ok: true, skipped: true}`),
  so the run stays green.
- A processed row is written back as **`archived`**, not `live`
  (`backend/scripts/process_submission.py` around line 947): the record is
  committed to `main` but not pushed to the live site.
- Go-live stays manual: after a run commits, upload the changed `data/*.json`
  (archive-core, archive-details, archive-entities, archive-data,
  archive-analytics, and search-index — the six files `sftp_push.py` pushes; see `DEPLOYMENT.md`
  "Deploy after adding records") through the WP file-explorer plugin. The
  automation still does the slow part (scrape, categorize, regen); only the
  upload is manual.

### `archived` is not a resting state — the sweeper auto-promotes it to `live`

`archived` is **not** terminal. `sweep-stuck-rows.yml` runs every 30 minutes and
`backend/scripts/sweep_stuck.py` re-dispatches any `archived` row older than 24 h
with a sentinel URL (`https://example.com/sweep-noop-<ts>`) to force an SFTP retry
(`_THRESHOLDS['archived'] = 24 * 60 * 60`); anything outside that thresholds dict
is terminal.

But the sentinel path in `process_submission.py` (`_is_sentinel`, ~line 542)
short-circuits scrape/categorize/append, runs only the SFTP step, then checks
**`push.get('ok')`**. With no SFTP, `push_to_production()` returns
`{ok: true, skipped: true}`, so `ok` is truthy and the row is promoted
`archived → live` ("Recovered via sweep retry", ~line 561). So an `archived` row
is **auto-marked `live` after ~24 h without anything being deployed** — a false
`live`, not an endless retry, and no re-commit (the sentinel path never appends).
At most one extra Action run, then the row reads `live`.

Note the asymmetry: a normal no-SFTP submission ends at `archived` (honest —
committed, not uploaded; `process_submission.py` ~line 954), but the sweeper's
sentinel retry of that same row marks it `live` (dishonest — still not uploaded).
Setting `ROSEN_QUEUE_SHEET_ID` + `ROSEN_QUEUE_SHEET_TAB` makes the sweep cron
functional, so pick a mitigation for the no-SFTP setup:

- **Recommended while there is no SFTP: leave the sweep cron disabled.** That keeps
  `archived` meaning "committed, not yet uploaded." Its only other job is re-firing
  genuinely stuck `submitted` (>30 min) / `processing` (>1 h) rows, so disabling it
  is safe while submissions are low-volume and watched.
- **Or, if the cron stays on, upload and set column F to `live` yourself within
  24 h** of each commit. Setting `live` only after a real upload keeps the status
  honest and pre-empts the sweeper; miss the window and the sweeper writes a false
  `live` for you.

A cleaner long-term fix (a code change, out of scope here) is to drop `archived`
from `sweep_stuck.py`'s thresholds, or make the sentinel path treat a `skipped`
push as not-yet-live, for a deployment that has no SFTP.

## GitHub Actions repo secrets

Set on `jamditis/rosen-frontend` → Settings → Secrets and variables → Actions.

| Secret | State | Source |
|---|---|---|
| `GEMINI_API_KEY` | set | `pass show claude/api/gemini-rosen` |
| `ROSEN_SHEETS_SA_KEY_JSON` | set | `pass show claude/google/rosen-service-account-full` |
| `ROSEN_QUEUE_SHEET_ID` | set | `1Q_Fik5KQXdkZ4dujEN8H_47K5oldLkv6-hxERuBAdpg` |
| `ROSEN_QUEUE_SHEET_TAB` | set | `submissions` |
| `ROSEN_GH_APP_ID` | **TODO** | rosen-archive-bot App settings page |
| `ROSEN_GH_APP_PRIVATE_KEY` | **TODO** | generated `.pem` (raw PKCS#1) |
| `ROSEN_SFTP_*` | intentionally unset | no server access — see above |

`GITHUB_TOKEN` in `sweep-stuck-rows.yml` is auto-provided by Actions; do not add it.

## Queue sheet

- Sheet: "Rosen Archive URL List" — id `1Q_Fik5KQXdkZ4dujEN8H_47K5oldLkv6-hxERuBAdpg`.
- Submission tab `submissions` (created 2026-06-16, gid 138855630). Layout, read
  as `A1:H` by the Apps Script and the sweeper:

  | Col | Field | Who writes it |
  |---|---|---|
  | A | submitted_at | Apps Script (timestamp on submit) |
  | B | url | you (paste) |
  | C | title | you (optional) |
  | D | notes | you (optional public note); does not skip the scrape — `raw_text` (the paste-the-body fallback) is a separate `submit-record` Actions input (#353), not this column |
  | E | submit | you (tick the checkbox — this is the trigger) |
  | F | status | written back (submitted / archived / error / ...) |
  | G | record_id | written back (RECORD-NNNNN) |
  | H | error | written back (reason on failure) |

## GitHub App: rosen-archive-bot

Commits the new record to `main` and lets the Action dispatch run. From
github.com/settings/apps (create it if absent — needs Contents: write and
Actions: write on rosen-frontend):

1. App ID → `ROSEN_GH_APP_ID` (Actions) and `GITHUB_APP_ID` (Apps Script property).
2. Generate a private key (downloads PKCS#1 `.pem`; old keys cannot be re-downloaded):
   - Actions: `gh secret set ROSEN_GH_APP_PRIVATE_KEY --repo jamditis/rosen-frontend < key.pem`
   - Apps Script: convert first, then paste into the `GITHUB_APP_PRIVATE_KEY` property:
     `openssl pkcs8 -topk8 -inform pem -in key.pem -outform pem -nocrypt -out key.pkcs8.pem`
3. Installation id (github.com/settings/installations → Configure → id in the URL)
   → `GITHUB_APP_INSTALL_ID` (Apps Script property).

## Apps Script (in the queue sheet)

Extensions → Apps Script. Install the Pillar 3a Apps Script from `automation/apps-script/`:

1. Replace `Code.gs` with `automation/apps-script/Code.gs`; replace
   `appsscript.json` with `automation/apps-script/appsscript.json`.
2. Project Settings → Script Properties: `GITHUB_APP_ID`, `GITHUB_APP_INSTALL_ID`,
   `GITHUB_APP_PRIVATE_KEY` (the PKCS#8 PEM).
3. Run `setup` once (authorize), then `verifyAuth` ("Auth OK" confirms the App
   credentials before relying on a live checkbox).

## Remaining checklist

- [ ] Create or locate the rosen-archive-bot GitHub App (Contents + Actions write).
- [ ] Set `ROSEN_GH_APP_ID` and `ROSEN_GH_APP_PRIVATE_KEY` Actions secrets.
- [ ] Install `Code.gs` + `appsscript.json` and the 3 Script Properties in the sheet.
- [ ] Run `setup` then `verifyAuth` in Apps Script.
- [ ] Smoke test per `docs/setup/pillar-3a-runbook.md` Block 3. Start safe: paste a
      `.invalid` URL (e.g. `https://jay-rosen-test.invalid/smoke-1`) in B, tick E,
      watch F go to `error` — `is_safe_public_url` rejects it before any fetch, so
      there is no scrape and no commit. **Do not use an `example.com` URL**: it
      resolves and serves real HTML, so a successful scrape would commit a bogus
      record to `main` (only the `sweep-noop-` sentinel prefix is special-cased,
      not bare `example.com`).
- [ ] Upload the regenerated `data/*.json` via the WP file-explorer plugin to go live.
- [ ] Set the row's column F to `live` after uploading so the 30-min sweeper does
      not auto-promote it to a false `live` first (see "`archived` is not a
      resting state").
- [ ] Decide whether to keep the `sweep-stuck-rows.yml` cron enabled before SFTP exists.
