---
type: concept
title: Provenance
description: The source material behind this bundle and how to re-verify each class of fact.
source: [this bundle's own references]
verified: 2026-06-22
tags: [sources, provenance, verification]
timestamp: 2026-06-22
---

# Provenance

What the facts in this bundle rest on, and how to re-check them:

- **The repo itself** — `version.json` (version), `data/archive-analytics.json` (counts), `CONTEXT.md` (vocabulary), `CLAUDE.md` and `docs/` (architecture, data, deploy). When code and bundle disagree, the code wins.
- **GitHub** — the canonical record for the project. The launch-issue cluster (umbrella #460; #445, #453, #454, #457, #458, #459, #461) and the follow-up #509 (branded form) and #484 (feature audit). Check work here first: `gh issue list` / `gh pr list` on `jamditis/rosen-frontend`.
- **The 2026-06-19 Jay Rosen call** — Fathom recording 156730488 (api.fathom.ai). Source for the name decision, the hosting picture, the tour-vs-showcase preference, and the count-at-publish ask.
- **The 2026-06-22 sent email** — the [handoff](../launch/handoff-2026-06-22.md) event, in Joe's sent mail; the shared Drive folder is `1n5Gt5fTPSHc_qsimb-D8YTA2tBOvxbLq`.

## Re-verification habit

Counts and version drift as records are added and builds ship. Before quoting a figure externally (especially the record count for Jay's launch essay), re-read `data/archive-analytics.json` rather than trusting this bundle's snapshot.
