# Batch maintenance runbook

How to run the archive's out-of-band maintenance jobs after Joe steps back, and
which job to reach for. Design: `docs/plans/2026-05-29-batch-maintenance-runner-design.md`.

These jobs are separate from the submission path (Pillar 3a). Submissions add
new records automatically when a curator ticks a row in the queue sheet. The
maintenance jobs *enrich and reconcile* the archive over time, and run only when
a person triggers them. This is deliberate: the workflow has no schedule and
does not run after a submission, merge, or deploy.

---

## Which job, when

| Job | What it does | Where it writes | Spends money? |
|---|---|---|---|
| `key_concepts` | Tags articles with Jay Rosen's 13 key concepts using Gemini | master sheet (`archive_records` by default) | yes (Gemini free tier) |
| `dedup` | Normalizes multi-value cells; deterministic | master sheet (`archive_records` by default) | no |
| `sync_to_archive` | Merges the sheet's enriched columns into the repo CSV, regenerates JSON, runs tests, and opens a PR | a review PR (then the live site after merge + deploy) | no |

The usual order: enrich the sheet (`key_concepts`, `dedup`), then carry the
results into the archive with `sync_to_archive`. Enrichment left in the sheet
never reaches the live site until a sync runs.

---

## Running a job

1. Go to the repo's **Actions** tab -> **Batch maintenance runner** -> **Run workflow**.
2. Pick the **job**, a **limit**, and leave **dry_run** checked for the first run.
3. Read the run log. A dry run logs every cell it *would* change plus a per-field
   count, and writes nothing.
4. Uncheck **dry_run** and re-run to apply. Escalate the limit as you gain
   confidence: **5 -> 25 -> 100**, never the whole archive in one run (a run that
   exceeds the 6-hour Action cap is killed mid-write).

The workflow checks its job-specific configuration before installing
dependencies or minting a GitHub App token. All jobs require the sheet name and
service-account credential. Only `key_concepts` requires Gemini, and only
`sync_to_archive` requires the GitHub App.

### Why dry-run first, every time

A live `key_concepts` run that calls Gemini but writes zero cells is the
"$0.53 wasted -- the AI ran and nothing was saved" failure. The job guards
against it: a live run with Gemini calls and zero writes **exits non-zero**, so
the Action shows red instead of a green run that quietly changed nothing. The
dry run is your chance to confirm the job will actually write before it spends
anything.

---

## `sync_to_archive`: review, merge, deploy

`sync_to_archive` does **not** push to `main` or to the live site. It:

1. merges the sheet's enriched columns into `data/archive_records-public.csv`,
2. regenerates the JSON and runs `npm test` (a bad value fails here and aborts),
3. commits to a fresh `sync/master-sheet-<run-id>` branch and **opens a PR**.

The merge is additive and never destructive:

- enrichment columns (`key_concepts`, `thematic_categories`, `tags`, `summary`,
  `excerpt`, `pull_quote`, `scope`, `era`, `content_type`) take the sheet's
  non-empty value; an empty sheet cell never blanks the CSV;
- fill-only columns (`raw_text`, `publication_date`, `word_count`) are written
  only into an empty CSV cell -- an existing value is never overwritten, so
  `raw_text` is never blanked or shortened;
- `id`, `url`, `verified`, `notes`, and everything else are left untouched.

To go live: **review the PR**, let its CI pass, then merge it with **Create a
merge commit**. Do not squash or rebase a `sync/master-sheet-*` PR: its second
commit stamps the first data commit as the census input, so both commits must
remain intact. Then run the **Pillar 3c deploy** workflow (`deploy.yml`) to push
the full site to pressthink.org. The sync and the deploy are deliberately two
steps so a human sees the data diff before it ships.

---

## Required repo configuration

Set these under Settings -> Secrets and variables -> Actions:

| Secret | Used by | Notes |
|---|---|---|
| `ROSEN_SHEETS_SA_KEY_JSON` | all jobs | service-account JSON (inline). Share the sheet with the service account's email as Editor. |
| `SPREADSHEET_NAME` | all jobs | exact name of the master sheet. The jobs open it by name; a wrong or missing value fails fast. |
| `GEMINI_API_KEY` | `key_concepts` | Gemini free-tier key from aistudio.google.com. |
| `ROSEN_GH_APP_ID`, `ROSEN_GH_APP_PRIVATE_KEY` | `sync_to_archive` | the same `rosen-archive-bot` App as Pillar 3a. The App needs **Contents: write** and **Pull requests: write** so it can push the branch and open the PR. |

