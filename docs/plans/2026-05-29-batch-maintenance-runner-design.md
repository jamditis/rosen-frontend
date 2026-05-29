# Batch maintenance runner design: a post-handoff home for the out-of-band jobs

**Status**: Decisions locked (Joe, 2026-05-29) — ready to implement
**Date**: 2026-05-29
**Goal**: Give the archive's batch maintenance jobs (entity extraction, key-concept tagging, raw-text/date backfill, dedup) a home that survives Joe stepping back, without depending on his Pi or his personal accounts. Sibling spec: `2026-05-24-pillar3a-free-auto-deploy-design.md` (covers the *submission* path; this covers the *maintenance* path).

---

## Why this exists

Pillar 3a automated one thing: a curator adds a URL to a sheet, a GitHub Action scrapes + categorizes + appends to the repo CSV + regenerates JSON + SFTP-pushes it live. That path writes the repo CSV directly (`backend/submission_server/processor.py:131`, `backend/scripts/process_submission.py`) and needs no human after the sheet edit.

Everything else the archive needs over time still runs by hand on houseofjawn:

- **Entity extraction** over the ~23k filtered social posts (`backend/scripts/unified_entity_processor.py`).
- **Key-concept tagging** of articles against the 13-concept schema (`backend/src/rosen_scraper/key_concepts_updater.py`).
- **Backfill** of missing `raw_text` / `pull_quote` / `publication_date` (`backend/scripts/backfill/backfill_worker.py`, `backfill_missing_dates.py`).
- **Data hygiene** — multi-value field normalization, entity dedup (`backend/scripts/diagnostics/data_deduper.py`, `deduplicate_entities.py`).

None of these is wired into `.github/workflows/` today. Post-handoff, Jay and Hali have no machine to run them on. This spec gives them one, and resolves the one structural gap that makes the maintenance path harder than the submission path.

---

## Locked decisions (Joe, 2026-05-29)

1. **Sheet→CSV sync**: add a `sync_to_archive` job to the runner (option 1 below). The master sheet stays the enrichment surface; an automated, additive merge carries results into the repo CSV and out to the live site.
2. **Entity extraction**: rewire to a headless `claude -p` / `gemini -p` CLI call so the backlog can grind down unattended on the free tier — respects the "CLI tools, not direct LLM API" rule and the $0 constraint. Build deferred until the safe jobs prove the runner; the interactive Codespaces path stays available for hand-tuned passes. (Option B below; option C / paid batch API is rejected.)
3. **v1 scope**: ship `key_concepts` + `dedup` + `sync_to_archive` first, prove the runner and the deploy tail end-to-end, then add backfill and entity extraction in follow-ups.

The sections below are written to these decisions; the original option menus are kept for context.

---

## The structural gap

The submission path and the maintenance path write to **different stores**:

| Path | Writes to | Reaches live archive by |
|---|---|---|
| Submission (Pillar 3a) | repo `data/archive_records-public.csv` directly | automatic — Action regenerates JSON + SFTP |
| Maintenance (these jobs) | the **master Google Sheet** (gspread, env `SPREADSHEET_NAME`) | **manual today** — someone exports the sheet, merges into the repo CSV, regenerates JSON, deploys |

`key_concepts_updater.py`, `backfill_worker.py`, `data_deduper.py`, and `data_improver.py` all open the master sheet and write cells back to it. There is no scheduled job that syncs the sheet into the repo CSV; the sync scripts that exist (`download_drive_data.py`, `export_merged_data.py`, `merge_new_records.py`) are run by hand.

**So a maintenance runner that only runs the enrichment script leaves the work stranded in the sheet.** The design has to close the tail: sheet write → repo CSV → `node data/export-archive-data.js` → SFTP. Three ways to do that, in order of preference:

1. **Add a `sync-sheet-to-archive` job** to the runner that pulls the enriched columns from the master sheet, merges them into `data/archive_records-public.csv` by `id`, regenerates JSON, runs the test suite, commits, and SFTP-pushes — reusing the exact deploy tail Pillar 3a already has. The enrichment jobs and the sync job become two stages of one pipeline.
2. **Point the enrichment jobs at the repo CSV instead of the sheet** so there's one store. Larger refactor; the scripts assume gspread today.
3. **Leave the sync manual** and document it. Cheapest, but it's the kind of recurring manual step the handoff is supposed to remove.

