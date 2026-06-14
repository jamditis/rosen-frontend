# Pillar 3 setup — submission server + Apps Script + Cloudflare tunnel

Operator-facing setup doc for the Jay Rosen authoring workflow.

Audience: whoever is running houseofjawn and Joe's Cloudflare zone. After
Joe steps back, this is the runbook for keeping Jay's submit-via-checkbox
flow alive.

Design source of truth: `docs/plans/2026-05-24-pillar3-authoring-workflow-design.md`.

---

## What gets installed where

| Component | Lives on | Path |
|---|---|---|
| Submission server (Flask) | houseofjawn | `backend/submission_server/app.py`, run by systemd as `rosen-submission.service` on `127.0.0.1:8084` |
| Apps Script trigger | Google (attached to the sheet) | `automation/apps-script/Code.gs` |
| Cloudflare tunnel route | houseofjawn (cloudflared) | `/etc/cloudflared/config.yml` ingress entry for `rosen-submit.amditis.tech` |
| SFTP deploy target | pressthink.org | `<remote>/j/rosen-archive/data/` (Bluehost-shared WP) |
| Queue sheet | Google Drive | "Rosen Archive URL List" (sheet ID is a Script Property, not in code) |

---

## One-time install on houseofjawn

### 1. Sync the repo

```bash
ssh houseofjawn
cd ~/projects/rosen-frontend
git pull
cd backend
poetry install        # picks up paramiko + everything else
```

### 2. Create the env file

```bash
sudo install -m 640 -o root -g jamditis \
  automation/systemd/rosen-submission.env.example /etc/rosen-submission.env
sudoedit /etc/rosen-submission.env
```

Fill in:

- `SUBMISSION_AUTH_TOKEN` — `openssl rand -hex 32`. Save the value, you'll
  paste it into the Apps Script script properties below.
- `ROSEN_SFTP_*` — read from `pass show claude/rosen/wp-admin`. Prefer key
  auth (point at a 0600 keyfile) over password.
- `ROSEN_SHEETS_SA_KEY` — path to the service-account JSON. Extract from
  `pass show claude/rosen/rosen-service-account-full > /etc/rosen-sa.json &&
  sudo chmod 640 /etc/rosen-sa.json && sudo chown root:jamditis /etc/rosen-sa.json`.
- `ROSEN_ALLOWED_SHEET_ID` and `ROSEN_ALLOWED_SHEET_TAB` — the queue
  spreadsheet's id and tab name. Set BOTH (#285): the service account can write
  any tab of any spreadsheet shared with it, so pinning the id alone still lets
  a caller redirect the write to another tab. A `/submit` whose `sheet_id` or
  `sheet_tab` differs is then rejected with 422.

### 3. Seed the SFTP host key

`rosen-submission.service` uses **strict** host-key checking
(`paramiko.RejectPolicy()`). The host key must be in `~jamditis/.ssh/known_hosts`
before the first deploy or every SFTP push fails.

```bash
sudo -u jamditis ssh-keyscan -p 22 <ROSEN_SFTP_HOST> >> ~jamditis/.ssh/known_hosts
```

### 4. Install the systemd unit + wrapper

```bash
sudo install -m 755 \
  automation/systemd/rosen-submission-exec.sh \
  /usr/local/sbin/rosen-submission-exec
sudo install -m 644 \
  automation/systemd/rosen-submission.service \
  /etc/systemd/system/rosen-submission.service
sudo systemctl daemon-reload
sudo systemctl enable --now rosen-submission.service
sudo systemctl status rosen-submission.service
```

The wrapper resolves the Poetry venv path at start time (`poetry env info -p`),
so the service keeps working after `poetry env remove` / `poetry install` / a
Python upgrade — all of which change the venv's hash-based directory name.

Sanity check:

```bash
curl -s -H "X-Auth-Token: $(sudo awk -F= '/^SUBMISSION_AUTH_TOKEN=/{print $2}' /etc/rosen-submission.env)" \
  http://127.0.0.1:8084/queue | jq .
```

Expected: `{"stats": {...}, "last_run": null, "is_processing": false}`.

### 5. Add the Cloudflare tunnel ingress entry

