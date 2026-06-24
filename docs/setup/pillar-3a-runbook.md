# Pillar 3a setup runbook

Operator-facing setup doc for the Pillar 3a free auto-deploy pipeline (`submit-record.yml` + `sweep-stuck-rows.yml`).

Until both blocks below are done, both workflows are inert — a sweep tick or a manual `submit-record` dispatch will fail visibly in the Actions tab but cause no damage to the live archive.

Total time: ~30 minutes hands-on.

Design source of truth: `docs/plans/2026-05-24-pillar3a-free-auto-deploy-design.md`. Tracking issue: [#226](https://github.com/jamditis/rosen-frontend/issues/226). Sibling Pillar 3 (now superseded) runbook: `automation/SETUP.md`.

---

## Pre-flight: verified value sources

Values were verified on houseofjawn 2026-05-28 (wake-20260528T0805-d0b994). Use the corrected sources below — the original issue body's assertions about pass entries were stale.

| Secret | Verified source | Notes |
|---|---|---|
| `ROSEN_GH_APP_ID` | Block 1 step 9 | Plain integer |
| `ROSEN_GH_APP_PRIVATE_KEY` | Block 1 step 8 | Paste the whole `.pem` including `-----BEGIN`/`-----END` |
| `GEMINI_API_KEY` | `pass show claude/api/gemini-rosen` | Rosen-specific Gemini key (separate from generic `claude/api/gemini` for quota isolation) |
| `ROSEN_SHEETS_SA_KEY_JSON` | `pass show claude/google/rosen-service-account-full` | One-line JSON; paste verbatim. Note: NOT `claude/rosen/...` or `claude/api/...` — older docs are stale |
| `ROSEN_QUEUE_SHEET_ID` | Created by Block 0 below | New sheet for the Pillar 3a queue |
| `ROSEN_QUEUE_SHEET_TAB` | `Sheet1` | Set only if you rename the tab |
| `ROSEN_SFTP_HOST` | Bluehost cPanel → FTP accounts | Not in `pass`. See "SFTP credentials" below |
| `ROSEN_SFTP_USER` | Bluehost cPanel | Same |
| `ROSEN_SFTP_PASSWORD` | Bluehost cPanel | Same |
| `ROSEN_SFTP_REMOTE_PATH` | See "SFTP remote path" below | Two candidates in existing docs — verify against current manual deploy practice |
| `ROSEN_SFTP_KNOWN_HOSTS` | `ssh-keyscan` output, captured after Block 1 | Pins host key; rejects MITM. Paste all of the inline `ssh-keyscan` output (every host-key line), not just one — the code accepts inline contents or a path (#408); see "Capturing the host key" below |

Optional (only if switching from password to key auth later):

| Secret | When needed |
|---|---|
| `ROSEN_SFTP_PORT` | Bluehost defaults to 22; set only if non-standard |
| `ROSEN_SFTP_KEY_PATH` | Path inside the runner — usually only set after also providing the key via a separate secret pipeline |
| `ROSEN_SFTP_KEY_PASSPHRASE` | Only if the key is encrypted |

**Total: 11 required secrets + 3 optional**, all consumed by `submit-record.yml` or `sweep-stuck-rows.yml`. Sources verified via `grep -oE 'secrets\.ROSEN_[A-Z_]+|secrets\.GEMINI_[A-Z_]+' .github/workflows/{submit-record,sweep-stuck-rows}.yml`.

### SFTP credentials

There is no `claude/rosen/sftp` or similar pass entry — none of the existing SFTP pass entries (`nestify-sftp`, `collabj-sftp`, `njcic-sftp`, `hawk/sftp-*`) point at pressthink.org. The earlier Pillar 3 work assumed `claude/rosen/wp-admin`, but that entry is the WordPress login (URL + admin email + password), not SFTP.

Get the SFTP creds from Bluehost cPanel:

1. Log in to Bluehost (account that owns pressthink.org).
2. cPanel → "FTP Accounts" → either reuse an existing account or "Create FTP Account" scoped to the `rosen-archive` directory (recommended — limits blast radius).
3. The cPanel page shows: server (`ftp.<your-domain>` or a `boxNNNN.bluehost.com` host), username (`<user>@<your-domain>`), and lets you set/reset the password.

Once you have the values, also save them to `pass` for future deploy work:

```bash
pass insert claude/rosen/sftp
# then paste a multi-line entry:
#   host: ftp.pressthink.org   (or boxNNNN.bluehost.com)
#   port: 22
#   user: <user>@pressthink.org
#   password: <password>
#   remote_path: /<verified-path-below>
```

### SFTP remote path

Two paths appear in existing docs; verify against your current manual FTP deploy practice before populating the secret:

- `DEPLOYMENT.md` (manual deploy guide, line 3): `/wp-content/rosen-archive/`
- `automation/SETUP.md` (Pillar 3 design): `<remote>/j/rosen-archive/data/`
- `backend/submission_server/sftp_push.py` docstring example: `/home/u/public_html/j/rosen-archive/data`

The live URL `pressthink.org/j/rosen-archive/` strongly suggests the second pattern (`<docroot>/j/rosen-archive/`). The data subdirectory is what gets the four JSONs — so the value should end in `/data`.

To verify before pasting:

```bash
# Read sftp_push.py to confirm it writes to <REMOTE_PATH>/archive-*.json (no further suffix)
grep -A2 'remote_final' backend/submission_server/sftp_push.py
```

`sftp_push.py:181` writes `f"{cfg['remote_path']}/{filename}"` — so `ROSEN_SFTP_REMOTE_PATH` must be the directory that directly contains the four `archive-*.json` files on the live site.

### Capturing the host key

Defer this step until you have the SFTP host from cPanel. Then on houseofjawn:

```bash
# Replace <HOST> and <PORT> with the values from cPanel
ssh-keyscan -p <PORT> <HOST> 2>/dev/null
```

`ssh-keyscan` prints one line per host-key type the server offers, each in the form `<host> <key-type> <key-body>` (or `[<host>]:<port> ...` for non-default ports). Paste **every line it emits** (all host-key types), each with its **hostname prefix** — the `known_hosts` format requires the hostname as the first field, and `paramiko`'s `RejectPolicy` matches the connect host against it. Keep all the lines, not just one: `paramiko` accepts only whichever host-key algorithm the server negotiates at connect time, so a single pasted line still rejects if the server picks a different type. Pasting only the `ssh-rsa AAAA…` body (no hostname) would leave no host mapping and every push would reject.

`backend/submission_server/sftp_push.py:159` enforces `RejectPolicy`, so a missing or mismatched key fails the push rather than silently trusting a MITM. This is intentional for a production-writeable deploy step.

#### Host-key handling (resolved in code — #408)

`ROSEN_SFTP_KNOWN_HOSTS` can hold **either** a path to a `known_hosts` file on the runner **or** the raw `ssh-keyscan` line(s) inline. `sftp_push.py:142-158` checks whether the value is an existing file: if so it loads it directly; otherwise it treats the value as inline `known_hosts` contents, writes them to a temp file, and loads that. `set_missing_host_key_policy(RejectPolicy())` then still rejects any unpinned host. So pasting the `ssh-keyscan` output straight into the secret works as-is — **no `submit-record.yml` patch is required**.

This closed the earlier inline-vs-path foot-gun: a secret holding inline contents used to fall through `load_host_keys`, leaving `RejectPolicy` to block every push with `Server '<host>' not found in known_hosts`. The fix landed in PR #408; issues #298 and #304 track it. The workflow passes the secret straight through, which is now correct for either shape.

Before Smoke 3, sanity-check that the secret holds **all** of the `ssh-keyscan` output — every host-key line (`<host> <key-type> <key-body>`, hostname first — see "Capturing the host key" above), not just one line or the `ssh-rsa AAAA…` body alone. `paramiko` accepts only the host-key type the server negotiates, so a one-line or body-only value can still reject the connect host — the same failure, one step later. Validate the secret against the full `ssh-keyscan` output before dispatching, not at push time.

---

## Block 0 — Create the queue sheet

The sweep workflow needs a Google Sheet to read submission rows from. The submit workflow writes status back to that same sheet.

1. Drive → New → Google Sheets → name it "Rosen Archive submission queue" (or whatever).
2. Tab name stays `Sheet1` unless you have a reason to rename it (saves you setting `ROSEN_QUEUE_SHEET_TAB`).
3. The columns are populated by the Apps Script (Pillar 3a piece 1, separate PR after this setup). For now an empty sheet is fine.
4. Share the sheet with the service-account email from `pass show claude/google/rosen-service-account-full | jq -r .client_email` — Editor access (it needs to write status updates).
5. Copy the sheet ID from the URL — it's the long string between `/d/` and `/edit`. This is what goes in `ROSEN_QUEUE_SHEET_ID`.

---

## Block 1 — Create the `rosen-archive-bot` GitHub App

1. Go to https://github.com/settings/apps/new (creates the App under your personal account — fine for a single-repo bot).
2. **Name**: `rosen-archive-bot`
3. **Homepage URL**: `https://github.com/jamditis/rosen-frontend` (or anything; required field, not load-bearing).
4. **Webhook**: uncheck "Active". No webhook needed.
5. **Repository permissions**:
   - **Contents**: Read and write (so App-token-pushed commits land on `main`)
   - **Actions**: Read and write (so the Apps Script piece can call `workflow_dispatch` on `submit-record.yml`)
   - Leave everything else at "No access"
6. **Where can this GitHub App be installed?** → "Only on this account"
7. Click "Create GitHub App"
8. Scroll to "Private keys" → "Generate a private key" → save the `.pem` file. This is what goes in `ROSEN_GH_APP_PRIVATE_KEY`.
9. Note the **App ID** at the top of the App settings page. This is what goes in `ROSEN_GH_APP_ID`.
10. Left sidebar → "Install App" → "Install" next to your username → **Only select repositories** → pick `jamditis/rosen-frontend` → Install.

### Branch-protection bypass

The design (`docs/plans/2026-05-24-pillar3a-free-auto-deploy-design.md`, locked decision 2) requires the App to push directly to `main` without going through review. Add the bot to the bypass list:

1. Repo Settings → Branches → `main` rule → "Allow specified actors to bypass required pull requests".
2. Add `rosen-archive-bot[bot]`.

Hand-edits from humans still go through normal PRs — only the App identity bypasses.

---

## Block 2 — Add the secrets to the repo

Settings → Secrets and variables → Actions → "New repository secret" for each row in the Pre-flight table above. Reasonable order:

1. `ROSEN_GH_APP_ID` and `ROSEN_GH_APP_PRIVATE_KEY` first (smoke-testable independently — the workflow's first step mints the token, so a misconfigured App fails fast at step 1).
2. `GEMINI_API_KEY` and `ROSEN_SHEETS_SA_KEY_JSON` next (both are paste-from-pass).
3. `ROSEN_QUEUE_SHEET_ID` (and optionally `ROSEN_QUEUE_SHEET_TAB`) next.
4. `ROSEN_SFTP_*` last (requires the cPanel side trip — see "SFTP credentials" above).

### Optional: rotating away from password auth later

Key-based auth is a possible future improvement but is **not safe to enable today** — the current `submit-record.yml` doesn't materialize a private key onto the runner. `sftp_push.py:54` reads `ROSEN_SFTP_KEY_PATH` as an existing path on disk, so setting that secret alone makes Smoke 3 fail with a missing-key-file error.

Making key-auth work would mean:

1. Generate a keypair: `ssh-keygen -t ed25519 -f rosen_deploy -N ''`. Upload the public key in cPanel under "SSH Access".
2. Add a new repository secret `ROSEN_SFTP_KEY_CONTENT` holding the **body** of the private key file (the contents of `rosen_deploy`, not a path).
3. Patch `submit-record.yml` to write that secret to a temp file with `chmod 600` before the "Process submission" step runs (e.g. `echo "$ROSEN_SFTP_KEY_CONTENT" > "$RUNNER_TEMP/rosen_deploy" && chmod 600 "$RUNNER_TEMP/rosen_deploy"`).
4. Set `ROSEN_SFTP_KEY_PATH` to that temp path (and `ROSEN_SFTP_KEY_PASSPHRASE` if encrypted) instead of `ROSEN_SFTP_PASSWORD` in the env: block.

Until step 3 lands in the workflow, password auth is the only supported path — don't set `ROSEN_SFTP_KEY_PATH`.

---

## Block 3 — End-to-end smoke test

Once Blocks 0–2 are done, run this exact sequence in the Actions tab. The dedup check inside `process_submission.py` makes re-dispatch safe at every stage.

### Smoke 1 — unresolvable URL, expect red

Use a URL on the RFC 6761 `.invalid` TLD — DNS resolution always fails, so `is_safe_public_url` (`backend/src/rosen_scraper/url_safety.py:84-88`) rejects it before any fetch happens. This guarantees no accidental scrape of a live page, no commit, no SFTP push.

(Don't use `example.com` — it's RFC 2606 "reserved for documentation," but it does resolve to a real IP and serves a real HTML body, so a misconfigured pipeline could accidentally scrape and commit it.)

1. Actions → "Pillar 3a — submit record" → "Run workflow" → branch `main`. Fill the 6 inputs:
   - `url`: `https://jay-rosen-test.invalid/smoke-1`
   - `title`: `Smoke test - delete me`
   - `notes`: `Pillar 3a setup verification`
   - `sheet_id`: the queue sheet ID from Block 0
   - `sheet_tab`: `Sheet1`
   - `sheet_row`: `2`
2. **Expected**: URL safety check rejects with "host could not be resolved", `_safe_writeback` records `status='error'` in the sheet, exit non-zero, Action goes red.
3. **NOT expected**: any commit on `main`, any SFTP push, any change to `data/archive_records-public.csv`.

### Smoke 2 — known-in-archive URL, expect duplicate

4. Pick any real PressThink URL already in `data/archive_records-public.csv`. The CSV has multi-line quoted fields, so don't `grep | cut` — use a CSV-aware reader:

   ```bash
   python3 -c "
   import csv
   with open('data/archive_records-public.csv') as f:
       for r in csv.DictReader(f):
           if 'pressthink.org' in (r.get('url') or ''):
               print(r['url']); break
   "
   ```

   Or open the CSV in a spreadsheet and copy a URL from the `url` column.

5. Same dispatch flow with that URL.
6. **Expected**: dedup short-circuits, no commit, sheet writeback records `status='duplicate'`, Action goes green.

### Smoke 3 — new URL, full pipeline

7. Confirm `ROSEN_SFTP_KNOWN_HOSTS` carries all of the host's `ssh-keyscan` output — every host-key line (inline is fine — handled in code, #408); a missing, partial, or wrong key fails the push under `RejectPolicy`.
8. Pick a real PressThink URL NOT in the archive (`pressthink.org/[year]/...` from a recent post).
9. Same dispatch flow.
10. **Expected**: full pipeline runs, new `RECORD-NNNNN` commit appears on `main` from `rosen-archive-bot[bot]`, `post-merge.yml` fires, archive JSONs deploy via SFTP, live site updates within a minute of the workflow finishing.

After Smoke 3 passes, the system is live. The Apps Script piece (Pillar 3a piece 1, separate PR) is what then makes this fire from Jay's sheet edit instead of from a manual Actions UI dispatch.

---

## Operational notes

### What runs automatically

- `sweep-stuck-rows.yml` runs every 30 minutes (cron `*/30 * * * *`). Until Block 0–2 are done it will fail visibly. Either complete setup or temporarily disable the workflow in Actions UI to suppress noise.
- `submit-record.yml` only runs on `workflow_dispatch` — never auto-fires.
- `post-merge.yml` runs on every push to `main` and notifies the dashboard. Independent of Pillar 3a; works fine without it.

### Cost

Public-repo standard runners stay unmetered through the [March 2026 GHA pricing changes](https://resources.github.com/actions/2026-pricing-changes-for-github-actions/). Gemini free tier covers ~1,500 RPD ([Gemini limits](https://ai.google.dev/gemini-api/docs/rate-limits)); Jay's expected load is ~10/day.

### Troubleshooting

- **"Bad credentials" on App-token mint step**: `ROSEN_GH_APP_ID` is wrong (should be integer, not the App's slug) or `ROSEN_GH_APP_PRIVATE_KEY` was pasted without the `-----BEGIN`/`-----END` lines.
- **Push to `main` rejected**: bot not added to branch-protection bypass (Block 1 final substep).
- **SFTP fails with "Host key not in known_hosts"**: re-run `ssh-keyscan` after Bluehost reinstall; update `ROSEN_SFTP_KNOWN_HOSTS`.
- **Sheet writeback fails with 403**: service-account email wasn't added as Editor to the queue sheet (Block 0 step 4).

### Related issues + PRs

- Issue #226 — this setup as a tracking issue
- PR #225 — the workflow files themselves
- PR #223 — `process_submission.py` + `sweep_stuck.py`
- PR #214 — original design
- Resolved (PR #408, tracked by #298 / #304): `ROSEN_SFTP_KNOWN_HOSTS` inline-vs-path handling in `sftp_push.py` — the secret now accepts inline `ssh-keyscan` contents or a path, so no `submit-record.yml` patch is needed (see "Host-key handling" above)
- Next: Pillar 3a piece 1 (Apps Script v2) — separate PR after this setup is verified end-to-end

Receipt token: wake-20260528T0805-d0b994
