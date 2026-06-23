---
type: concept
title: OKF enhancement radar
description: Prioritized next experiments for turning the Rosen OKF bundle into reusable open-knowledge tooling.
source: ["OKF explorer scan, 2026-06-23", "public wiki UX explorer scan, 2026-06-23", "wiki/meta/community-roadmap.md", "wiki/meta/wiki-ux-requirements.md"]
verified: 2026-06-23
tags: [okf, roadmap, tooling, ux]
timestamp: 2026-06-23
---

# OKF enhancement radar

This page captures the next unusual but practical moves after the flight recorder and blindfold test. The emphasis is on work that improves this repo and can be copied by other OKF or open-knowledge projects.

## Priority queue

| Idea | Why it matters | Likely hooks |
| --- | --- | --- |
| Profile conformance pack | Makes the local project-wiki profile copyable without implying it is base OKF. | `wiki/meta/okf-profile.md`, `scripts/validate-okf.js`, fixture bundles, JSON output mode. |
| Freshness contract | Turns `source` and `verified` into a portable trust signal for renderers. | `scripts/okf-flight-recorder.js`, `wiki/meta/wiki-ux-requirements.md`, public `deriveWikiFreshness(page, asOfDate)`. |
| Flight-recorder diff | Lets PRs show knowledge-health changes: new concepts, stale concepts, orphaned concepts, and drift-risk movement. | Compare two `bundle-inventory.json` files or two git refs. |
| Blindfold scenario format | Tests whether docs answer real tasks, not merely whether files exist. | `wiki/meta/blindfold-scenarios.json`, generic example scenarios, schema validation. |
| Local graph renderer contract | Prevents hairball-by-default renderers by making one-hop/two-hop and label-gating behavior testable. | `graphPolicy`, `localGraph`, `shouldShowWikiNodeLabel({ zoom, degree, isCenter })`. |
| Public/internal bridge | Shows how a civic archive can keep maintainer knowledge private while publishing safe public wiki seed data. | Redaction tests, allowlisted frontmatter fields, `data/wiki-seed.json` export sample. |

## Public wiki follow-ons

For the in-app `#wiki` surface, the next implementation order should be:

1. Add a shared freshness model from `lastUpdated` plus reference count.
2. Render freshness badges on detail headers, result cards, related chips, and future graph nodes.
3. Add a local concept orbit from related pages, one hop by default with a two-hop expansion.
4. Add a pure label policy helper before any visual graph work.
5. Add search-result explanations that say why a page matched.
6. Add section-level source coverage only after the page-level freshness contract is stable.

## Acceptance rules

- Any graph work starts from a concept, not the whole bundle.
- Any freshness work is derived from existing metadata, not a separate manually curated table.
- Any upstream-facing output keeps the local profile separate from base OKF v0.1.
- Any public bridge has redaction tests before publishing sample output.
