---
type: concept
title: What the archive is
description: A public, searchable collection of Jay Rosen's four decades of journalism criticism and media theory, curated by Joe Amditis and hosted at pressthink.org.
source: [CONTEXT.md, CLAUDE.md, docs/narrative/project-history.md]
verified: 2026-06-22
tags: [overview, archive, mission]
timestamp: 2026-06-22
---

# What the archive is

**Jay Rosen's Internet Archive** is a public, searchable collection of the works, critiques, and teachings of [Jay Rosen](../people/jay-rosen.md), professor of journalism at NYU and creator of the PressThink blog. It spans four decades — from the early PressThink era through his recent posts — and includes his 1986 dissertation, *The Impossible Press*.

- **Live URL:** <https://pressthink.org/j/rosen-archive/>
- **Repository:** `jamditis/rosen-frontend`
- **Curator:** [Joe Amditis](../people/joe-amditis.md) (Center for Cooperative Media)

## What it holds

The [Archive](../data/corpus.md) is the whole collection — every [Record](../data/corpus.md), every [Entity](../data/corpus.md), and the derived [Entity Index](../data/schema.md) and [Facets](../data/schema.md) used to navigate them. As of 2026-06-22 it publishes **26,615 records**. See [data/corpus.md](../data/corpus.md) for the breakdown and [data/schema.md](../data/schema.md) for the vocabulary.

## Naming

The official name is **"Jay Rosen's Internet Archive"** (possessive) — Jay's request on the 2026-06-19 call, already shipped across the site title and OG/Twitter tags. On PressThink's own menu, the new project is **"Internet Archive"** and the old blogroll is **"Vault (2003–present)"**, to keep the two distinct.

## How it's built

A zero-build static site (React via CDN, HTM, sql.js) backed by a Python data pipeline. See [systems/frontend.md](../systems/frontend.md), [systems/data-pipeline.md](../systems/data-pipeline.md), and the deeper [docs/narrative/architecture.md](../../docs/narrative/architecture.md).
