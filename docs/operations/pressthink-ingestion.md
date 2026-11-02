# PressThink article intake

The PressThink adapter reads the fixed public WordPress posts API. It checks
robots.txt, refuses redirects, limits response sizes, and requires a complete
pagination walk within 2,000 posts. An incomplete or changing page set fails
before canonical writes. Raising that bound requires a reviewed change.

`backend/scripts/pressthink_batch_update.py` captures source HTML and parsed text
with public title, author, publication time, modification time, and canonical
URL. WordPress user endpoints currently do not expose the author, so authorship
comes from the public article's Yoast author metadata. Missing authorship fails
capture. Only posts attributed to Jay Rosen can create new records. Other
authors appear in the operational report for review.

New records use source excerpts for summaries, the existing deterministic
taxonomy matcher, and an explicit review flag. No remote language-model API is
called. Existing canonical URLs retain their IDs. A later change updates a
field only when the row belongs to this adapter and that field still matches
the prior captured value. Curator changes survive. Existing curated records
receive source-version evidence without automatic metadata replacement.
Day-bearing WordPress URL aliases retain the existing ID. Ambiguous URL matches
or an existing title from the same year go to review without creating a second
record. The report lists proposed additions and possible matches. A curator's
removed row is recorded as retired and is not recreated; unrelated intake can
continue. Uncategorized records carry the low-confidence flag.

`preservation/pressthink/versions.jsonl` retains public source versions in an
append-only chain with a SHA-256 and previous-version hash for each WordPress
post identity. Every run verifies the existing chain before preparing changes.
Unchanged captures add no rows or versions. A missing source is reported without
deleting its canonical record or prior evidence. Absence alone does not prove
deletion. Original source rights continue to apply.

The adapter uses the archive's Node CSV bridge. Python's ordinary CSV reader
cannot safely parse the existing mixed newline representation. Unchanged rows
retain their original bytes, and the bridge verifies the successor CSV before
replacement.

The adapter prepares data only. Scheduling, public publication, receipt delivery,
and per-source health must be verified separately when its publisher integration
is enabled. A local source change or successful dry run does not prove live
article ingestion. Existing Bluesky publication remains independent until that
integration lands.

All repository tests, builds, lint, and validation run on GitHub-hosted CI.
