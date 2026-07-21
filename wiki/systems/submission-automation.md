---
type: system
title: Submission automation (Pillar 3a)
description: The sheet-driven GitHub Actions path that validates, processes, publishes, and reports the status of new archive records.
source: [backend/submission_runtime/, backend/scripts/process_submission.py, .github/workflows/submit-record.yml, docs/setup/pillar-3a-runbook.md]
verified: 2026-07-21
tags: [backend, submission, pillar3a, github-actions]
timestamp: 2026-07-21
---

# Submission automation (Pillar 3a)

The supported intake path is Google Sheet → Apps Script → GitHub App →
`submit-record.yml`. The workflow calls `backend/scripts/process_submission.py`,
which validates and scrapes the URL, categorizes and deduplicates the record,
updates the archive CSV, runs `node data/export-archive-data.js`, commits the
generated data, attempts the SFTP push, and writes status back to the sheet.
Shared config, artifact, CSV-safety, SFTP, and Sheets helpers live in
[`backend/submission_runtime/`](../../backend/submission_runtime/).

- **Status:** the code path exists, but the GitHub App and remaining repository
  credentials must be configured before the sheet workflow is live.
- **Deploy constraint:** the per-record SFTP leg depends on hosting credentials;
  see [deploy-and-hosting.md](deploy-and-hosting.md).
- **Manual fallback:** until automation is configured, use the reviewed manual
  record-add and deploy procedure in [`ADDING-RECORDS.md`](../../ADDING-RECORDS.md).

The retired Flask intake, SQLite queue, scheduler, templates, and systemd
packaging are available only through git history. There is no maintained HTTP
endpoint or local-server fallback.

Runbook: [docs/setup/pillar-3a-runbook.md](../../docs/setup/pillar-3a-runbook.md).
