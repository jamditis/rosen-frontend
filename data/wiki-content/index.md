---
okf_version: "0.1"
title: Jay Rosen Internet Archive public wiki
description: Reader-facing concept and entity pages for the archive, authored in OKF and generated into the public wiki.
---

# Jay Rosen Internet Archive public wiki

This bundle holds the public, reader-facing wiki content for the archive: the key ideas from Jay Rosen's 1986 dissertation, *The Impossible Press*, as concept pages, the chapters that frame them as topic pages, and the people and works they connect to.

It is the source of truth for `data/wiki-seed.json`, which `data/build-wiki-seed.js` generates and the frontend renders at `#wiki`. The internal maintainer bundle lives separately at `wiki/`.

## Sections

- [Concepts](concept/index.md): the key ideas
- [Entities](entity/index.md): people, works, and organizations
- [Topics](topic/index.md): one page per dissertation chapter
