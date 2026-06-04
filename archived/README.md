# archived/

Reference-only code kept out of the production deploy (see the "do not upload"
list in [`DEPLOYMENT.md`](../DEPLOYMENT.md)). Not part of the live static site.

## What's here

- `dissertation-tools/` — 7 earlier standalone dissertation tools (comparison,
  concepts, context, excerpts, faq, glossary, timeline) plus a `source/` bundle
  (the dissertation PDF, a transcribed markdown copy, and a build helper). The
  3 maintained surfaces (reader, foreword, network-effect) live in
  `dissertation/` instead.

## Why these are still tracked

The 7 tools were uploaded to WordPress once and are still served on production,
even though the FTP deploy manifest no longer includes them — so this is the
only editable source for those live pages. Whether to fold them back into the
maintained `dissertation/` directory or leave them here is an open call; see the
dissertation-tools entry in [`docs/decisions-pending.md`](../docs/decisions-pending.md).
They were left in place
when the rest of `archived/` (archive-v1, the Win95 promo site, the BYOK chat,
old web snapshots, and legacy docs) was pruned in #166.

## Rule

Do not edit code under `archived/`. An edit here does not reach production via
the current deploy workflow.
