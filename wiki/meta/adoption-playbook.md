---
type: playbook
title: OKF adoption playbook
description: A practical process for applying this OKF profile to another repo, public archive, or open-source project.
source: ["wiki/meta/okf-profile.md", "wiki/meta/concept-template.md", "https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md", "https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing"]
verified: 2026-06-23
tags: [okf, adoption, open-source, playbook]
timestamp: 2026-06-23
---

# OKF adoption playbook

Use this when starting a project wiki from an existing repo. The goal is not to document everything. The goal is to make the project easier to understand, operate, review, and hand off.

## Step 1: set the boundary

Choose one bundle root, usually `wiki/`. Write the root `index.md` first with:

- project name and live surface;
- high-level map;
- statement that code and live systems win when docs disagree;
- link to `log.md`.

## Step 2: seed the first directories

Start with five directories:

- `project/` — what it is, status, workflow.
- `systems/` — runtime pieces, CI, deploy, operations.
- `data/` — schemas, sources, gaps, quality rules.
- `people/` — project roles, not biographies.
- `sources/` — provenance and re-verification commands.

Add `launch/` or `timeline/` only if they answer recurring questions.

## Step 3: write only sourced concepts

For every concept:

1. Read the source first.
2. Add source pointers in frontmatter.
3. Keep the body short enough to scan.
4. Link to the deeper source rather than copying it.
5. Mark drift-prone claims with `verified`.

If a fact cannot be checked, do not write it as fact. Add it under `## Open questions` or leave it out.

## Step 4: add an operator layer

An OKF bundle becomes useful when it answers "what should I do next?" Add:

- test commands and CI map;
- deploy path and blockers;
- cache/version traps;
- issue-selection rules;
- data-generation path;
- security boundaries;
- re-verification commands.

## Step 5: validate the bundle

Run a validator locally and in CI. At minimum:

- every concept has parseable frontmatter and non-empty `type`;
- every directory has an index;
- every concept is linked from its directory index;
- internal links resolve;
- secret-looking values are rejected;
- root `index.md` declares `okf_version`.

This repo's validator is `scripts/validate-okf.js`.

## Step 6: make it contribution-friendly

Add copyable templates, a quality model, and a change log. New contributors should be able to add a concept without knowing the whole project.

## Step 7: keep humans in the loop

Agents can draft and cross-link quickly, but humans still own factual correctness, source quality, and public claims. For open-source bundles, review new OKF files like code: diff, source, links, and impact on future readers.