Edit `/etc/cloudflared/config.yml` on houseofjawn. Add **above** the
catch-all 404 entry:

```yaml
  - hostname: rosen-submit.amditis.tech
    service: http://127.0.0.1:8084
```

DNS: create a CNAME `rosen-submit` → `<tunnel-uuid>.cfargotunnel.com` in
the `amditis.tech` zone (Cloudflare dashboard or `cloudflared tunnel route
dns <tunnel> rosen-submit.amditis.tech`).

Restart cloudflared:

```bash
sudo systemctl restart cloudflared
```

End-to-end check from anywhere:

```bash
curl -s -H "X-Auth-Token: <token>" https://rosen-submit.amditis.tech/queue
```

Same JSON as the localhost call. If you get 502, cloudflared can't reach
the local service; if you get 401, the token is wrong or missing.

---

## Apps Script setup (one-time, in the queue sheet)

Pillar 3a Apps Script (`automation/apps-script/Code.gs`) authenticates to
GitHub as the `rosen-archive-bot` GitHub App and fires the `submit-record.yml`
workflow directly — it does NOT POST to the Flask `/submit` endpoint above.
The Flask server (sections 1–5) is the legacy Pillar 3 path, retired once the
production sheet is cut over to this script. The GitHub App, repo secrets, and
the `submit-record.yml` / `sweep-stuck-rows.yml` workflows are prerequisites;
see `docs/plans/2026-05-24-pillar3a-free-auto-deploy-design.md`.

### Convert the private key first (PKCS#1 → PKCS#8)

GitHub downloads the App private key in PKCS#1 format
(`-----BEGIN RSA PRIVATE KEY-----`). Apps Script's
`Utilities.computeRsaSha256Signature` only accepts PKCS#8
(`-----BEGIN PRIVATE KEY-----`) and throws `Invalid argument: key` on the raw
download. Convert it once:

```bash
openssl pkcs8 -topk8 -inform pem -in rosen-archive-bot.private-key.pem \
  -outform pem -nocrypt -out rosen-archive-bot.pkcs8.pem
```

Paste the **contents of the PKCS#8 file** (the full `BEGIN PRIVATE KEY` block,
newlines preserved) into the `GITHUB_APP_PRIVATE_KEY` property below.

### Install the script

1. Open the "Rosen Archive URL List" sheet.
2. **Extensions → Apps Script.** Replace the contents of `Code.gs` with
   `automation/apps-script/Code.gs` from this repo. Open `appsscript.json`
   in the editor (gear icon → "Show appsscript.json") and paste this repo's
   `automation/apps-script/appsscript.json`.
3. **Project Settings → Script Properties** → add:
   - `GITHUB_APP_ID` = the App's numeric App ID (or its Client ID — either works)
   - `GITHUB_APP_INSTALL_ID` = the installation id for the rosen-frontend repo
     (Org/account → Settings → GitHub Apps → the App → Install, the id in the
     URL; or `GET /app/installations` as the App)
   - `GITHUB_APP_PRIVATE_KEY` = the PKCS#8 PEM from the conversion step above

   Optional — set only on handoff if the repo was transferred to a different
   account or org (they default to the current repo):
   - `GITHUB_OWNER` (default `jamditis`)
   - `GITHUB_REPO` (default `rosen-frontend`)
   - `GITHUB_WORKFLOW_FILE` (default `submit-record.yml`)
4. Save the project. From the editor, select `setup` from the function
   dropdown and **Run**. Authorize when prompted (the script needs
   `script.external_request` for the GitHub POSTs and `spreadsheets.currentonly`
   to write status back). You should see "Installed onEdit trigger for
   spreadsheet <id>" in the execution log.
5. Select `verifyAuth` from the function dropdown and **Run**. This mints a JWT
   and exchanges it for an installation token without dispatching anything or
   touching the sheet — "Auth OK" in the log confirms the credentials are good
   before you rely on a live checkbox tick. A failure here means the App ID,
   installation id, or private key (most often the key — re-check the PKCS#8
   conversion) is wrong.

The trigger is now live. Test it by pasting a URL into column B of a fresh
row and ticking the checkbox in column E.

---

## End-to-end smoke test