**Locked: option 1.** The enrichment jobs and the sync job become two stages of one pipeline; the deploy tail is the Pillar 3a one, fed from the sheet instead of a single submission.

---

## Job inventory

Verified by reading the scripts on 2026-05-29. "Headless" = runs unattended in CI with no human or interactive LLM.

| Job | Headless? | LLM | Writes | Resumable | CI-safe | Notes |
|---|---|---|---|---|---|---|
| `key_concepts_updater.py` | yes | Gemini (direct, already sanctioned by Pillar 3a) | master sheet | yes — skips rows that already have concepts; the sheet itself is the progress store | yes | 100 rows/batch, 5s/row. ~8 min/batch. Reads/writes sheet. |
| `data_deduper.py` | yes | none (deterministic) | master sheet | yes — idempotent | yes | Pure normalization. Safe to re-run. |
| `backfill_worker.py` | yes (if `dispatcher` is) | none for this job (scrape via dispatcher) | master sheet | weak — skips rows that already have a note, no progress file | conditional | Fills `raw_text` / `pull_quote`. Depends on the scraper dispatcher. |
| `data_improver.py` | yes (if `dispatcher` is) | none | master sheet | weak — note-gated | conditional | Refreshes metadata from existing `raw_text`. |
| `unified_entity_processor.py` | **no** | **Claude via Ralph Loop (interactive, $0)** | SQLite in `data/social_import/` (gitignored) | yes — SQLite by post id | **no** | Exports markdown batches for an interactive Claude session to extract, then ingests the JSON back. No headless extraction mode. See "the entity-extraction problem." |
| `bulk_reprocessor.py` | yes | none | master sheet | **no** — no checkpoint, rewrites rows | **no** — re-run risk + 6h limit | Destructive bulk rewrite. Keep on a human's machine with a rollback plan. |

Two CI hazards to respect:

- **The 6-hour Action job limit.** Per-batch jobs (`key_concepts_updater --limit 100`) are fine. Whole-archive sweeps (`bulk_reprocessor`, full parallel extraction) can exceed it. The runner must enforce batch-at-a-time, never whole-archive-in-one-run.
- **Gitignored progress.** `data/social_import/` is gitignored (`.gitignore:93`), so any SQLite/JSON progress state is wiped between CI runs. Only jobs whose progress lives **in the sheet** (key_concepts, dedup) are naturally resumable in CI. Stateful jobs need their progress committed, cached (`actions/cache`), or stored as a run artifact — or they stay on the interactive track.

---

## The entity-extraction problem

`unified_entity_processor.py` is the one job that resists a headless Action. By design it exports a markdown batch, an interactive Claude session reads it and hands back JSON, and the script ingests that JSON. The team chose this deliberately (`docs/ENTITY_EXTRACTION_PIPELINE.md`: "Use Claude via Ralph Loop — zero API cost, higher quality"). Making it headless means picking one of:

- **A. Keep it interactive** on the Codespaces track below (a human plus a Claude session). Preserves $0 and the quality the doc cites. Still needs a person to drive it.
- **B. Rewire extraction to a CLI call** (`claude -p` / `gemini -p` with a JSON schema in the prompt) so an Action can run it unattended. Respects Joe's "CLI tools, not direct LLM API" rule and the $0 goal, but is new code and needs the progress-state fix above.
- **C. A paid batch API.** A `batch_entity_extraction.py` exists that can target the Anthropic/OpenAI/Gemini APIs directly. **Not recommended** — it breaks both the $0 constraint and the global "no direct LLM API calls" rule.

**Locked: option B**, with A available. A new headless extraction mode calls the LLM via `claude -p` / `gemini -p` with a JSON schema in the prompt, so the backlog grinds down in CI on the free tier; the interactive Codespaces path stays for hand-tuned passes. Option C (paid batch API) is rejected — it breaks the $0 constraint and the global "no direct LLM API calls" rule. Build is deferred until the safe jobs prove the runner (see v1 scope), so this is a follow-up, not part of v1.

