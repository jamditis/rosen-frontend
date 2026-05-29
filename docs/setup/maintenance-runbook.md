# Batch maintenance runbook

How to run the archive's out-of-band maintenance jobs after Joe steps back, and
which job to reach for. Design: `docs/plans/2026-05-29-batch-maintenance-runner-design.md`.

These jobs are separate from the submission path (Pillar 3a). Submissions add
new records automatically when a curator ticks a row in the queue sheet. The
maintenance jobs *enrich and reconcile* the archive over time, and run only when
a person triggers them.

---

## Which job, when

| Job | What it does | Where it writes | Spends money? |
|---|---|---|---|
| `key_concepts` | Tags articles with Jay Rosen's 13 key concepts using Gemini | master sheet (`test_runs`) | yes (Gemini free tier) |
| `dedup` | Normalizes multi-value cells and recomputes entity mentions; deterministic | master sheet | no |
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

To go live: **review the PR**, let its CI pass, **merge it**, then run the
**Pillar 3c deploy** workflow (`deploy.yml`) to push the full site to
pressthink.org. The sync and the deploy are deliberately two steps so a human
sees the data diff before it ships.

---

## Required repo secrets

Set these under Settings -> Secrets and variables -> Actions:

| Secret | Used by | Notes |
|---|---|---|
| `ROSEN_SHEETS_SA_KEY_JSON` | all jobs | service-account JSON (inline). Share the sheet with the service account's email as Editor. |
| `SPREADSHEET_NAME` | all jobs | exact name of the master sheet. The jobs open it by name; a wrong or missing value fails fast. |
| `GEMINI_API_KEY` | `key_concepts` | Gemini free-tier key from aistudio.google.com. |
| `ROSEN_GH_APP_ID`, `ROSEN_GH_APP_PRIVATE_KEY` | `sync_to_archive` | the same `rosen-archive-bot` App as Pillar 3a. The App needs **Contents: write** and **Pull requests: write** so it can push the branch and open the PR. |

`sync_to_archive` opens the PR with the App token (not the default
`GITHUB_TOKEN`) on purpose: a PR opened by `GITHUB_TOKEN` would not trigger the
PR's own CI.

---

## Known limitation: progress state in CI

CI runners are ephemeral, so a job's progress file does not survive between
runs. What that means per job:

- **`dedup`** is deterministic and idempotent. Re-running over already-clean
  rows is a cheap no-op (zero writes). To cover the whole sheet in one pass, run
  it with a high `--limit` or `0` (no cap) -- it makes no AI calls. The
  entity-mention recompute always reads every row, so valid mentions are never
  dropped by a limit.
- **`key_concepts`** has no persistent cursor in CI, so each run starts from the
  top of the sheet. With a small `limit` it keeps re-touching the first rows. It
  skips filling rows that already have concepts, but it still spends a Gemini
  "review" call on them. For the long backlog grind, use the **Codespaces track**
  below, where the progress file persists across a session.

This is a v1 limitation, not a bug. Sheet-resident progress (or committed/cached
progress state) is a planned follow-up.

---

## Codespaces track (interactive + break-glass)

For the entity-extraction Ralph Loop, hand-tuned passes, the long `key_concepts`
grind, or pushing data by hand when an Action is broken:

1. On the repo, **Code -> Codespaces -> Create codespace on main**. The
   devcontainer pins Node 22 + Poetry + Playwright Chromium and installs deps on
   create (`.devcontainer/devcontainer.json`).
2. Add `SPREADSHEET_NAME`, `GEMINI_API_KEY`, and `ROSEN_SHEETS_SA_KEY_JSON` as
   **Codespaces secrets** (Settings -> Codespaces) so they arrive as env vars.
3. Run the same commands the Action runs, e.g.:
   ```bash
   poetry -C backend run python -m rosen_scraper.key_concepts_updater --limit 100 --dry-run
   poetry -C backend run python scripts/diagnostics/data_deduper.py --limit 0 --dry-run
   ```
   Drop `--dry-run` to apply. The Codespace's disk keeps `key_concepts_progress.json`
   across the session, so a `key_concepts` grind resumes where it left off.

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
- Sheet-resident or cached progress state so `key_concepts` resumes in CI.

These are tracked in the design doc's "Pieces to build" table (pieces 5-6).
