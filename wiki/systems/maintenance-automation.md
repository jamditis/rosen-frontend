---
type: system
title: Maintenance automation
description: The manual-dispatch jobs for enriching, syncing, deploying, and monitoring the archive outside the normal PR path.
source: [.github/workflows/maintenance.yml, .github/workflows/deploy.yml, .github/workflows/post-merge.yml, docs/setup/maintenance-runbook.md, docs/setup/pillar-3a-runbook.md]
verified: 2026-06-23
tags: [automation, maintenance, github-actions, deploy]
timestamp: 2026-06-23
---

# Maintenance automation

Maintenance jobs are separate from the normal submission path and from ordinary PR work. They exist for attended, out-of-band enrichment and deploy tasks.

## Batch maintenance runner

`.github/workflows/maintenance.yml` exposes three manual-dispatch jobs:

- `key_concepts` — uses Gemini to tag records in the master sheet.
- `dedup` — deterministic normalization and entity-mention recomputation.
- `sync_to_archive` — merges approved sheet data into `data/archive_records-public.csv`, regenerates JSON, runs tests, commits a branch, and opens a PR.

The first run of any job should be a dry run. Use small limits before widening: `5 -> 25 -> 100`. `sync_to_archive` deliberately opens a PR instead of pushing to `main`, so a human reviews the data diff before it can ship.

Runbook: [docs/setup/maintenance-runbook.md](../../docs/setup/maintenance-runbook.md).

## Full-site deploy

`.github/workflows/deploy.yml` is a manual full-site SFTP push. It calls `backend/scripts/deploy_full_site.py` and uses a site-root secret that is distinct from the per-record data-subdir secret used by Pillar 3a. The workflow has a `dry_run` boolean input.

This does not replace the need to keep the deploy manifest correct. See [deploy-and-hosting.md](deploy-and-hosting.md) and [DEPLOYMENT.md](../../DEPLOYMENT.md).

## Post-merge dashboard sync

`.github/workflows/post-merge.yml` is inert unless the `DASHBOARD_WEBHOOK_URL` repository variable is set. The job-level gate means an unconfigured repo starts no runner and spends no Actions minutes.

## Safety notes

- Do not put secret values in this OKF bundle. Link to runbooks and secret names only.
- For submission automation, the current live blockers are the GitHub App and deploy credentials; see [submission-automation.md](submission-automation.md) and [deploy-and-hosting.md](deploy-and-hosting.md).
- A workflow-dispatch input must be passed through environment variables, not interpolated into shell text.
