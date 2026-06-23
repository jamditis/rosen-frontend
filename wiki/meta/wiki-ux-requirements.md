---
type: concept
title: Wiki UX requirements
description: Non-negotiable wiki navigation and trust requirements derived from prior UX research on graph-heavy knowledge wikis.
source: ["User UX research synthesis, 2026-06-23", "docs/plans/2026-06-21-community-wiki-spec.md", "wiki/meta/bundle-inventory.json"]
verified: 2026-06-23
tags: [okf, wiki, ux, graph, freshness]
timestamp: 2026-06-23
---

# Wiki UX requirements

Two wiki anti-patterns are load-bearing design constraints for both the repo-maintenance OKF bundle and any public archive wiki renderer.

## Local graph first

Avoid a hairball graph as decoration. A global force graph becomes more interesting to look at than to navigate once the corpus grows, especially past a few hundred nodes.

The required default is:

- show a per-concept local graph first;
- show one hop by default;
- allow a two-hop expansion;
- keep the global graph as an explicit, filterable opt-in;
- gate labels by zoom level and node degree;
- do not show all labels all the time.

The flight recorder supports this by emitting `graphPolicy` and per-concept local graph fields in [bundle-inventory.json](bundle-inventory.json).

## Freshness visible everywhere

Staleness damages trust in the whole wiki, not only the stale page. Each concept already carries enough OKF metadata to expose a freshness badge: `verified` and `source`.

Renderers should show a per-concept badge anywhere a concept is presented:

| Badge | Meaning |
| --- | --- |
| Fresh | Verified within 30 days of the bundle inventory date. |
| Watch | Verified within 31-90 days. |
| Stale | Verified more than 90 days ago. |
| Unknown | Missing or invalid verification metadata. |

The badge should show the verification date and source count on hover, focus, or detail expansion. High-change topics can still be fresh; drift risk and freshness are related but separate signals.

## Acceptance checks

- A concept page can be understood without opening a global graph.
- The default graph view never hides the main concept behind a large unlabeled network.
- Labels appear only when the view has enough zoom or the node degree is low enough.
- Every concept card, detail page, search result, and generated report has visible freshness state.
- Freshness is derived from OKF metadata, not from a separate hand-maintained trust table.
