# Daily Bluesky publication

The archive has two daily jobs. The Cloudflare Worker discovers candidate locations
at 09:17 UTC. The GitHub Actions publisher captures and processes Jay Rosen's public
Bluesky feed at 18:47 UTC. Publication runs in the existing FIFO release queue with
full-site deployments and record submissions. It does not depend on officejawn
being online.

[Actions runs](https://github.com/jamditis/rosen-frontend/actions/workflows/bluesky-stewardship.yml)
and the [public health endpoint](https://rosen-source-discovery.jamditis.workers.dev/health)
show capture and publication outcomes. Work is tracked in the
[Rosen Archive stewardship project](https://github.com/users/jamditis/projects/4),
[handoff issue #812](https://github.com/jamditis/rosen-frontend/issues/812), and
[health issue #743](https://github.com/jamditis/rosen-frontend/issues/743).

## Admission and preservation

The collector uses Jay's fixed DID `did:plc:3t37x6vfigdzzp2gjcfnzlz4`, the public
AppView API, and `posts_with_replies`. It checks the public API's robots policy,
allows only the fixed feed and context endpoints, and disables redirects. It
retries transient network errors, 429, and transient server errors within bounded
limits. A 401, 403, policy denial, invalid payload, incomplete pagination, or
invalid author identity fails before canonical rows are written.

Each capture exhausts the feed within explicit page and item bounds. It starts
with a 24-hour overlap before the newest canonical Bluesky source timestamp and
deduplicates by source URI. Reposts and other authors' posts are excluded. Original
CSV bytes and IDs are preserved; new IDs are assigned in source-time order.
Raw API snapshots, context, hashes, and the decision report stay in the runner's
private temporary directory. This capture does not preserve attached media bytes
or full conversations. Longer-term source preservation remains separate work.

Admission is conservative and deterministic. A substantive Jay-authored post must
meet text and taxonomy thresholds. Replies and quote posts also require verified
context. Titles and summaries derive from Jay's own text; context identifies the
source relationship without copying another author's commentary into Jay's record.
Acknowledgments and uncertain cases remain context-only with `verified: FALSE`.
They cannot become standalone records. This path uses no remote language-model API
and does not invent entities or graph assertions. Manual batches can add reviewed
editorial summaries and literal entity mentions separately.

The publisher rebuilds public JSON, lexical indexes, analytics, feeds, and graph
artifacts. A generated thread exception is added only when its members and reply
chain match the canonical source rows. Existing graph holds remain in force.
Semantic vectors use the existing local `Xenova/bge-small-en-v1.5` model. Checksummed,
unchanged inputs reuse their vectors; new or changed inputs are encoded locally.
The release number, module imports, service worker, and data cache advance together.

## Publication contract

The publisher tests the complete generated release before pushing explicit data
and version paths through the existing GitHub App. It refuses a moved main branch.
Certificate-verified FTPS uploads dependencies before release entry points and keeps
the existing making-of publication hold. Live byte verification compares the tested
release with the ordinary public URLs. A successful Git push or upload alone does
not count as publication.

The authenticated receipt has a schema version, run/attempt ID, canonical commit,
release version, outcome, counts, source timestamp, and candidate decisions. D1
stores only compact operational metadata. The Worker has no GitHub or FTPS
credentials, canonical writer, arbitrary URL endpoint, or publication permission.
Repeated receipt delivery is idempotent. Decisions can arrive before the next
discovery tick. Failed runs carry no admission decisions. Dry runs send no receipt
and do not change candidate status or health history.

An empty capture is healthy when the public bytes match the tested canonical head.
If an earlier push reached main but its upload failed, the next run tests and
redeploys that existing head without assigning duplicate source rows. A repeated
failure creates or updates one GitHub issue with the run link and a safe error class.

## Health and recovery

Live health requires recent successful Bluesky discovery and a successful
`published` or verified `no_change` receipt within 36 hours. PressThink keeps its
168-hour source-check interval plus the same grace period. A missing heartbeat,
failed publication, ledger failure, or stale source check returns HTTP 503.
An independent hourly user timer on officejawn checks this endpoint. Two consecutive
failed checks send one Telegram alert through the supported notification route;
recovery sends one resolution. Officejawn downtime delays this watch, while Actions
publication and GitHub failure issues remain independent.

For an incident, inspect health, the linked Actions run, and the existing failure
issue. Re-run the failed publisher after fixing the recorded cause. The release
queue prevents overlap with ordinary full-site deployment. A dry-run dispatch
captures and verifies without changing main, production, candidate decisions, or
the publication heartbeat. Do not work around robots, authentication, or source
policy failures.

The existing full-site deploy workflow remains a manual recovery path. Verify its
live-byte step and then run the publisher to record current ingestion health.
To pause scheduled ingestion, remove its cron schedule in reviewed source. To
pause edge discovery, remove the Worker's trigger or deploy disabled mode. Preserve
the canonical CSVs and D1 ledger. Do not delete either as a recovery shortcut.

## Credential and live-state evidence

On October 14, the two documented personal Cloudflare API tokens lacked D1 access
and returned error 7403. The existing Wrangler OAuth session had the required D1
scope. A read of the actual production database confirmed a successful Bluesky
discovery at `2026-10-14T09:17:25Z`, daily successful runs, 216 pending Bluesky
candidates, and 25 pending PressThink candidates. This resolves the earlier audit's
visibility limitation; it did not require replacing unrelated Cloudflare tokens.

Use `wrangler whoami` to confirm the account before operations. Apply the dedicated
database migrations before Worker deployment. The receipt credential is encrypted
at `claude/rosen/ingestion-receipt-token` and bound as Worker secret
`INGESTION_RECEIPT_TOKEN` and repository secret `ROSEN_INGESTION_RECEIPT_TOKEN`.
Retrieve it only into process memory or documented secret input. Never put its
value in command arguments, logs, source files, or receipts.

```sh
wrangler d1 execute rosen-source-discovery-ledger --remote \
  --config workers/source-discovery/wrangler.jsonc \
  --command 'SELECT * FROM discovery_source_state; SELECT * FROM archive_ingestion_runs ORDER BY checked_at DESC LIMIT 3;' --json
node --test workers/source-discovery/test/*.test.js
python3 -m pytest backend/tests/test_bluesky_batch_update.py backend/tests/test_post_ingestion_receipt.py
npm test
```
