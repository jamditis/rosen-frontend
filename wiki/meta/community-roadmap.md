---
type: concept
title: OKF community contribution roadmap
description: Concrete ways this repo can contribute useful patterns, validators, and examples back to the wider OKF and open-knowledge community.
source: ["wiki/meta/okf-profile.md", "scripts/validate-okf.js", "https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md", "https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing"]
verified: 2026-06-23
tags: [okf, open-source, roadmap, community]
timestamp: 2026-06-23
---

# OKF community contribution roadmap

This repo can be more than a local project wiki. It can act as a field test for OKF in public-interest archives, small open-source projects, and human-agent collaboration workflows.

## Near-term contributions

- **A project-wiki profile** — document a practical layer above base OKF for repos that need status, operations, source evidence, and handoff context.
- **A dependency-free validator** — keep `scripts/validate-okf.js` small, readable, and easy to copy into other repos.
- **Templates** — maintain copyable templates for systems, concepts, people, events, and playbooks.
- **An adoption playbook** — show how to start with a few high-value pages instead of trying to document a whole repo at once.
- **A quality model** — define checks for navigation, evidence, operations, security, and community usefulness.
- **Renderer UX requirements** — make local graph navigation and per-concept freshness badges part of the profile, not decoration.
- **Bundle flight recorder** — publish generated JSON and markdown for graph policy, concept inventory, drift risk, freshness, and orphaned concepts.
- **Blindfold scenarios** — test whether a new reader can answer common project questions starting only from the root wiki index.
- **Enhancement radar** — keep a short queue of copyable experiments so the repo does not lose the next useful moves after each iteration.

## Medium-term contributions

- **Machine-readable profile output** — have the validator emit JSON so CI, graph viewers, and other agents can consume findings.
- **Changed-file drift report** — flag concepts whose source paths changed after their `verified` date.
- **Flight-recorder diff** — compare two inventory snapshots so PR review can see knowledge-health changes.
- **Profile conformance pack** — publish optional profile JSON, fixtures, and validator output modes.
- **Public/internal bridge sample** — export safe public seed data from internal OKF concepts with redaction tests.
- **Public archive bridge** — map the public `#wiki` seed-data contract to OKF concepts without coupling public community content to internal maintainer notes.
- **Cross-repo example set** — apply the same profile to one small personal project, one data project, and one public archive so the pattern is not overfit to Rosen.

## Upstream-facing ideas

These are candidates for issues, discussions, or examples in the wider OKF community:

- A "project wiki" profile for software repos that need operational context, not only data-catalog metadata.
- Guidance on `source` and `verified` fields as a portable evidence layer.
- Guidance on freshness badges as a default trust primitive for OKF renderers.
- Guidance on local-first graph navigation instead of global graph decoration.
- Guidance on whether `README.md` should be treated as a concept, ignored, or reserved by profile.
- A minimal link/index validator pattern that stays compatible with permissive OKF consumers.
- Examples of separating internal OKF bundles from public wiki/content features in the same repo.

## Guardrails

- Do not make this profile look normative for all OKF users.
- Do not add tooling that requires a platform account, cloud service, or model provider.
- Do not expose private operational knowledge in a public sample.
- Keep the examples readable in GitHub without a renderer.
