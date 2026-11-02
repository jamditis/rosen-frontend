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
that file with the CSV and source history. Never commit a pending recovery
journal. Removed rows never free an ID; a failed
transaction can leave a harmless gap. Never lower the mark during recovery.
Missing or invalid state stops intake. Restore verified state and compare current
and historical IDs before resuming. Manual submissions and sheet synchronization
stop while a PressThink transaction is pending. Pause other maintenance writers
during recovery. Hosted CI requires reservations to cover canonical IDs.

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

The PressThink publisher has its own daily job, retry outcome and source receipt.
It shares the tested release builder, FIFO queue, version/cache update, Git push,
certificate-verified FTPS transfer and public byte verification with Bluesky.
New or updated article records rebuild article semantic vectors too. A no-change
run still verifies the public release. Failure to capture or publish PressThink
prevents a successful PressThink receipt. The Bluesky job can still run on its
own schedule.

Newly admitted articles receive a Work entity and an `Authored By` link to Jay's
existing Person entity, supported by the public author metadata. This is the
minimum graph coverage for a captured article. It does not claim that every
body entity or relationship has been extracted. Work labels retain the title
captured at admission as a stable bibliographic label. Later source titles appear
in the canonical record and preserved source versions; they do not rename those
graph labels automatically. Existing curated entity and relationship rows are
preserved. A conflicting relationship identity fails before publication.

The source journal is committed as an exact allowed path. It is not a public
website asset. The website content backup and the repository serve different
purposes: The monthly website mirror does not include this repository-only
journal. Its presence in Git does not prove a fresh Legion copy.

The public Worker stores PressThink outcomes in a separate source-scoped table.
A successful receipt settles only source associations present in the generated,
verified public export. Review holds and retired rows remain unsettled. A no-change
capture retains associations so receipt recovery does not require another edit.

Apply migration 0006 before deploying the Worker. Legacy Bluesky receipts and its
table remain unchanged. PressThink health uses the daily receipt time with a
36-hour allowance, separately from the weekly discovery backstop and the date of
the most recent blog edit. A missing, failed or stale PressThink receipt degrades
aggregate health. Run the first real publisher immediately after Worker activation.
Never manufacture a receipt to clear health.

All repository tests, builds, lint, and validation run on GitHub-hosted CI.

## Reviewed publisher feeds

The separate `publisher-feeds-stewardship.yml` job checks the verified CJR search,
CJR Jay Rosen author and Common Dreams Jay Rosen author RSS feeds daily at
20:47 UTC. Its serial matrix has `max-parallel: 1` and `fail-fast: false`: One
failed feed does not suppress the next attempt, and sibling jobs cannot race
inside the same release-queue run. Each feed has its own receipt and health.

The adapter checks robots, refuses redirects and bounds reads to 256 KiB and
100 items. These are finite current feed views, with no proven pagination or
exhaustive historical coverage. Only an exact Jay Rosen creator in author feeds,
or a clear Jay Rosen title in the CJR search feed, can create metadata records.
Other search hits remain review evidence. The publisher item link is identity;
GUID is provenance. Source dates retain their written calendar day and offset.
Fetch success time is separate from article publication time.

The version journal `preservation/publisher-feeds/versions.jsonl` contains only
bibliographic metadata. Descriptions and article bodies are neither captured nor
republished. Public records explicitly label metadata-only coverage, leave body
and word count absent, and retain review flags. They do not claim full-text
preservation or completed entity extraction. Existing author credits and curator
edits survive. In particular, about-Jay articles retain their real authors.

Both article adapters use the same native CSV, durable transaction and shared ID
reservation helpers. Cross-feed URL matches retain one canonical record; title
and year matches with a different URL remain syndication-review holds. Removed
IDs and prior feed associations are retained. Other writers stop while either
journal has an incomplete transaction. Disappearing feed items are reported,
never deleted from the archive or its history.

The Worker exposes `POST /discovery-run` only with the existing ingestion receipt
bearer authorization and live mode. It accepts no source URL or configuration.
This bounded operator permits supervised activation checks without waiting for
the next daily discovery tick. Its public health endpoint still triggers no
fetch. Use only the documented credential pointer, never a token in arguments.

Older captured feed metadata is reconsidered from verified journal heads even
when it is absent from the current finite RSS view. The report separates current
feed items, historical reconsideration and missing current identities. Replayed
versions retain `source_observed_at` and use `historical_reconciliation`; they do
not claim a new source observation. At most 2,000 current plus historical items
per feed are reconsidered. Retirements and unresolved syndication holds stay in
place. This recovers earlier captured associations, not unknown historical works.

For these metadata feeds, receipt and health `captured` counts all current and
historical items reconsidered. `held` includes unresolved historical items.
These counts are not the number of new RSS observations. The run report's
`current_feed_items` and `historical_reconsidered` give the split. Receipt
`sourceLatestAt` uses only the current RSS observations, or null for an empty
feed. Historical associations can settle a pending candidate without claiming
that the source was observed again.

The Bluesky publisher also reads the authenticated pending Jay URI ledger before
publication. It fetches at most 200 missing older posts with the fixed public
`getPosts` endpoint, independent of the normal moving cutoff. Those posts use the
same deterministic admission/context rules and source-provenance checks as recent
posts. Already canonical identities are not duplicated. Missing/deleted sources
remain explicitly unavailable and pending; they are never fabricated or treated
as an accepted record. A larger backlog fails before writes and requires reviewed
operator intervention. The existing robots and access boundaries apply.

The hourly notification-only watcher reads source-specific article health and
names the affected source and receipt error. It does not repair, publish, dispatch
or back up automatically. The separate PressThink root monitor remains every two
hours and notification-only.

The receipt token reaches only the authenticated Python candidate reader and the
receipt sender. Other preparation children, including tests, vector builds,
census generation and Git, receive a sanitized environment. Source URI aliases
can settle the same canonical record without changing its identity. Replayed
metadata groups normalized URL spellings, preserves the original managed identity,
and reports superseded historical aliases without deleting their evidence.
