# Jay Rosen's Internet Archive: handoff package

**For**: Jay Rosen, Hali Rosen, and any future operator picking up this archive after Joe Amditis steps back.

**About this doc**: the operational reference for keeping the archive alive and useful. Who maintains what, what to do when something breaks, when each piece is expected to need attention, and how to escalate if it's beyond your comfort zone.

**Last updated**: 2026-05-25

> **Architecture assumption**: this doc describes the post-handoff state, which assumes Pillar 3a (Apps Script → GitHub App → GitHub Action ingestion, designed in `docs/plans/2026-05-24-pillar3a-free-auto-deploy-design.md`) is deployed and the era taxonomy normalization (PR #218) is merged. **Until Pillar 3a is built**, the live system is still Pillar 3: Apps Script POSTs to a Flask submission server running on houseofjawn, with credentials wired via `SUBMISSION_URL` / `SUBMISSION_TOKEN`. The day-to-day failure modes and recovery steps in this doc only apply once Pillar 3a is in production — if a problem hits before then, see `automation/SETUP.md` for the current (Pillar 3) operational guide.

> **Legacy submission limit**: while the Flask submission server is in use, `/submit` is rate-limited by client IP and supplied token. Defaults are 5 submissions per minute and 30 submissions per hour. Override only if Jay's real submission volume needs it with `SUBMISSION_RATE_LIMIT_PER_MINUTE` and `SUBMISSION_RATE_LIMIT_PER_HOUR`.

---

## TL;DR for Jay

If you only read one paragraph: the archive is at `pressthink.org/j/rosen-archive/`. You add new content by ticking a checkbox in a Google Sheet — full instructions are in [`JAY_ADDING_RECORDS.md`](JAY_ADDING_RECORDS.md). If something looks wrong on the live archive, ask Hali first; if Hali isn't available and it's urgent, email Joe at `jamditis@gmail.com`. The archive runs at $0/mo after Joe steps back — no monthly bills will land on you.

---

## The stack at a glance

| Layer | What it does | Who owns it | What it costs |
|---|---|---|---|
| Google Sheet "Rosen Archive URL List" | Jay's submission inbox; status updates write back here | Jay (Sheet owner) | $0 (free Google account) |
| Apps Script (bound to the Sheet) | Validates URLs, POSTs new submissions to GitHub, writes status updates back to the Sheet | Whoever owns the Sheet's Google account (Jay or Hali) | $0 |
| `jamditis/rosen-frontend` GitHub repo | Source of truth for archive data + code | Transferred from Joe to Jay/Hali at handoff (see "Handoff steps" below) | $0 (public repo, free Actions) |
| GitHub App `rosen-archive-bot` | Authenticates Apps Script → GitHub workflow dispatch | Recreated under Jay/Hali account at handoff | $0 |
| GitHub Action `submit-record.yml` | Scrapes the new URL, categorizes, appends to archive, regenerates JSON, pushes to live site | Self-running; lives in the repo | $0 (public-repo Actions are unmetered) |
| Bluehost SFTP → `pressthink.org/j/rosen-archive/` | The live archive readers see | Jay (already pays for Bluehost WP hosting) | Whatever Jay already pays for Bluehost; NO marginal cost |
| Gemini API (for categorization) | Auto-tags new submissions with themes/concepts/eras | Jay or Hali's free-tier Gemini key | $0 (free tier handles ~10 submissions/day with ~150x headroom) |

**Nothing in this stack will start charging anyone money after the handoff.** The only $$ is Jay's existing Bluehost WP hosting, which exists independent of this archive.

---

## Who does what

### Jay
- **Adds new content** by ticking the checkbox in the Sheet (per `JAY_ADDING_RECORDS.md`)
- **Reviews/edits** records via the archive UI or by hand-editing the CSV through a PR (Hali helps with PRs)
- **Decides what's in scope** for the archive (Jay's editorial judgment)

### Hali
- **Day-to-day operator** — handles the "Column F says error, what do I do" questions Jay can't self-serve
- **Coordinates PRs** when Jay wants to hand-edit records or fix something
- **Knows the GitHub repo's surface** at the level of "I can open a PR, address a Copilot review comment, merge it"

### The system (no human required)
- New URL ticked in Sheet → Apps Script → GitHub Action → scrapes + categorizes + commits + deploys → status writes back to Sheet
- Stuck-row sweeper runs every 6 hours and re-dispatches anything stuck at "submitted > 30 min"

