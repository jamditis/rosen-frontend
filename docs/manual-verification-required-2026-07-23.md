# manual verification required

Last updated: 2026-07-23.

This list is for records that still need a human browser capture, page print, PDF,
or copied source text before they can be marked verified.

At this checkpoint, only one archive record needs Joe's hands in a browser. The
PressThink recovery packet and entity merge packet are different queues: they
have enough local evidence for review, but they need curator decisions before
canonical import or merge work.

Related curator queues:

- `docs/pressthink-recovery-index-2026-07-23.md`
- `docs/entity-merge-review-queue-2026-07-23.md`

Related source-recovery queue:

- `docs/social-source-recovery-queue-2026-07-23.md`

## active records

### RECORD-00865

- Title: `#NN08 Sketchbook Rick Pearlstein: impressive. Very. I love it when the youngest person on the panel has the longest view.`
- Current archive URL: `https://www.huffpost.com/entry/nn08-sketchbook-rick-pear_b_113763`
- Legacy URL: `http://www.huffingtonpost.com/jay-rosen/nn08-sketchbook-rick-pear_b_113763.html`
- Current archive state: `verified=FALSE`, `low_confidence=TRUE`, `needs_review=TRUE`

Current evidence preserves the title and Jay Rosen authorship, but not a visible
2008 posted date or full body text. The row should stay unverified until stronger
source evidence is captured.

What has already been checked:

- The modern HuffPost entry URL returns a not-found page.
- The 2016 Wayback capture preserves the title and author, but not a visible
  2008 posted date.
- The same Wayback capture exposes `2011-05-25 12:40:20 -0400` as structured
  metadata, which appears to be a HuffPost migration date, not the original
  post date.
- Adjacent `#NN08` HuffPost records have source captures with visible
  `2008-07-19` timestamps, so this row's current date is sequence-inferred.
- The live HuffPost author page at `https://www.huffpost.com/author/jay-rosen`
  confirms the Jay Rosen profile and returns the migrated backfile through the
  author-card endpoint, but it does not return this `113763` short post.
- The author-card endpoint checked was:
  `https://www.huffpost.com/client/author/jay-rosen/cards?page=N&limit=10`.
  It returned 76 paginated cards, plus six embedded cards on the author page,
  and no match for `113763`, `nn08-sketchbook-rick-pear`, or `Rick Pearlstein`.

What Joe can capture manually:

1. Open `https://www.huffpost.com/author/jay-rosen` in a normal browser.
2. Use `Load More Articles` until the page stops loading.
3. Search the loaded page for `113763`, `Rick Pearlstein`, and `#NN08`.
4. If the record appears, save the page as PDF or copy the visible card text,
   URL, and any date shown.
5. Open the legacy Wayback capture:
   `http://web.archive.org/web/20160212022545/http://www.huffingtonpost.com/jay-rosen/nn08-sketchbook-rick-pear_b_113763.html`
6. If the browser renders more text than the fetched HTML did, save as PDF or
   copy the article body, visible date, and author block.
7. If no source reveals a visible original date or body, leave this record
   unverified and keep the row marked `low_confidence=TRUE` and
   `needs_review=TRUE`.

Minimum evidence needed to mark the row verified:

- A source-visible title or body matching the archive title.
- Jay Rosen authorship.
- A trustworthy original posted date, preferably visible as `07/19/08` or
  equivalent.

