# Archive health and Bluesky backfill: October 14, 2026

The public archive works, but regular publication of new Bluesky records is incomplete. The last canonical Bluesky update was August 24. This batch prepares the missing records through October 14 for review and publication.

## Health findings

- `jamditis/rosen-frontend` owns the current site and backend. The older `jamditis/rosen` and `jamditis/rosen-archive` repositories are archived.
- The [production site](https://pressthink.org/j/rosen-archive/) loads, displays record cards and filters, and serves 26,816 records. Its newest Bluesky record is `BSKY-03334`, dated August 24. The live release is 3.8.36.
- The [October 9 full-site deployment](https://github.com/jamditis/rosen-frontend/actions/runs/37957073901) passed its tests, upload, and live byte verification. Seven consecutive weekly deployments passed. Repeated deployments do not create new source records.
- The [discovery Worker health endpoint](https://rosen-source-discovery.jamditis.workers.dev/health) returns HTTP 200, `status: ok`, and `mode: live`. Its configured schedule is daily at 09:17 UTC. This endpoint reports configuration, not successful discovery history.
- The two documented personal Cloudflare credential routes cannot read this D1 database: Cloudflare returns error 7403. Recent discovery runs and candidate counts remain unverified. Credentials and access policy were not changed.
- Discovery-to-processing remains open in [issue #812](https://github.com/jamditis/rosen-frontend/issues/812). [Issue #743](https://github.com/jamditis/rosen-frontend/issues/743) covers operational health reporting. The submission-row sweep handles submitted records; it does not pull Jay's feed.

## Batch receipt

The fixed public DID was `did:plc:3t37x6vfigdzzp2gjcfnzlz4`. The public API's robots policy permits crawling. The existing `bluesky_feed_backfill.py` collector used `posts_with_replies`, a 100-item page size, an inclusive August 24 UTC cutoff, and complete cursor exhaustion before assigning IDs.

| Measure | Result |
| --- | --- |
| Feed pages / items examined | 49 / 4,800 |
| Existing entries skipped | 3,182 |
| Reposts excluded | 209 |
| Other entries before the cutoff | 1,308 |
| Missing Jay-authored posts captured | 101 |
| Source publication dates | August 25 through October 14 |
| New source IDs | BSKY-03335 through BSKY-03435 |
| Source post types | 34 originals, 63 replies, 4 quote posts |
| Substantive posts admitted in this proposal | 50 |
| Other items retained as context only | 51 |
| Public additions | 48 standalone records and THREAD-00019 |
| Existing public records removed | 0 |
| Authored context summaries | 17 |
| New mention relationships / new entities | 10 / 0 |

[The decision receipt](2026-10-14-bluesky-backfill-decisions.csv) records each source URI, CID, canonical record hash, type, decision, and context references. Full API responses were retained separately as run evidence. This is a capture of source records and metadata; attached media bytes and complete conversations were not preserved by this batch.

Titles, summaries, categories, and concepts were checked against Jay's source text. The parent, root, and quoted context needed by admitted replies and quote posts was available through the public API. Third-party context is represented by authored summaries rather than copied conversation text. Context-only items have `verified: FALSE` and cannot become standalone public records. `BSKY-03410` remains context inside the three-post thread with `BSKY-03409` and `BSKY-03412`.

The 10 graph assertions are literal mentions of existing, unambiguous named entities in Jay's accepted post text. The relationship CSV's original bytes were preserved before appending those assertions. No new entity or alias was inferred from another author's post. The registry census and generated-thread exception were refreshed without changing relationship holds or endpoint rules.

JSON, lexical search, analytics, RSS, OPML, relationship shards, and the stewardship census accompany the source update. Semantic search encodes the 49 new public documents with the existing local `Xenova/bge-small-en-v1.5` model. The 25,785 unchanged input texts retain their original vectors; the combined 25,834-row artifact has a fresh checksum. Release 3.8.37 and data-cache version v12 keep returning readers on one release.

## Verification and next action

The collector's 20 tests and the 362 pre-change data tests passed. Browser checks confirmed that a new record displays its source URL, authored summary, categories, and entity links. The new record count is 26,865. The complete Node suite, graph validation, dependency audit, and captured-feed idempotency check form the release checks recorded in the pull request.

Review and merge this batch, then publish the exact reviewed main through the existing full-site deployment workflow and read back the new live version and record IDs. The batch does not connect discovery to the office runner or change a schedule. Finishing #812 and restoring D1 run visibility remain necessary for regular unattended ingestion.

For the next manual batch, use an isolated worktree and the last canonical ingestion date:

```sh
python3 backend/scripts/bluesky_feed_backfill.py --since YYYY-MM-DD --all --dry-run
```

The collector alone leaves new rows unverified. Review admission and context before export. Refresh graph counts and generated-thread provenance, update semantic vectors for changed text, regenerate the public bundle, stamp the release and data cache, commit the inputs, and refresh the census. Run release checks before publication. Compare source activity, canonical ingestion, and the public record set separately; a green deployment or health endpoint cannot establish feed coverage.
