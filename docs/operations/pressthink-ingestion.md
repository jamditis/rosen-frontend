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

CSV and history replacement use a durable pending transaction. Both successor
files are prepared and checked first. A recovery journal records their exact
bytes and the previous file hashes before either live file changes. A normal
retry completes an interrupted replacement before it observes a newer source.
Unexpected external edits stop recovery without overwriting them. Dry runs do
not perform recovery writes. The bounded journal holds up to 256 MB; larger
transactions fail before live replacement and require a reviewed storage change.
The canonical CSV retains its usual one-level backup. Completed journals are
removed; source history is retained.

Article IDs share `data/record-id-sequence.json` with manual submissions. Its
high-water mark advances and is fsynced before CSV/history replacement. Commit
that file with the CSV and journal. Removed rows never free an ID; a failed
transaction can leave a harmless gap. Never lower the mark during recovery.
Missing or invalid state stops intake. Restore verified state and compare current
and historical IDs before resuming. Other CSV writers stop while a PressThink
transaction is pending. Hosted CI requires reservations to cover canonical IDs.

The checkout has one writer. A lost race detected before journaling leaves no
pending write. If recovery stops on an unexpected edit, pause the writer and
preserve the journal and both targets before investigation. Compare target hashes
with the journal's before/after hashes. A target matching neither hash is
indeterminate: It might contain a partial transaction plus a later edit. Compare
its fields with the decoded before and after payloads, then reconcile the source
associations, proposed additions and any intentional removals before clearing the
journal. Retain the original journal and targets as recovery evidence. A hash
mismatch alone never proves that no replacement occurred. Never replace an
unexpected edit or discard a pending transaction automatically.

The adapter prepares data only. Scheduling, public publication, receipt delivery,
and per-source health must be verified separately when its publisher integration
is enabled. A local source change or successful dry run does not prove live
article ingestion. Existing Bluesky publication remains independent until that
integration lands.

All repository tests, builds, lint, and validation run on GitHub-hosted CI.