### Joe
- **Not in the critical path** after handoff completes
- Available for "the world has changed and we need to redesign X" calls — but not for "Column F says error" calls
- Won't push code, won't approve PRs, won't pay any bills

---

## Failure modes and what to do

### Jay's submission shows `error` in Column F

1. Read Column H — it tells you in plain English what went wrong (per `JAY_ADDING_RECORDS.md` "What if Column F says error?")
2. If it says `URL already exists in archive` — already there, no action
3. If it says `URL cannot be accepted` — bad URL, fix Column B and re-tick
4. If it says `Network: ...` — temporary, untick + retick
5. If it says `Scrape returned no content` — the page is gone; try the Wayback Machine URL instead (paste `https://web.archive.org/web/<URL>` in Column B)
6. Anything else: **ask Hali** with the row's contents

### The live archive isn't showing recent submissions

1. Check the GitHub Action run history at `https://github.com/<owner>/rosen-frontend/actions/workflows/submit-record.yml`
2. If recent runs show "failure" — Hali clicks into the latest failed run, reads the error, addresses or pings Joe
3. If recent runs show "success" but the live site is stale — Bluehost SFTP push may be failing silently. Check `Column F` for any rows stuck at `archived` (those are the ones the SFTP push didn't deliver). The next successful submission will retry the push and clear the backlog.

### The Sheet is unresponsive (Apps Script trigger not firing)

1. Open the Sheet → Extensions → Apps Script
2. Run the `setup()` function once — re-installs the trigger
3. If `setup()` fails with "missing script property" — the script needs `GITHUB_APP_ID`, `GITHUB_APP_INSTALL_ID`, `GITHUB_APP_PRIVATE_KEY` set under Project Settings → Script Properties. Get these from Joe (or recreate per "Handoff steps" if Joe is already disengaged).

### GitHub Action fails on every submission

1. Most common cause: a repo secret expired or got rotated
2. Check repo Settings → Secrets and variables → Actions. Required secrets (names match `backend/submission_server/sheets_callback.py` and `sftp_push.py`):
   - `ROSEN_SFTP_HOST`, `ROSEN_SFTP_USER`, `ROSEN_SFTP_REMOTE_PATH`, `ROSEN_SFTP_KNOWN_HOSTS` (Bluehost endpoint info)
   - one of: `ROSEN_SFTP_PASSWORD` (password auth) OR `ROSEN_SFTP_KEY_PATH` (private-key file, preferred)
   - optional: `ROSEN_SFTP_KEY_PASSPHRASE` (only when the private key is encrypted)
   - `GEMINI_API_KEY` (for categorization)
   - one of: `ROSEN_SHEETS_SA_KEY` (path to service-account JSON file) OR `ROSEN_SHEETS_SA_KEY_JSON` (inline JSON content), for sheet writeback
3. Rotate any that expired; Hali can do this with values from Jay's Bluehost cPanel + Jay's Gemini key

### The GitHub App private key leaks or is suspected compromised

1. GitHub → Settings → Developer settings → GitHub Apps → `rosen-archive-bot`
2. Generate a new private key; revoke the old one
3. Update the `GITHUB_APP_PRIVATE_KEY` script property in the Sheet's Apps Script (~5 min recovery)

### Bluehost rotates the SFTP password

1. New password lands in Jay's Bluehost cPanel
2. Hali updates the `ROSEN_SFTP_PASSWORD` repo secret to match (or `ROSEN_SFTP_KEY_PATH` if Bluehost rotated to key-only auth)
3. Next submission deploys cleanly; until then submissions land as `archived` in Column F

### Categorization (Gemini) starts failing

The system is designed to fail soft here — submissions still succeed, the record commits with `categories=["uncategorized"]` and `low_confidence=true`. Hali or Jay can hand-edit the categories later via a PR. No emergency; just a quality-of-categorization issue.

If categorization fails on EVERY submission for a sustained period:
1. The Gemini API key may have hit a rate limit or been revoked
2. Generate a new key at `aistudio.google.com`; update `GEMINI_API_KEY` repo secret

---

## Handoff steps (Joe → Jay/Hali)

Estimated total time: ~2 hours, all one-time. Best done with Joe on a call or in person.

1. **GitHub repo transfer**: Joe → Settings → Transfer ownership → Jay or Hali's GitHub username. Repo secrets carry over; old URLs redirect.
2. **GitHub App recreate**: GitHub Apps cannot be transferred. Jay or Hali creates a new `rosen-archive-bot` App on their own GitHub account. Permissions: `Contents: write`, `Actions: write`, `Metadata: read`. Install on the (now-transferred) repo. Generate a private key.
3. **Apps Script recreate**: Bound Apps Script does NOT transfer with the Sheet. Jay opens the queue Sheet → Extensions → Apps Script → File → New → Project. Pastes the contents of `automation/apps-script/Code.gs` from the repo. Sets the three script properties to match the new GitHub App. Runs `setup()` once.
4. **GCP project + service account migration**: if Jay or Hali has a Google Workspace account (university, paid Workspace), create a fresh GCP project under that account. Enable Sheets API. Create a service account. Download JSON. Update `SHEETS_SA_KEY` repo secret. Share the queue Sheet with the new service account's email (Editor). **If only personal Gmail accounts are available**, this still works but be aware: Google deletes personal accounts after 2 years of inactivity (Dec 2023 policy onward), taking the GCP project with them. Workspace accounts are exempt.
5. **Gemini API key swap**: Jay or Hali generates their own Gemini API key from `aistudio.google.com`. Update `GEMINI_API_KEY` repo secret.
6. **SFTP credentials sync**: confirm current Bluehost SFTP creds match `ROSEN_SFTP_*` repo secrets. Rotate if stale.
7. **Decommission Pillar 3 (houseofjawn)**: Joe runs `sudo systemctl disable --now rosen-submission` on houseofjawn. Removes the Cloudflare tunnel entry for `rosen-submit.amditis.tech`. Deletes the DNS record. (Only matters if Pillar 3 was ever deployed — currently blocked on Joe per task #31.)

After step 7, nothing on Joe's machines, accounts, or domains is in the archive's critical path.

---

## Retirement timeline

Joe disengages on a soft timeline driven by Jay's pace, not a fixed date. The expected sequence:

1. **Now → Wednesday May 27 demo call**: Joe walks Jay through the live system, addresses any concerns, gets Jay's sign-off.
2. **May 27 → ~30 days**: parallel-run period. Joe stays available for quick fixes; Hali starts handling everyday operator questions. Any architectural feedback from Jay lands in this window.
3. **~30 days post-call**: handoff steps 1-6 above execute. Joe transfers repo to Jay/Hali; everything else recreates.
4. **~60 days post-call**: handoff step 7 (decommission houseofjawn dependencies) if Pillar 3 deploy ever happened.
5. **Steady state**: archive runs unattended. Hali is the day-to-day operator. Joe is available for "the world has changed" calls but not "Column F says error" calls.

This timeline is intentionally not a contract — slide it later or earlier based on Jay's comfort.

---

## What's INTENTIONALLY left out

This handoff doc does NOT cover:

- **Pillar 3a operational details** beyond the framework above — those live in the design spec at `docs/plans/2026-05-24-pillar3a-free-auto-deploy-design.md` (which lands in this repo when PR #214 merges) and the eventual implementation. When Pillar 3a is implemented, update the relevant sections of this doc (the "Failure modes" section especially).
- **Hand-editing records via PR** — that's the normal GitHub PR workflow; if Hali isn't comfortable with PRs yet, ask Joe for a 30-min walkthrough during the parallel-run period.
- **Adding new categorization themes / eras** — the existing 8 canonical eras and 6 categories (in `data/SCHEMA.md`, established by PR #218) cover Jay's existing work. Adding new ones is a separate scope decision that needs Jay's editorial judgment + a PR.
- **What to do if Bluehost goes away or rates rise unacceptably** — that's a "redesign X" conversation; call Joe.
- **What to do if GitHub starts charging for public-repo Actions** — currently unmetered per the 2026 pricing announcement; if that changes, call Joe.

---

## Escalation path

| Situation | Who to call |
|---|---|
| "Column F says error, I don't understand the message" | Hali |
| "The whole sheet is broken" | Hali → Joe |
| "I want to bulk-edit categories" | Hali (with PR) |
| "I want to add a whole new platform (e.g., Substack newsletter)" | Joe |
| "Something architectural needs to change" | Joe |
| "GitHub / Bluehost / Google are doing something unexpected" | Joe |
| "I want to sunset the archive" | Joe + Jay (joint decision) |

---

## Living-doc maintenance

This doc should be updated whenever:
- A handoff step changes (e.g., GCP project moves to a new account)
- A failure mode is encountered that isn't covered above
- A repo secret rotates
- The escalation contacts change

Update it as a normal PR. The point is that the doc reflects the actual operational state, not the originally-planned state.