The scripts use the current `archive_records` tab by default. To target a
different compatible tab, set the Actions **repository variable**
`ROSEN_MASTER_SHEET_TAB` to its exact name. Use a variable, not a secret: the
tab name is configuration and does not contain a credential. Codespaces and
local runs can set the environment variable with the same name.

`sync_to_archive` opens the PR with the App token (not the default
`GITHUB_TOKEN`) on purpose: a PR opened by `GITHUB_TOKEN` would not trigger the
PR's own CI.

---

## Durable key-concept progress

The `key_concepts` Action stores a task receipt beside each source row in the
master sheet. The first live eligible write adds the
`key_concepts_task_receipt` header. It writes that header, the row output, and
the receipt in one Google Sheets batch request. [Google Sheets applies all
updates in a request atomically](https://developers.google.com/workspace/sheets/api/limits),
so a failed request cannot leave an output without its receipt. A dry run logs
the same task keys but does not add the header or write a receipt.
If the receipt needs another grid column, the live run adds only the required
empty columns before a model call. It preserves populated cells without headers.

Each receipt binds the stable record ID, source text, current curator-assigned
concepts, ordered taxonomy, force mode, rule version, model version, and task
version. It also records the concept state expected after the write. An
unchanged receipt skips the row before a model call. A source, curator input,
taxonomy, rule, or model change makes the row eligible again. Malformed
receipts and missing or duplicate record IDs stop the run before a model call.

The local `key_concepts_progress.json` cursor remains available for attended
commands that omit `--durable-progress`. It is not imported as a receipt
because a row number does not prove a stable record identity or a completed
Sheet write.

Progress behavior for the other jobs is unchanged:

- **`dedup`** is deterministic and idempotent. Its limit counts rows that need
  changes, not the clean rows it scans. Repeated applied runs therefore advance
  through the sheet, and the normalized sheet cells are the durable completion
  state. Use `0` (no cap) when you want one full pass; it makes no AI calls.

### Legacy entity-mention pass

The old dedup command also recomputed `entity_mentions` in a separate
`entities` tab. The current workbook path uses `archive_records`, so that
legacy cross-tab pass is disabled by default and is not enabled by the Actions
workflow. Run it only against a workbook that still has the compatible legacy
schema by invoking the script directly with
`--recompute-legacy-entity-mentions`. Start with `--dry-run` and set
`ROSEN_MASTER_SHEET_TAB` to the intended source tab when it is not
`archive_records`.

---

## Codespaces track (interactive + break-glass)

For the entity-extraction Ralph Loop, hand-tuned passes, or pushing data by
hand when an Action is broken:

1. On the repo, **Code -> Codespaces -> Create codespace on main**. The
   devcontainer pins Node 22 + Poetry + Playwright Chromium and installs deps on
   create (`.devcontainer/devcontainer.json`).
2. Add `SPREADSHEET_NAME`, `GEMINI_API_KEY`, and `ROSEN_SHEETS_SA_KEY_JSON` as
   **Codespaces secrets** (Settings -> Codespaces) so they arrive as env vars.
   Set `ROSEN_MASTER_SHEET_TAB` only when you need to override the default
   `archive_records` tab.
3. Run the same commands the Action runs, e.g.:
   ```bash
   poetry -C backend run python -m rosen_scraper.key_concepts_updater --limit 100 --dry-run
   poetry -C backend run python scripts/diagnostics/data_deduper.py --limit 0 --dry-run
   ```
   Drop `--dry-run` to apply. Add `--durable-progress` to use the same Sheet
   receipts as the Action. Without that flag, the Codespace keeps the legacy
   `key_concepts_progress.json` cursor for manual compatibility.

The free Codespaces tier (~60-120 core-hours/month) covers this volume, and the
Codespace transfers to Jay/Hali with the repo.

### Cloud Shell is the fallback, not the primary

Google Cloud Shell needs no setup and is already inside a Google login, so it is
fine for a quick attended run. It is **not** where to build the handoff: its
`$HOME` is deleted after 120 days idle and dies with the owning Google account
(the exact fragility the archive engineered around), it has a 40-minute
non-interactive kill and a 50-hour weekly cap, and it cannot host the runner.
Prefer the Codespace.

---

## Follow-ups (not in v1)

- `backfill_raw_text` / `backfill_dates` jobs added to the picker.
- Headless entity extraction via `claude -p` / `gemini -p` so the backlog grinds
  down unattended in CI.

These are tracked in the design doc's "Pieces to build" table (pieces 5-6).
