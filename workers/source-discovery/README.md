# Rosen source-discovery Worker

This is the implementation for [issue #806](https://github.com/jamditis/rosen-frontend/issues/806).

It is a read-only candidate-discovery control plane. It is not the archive scraper, entity extractor, relationship mapper, or deployment service.

## Safety boundary

- `DISCOVERY_MODE` is `live` and runs once daily at 09:17 UTC.
- The Worker has one dedicated D1 database: `rosen-source-discovery-ledger`.
- D1 stores source validators, run state, candidate locations, content IDs, post types, root and parent identifiers, review status, and compact publication receipts.
- D1 never stores feed bodies, item titles, article text, credentials, archive CSV data, or review notes.
- The configuration has no KV, R2, Queue, AI, Vectorize, or route binding. The one receipt secret grants permission to record operational metadata only.
- `GET /health` reads recent successful discovery and verified publication receipts. A missing, failed, or stale receipt returns HTTP 503.
- `POST /ingestion-receipt` accepts authenticated, bounded receipts from the GitHub publisher. It cannot start discovery, fetch a supplied URL, write archive CSVs, or publish the site.
- `GET /ingestion-candidates` authenticates with the same token and returns a bounded page of pending Jay source URIs. The publisher uses canonical rows to settle earlier successful captures after upload or receipt recovery.
- It deploys only to `https://rosen-source-discovery.jamditis.workers.dev`.
- The source manifest is fixed in source code. It allows HTTPS URLs from named origins and paths only.
- The source manifest is versioned. Increase `SOURCE_MANIFEST_VERSION` only when a reviewed source boundary or adapter shape changes.
- The public Bluesky source is Jay Rosen's fixed DID `did:plc:3t37x6vfigdzzp2gjcfnzlz4` on the public AT Protocol AppView endpoint. It uses `posts_with_replies` to include Jay's replies outside Jay-authored threads.
- The Bluesky adapter reads one fixed public API `robots.txt` policy. It checks that policy against the complete query for every page.
- A Bluesky redirect cannot change the resource, fixed author-feed query, or requested cursor.
- The Bluesky adapter reads at most four pages and 100 candidates. It stops at a recent known non-repost candidate.
- The Bluesky adapter reports `pagination_truncated` when a page or candidate limit stops a run. It does not advance conditional validators for that run.
- The Bluesky adapter classifies original posts, replies, quote posts, reposts, and entries in Jay-authored threads. It does not classify archive value.
- Each applicable source reads `robots.txt` first. A disallow, crawl delay, 401, 403, 429, CAPTCHA, paywall, large response, invalid payload, or unsafe redirect stops that source.
- Conditional feed requests use stored ETag and Last-Modified values.
- A transient network failure, response-read error or timeout, `429`, or `5xx` result
  creates an exponential per-origin backoff from 15 minutes to 24 hours.
- PressThink runs as a 168-hour backstop after a successful check.

The manifest starts with Jay Rosen's public Bluesky author feed. It retains the public PressThink WordPress index as a low-frequency backstop. The Worker only records compact source metadata. The existing repository workflow remains the only route to archive publishing.

## Local checks

Run these commands from this directory:

```bash
node --test test/*.test.js
wrangler types /tmp/rosen-source-discovery-worker-configuration.d.ts --config wrangler.jsonc
wrangler dev --local --test-scheduled --config wrangler.jsonc
```

The type command generates a temporary binding declaration. The last command
starts a local server. `GET /health` confirms the mode and public source labels.
It uses a local D1 database. In live mode an empty ledger is degraded until both
discovery and publication have succeeded. PressThink retains its weekly allowance;
Bluesky discovery and publication must succeed within 36 hours.

## Deployment and rollback

Apply migrations before deploying:

```bash
wrangler d1 migrations apply rosen-source-discovery-ledger --remote --config wrangler.jsonc
wrangler deploy --config wrangler.jsonc
```

Migration `0004_candidate_history_index.sql` adds the bounded Bluesky history lookup index. Candidate writes use batches that stay below D1's 100-parameter statement limit.

Migration `0005_ingestion_health.sql` adds publication receipts. Set
`INGESTION_RECEIPT_TOKEN` with Wrangler secret input before deploying. The matching
GitHub secret is `ROSEN_INGESTION_RECEIPT_TOKEN`; its encrypted credential pointer
is `claude/rosen/ingestion-receipt-token`. Never put its value in configuration,
commands, logs, or documentation. Each request carries at most 40 candidate
decisions. Identical delivery is idempotent; older receipts cannot reverse newer
candidate decisions. Raw source snapshots and canonical data stay outside D1.

The [daily publisher runbook](../../docs/operations/bluesky-stewardship.md)
describes capture, tests, publication verification, recovery, and the independent
health watch.

Keep `pressthink.org` unconfigured. This personal account does not control that zone.

To stop the pilot, remove the cron trigger or deploy with `DISCOVERY_MODE` set to `disabled`. Delete the Worker and its dedicated D1 database only after exporting any reviewer-needed candidate ledger.

The existing pipeline remains responsible for SSRF protection, full scraping, browser rendering, extraction, entity and relationship proposals, canonical CSV writes, tests, pull-request review, and certificate-verified FTPS publication. The external hosting owner provides the transfer account; this project does not administer the domain or hosting server. The account can list the broader PressThink document root, so the deployment client's path checks enforce the archive scope.
