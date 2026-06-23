---
type: concept
title: Open launch and architecture decisions
description: The decisions that still affect launch, data cleanup, submission automation, and future editor work.
source: [docs/decisions-pending.md, docs/definition-of-done.md, wiki/launch/launch-plan.md]
verified: 2026-06-23
tags: [decisions, launch, architecture]
timestamp: 2026-06-23
---

# Open launch and architecture decisions

The detailed decision blocks live in [docs/decisions-pending.md](../../docs/decisions-pending.md). This page is the fast map.

## Highest-impact decisions

- **URL canonicalization** — decide whether PressThink Records prefer the modern `pressthink.org` URL, the historical `archive.pressthink.org` URL, or a hybrid with notes. This affects duplicate cleanup and future gap-fill PRs.
- **Pillar 3a deploy mechanism** — decide the durable publish path: button, weekly GitHub Actions safety net, or both. Current recommendation in the source doc is button plus weekly safety net.
- **Pillar 3b authoring scope** — decide whether Google Sheets remains the long-term authoring surface or a Jay-facing edit UI is in scope.

## Independent follow-ups

- Social-platform backfill priority: Bluesky first is the current recommendation; Threads stays deferred unless Jay or data needs change.
- SQLite-validator timing: current recommendation is to add a CI validator step before deeper source-of-truth changes.
- Dissertation tools restoration: live production and repo structure still do not fully match; the current recommendation is a curated restore/retire mix.

## How to use this

Resolve decisions 1-2 first because they unblock the most downstream work. For any work item picked from GitHub, exclude `do-not-automate` issues before selection; see [project/development-workflow.md](../project/development-workflow.md).
