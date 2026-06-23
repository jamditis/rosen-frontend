---
type: concept
title: OKF quality model
description: The checks that make an OKF bundle useful as shared project knowledge instead of stale documentation.
source: ["wiki/meta/okf-profile.md", "scripts/validate-okf.js", "https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md"]
verified: 2026-06-23
tags: [okf, quality, validation, review]
timestamp: 2026-06-23
---

# OKF quality model

Base OKF conformance is intentionally permissive. This quality model is stricter because this repo uses OKF as working project memory.

## Conformance

- Every concept file has YAML frontmatter.
- Every concept has a non-empty `type`.
- Root `wiki/index.md` declares `okf_version: "0.1"`.
- Reserved files (`index.md`, `log.md`) are not treated as concepts.

## Navigation

- Every directory with concepts has an `index.md`.
- Every concept appears in that directory's `index.md`.
- Internal links resolve.
- The root index tells readers which branch to open first.
- Rendered graph navigation starts from a per-concept local graph, one hop by default and two hops as expansion.
- Global graph views are filterable opt-ins; always-on graph labels are avoided.

## Evidence

- Every concept has `source`, `verified`, and `timestamp`.
- Counts, versions, URLs, credentials, and launch status have explicit re-verification paths.
- Claims that may drift are dated.
- Open questions are labeled as open, not written as decisions.
- Rendered concepts expose a freshness badge derived from `verified` and `source`.

## Operations

- The bundle includes commands for tests, data generation, preview, deploy, and issue selection.
- Known failure modes and blockers are visible near the system they affect.
- Public and internal surfaces are clearly separated.

## Security

- No secret values.
- Credential docs name only key names, secret names, or retrieval locations.
- Public-facing docs do not expose private Drive identifiers, passwords, tokens, or operational shortcuts that should stay private.

## Community usefulness

- Templates exist.
- The profile explains what is local convention versus base OKF.
- The bundle can be consumed by a generic OKF reader, but offers extra value to project-aware tools.
- CI guards the bundle so useful structure survives ordinary repo churn.
- Generated inventory and blindfold scenarios make navigation, drift risk, and freshness testable.
