---
type: reference
title: OKF bundle inventory
description: Generated flight-recorder report for the Rosen project OKF bundle.
source: ["scripts/okf-flight-recorder.js", "wiki/meta/bundle-inventory.json"]
verified: 2026-07-21
tags: [okf, inventory, drift, generated]
timestamp: 2026-07-21
---

# OKF bundle inventory

This is a generated flight-recorder report for the repo OKF bundle. It gives maintainers and downstream consumers a compact way to see what exists, where attention may drift, and which concepts have weak graph placement.

Run:

```bash
npm run okf:flight-recorder
```

Machine-readable output: [bundle-inventory.json](bundle-inventory.json).

## Graph policy

The default navigation view should be a per-concept local graph, not a global force graph. Show one hop by default, allow two hops, keep the global graph as a filterable opt-in, and gate labels by zoom level plus node degree.

## Summary

| Metric | Count |
| --- | ---: |
| Markdown files | 44 |
| Concepts | 34 |
| Concept directories | 9 |
| Internal links | 114 |
| External links | 2 |
| Orphaned concepts | 13 |

## Type counts

| Type | Count |
| --- | ---: |
| concept | 15 |
| event | 1 |
| organization | 1 |
| person | 2 |
| playbook | 1 |
| profile | 2 |
| reference | 1 |
| system | 9 |
| template | 1 |
| test | 1 |

## Drift risk counts

| Risk | Count |
| --- | ---: |
| high | 14 |
| low | 9 |
| medium | 11 |

## Freshness badge counts

| Badge | Count |
| --- | ---: |
| fresh | 34 |

## Freshness watchlist

| Concept | Badge | Verified | Sources | Reason |
| --- | --- | --- | ---: | --- |
| [The corpus](../data/corpus.md) | Fresh | 2026-06-22 | 3 | Verified 29 days before inventory |
| [Schema and vocabulary](../data/schema.md) | Fresh | 2026-06-22 | 3 | Verified 29 days before inventory |
| [Pre-launch handoff to Jay (2026-06-22)](../launch/handoff-2026-06-22.md) | Fresh | 2026-06-22 | 3 | Verified 29 days before inventory |
| [Launch plan](../launch/launch-plan.md) | Fresh | 2026-06-22 | 3 | Verified 29 days before inventory |
| [Jay Rosen](../people/jay-rosen.md) | Fresh | 2026-06-22 | 3 | Verified 29 days before inventory |
| [Joe Amditis](../people/joe-amditis.md) | Fresh | 2026-06-22 | 3 | Verified 29 days before inventory |
| [Unified Field](../people/unified-field.md) | Fresh | 2026-06-22 | 3 | Verified 29 days before inventory |
| [Launch status](../project/launch-status.md) | Fresh | 2026-06-22 | 3 | Verified 29 days before inventory |
| [What the archive is](../project/overview.md) | Fresh | 2026-06-22 | 3 | Verified 29 days before inventory |
| [Provenance](../sources/provenance.md) | Fresh | 2026-06-22 | 1 | Verified 29 days before inventory |
| [Data pipeline (backend)](../systems/data-pipeline.md) | Fresh | 2026-06-22 | 3 | Verified 29 days before inventory |
| [Deploy and hosting](../systems/deploy-and-hosting.md) | Fresh | 2026-06-22 | 4 | Verified 29 days before inventory |

## High-drift concepts

