---
type: test
title: OKF blindfold test
description: Scenario-based navigation test for whether a new contributor can answer project questions starting only from the OKF root index.
source: ["scripts/okf-blindfold-test.js", "wiki/meta/blindfold-scenarios.json"]
verified: 2026-06-23
tags: [okf, test, navigation, onboarding]
timestamp: 2026-06-23
---

# OKF blindfold test

The blindfold test treats [`wiki/index.md`](../index.md) as the only starting point. Each scenario asks a realistic contributor or agent question, then checks that the answer path is reachable and contains the terms a correct answer should surface.

Run:

```bash
npm run okf:blindfold
```

## Current result

| Metric | Value |
| --- | ---: |
| Scenarios | 6 |
| Passing scenarios | 6 |
| Reachable wiki markdown files | 44 |
| Failed scenarios | 0 |

## Scenarios

### deploy-path

**Prompt:** Starting only from wiki/index.md, explain how deploys work, what blocks automation, and what cache or version steps matter.

**Status:** pass

**Expected files:** [systems/deploy-and-hosting.md](../systems/deploy-and-hosting.md), [systems/cache-and-versioning.md](../systems/cache-and-versioning.md), [systems/maintenance-automation.md](../systems/maintenance-automation.md)

**Required terms:** `SFTP`, `manual`, `version.json`, `CACHE_VERSION`

**Rubric:** A useful answer names the manual upload path, the missing SFTP credentials, and the release-time cache/version sweep.

**Failures:** none

### public-wiki-boundary

**Prompt:** Where do public wiki pages live, and how are they different from internal OKF project knowledge?

**Status:** pass

**Expected files:** [README.md](../README.md), [systems/public-community-wiki.md](../systems/public-community-wiki.md), [meta/okf-profile.md](okf-profile.md)

**Required terms:** `#wiki`, `data/wiki-seed.json`, `repo-maintenance`

**Rubric:** A useful answer separates the in-app #wiki reader feature from the repo-maintenance OKF bundle and names the seed-data file.

**Failures:** none

### add-record

**Prompt:** How does a new archive Record enter the system, and what is currently blocked?

**Status:** pass

**Expected files:** [systems/submission-server.md](../systems/submission-server.md), [systems/data-pipeline.md](../systems/data-pipeline.md), [systems/deploy-and-hosting.md](../systems/deploy-and-hosting.md), [data/data-quality-gaps.md](../data/data-quality-gaps.md)

**Required terms:** `node data/export-archive-data.js`, `submit-record.yml`, `SFTP`

**Rubric:** A useful answer distinguishes the Flask submission path from the sheet-driven workflow, then names export and deploy constraints.

**Failures:** none

### verify-change

**Prompt:** What tests should a contributor run after changing wiki, frontend, or data surfaces?

**Status:** pass

**Expected files:** [project/development-workflow.md](../project/development-workflow.md), [systems/ci-and-testing.md](../systems/ci-and-testing.md), [sources/reverification-playbook.md](../sources/reverification-playbook.md)

**Required terms:** `npm test`, `npm run test:okf`, `npm run test:frontend`

**Rubric:** A useful answer chooses the narrow verification command first, then names the broader suite for the touched surface.

**Failures:** none

### open-decisions

**Prompt:** What decisions should be resolved before launch or deeper automation?

**Status:** pass

**Expected files:** [launch/open-decisions.md](../launch/open-decisions.md), [launch/launch-plan.md](../launch/launch-plan.md), [project/launch-status.md](../project/launch-status.md)

**Required terms:** `URL canonicalization`, `Pillar 3a`, `Pillar 3b`

**Rubric:** A useful answer names the current launch state and the highest-impact unresolved decisions before picking deeper automation work.

**Failures:** none

### wiki-ux-guardrails

**Prompt:** What UI mistakes should a future OKF or public-wiki renderer avoid, and what trust signal must be visible per concept?

**Status:** pass

**Expected files:** [meta/wiki-ux-requirements.md](wiki-ux-requirements.md), [meta/quality-model.md](quality-model.md), [systems/public-community-wiki.md](../systems/public-community-wiki.md)

**Required terms:** `local graph`, `global graph`, `freshness badge`, `verified`, `source`

**Rubric:** A useful answer treats local-first graph navigation and per-concept freshness as requirements, not visual extras.

**Failures:** none

## Maintenance rule

Add a scenario when a maintainer notices a project question that took too long to answer. The question should name expected wiki files and a few required terms, not a canned answer.
