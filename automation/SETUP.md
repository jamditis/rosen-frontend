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

1. Open the "Rosen Archive URL List" sheet.
2. **Extensions → Apps Script.** Replace the contents of `Code.gs` with
   `automation/apps-script/Code.gs` from this repo. Open `appsscript.json`
   in the editor (gear icon → "Show appsscript.json") and paste this repo's
   `automation/apps-script/appsscript.json`.
3. **Project Settings → Script Properties** → add two properties:
   - `SUBMISSION_URL` = `https://rosen-submit.amditis.tech/submit`
   - `SUBMISSION_TOKEN` = the token from `/etc/rosen-submission.env`
4. Save the project. From the editor, select `setup` from the function
   dropdown and **Run**. Authorize when prompted (the script needs
   `script.external_request` for the HTTPS POST and `spreadsheets.currentonly`
   to write status back). You should see "Installed onEdit trigger for
   spreadsheet <id>" in the execution log.

The trigger is now live. Test it by pasting a URL into column B of a fresh
row and ticking the checkbox in column E.

---

## End-to-end smoke test

Before the Wednesday demo, run one cycle with a test URL so any wiring
error surfaces in a non-Jay-facing context.

1. Add a row to the queue sheet:
   - B: `https://example.com/test-rosen-archive-` + ISO date
   - E: tick

2. Within ~5 seconds, column F should read `submitted`.
3. Watch the server-side logs: `journalctl -u rosen-submission -f`.
4. Trigger processing manually:
   ```bash
   curl -X POST -H "X-Auth-Token: <token>" https://rosen-submit.amditis.tech/process
   ```
   (Or wait for the scheduler cron if it's installed.)
5. Column F should bump to `live` and column G should hold the new record ID.
6. Refresh `https://summit.pressthink.org/j/rosen-archive/` — the new entry
   should be visible.

If anything fails, F gets `error` and H gets the reason — start there.

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

### Rotating the auth token

1. `openssl rand -hex 32` → new token.
2. Update `/etc/rosen-submission.env`, restart the service.
3. Update Apps Script property `SUBMISSION_TOKEN`.

Don't worry about race conditions — the worst case is one or two failed
submissions during the swap, all visible as `error` in column F.

---

## Phase 2 migration (post-handoff)

Once Joe steps back, replace the houseofjawn dependency:

- Apps Script keeps doing input + queueing + status writeback.
- New Cloudflare Worker (free tier 100k req/day) replaces the Flask server:
  scrape via Wayback, simple categorization via Gemini free tier, GitHub
  REST API to open PR.
- GitHub Actions on the public repo runs tests, auto-merges on green,
  cron-pushes via SFTP from an Action.

The sheet, the schema, and the Apps Script don't change — only the URL the
Apps Script POSTs to. See the Phase 2 section of the design doc.