---

## Architecture: two tracks

### Track 1 — headless jobs as a manual-trigger Action

A single `maintenance.yml` workflow, `workflow_dispatch` only (never auto-cron at first — these spend money and touch data; earn the cron later):

```
Actions tab → "Run maintenance job" → pick:
  job:     [ key_concepts | dedup | sync_to_archive ]   ← v1; backfill_raw_text / backfill_dates added in a follow-up
  limit:   integer (default 25)        ← never whole-archive in one run
  dry_run: boolean (default true)      ← first run of any job is a no-write rehearsal
```

The workflow reuses the Pillar 3a runner setup (Python 3.13 + Poetry + Node 22 + `npm ci`) and the same repo secrets: `GEMINI_API_KEY`, `ROSEN_SHEETS_SA_KEY_JSON`, `SPREADSHEET_NAME`, plus the `ROSEN_SFTP_*` set for the `sync_to_archive` job. It enforces the data-pipeline safety rules that were learned the hard way (`docs/narrative/data-pipeline.md`):

- `dry_run: true` default — the job logs what it *would* write and a per-field counter, writes nothing.
- Small `limit` default — the 5 → 25 → 100 escalation, not straight to full.
- Verify-writes counter in the job summary — the "$0.53 wasted, AI ran but nothing was written" incident must be impossible to repeat silently. A run that calls Gemini but writes zero fields fails loudly.
- The categorizer's existing uniform-response guard stays in force.

`sync_to_archive` is the tail from "the structural gap" above: sheet → repo CSV merge by `id` → `node data/export-archive-data.js` → test suite → commit (bot identity) → SFTP. It is the only Track-1 job that writes the repo and the live site; the enrichment jobs only touch the sheet.

### Track 2 — Codespaces devcontainer for interactive + break-glass

For the entity-extraction Ralph Loop, any hand-tuned pass, and "the Action is broken, push the JSON by hand" moments:

- `.devcontainer/devcontainer.json` pins Node 22 + Poetry + `playwright install chromium`, repo pre-checked-out. Free tier is ~60–120 core-hours/month, tied to the **repo** (which transfers to Jay/Hali), not a deletable personal Google account.
- Hali/Jay opens a Codespace, runs the documented commands. No local toolchain install.
- **Google Cloud Shell is the fallback here, not the primary.** It needs zero setup and is already in a Google login, but its $HOME is deleted after 120 days idle and dies with the owning Google account (the exact fragility Pillar 3a engineered around), it has no inbound and a 40-min non-interactive kill, and it can't host the runner. Fine for an ad-hoc attended run; wrong thing to build the handoff on.

---

## Pieces to build

| # | Piece | Effort | Location |
|---|---|---|---|
**v1 = pieces 1–4, scoped to `key_concepts` + `dedup` + `sync_to_archive`.** Pieces 5–6 are follow-ups.

| # | Piece | v1? | Effort | Location |
|---|---|---|---|---|
| 1 | `maintenance.yml` — `workflow_dispatch`, job picker (`key_concepts`/`dedup`/`sync_to_archive`), `limit`/`dry_run`, reuses Pillar 3a secrets | yes | ~120 lines | `.github/workflows/maintenance.yml` (new) |
| 2 | `backend/scripts/sync_sheet_to_archive.py` — sheet → CSV merge by `id` + JSON regen + deploy tail | yes | ~150 lines | `backend/scripts/` (new) |
| 3 | `dry_run` + write-counter guards in `key_concepts_updater.py` (it already skips done rows; add the counter + dry-run flag) and a dry-run flag for `data_deduper.py` | yes | ~50 lines | `backend/...` (extend) |
| 4 | `.devcontainer/devcontainer.json` + one-page `docs/setup/maintenance-runbook.md` (Codespaces steps, Cloud Shell fallback, which job to run when) | yes | ~120 lines | repo root + `docs/setup/` (new) |
| 5 | Backfill jobs (`backfill_raw_text`, `backfill_dates`) added to the picker + their dry-run/counter guards | follow-up | ~80 lines | `backend/...` + workflow |
| 6 | Entity-extraction headless mode (`claude -p` / `gemini -p`, decision B) + its progress-state handling | follow-up | ~180 lines | `backend/scripts/` |

