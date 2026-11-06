# Archive handoff and stewardship guide

Updated: November 6, 2026

This guide explains what a new steward needs to operate, preserve, and take responsibility for the Jay Rosen archive. It describes the repository’s current operating arrangements. It does not certify who owns the connected accounts, that backups exist elsewhere, or that a transfer of responsibility has already happened. Record those facts in the handoff register below.

The public archive is at [pressthink.org/j/rosen-archive](https://pressthink.org/j/rosen-archive/). Its source, data, and operating instructions are in [jamditis/rosen-frontend](https://github.com/jamditis/rosen-frontend). The technical publishing procedure is [DEPLOYMENT.md](../DEPLOYMENT.md).

## 1. What you are taking care of

The archive is a static website: visitors receive files that their browser reads and searches. The public site does not need the editor’s spreadsheet, a running Python server, or a maintainer’s computer to serve its existing collection. Adding material, rebuilding search files, publishing changes, monitoring failures, and preserving source evidence depend on additional services.

Keep these three kinds of material distinct:

- **The catalog:** the descriptions, dates, source links, identifiers, classifications, and relationships that tell people what the archive contains.
- **The published website:** pages and generated search, data, and relationship files used by visitors.
- **Preservation evidence:** original or captured source material, checksums, capture histories, rights decisions, and verified copies held elsewhere.

A working website or a complete catalog does not establish that every linked article, post, image, or video has been preserved. A missing source can remain represented by its catalog record while recovery is investigated. Retain the record’s identifier and clearly describe the limitation.

## 2. Assign people and verify access

Before calling a handoff complete, fill in a private register with a primary person, a backup person, a recovery method, and the date access was tested for each responsibility. Do not put passwords, private keys, recovery codes, or personal account details in this public repository.

| Responsibility | Primary and backup — confirm | Access or decision to verify |
|---|---|---|
| Editorial stewardship | To be recorded | Inclusion, corrections, source attribution, review holds, rights questions |
| Technical maintenance | To be recorded | Repository administration, tests, release workflows, recovery |
| Website hosting and domain | To be recorded | PressThink hosting, archive directory, certificate, DNS contact |
| Connected accounts | To be recorded | Google, GitHub App, Cloudflare, API credentials, renewal and billing contacts |
| Preservation and backups | To be recorded | Independent copies, fixity checks, source files, restoration drills |
| Monitoring and incidents | To be recorded | Failed workflow notifications, health monitoring, alert destination |

Repository access, hosting access, and domain control are separate responsibilities. The source-discovery Worker uses a Cloudflare account; that does not establish control over PressThink’s domain. Verify each service directly with the responsible account holder. Record costs, quotas, renewal dates, and a funding owner using the actual account settings. There is no guarantee that hosting, APIs, storage, or free service allowances will remain free.

## 3. Know where the records live

The curated article catalog is `data/archive_records-public.csv`; social records are in `data/social_posts.csv`. Entity and relationship data are in `data/extracted_entities.csv` and `data/extracted_relationships.csv`. The schema and taxonomy explain how those fields should be interpreted. Generated JSON, search indexes, embeddings, feeds, and relationship shards support the website and must stay consistent with their inputs.

The master Google Sheet supports submission and enrichment work. Its contents and queue are not automatically equivalent to the public CSVs. Follow [the adding-records guide](../ADDING-RECORDS.md) and [maintenance runbook](setup/maintenance-runbook.md) for the relevant route. Older backend routines use exported CSV files under `csv/`; they are not a live connection to the master Sheet.

When correcting a record, preserve its stable ID, keep evidence for the correction, and rebuild the affected outputs using the documented tools. A source’s wording, an editor’s summary, and a machine suggestion must remain distinguishable. Do not silently replace uncertain claims with confident ones.

## 4. Understand the current automation

These are schedules committed in the repository. They are intended run times in UTC; scheduling can be delayed. Inspect actual Actions runs and the Worker health report to establish whether a particular run happened and succeeded.

| Process | Committed schedule | What it does |
|---|---|---|
| Cloudflare source discovery | Daily, 09:17 UTC | Checks a fixed source allowlist and keeps candidate and operating metadata in D1; PressThink discovery has a longer per-source interval |
| Bluesky stewardship | Daily, 18:47 UTC | Collects the allowed author feed, applies conservative rules, rebuilds, tests, publishes, verifies live files, and reports a receipt |
| PressThink stewardship | Daily, 19:47 UTC | Runs the separate article ingestion and publishing path |
| Publisher-feed stewardship | Daily, 20:47 UTC | Runs CJR search, CJR author, and Common Dreams consumers in sequence |
| Full-site deployment | Friday, 09:17 UTC, and manual dispatch | Tests and transfers the reviewed main branch through the release queue |

The discovery Worker does not hold the GitHub or hosting credentials used to publish the archive. It does not write the canonical CSVs. Its D1 database holds compact candidate, decision, and health information. See [the Worker guide](../workers/source-discovery/README.md).

The daily Bluesky path can admit and publish qualifying records without a person approving each one. It uses a fixed author identity, bounded collection, deterministic rules, and checks for source and thread context. Uncertain or context-only material can remain unverified. This route does not call a remote language-model API or create entity and relationship assertions. Stop and investigate authentication, robots, policy, or incomplete-collection failures; do not work around them to force a green run.

Some other work remains attended. The batch maintenance runner is manually dispatched. Its `sync_to_archive` job creates a review PR; it does not itself merge or publish. The proposal and decision machinery under `stewardship/` is an offline contract, not an installed end-to-end publishing service. The [Bluesky design map](bluesky-stewardship-pipeline.md) also contains future work. Use [the current operations runbook](operations/bluesky-stewardship.md) for implemented behavior.

## 5. Publish through the documented release path

The publication workflows share a first-in, first-out release queue so that transfers do not overlap. A successful commit or upload is only part of a release. The daily stewardship workflows verify the live bytes and then record the outcome. Check the run’s tested commit, release version, transfer result, live verification, and receipt together.

Production currently uses certificate-verified explicit FTPS on port 21. The production selector is `ROSEN_TRANSFER_PROTOCOL=ftps`, the archive root is `ROSEN_SFTP_SITE_PATH=j/rosen-archive`, and the data directory is `ROSEN_SFTP_REMOTE_PATH=j/rosen-archive/data`. The retained `SFTP` names do not mean production uses SFTP. Omitting the protocol selector can select the legacy adapter and fail against the current service.

Deployments that change existing semantic-recall artifact pairs require the approved rollback directory, configured by `ROSEN_SFTP_TRANSACTION_PATH`, outside the public archive root and inaccessible over HTTP. The current FTPS arrangement uses `.rosen-archive-transactions`. This provides targeted recovery for those paired artifacts; it does not make publication of the entire website atomic. First publication and byte-identical redeploys do not require that pair rollback storage. Confirm the server’s protection before relying on it.

Use the explicit deployment allowlist in [DEPLOYMENT.md](../DEPLOYMENT.md). Materialize the current Git LFS assets, including the dissertation PDF and semantic model/runtime files. Publish dependencies before the entry pages, service worker, and version markers. Never upload the whole checkout: working CSVs, private captures, credentials, backups, and operational files do not belong on the public server.

GitHub Pages and PressThink are separate destinations. Publishing one does not prove the other is current. If the interface shows an older count or version while live data files match the tested release, investigate browser and service-worker freshness before declaring the transfer broken.

The “making of” feature remains under an explicit publication hold. Do not deploy it or treat its provisional first-person text as approved. Follow `AGENTS.md` and obtain Joe’s explicit approval before lifting that hold.

## 6. Preserve more than the website

The daily Bluesky workflow’s raw API snapshots, context, hashes, and detailed decision reports are temporary runner artifacts. It does not preserve attached media or complete conversations as durable source holdings. D1’s compact ledger does not replace those source files. Planned object storage or a preservation design is not evidence that a capture has been stored successfully.

The PressThink article adapter retains captured source HTML, parsed text, and public metadata in the append-only `preservation/pressthink/versions.jsonl` journal, with linked hashes. This journal is committed to the repository and excluded from public website deployments; a website mirror does not preserve it. The reviewed CJR and Common Dreams feed adapters retain bibliographic metadata in `preservation/publisher-feeds/versions.jsonl`. They do not capture or republish article bodies or descriptions, and their finite feed views do not establish complete historical coverage. See [article and publisher-feed operations](operations/pressthink-ingestion.md). A journal’s presence in Git does not establish a verified independent copy.

The [preservation manifest](../preservation/README.md) records source checks, capture attempts, artifacts, copies, fixity checks, rights, and review history. A catalog baseline imported into that system is still a baseline; it is not a verified web capture. A derived Wayback replay URL is not proof that someone has opened and checked the replay.

For each retained source, record what was captured, when, by which method, where the bytes are held, the checksum, access or rights restrictions, and the result of opening the saved material. Keep original evidence and append corrections. Do not erase a failed capture, rejected proposal, or earlier rights decision to simplify the history. Follow [manifest migration instructions](../preservation/MIGRATING.md) when formats change.

## 7. Make a recoverable backup

The repository includes a checksummed data-baseline tool. A checksum is a fingerprint used to detect changed bytes. From a prepared checkout, create a dated baseline outside the repository and verify it:

```sh
npm run baseline:create -- --output /path/outside/repo/baseline-YYYY-MM-DD
npm run baseline:verify -- /path/outside/repo/baseline-YYYY-MM-DD
```

Keep the entire resulting bag together, including its payload, manifests, and metadata. Copy it to at least two independently controlled locations outside Git, verify each copy, and record custody and verification dates. These are actions the custodian must perform; the tool does not create remote backup copies. See [the baseline guide](../preservation/BASELINE.md).

That bag covers an explicit set of archive data files. A full handoff also needs:

- Repository history and the required Git LFS objects, plus the code and documentation needed to interpret and regenerate the catalog.
- Original source files and approved captures, preservation manifests, journals, checksums, and copy-location records.
- An export of the discovery D1 database, its migration files, and operating receipts before deleting or replacing the Worker or database.
- The master Sheet, queue state, Apps Script source and configuration, installed-trigger inventory, and account recovery arrangements.
- Hosting configuration, redirects, approved directory layout, and a secure credential inventory with owners and recovery instructions.

A downloaded repository ZIP is not proof that LFS content, Git history, or any of those external services has been retained. Do not place secrets inside a public backup bundle.

## 8. Recover in an isolated copy first

Pause the affected publishing route if continuing it could compound a problem. Save the failed run link, tested commit, release version, transfer report, and receipt status. Preserve the existing catalog and ledger before making repairs.

For a baseline restoration, keep the original bag untouched, verify a working copy, and create a fresh checkout of its recorded `Source-Commit`. Restore the bag’s `data/data/` payload into that checkout’s `data/` directory. Then run:

```sh
npm run baseline:verify -- /path/to/bag --restore-root /path/to/checkout
```

The restore root is the checkout, not its data directory. Materialize the required LFS files, install dependencies from the lockfile, and run the documented tests. Open the isolated site and check search, records, stable links, the dissertation, and relevant browsing tools. Reconcile external Sheet and D1 state separately; restoring catalog files does not rewind those services.

If a publisher committed successfully but its transfer failed, the new records may already be on main. After fixing the cause, the documented next run can test and redeploy that head without adding duplicate records, verify live files, and settle pending candidates. Do not append the same batch manually or fabricate a successful receipt.

## 9. Transfer accounts and migrate deliberately

Use each provider’s current transfer process. [GitHub Apps can be transferred](https://docs.github.com/en/apps/maintaining-github-apps/transferring-ownership-of-a-github-app); verify installation access, permissions, keys, and both submission and Actions integrations afterward. A repository transfer alone does not establish that every external credential or service has moved.

A [container-bound Apps Script inherits its container’s ownership](https://developers.google.com/apps-script/guides/bound). [Installable triggers run as their creator](https://developers.google.com/apps-script/guides/triggers/installable), so inventory them, recreate the required triggers under the continuing operator where appropriate, and test their authorization. Check account and organization restrictions before promising a particular Google ownership transfer.

Current Actions configuration includes `ROSEN_GH_APP_ID`, `ROSEN_GH_APP_PRIVATE_KEY`, `ROSEN_SHEETS_SA_KEY_JSON`, the transfer settings above, and `ROSEN_INGESTION_RECEIPT_TOKEN` for receipts. The Worker uses `INGESTION_RECEIPT_TOKEN`. Other jobs have their own settings; verify their current workflow and runbook. Rotate credentials through the affected services together, keeping secret values out of logs and this document.

For a new host, prepare and test a separate copy before changing DNS or the public address. Preserve stable record URLs and redirects, check browser security rules and service-worker scope, and transfer only the public allowlist. Retain the old release and recovery access until the new host passes acceptance checks.

## 10. Accept the handoff with evidence

Complete the handoff only when the receiving team can independently:

1. Access every required account and identify its primary owner, backup, recovery route, renewal obligations, and alert recipient.
2. Find and verify independent backups, including LFS and separately held source evidence.
3. Restore an isolated copy, pass its integrity checks, and demonstrate the main reader tasks.
4. Run an appropriate dry run, explain held or rejected records, and recognize which actions publish automatically.
5. Complete an authorized tested release, verify the public result, and locate its operating receipt.
6. Receive a test alert and follow the documented failure and recovery procedure.

Record the evidence, unresolved limitations, named accepting people, and acceptance date. Agree on a recurring review of backups, account access, costs, failed runs, source losses, and editorial requests. Any continuing dependency on a departing maintainer should have a named replacement and a completion date.
