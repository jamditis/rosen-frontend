# archived/

Reference-only code kept out of the production deploy (see the "do not upload"
list in [`DEPLOYMENT.md`](../DEPLOYMENT.md)). Not part of the live static site.

## What's here

- `dissertation-tools/source/` — the tracked source bundle for the maintained
  dissertation reader in `dissertation/reader/`: the original dissertation PDF,
  a transcription, and the historical PDF build helper. It remains as source
  provenance after the six retired tool routes were removed.
- `scripts/` — retired one-off scripts, split into `data-oneoffs/` and
  `backend-oneoffs/`, kept as provenance. Most are data and relationship repairs
  that ran once against a known dataset and were never meant to recur;
  `backend-oneoffs/` also holds one superseded augmentation tool
  (`relationship_augmentation.py`) that was abandoned before it ran. None is
  wired into the running pipeline. Live docs point here as the record of those
  runs:
  [`docs/LAUNCH_VALIDATION_REPORT.md`](../docs/LAUNCH_VALIDATION_REPORT.md),
  [`backend/docs/ENTITY_SCHEMA.md`](../backend/docs/ENTITY_SCHEMA.md),
  [`docs/narrative/architecture.md`](../docs/narrative/architecture.md), and
  [`.claude/skills/data-pipeline.md`](../.claude/skills/data-pipeline.md). Each
  subdir carries its own README; provenance only, do not run.

## Rule

Do not edit code under `archived/`. An edit here does not reach production via
the current deploy workflow.
