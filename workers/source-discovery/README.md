# Rosen source-discovery Worker

This is the implementation for [issue #806](https://github.com/jamditis/rosen-frontend/issues/806).

It is a read-only candidate-discovery control plane. It is not the archive scraper, entity extractor, relationship mapper, or deployment service.

## Safety boundary

- `DISCOVERY_MODE` is `live` and runs once daily at 09:17 UTC.
- The Worker has one dedicated D1 database: `rosen-source-discovery-ledger`.
- D1 stores source validators, run state, candidate locations, content IDs, post types, root and parent identifiers, and review status only.
- D1 never stores feed bodies, item titles, article text, credentials, archive CSV data, or review notes.
- The configuration has no KV, R2, Queue, AI, Vectorize, secret, or route binding.
- The Worker only offers `GET /health`. It has no HTTP endpoint that starts discovery or accepts a URL.
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
It uses a local D1 database.

## Deployment and rollback

Apply migrations before deploying:

```bash
wrangler d1 migrations apply rosen-source-discovery-ledger --remote --config wrangler.jsonc
wrangler deploy --config wrangler.jsonc
```

Migration `0004_candidate_history_index.sql` adds the bounded Bluesky history lookup index. Candidate writes use batches that stay below D1's 100-parameter statement limit.

Keep `pressthink.org` unconfigured. This personal account does not control that zone.

To stop the pilot, remove the cron trigger or deploy with `DISCOVERY_MODE` set to `disabled`. Delete the Worker and its dedicated D1 database only after exporting any reviewer-needed candidate ledger.

The existing pipeline remains responsible for SSRF protection, full scraping, browser rendering, extraction, entity and relationship proposals, canonical CSV writes, tests, pull-request review, and Plesk deployment.
