---
type: concept
title: Launch plan
description: A short, bounded test-audience release then iterate live, greenlit by Marla on 2026-06-17; readiness is gated by issue #445 and a small cluster of launch issues under umbrella #460.
source: ["GitHub #445/#460 cluster", "2026-06-17 forwarded thread", "2026-06-19 call"]
verified: 2026-06-22
tags: [launch, plan, readiness]
timestamp: 2026-06-22
---

# Launch plan

The approach is a **short, bounded test-audience release, then iterate live** — keep the test brief, ship sooner, fix in the open. [Marla Supnick](../people/unified-field.md) greenlit this on 2026-06-17.

## Readiness gate

Issue **#445** is the launch-readiness gate. The launch work is organized under umbrella issue **#460**, which threads the user-facing tasks Jay raised on the call:

- **#453** — feature walkthrough (delivered in the [handoff](handoff-2026-06-22.md)).
- **#458** — SFTP/server access request (the [blocker](../systems/deploy-and-hosting.md)).
- **#459** — interim weekly upload coverage.
- **#454** — opt-in first-visit tour (deferred; Jay prefers Bluesky showcases).
- **#461** — submission approval gate.
- **#457** — submitter confirmation email.
- **#509** — branded in-archive report/submit form ([feedback path](../systems/feedback-and-reporting.md)).

#460 and #458 carry the `do-not-automate` label — human-visibility only. Never select, work, PR against, or change the state of a `do-not-automate` issue; enumerate candidate work with `gh issue list --search 'is:open -label:"do-not-automate"'`.

## What gates the actual go

Joe's side is ready to ship the test audience. The remaining external dependencies sit with Jay and Unified Field: server access (so deploys aren't manual), the launch essay, and the confirmed [record count](../data/corpus.md) at publish time.
