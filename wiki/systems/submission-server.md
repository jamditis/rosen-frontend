---
type: system
title: Submission server (Pillar 3a)
description: A Flask intake that validates and enqueues URL submissions; a separate local processor (POST /process or the scheduler) scrapes, categorizes, appends, regenerates, tests, and pushes.
source: [backend/submission_server/, .github/workflows/submit-record.yml, docs/plans/2026-05-24-pillar3a-free-auto-deploy-design.md]
verified: 2026-06-22
tags: [backend, submission, pillar3a, intake]
timestamp: 2026-06-22
---

# Submission server (Pillar 3a)

A Flask app in [`backend/submission_server/`](../../backend/submission_server/) that renders a submission form (`GET /`) and accepts a URL submission (`POST /submit`). `/submit` validates the URL and enqueues a pending row via `db.add_submission` (JSON callers like the Apps Script round-trip `sheet_id`/`sheet_tab`/`sheet_row` for status write-back). Processing is a separate local step: `POST /process` (or the scheduler) calls `process_batch`, which scrapes, categorizes, appends the CSV, regenerates JSON, tests, and pushes. The `submit-record.yml` GitHub Actions workflow is a separate sheet-driven path — not what the Flask `/submit` triggers.

- **Status:** the form is not deployed at a public URL yet, so the live path for visitors is the on-site report button — see [feedback-and-reporting.md](feedback-and-reporting.md).
- **The SFTP-push leg** of the processing run is the same blocker as everything else — see [deploy-and-hosting.md](deploy-and-hosting.md).
- **Planned guards:** an approval gate before processing third-party submissions (#461) and a "being processed" confirmation email to submitters (#457).

Design: [docs/plans/2026-05-24-pillar3a-free-auto-deploy-design.md](../../docs/plans/2026-05-24-pillar3a-free-auto-deploy-design.md).
