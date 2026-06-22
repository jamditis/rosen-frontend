---
type: system
title: Submission server (Pillar 3a)
description: A Flask intake that accepts URL submissions and, via a GitHub Actions workflow_dispatch, scrapes, categorizes, appends, regenerates, tests, and pushes a record.
source: [backend/submission_server/, .github/workflows/submit-record.yml, docs/plans/2026-05-24-pillar3a-free-auto-deploy-design.md]
verified: 2026-06-22
tags: [backend, submission, pillar3a, intake]
timestamp: 2026-06-22
---

# Submission server (Pillar 3a)

A Flask app in [`backend/submission_server/`](../../backend/submission_server/) that renders a submission form (`GET /`) and accepts a URL submission (`POST /submit`). A submission is fired through the `submit-record.yml` GitHub Actions `workflow_dispatch`, which runs one row end-to-end: scrape, categorize, append CSV, regenerate JSON, `npm test`, push to `main`, SFTP push, and sheet write-back.

- **Status:** the form is not deployed at a public URL yet, so the live path for visitors is the on-site report button — see [feedback-and-reporting.md](feedback-and-reporting.md).
- **The SFTP-push leg** of the workflow is the same blocker as everything else — see [deploy-and-hosting.md](deploy-and-hosting.md).
- **Planned guards:** an approval gate before processing third-party submissions (#461) and a "being processed" confirmation email to submitters (#457).

Design: [docs/plans/2026-05-24-pillar3a-free-auto-deploy-design.md](../../docs/plans/2026-05-24-pillar3a-free-auto-deploy-design.md).
