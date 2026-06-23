---
type: profile
title: Rosen project OKF profile
description: The stricter project-wiki conventions this repo layers on top of the minimal OKF v0.1 specification.
source: ["https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md", "https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing", "wiki/README.md", "scripts/validate-okf.js"]
verified: 2026-06-23
tags: [okf, profile, conventions, interoperability]
timestamp: 2026-06-23
---

# Rosen project OKF profile

OKF v0.1 is intentionally small: markdown files, YAML frontmatter, one required `type`, optional `title`, `description`, `resource`, `tags`, and `timestamp`, plus reserved `index.md` and `log.md` files. This repo uses a stricter **project-wiki profile** so the bundle is useful as an operating map, not only a loose note set.

This profile is optional. It should never be presented as base OKF. A consumer that understands only OKF v0.1 should still be able to read these files.

## Frontmatter

Every concept file in this bundle uses:

```yaml
---
type: concept
title: Short display name
description: One sentence explaining what the concept covers.
source: ["path/or/url", "command or event used as evidence"]
verified: 2026-06-23
tags: [domain, purpose]
timestamp: 2026-06-23
---
```

Field meanings:

- `type` — local routing label. Current local values are `concept`, `event`, `organization`, `person`, `playbook`, `profile`, `reference`, `system`, `template`, and `test`.
- `title` — human display name.
- `description` — one-sentence summary, useful for indexes and search snippets.
- `source` — evidence pointers. These may be repo paths, commands, URLs, issue references, calls, or emails. They are not secrets.
- `verified` — date the claim was checked against the repo, live system, or source material.
- `timestamp` — date this concept was authored or materially updated.
- `tags` — short lowercase categorization tokens.
- `resource` — optional OKF-native URI for concepts tied to a canonical asset.

## Body conventions

Use structural markdown: headings, short lists, tables, and fenced commands. The first section should answer "what is this and why does it matter?" before implementation detail.

Preferred section names:

- `## Current state`
- `## How it works`
- `## Commands`
- `## Risks`
- `## Verification`
- `## Future work`

Avoid copying long source docs. The OKF file should summarize the stable decision and link to the deeper source.

## Index conventions

Every directory with concept files has an `index.md`. The index is a progressive-disclosure map: a short heading, one-line orientation, and bullets that link every concept in that directory.

The root `wiki/index.md` may carry `okf_version: "0.1"` plus display metadata. Non-root index files should not carry frontmatter.

## Link conventions

Use relative markdown links. Link to:

- sibling OKF concepts for navigable project context;
- source docs in `docs/`, `data/`, `frontend/`, `backend/`, and `.github/`;
- external URLs only when they are authoritative source material.

Broken links are allowed by base OKF consumers, but this repo treats them as validation failures because stale links make the bundle less useful.

## Renderer requirements

Any graph renderer should open on a per-concept local graph: one hop by default, two hops as an expansion, and the global graph only as a filterable opt-in. Labels should be gated by zoom and node degree, not shown across the whole graph at once.

Any concept renderer should show a freshness badge derived from `verified` and `source`. See [wiki-ux-requirements.md](wiki-ux-requirements.md) and the generated [bundle-inventory.md](bundle-inventory.md).

## Security boundary

The bundle may name secret keys, GitHub secret names, pass entries, or credential locations. It must not include secret values, private keys, tokens, passwords, webhook secrets, or Drive folder identifiers that should not be public.
