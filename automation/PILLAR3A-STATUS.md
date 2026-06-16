# Pillar 3a status and remaining setup

Last updated 2026-06-16.

Pillar 3a (sheet checkbox → GitHub Action scrapes, categorizes, commits a record,
writes status back) is written in code but was never stood up: no secrets were
set, the GitHub App key was never on disk, and the queue sheet had no submission
tab. This file tracks what is done and what is left. The full install procedure
is in `automation/SETUP.md`; this is the current-state delta.

## Deploy reality: no SFTP

pressthink.org has no FTP/SFTP access. Files go live through the WordPress
file-explorer plugin (manual upload), not a server account. So:

- Leave every `ROSEN_SFTP_*` secret **unset**. `backend/submission_server/sftp_push.py`
  returns a successful no-op when they are missing (`{ok: true, skipped: true}`),
  so the run stays green.
- A processed row is written back as **`archived`**, not `live`
  (`backend/scripts/process_submission.py` around line 947): the record is
  committed to `main` but not pushed to the live site.
- Go-live stays manual: after a run commits, upload the changed `data/*.json`
  (archive-core, archive-details, archive-data, archive-analytics — see
  `DEPLOYMENT.md` "Deploy after adding records") through the WP file-explorer
  plugin. The automation still does the slow part (scrape, categorize, regen);
  only the upload is manual.

### `archived` is not a resting state — the sweeper retries it

`archived` is **not** terminal. `sweep-stuck-rows.yml` runs every 30 minutes and
`backend/scripts/sweep_stuck.py` re-dispatches any `archived` row older than 24 h
with a sentinel URL to force an SFTP retry (`_THRESHOLDS['archived'] = 24 * 60 * 60`).
Its terminal set is `live | error | duplicate | no URL | invalid URL` only. With
no SFTP the retry can never succeed, so an `archived` row would be re-fired every
24 h forever — repeated Action runs and re-commits, one per stale row.

Setting `ROSEN_QUEUE_SHEET_ID` + `ROSEN_QUEUE_SHEET_TAB` makes the sweep cron
functional, so pick a mitigation for the no-SFTP setup:

- **Recommended: after the manual upload, set the row's column F to `live`** (a
  terminal status). That records it as live and stops the sweeper re-firing it.
- **Or leave the sweep cron disabled** until SFTP exists. Its only other job is
  re-firing genuinely stuck `submitted` (>30 min) / `processing` (>1 h) rows, so
  disabling it is safe while submissions are low-volume and watched.

A cleaner long-term fix (a code change, out of scope here) is to drop `archived`
from `sweep_stuck.py`'s thresholds for a deployment that has no SFTP.

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
  | D | notes | you (optional; pasted body skips the scrape) |
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

Extensions → Apps Script. Per `automation/SETUP.md`:

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
- [ ] Smoke test: paste an `example.com` URL in B of `submissions`, tick E, watch
      F go to `submitted` then `archived`, confirm the record committed to `main`.
- [ ] Upload the regenerated `data/*.json` via the WP file-explorer plugin to go live.
- [ ] Set the row's column F to `live` after uploading so the 30-min sweeper does
      not re-fire it (see "`archived` is not a resting state").
- [ ] Decide whether to keep the `sweep-stuck-rows.yml` cron enabled before SFTP exists.