Run one cycle with a test URL against a TEST sheet (not the production one) so
any wiring error surfaces in a non-Jay-facing context. `example.com` is
reserved for documentation (RFC 2606) and won't hit a real publisher.

1. Add a row to the queue sheet:
   - B: `https://example.com/test-rosen-archive-` + ISO date
   - E: tick

2. Within ~5 seconds, column F should read `submitted` — the Apps Script
   dispatch reached GitHub. (If it reads `error`, H has the reason: a 401/403
   means the App credentials or permissions are wrong; a 404 means the
   owner/repo/workflow-file properties don't resolve.)
3. Open the repo's **Actions** tab → the "Pillar 3a — submit record" run. The
   workflow does the full pipeline (scrape, categorize, append CSV, regen JSON,
   test, push, SFTP, sheet writeback). End-to-end latency is ~10–15 min on a
   cold runner.
4. Column F should bump to `live` and column G should hold the new record ID —
   both written back by the Action via the service account, not by Apps Script.
5. Refresh `https://pressthink.org/j/rosen-archive/` — the new entry should be
   visible.

If anything fails, F gets `error` and H gets the reason — start there, then the
Action run log.

---

## Day-2 operations

### Restart after a config change

```bash
ssh houseofjawn "sudo systemctl restart rosen-submission"
```

### Watch the log

```bash
ssh houseofjawn "sudo journalctl -u rosen-submission -f"
```

### Re-deploy after a code change

```bash
ssh houseofjawn "cd ~/projects/rosen-frontend && git pull && \
  cd backend && poetry install && sudo systemctl restart rosen-submission"
```

### When SFTP push fails

`/queue` will show `is_processing: false` and the last run summary. The
submission's row in the sheet will read `archived` with an error string in
column H ("Archived; live push will retry next batch ..."). The next batch
re-pushes the same JSON (SFTP overwrites are idempotent — the staging dir
is the source of truth) so the row goes live without manual intervention.

If the push is failing repeatedly, check:
1. `pass show claude/rosen/wp-admin` matches `/etc/rosen-submission.env`.
2. `~jamditis/.ssh/known_hosts` has the SFTP host's key.
3. The remote path exists and is writable.

### Adding a new submitter (e.g. Hali)

Share the queue sheet with their Google account (Editor access). No code
change. The Apps Script trigger fires for any sheet editor.

### Rotating the GitHub App private key (Pillar 3a)

The Apps Script authenticates with the App private key, not a shared token.
To rotate (or after a suspected key leak):

1. In the App settings (Settings → Developer settings → GitHub Apps → the App),
   generate a new private key and revoke the old one.
2. Convert the new key to PKCS#8 (see "Convert the private key first" above).
3. Update the `GITHUB_APP_PRIVATE_KEY` script property with the PKCS#8 contents.
4. Run `verifyAuth` from the editor to confirm the new key works.

Don't worry about race conditions — the worst case is one or two failed
submissions during the swap, all visible as `error` in column F.

### Rotating the legacy Flask token (Pillar 3, transitional)

Only relevant while the Flask server is still running:

1. `openssl rand -hex 32` → new token.
2. Update `/etc/rosen-submission.env`, restart the service.

---

## Post-handoff (Pillar 3a)

The post-handoff design that removes the houseofjawn dependency is Pillar 3a,
now built: Apps Script dispatches `submit-record.yml` directly via the GitHub
App (above), and the whole pipeline runs in a GitHub Action on the public repo.
No Cloudflare Worker, no Flask server, nothing on Joe's machines in the path.

- Design + architecture: `docs/plans/2026-05-24-pillar3a-free-auto-deploy-design.md`
- Handoff steps (repo transfer, fresh App, service account, secrets) are in
  that design's "Handoff steps" section.

The sheet, the schema, and the columns don't change. The only Apps Script
change at handoff is repointing the `GITHUB_OWNER` / `GITHUB_REPO` script
properties if the repo moved to a new account or org.

(An earlier draft of this section proposed a Cloudflare Worker; the ownership
research in the Pillar 3a design ruled that out — Workers can't transfer
between accounts — in favor of the Apps-Script-direct-dispatch flow.)