### Tests

- `tests/test_sync_sheet_to_archive.py` — mock gspread + a fixture sheet; assert merge-by-`id` is correct, no `raw_text` is ever blanked (see `feedback_never_destroy_raw_text_column` — the merge must be additive, never destructive), dry-run writes nothing.
- Extend the existing `tests/data-pipeline.test.js` — the synced rows are CSV rows like any other and must pass the same integrity/quality gates.
- A workflow lint step so `maintenance.yml` can't ship with a YAML error (matches the Pillar 3a known_hosts lesson — a silent workflow gap is worse than a loud one).

---

## Cost

| Component | Post-handoff |
|---|---|
| GitHub Actions (public repo, manual dispatch) | $0 (unmetered) |
| GitHub Codespaces (free tier ~60–120 core-h/mo) | $0 at this volume |
| Gemini (key-concept tagging, free tier ~1,500 RPD; load is far under) | $0 |
| Entity extraction via `claude -p` / `gemini -p` CLI (decision B) | $0 (CLI on their subscription/free tier) |
| Master Google Sheet + SFTP to Bluehost | $0 marginal (already paid) |
| **Total ongoing** | **$0/mo** |

No paid service in the critical path, consistent with Pillar 3a. The only thing that would add cost is decision C (paid batch API), which this design recommends against.

---

## Risks

| Risk | Mitigation |
|---|---|
| Enrichment runs, writes the sheet, but nobody runs `sync_to_archive` — work stranded | `sync_to_archive` is part of the runner, not a separate manual step; document it as the required closing job after any enrichment batch |
| AI spend with no write (the $0.53 incident) | `dry_run` default + mandatory write-counter in the job summary; a zero-write run after live calls fails the job |
| A batch exceeds the 6-hour Action limit | runner enforces `limit`; whole-archive sweeps stay on a human's machine (Track 2), never Track 1 |
| Progress state lost between CI runs (gitignored `social_import`) | sheet-resident progress for the safe jobs; commit/cache/artifact for stateful ones; otherwise interactive track |
| `sync_to_archive` merge destroys `raw_text` | additive merge by `id` only; test asserts no existing `raw_text` is shortened or blanked |
| Codespaces/Cloud Shell tied to a deletable account | Codespaces follows the repo (transfers to Jay/Hali); Cloud Shell is fallback-only for this reason |

---

## Out of scope

- Auto-cron for maintenance jobs — start manual-dispatch only; add schedules once a job has proven safe over several manual runs.
- `bulk_reprocessor.py` and whole-archive parallel re-extraction — stay on a human's machine with a rollback plan; too long and too destructive for unattended CI.
- The historical one-off scripts (`run_smart_corrector_*`, `fix_*`, most `analyze_*`) — archaeology, not recurring jobs; not part of the runner.
- Changing the submission path — Pillar 3a is unchanged.

---

## Decisions resolved (2026-05-29)

All three are locked above; recorded here for traceability.

1. **The structural gap** → option 1: add a `sync_to_archive` job to the runner.
2. **Entity extraction** → option B: rewire to a headless `claude -p` / `gemini -p` CLI call; interactive Codespaces path available; paid batch API rejected. Deferred to a follow-up.
3. **v1 scope** → two safe jobs (`key_concepts`, `dedup`) + `sync_to_archive`; backfill and entity extraction follow.

---

## Next steps

1. Branch `feat/batch-maintenance-runner` off main.
2. Build pieces 2 + 3 first (the sync job + the dry-run/counter guards) so the deploy tail is testable in isolation, then 1 (the workflow), then 4 (devcontainer + runbook).
3. Smoke test each job with `dry_run: true, limit: 5` against a copy of the master sheet before any live write.
4. Once v1 is proven over several manual runs, take up pieces 5–6 (backfill jobs, then headless entity extraction).
