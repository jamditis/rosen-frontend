---
type: concept
title: Launch status
description: Pre-launch state as of 2026-06-22 — naming and feature audit done, handoff sent, with the SFTP credential gap as the one live blocker to automated deploys.
source: ["GitHub issues #445/#460/#458/#484/#509", "2026-06-19 call", "docs/decisions-pending.md"]
verified: 2026-06-22
tags: [launch, status, blocker]
timestamp: 2026-06-22
---

# Launch status

The archive is in pre-launch. The plan is a short, bounded test-audience release, then iterate live (greenlit by Marla Supnick on 2026-06-17; readiness gate is issue #445). See [launch/launch-plan.md](../launch/launch-plan.md).

## Done

- **Naming** shipped — "Jay Rosen's Internet Archive" across title and OG/Twitter tags (v3.4.5).
- **Feature audit** (#484) — 166 features catalogued as user stories and tested in real Chromium; 14 of 23 fail/partial fixes applied and re-verified, the rest deferred/wontfix with rationale. Output in [docs/feature-audit/](../../docs/feature-audit/).
- **Report-a-bug button** (#450/#451) — on-site button that opens a prefilled GitHub issue. See [systems/feedback-and-reporting.md](../systems/feedback-and-reporting.md).
- **Pre-launch handoff** sent to Jay on 2026-06-22 — see [launch/handoff-2026-06-22.md](../launch/handoff-2026-06-22.md).

## The one live blocker

Automated deploys are blocked on **SFTP credentials** for the hosting box. The deploy automation exists but has no credentials, so it fails safe to manual WordPress File Manager uploads. This is a known blocker already discussed with Jay — not waiting on Joe. The credential request is item #458, and the interim manual path is #459. See [systems/deploy-and-hosting.md](../systems/deploy-and-hosting.md).

## Pending (tracked, not blocking the test)

- Branded in-archive submission/report form that files a GitHub issue without sending the visitor to GitHub (#509).
- Opt-in first-visit tour (#454), submission approval gate (#461), submitter confirmation email (#457).
- Open curation and recovery items — see [docs/decisions-pending.md](../../docs/decisions-pending.md) and [docs/backlog-priority.md](../../docs/backlog-priority.md).