| Concept | Type | Verified | Inbound links | Reason |
| --- | --- | --- | ---: | --- |
| [Pre-launch handoff to Jay (2026-06-22)](../launch/handoff-2026-06-22.md) | event | 2026-06-22 | 8 | high-change topic: launch |
| [Launch plan](../launch/launch-plan.md) | concept | 2026-06-22 | 2 | high-change topic: launch |
| [Jay Rosen](../people/jay-rosen.md) | person | 2026-06-22 | 5 | high-change topic: launch |
| [Unified Field](../people/unified-field.md) | organization | 2026-06-22 | 2 | high-change topic: launch |
| [Launch status](../project/launch-status.md) | concept | 2026-06-22 | 0 | high-change topic: blocker, credential, launch, sftp |
| [Deploy and hosting](../systems/deploy-and-hosting.md) | system | 2026-06-22 | 11 | high-change topic: blocker, cloudflare, deploy, dns, hosting, sftp |
| [Feedback and reporting](../systems/feedback-and-reporting.md) | system | 2026-06-22 | 3 | high-change topic: launch |
| [Key dates](../timeline/key-dates.md) | concept | 2026-06-22 | 1 | high-change topic: launch |
| [Open launch and architecture decisions](../launch/open-decisions.md) | concept | 2026-06-23 | 0 | high-change topic: automation, launch, submission; change-prone topic: data, decisions |
| [Re-verification playbook](../sources/reverification-playbook.md) | concept | 2026-06-23 | 0 | high-change topic: deploy; change-prone topic: verification |
| [Cache and versioning](../systems/cache-and-versioning.md) | system | 2026-06-23 | 1 | high-change topic: cache, deploy, versioning; change-prone topic: data |
| [CI and testing](../systems/ci-and-testing.md) | system | 2026-06-23 | 1 | high-change topic: ci, github-actions, testing |
| [Maintenance automation](../systems/maintenance-automation.md) | system | 2026-06-23 | 1 | high-change topic: automation, deploy, github-actions |
| [Submission automation (Pillar 3a)](../systems/submission-automation.md) | system | 2026-07-21 | 2 | high-change topic: automation, github-actions, submission |

## Stale concepts

These concepts have a `verified` date more than 30 days before the inventory date.

| Concept | Type | Verified | Inbound links | Reason |
| --- | --- | --- | ---: | --- |
| None | | | | |

## Orphaned concepts

These concepts currently have no inbound links from other concept files. Section indexes can still point to them, but orphaned concepts are weaker graph nodes for agents.

| Concept | Type | Verified | Inbound links | Reason |
| --- | --- | --- | ---: | --- |
| [Data quality gaps](../data/data-quality-gaps.md) | concept | 2026-06-23 | 0 | change-prone topic: data |
| [Open launch and architecture decisions](../launch/open-decisions.md) | concept | 2026-06-23 | 0 | high-change topic: automation, launch, submission; change-prone topic: data, decisions |
| [OKF adoption playbook](adoption-playbook.md) | playbook | 2026-06-23 | 0 | change-prone topic: public, source |
| [OKF blindfold test](blindfold-test.md) | test | 2026-07-21 | 0 | recently verified |
| [OKF community contribution roadmap](community-roadmap.md) | concept | 2026-06-23 | 0 | change-prone topic: community, source |
| [Concept templates](concept-template.md) | template | 2026-06-23 | 0 | recently verified |
| [OKF enhancement radar](enhancement-radar.md) | concept | 2026-06-23 | 0 | recently verified |
| [Rosen project OKF profile](okf-profile.md) | profile | 2026-06-23 | 0 | recently verified |
| [OKF quality model](quality-model.md) | concept | 2026-06-23 | 0 | recently verified |
| [Launch status](../project/launch-status.md) | concept | 2026-06-22 | 0 | high-change topic: blocker, credential, launch, sftp |
| [Jay Rosen's Internet Archive knowledge bundle](../README.md) | profile | 2026-06-23 | 0 | change-prone topic: public |
| [Provenance](../sources/provenance.md) | concept | 2026-06-22 | 0 | change-prone topic: provenance, source, verification |
| [Re-verification playbook](../sources/reverification-playbook.md) | concept | 2026-06-23 | 0 | high-change topic: deploy; change-prone topic: verification |

## How to interpret this

- High drift does not mean incorrect. It means the concept names a surface likely to change, such as deploys, launch state, credentials, CI, cache/version handling, or submission automation.
- Freshness badge data comes from each concept's `verified` date and source count, so a renderer can show trust state without a separate database.
- Stale means the claim has not been rechecked recently relative to the bundle's newest evidence date.
- Orphaned means the concept may be discoverable from an index but is not yet well-integrated into the concept graph.
