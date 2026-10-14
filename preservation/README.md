# Preservation manifest

This file documents the per-object preservation manifest (issue #701): a
versioned stewardship sidecar that connects an archive object to source
checks, captures, artifacts, storage copies, fixity checks, rights decisions,
and human review. For the separate, whole-archive checksummed baseline
snapshot (issue #702), see [`BASELINE.md`](BASELINE.md) instead.

The preservation manifest is a versioned stewardship sidecar. It connects an
archive object to source checks, captures, artifacts, storage copies, fixity
checks, rights decisions, and human review without adding operations metadata
to the curator-facing CSVs.

The CSVs remain the source of truth for published archive records. A manifest
records what preservation work happened to those objects. The index returned by
`buildPreservationIndex()` is derived and disposable; rebuild it from a valid
manifest instead of editing it.

## Files

- `preservation-manifest.schema.json` is the JSON Schema 2020-12 contract.
- `cdx-result.schema.json` is the separate version 1 contract for recorded
  Wayback CDX query results.
- `cdx-result.mjs` strictly parses recorded CDX JSON page bytes and emits a
  deterministic result sidecar without making a network request.
- `validate-preservation-manifests.mjs` validates schema rules, stable IDs,
  uniqueness, references, and append-only supersession.
- `import-winer-evidence.mjs` maps the existing Winer method evidence artifact
  into schema v1 without changing its source file.
- `import-social-baseline.mjs` packages the existing `data/social_posts.csv`
  rows into a schema v1 baseline without making a live network call.
- `import-preservation-sample.mjs` projects `data/preservation-sample.json`'s
  100 pilot sources into schema v1 objects without changing the sample file.
- `browsertrix-capture.mjs` runs a pinned, resource-limited Browsertrix
  container for one source and writes a machine-readable capture result.
- `examples/` contains successful capture, existing Wayback, bot-wall,
  oversize-abort, and rights-hold manifests.
- `MIGRATING.md` defines compatibility and migration rules.

Run all example and compatibility checks from the repository root:

```text
npm run validate:preservation
node --test tests/preservation-manifest.test.js
node --test tests/cdx-result.test.js
```

Validate one or more manifests directly:

```text
node preservation/validate-preservation-manifests.mjs path/to/manifest.json
```

## Offline CDX result contract

The CDX result sidecar is separate from the preservation manifest. It does not
add fields to a version 1 `wayback-reference` event. Result version `1.0.0`
records the exact request URL, its ordered decoded parameters, the adapter
version, a query fingerprint, the check time, captures, coverage, and any next
cursor. Object and source mappings are outside the query identity. This lets
one query result map to more than one archive object without changing its
fingerprint. The fingerprint is SHA-256 over compact UTF-8 JSON containing the
exact `requestUrl` and ordered `parameters` fields.

`parseCdxPage(bytes, metadata)` accepts only supplied UTF-8 bytes. It parses
capture values by the declared header names. It preserves returned original
URLs, status values, media types, and opaque digests. It does not lowercase a
URL, remove a query, fold a print URL into another URL, deduplicate equal
digests, or infer replay availability from an indexed status value. Replay
URLs are references derived from each returned timestamp and original URL;
they are not replay checks.

The parser follows the Internet Archive's documented JSON resumption shape:
an empty array separates capture rows from one final one-field resume-key row.
It returns a cursor only after the header, every capture row, and the complete
trailer validate. An invalid page throws `CdxResultError` with a one-based JSON
row number where available and always exposes `nextCursor` as `null`.

Coverage is conservative. A present resume key proves `partial` coverage. A
terminal continuation page and requests with time filters, result filters, or
collapse rules also stay `partial`. An absent resume key proves `complete`
coverage only for an initial JSON request that explicitly used
`showResumeKey=true`, requested a full capture history, and used no restricting
or unknown parameter. Other requests stay `unknown`. Only a complete result can
claim an empty result or absolute earliest and latest capture timestamps.

`serializeCdxResult(result)` sorts object keys recursively, uses two-space JSON
indentation, and ends with one newline. It preserves array order, including the
recorded query-parameter and capture order.

The schema keeps `success`, `query-failure`, and `excluded` outcomes distinct.
Failure and exclusion sidecars use unknown coverage and cannot carry capture
rows or a next cursor. The parser creates only successful sidecars; a later live
adapter owns remote failure and exclusion evidence. Version `1.0.0` includes no
live CDX fetch, Save Page Now call, cursor ledger, or canonical archive edit.

The response shape is based on the Internet Archive
[CDX Server JSON, field-order, and resumption-key documentation](https://github.com/internetarchive/wayback/blob/master/wayback-cdx-server/README.md#resumption-key).

## Bounded browser capture

The Browsertrix adapter requires a public HTTP or HTTPS seed, verifies its DNS
answers before execution, blocks private-address URL targets, and does not load
browser profiles, cookies, or credentials. Static articles, PDF URLs, and
redirect checks use Browsertrix's `page` scope. Dynamic social pages use
`page-spa`. Both profiles keep one worker and one page. A five-page prefix crawl
is available only when `linked-pages` and `--allow-outlinks` are both explicit.
The URL and DNS checks supplement the network policy of the host that runs the
container; they do not replace an egress-filtered Docker network.

Execution requires an operator-managed Docker network labeled
`org.rosen-archive.public-egress=restricted`. The label is an attestation that
the network blocks private and host destinations. The adapter checks it and
passes the network name to Docker; it does not create or modify firewall rules.

Create a WACZ and its JSON result from the repository root:

```text
npm run capture:browsertrix -- \
  --capture-id example-article \
  --source-url https://example.org/article \
  --output-dir /absolute/path/to/captures \
  --network rosen-public-egress \
  --task-type static-article
```

Use `--plan` to inspect the exact Docker command without starting a crawl. The
profile pins Browsertrix Crawler 1.14.3, one CPU, 1.5 GB of memory, one worker,
a 300-second crawl ceiling, a 256 MB capture ceiling, and bounded page behavior.
It records the requested and final URLs, crawl counts, loaded-resource counts,
MIME and status summaries, WACZ size, and SHA-256 digest under `results/`.
The result also records the exact scope, limits, behaviors, screenshot choices,
user-agent suffix, crawler image, and the WACZ software string that identifies
the crawler and browser build.

The adapter accepts a package only when Browsertrix exits successfully, every
queued page completes, and the WACZ ZIP contains its data package, CDX index,
and page list. It moves failed, interrupted, partial, or invalid directories under
`quarantine/` and still writes the JSON result. A successful WACZ can be served
without network access by a local ReplayWeb.page installation for the replay
acceptance check; keep the replay server offline while testing the sample.

## Data shape

The model uses normalized top-level arrays. An object may have any number of
events and artifacts. An artifact may have any number of storage copies. Stable
IDs join those arrays, so neither identity nor relationships depend on a local
filesystem layout.

### Manifest fields

| Field | Requirement | Meaning |
|---|---|---|
| `schemaVersion` | Required | Data-shape version. The validator accepts `1.0.0` and `1.1.0`. |
| `vocabularyVersion` | Required | Event and state vocabulary version. Version 1 requires `1.0.0`. |
| `manifestId` | Required | Stable `urn:rosen-preservation:manifest:*` identifier. |
| `createdAt` | Required | UTC timestamp for this manifest representation, at or after every contained event and storage-copy creation. |
| `objects` | Required | Archive objects addressed by stable object IDs. |
| `events` | Required | Ordered, append-only preservation history. May be empty. |
| `artifacts` | Required | Captured or generated artifacts and their storage copies. May be empty. |
| `supersedesManifestId` | Optional | Prior manifest when a versioned migration creates a new representation. |
| `description` | Optional | Human-readable scope note. |
| `fieldMappings` | Optional in 1.1 | Shared named field mappings referenced by normalization evidence. Inline `fieldMapping` remains valid for 1.1 producers that do not use the registry. |

### Object fields

`objectId`, `objectType`, and `canonicalSourceUrl` are required. The optional
`alternateSourceUrls` list records redirect targets or other source URLs that
retrieval events may address; `sourceRecordId` and `label` are optional
conveniences. The canonical source may be HTTP(S), S3, Google Cloud Storage, a
file URI, or a URN. An object with a non-web canonical source must list each
web retrieval target explicitly in `alternateSourceUrls`. Object IDs use the form
`urn:rosen:object:<type>:<stable-id>` and cannot be filesystem paths. The type
segment and `objectType` must agree so identity never changes meaning between
URN-aware and field-aware consumers.

Version 1 object types are `archive-record`, `social-post`, `entity`,
`relationship`, `dataset`, `source-file`, `generated-artifact`, and
`feature-record`.

### Event fields

Every event requires:

- `eventId`, `eventType`, and `objectId`;
- `taskVersion` and a SHA-256 `inputHash`;
- `actor` with an explicit human or automation identity;
- `occurredAt`; and
- `review.state`, with optional `review.notes`.

`supersedesEventId` is optional on an original event. A correction appends a new
event of the same applicable type and points it at the event being corrected.
The target must be an earlier event for the same object. The validator rejects
missing targets, forward references, cross-object corrections, duplicate IDs,
and two corrections that claim the same predecessor. Existing events are never
removed or rewritten.

Schema 1.1 events may use `captureEventId` to link later validation or
enrichment evidence to an earlier real `capture-attempt` for the same object.
The link does not imply a new capture. It must resolve to an earlier event in
the append-only manifest, cannot point to an event already superseded when the
link is appended or to a `not-requested` event, and cannot claim validation or
enrichment before the linked capture occurred. Each current artifact-specific
event must link to the same capture named by that artifact's `captureEventId`.
A later correction can rebind the artifact when it also supersedes current
artifact-specific links to the old capture; superseded links remain as history.

All ISO timestamps must name a real UTC calendar instant, not merely match the
timestamp character pattern. Wayback capture timestamps receive the same
calendar check and must equal the timestamp embedded in their replay URL.
Retrieval and Wayback capture times cannot be later than their containing
event's `occurredAt`.

## Event vocabulary

| Event type | Required payload | Use |
|---|---|---|
| `source-check` | `retrieval` | Observe a source without retaining an artifact. |
| `capture-attempt` | `retrieval` | Record a bounded retrieval attempt, successful or not. |
| `wayback-reference` | `wayback` | Record an existing timestamped replay without implying a new deposit. |
| `artifact-created` | `artifactId` | Record creation of a manifest artifact. Schema 1.1 also permits normalization evidence. |
| `storage-copy-created` | `artifactId`, `storageCopyId` | Record a new physical or service copy. |
| `fixity-check` | `fixity` | Compare an artifact against an expected SHA-256. |
| `rights-decision` | `rights` | Record versioned rights, access, and deposit states. |
| `review-decision` | `review` | Record a human disposition without changing earlier events. |

Retrieval events always retain the requested source URL, nullable HTTP status,
HTTP outcome, nullable media type, bytes received, client name and version, and
semantic outcome. A received or aborted response, network error, or timeout
also records the observed source URL and retrieval time. A received or aborted
response requires a final URL and integer status. A network error, timeout, or
not-requested outcome may omit `finalUrl` and must carry null response
metadata. A not-requested check may also omit `observedSourceUrl` and
`retrievedAt`, because no request occurred. Optional
`reportedByteLength` and `limitBytes` distinguish an oversize abort from a
completed download. Requested, observed, and non-null final URLs must match the
owning object's canonical URL or one of its explicit alternate source URLs. A
present `redirectChain` must be non-empty, begin at `requestedUrl`, end at the
non-null `finalUrl`, and is invalid when no final response URL exists.

Semantic outcomes are `intended-content`, `bot-wall`, `login-wall`, `missing`,
`redirect`, `uncertain`, and `oversize-abort`. Unknown values fail validation;
new vocabulary requires a version change. An `oversize-abort` semantic outcome
must use the `aborted` HTTP outcome.

## Artifacts, storage, and fixity

An artifact requires a stable artifact ID, owning object ID, artifact type,
URI, SHA-256, byte size, and `storageCopies` array. HTTP-response artifacts also
require their originating capture-event ID. Generated metadata, checksum, and
other non-response artifacts may omit that ID, but they must have one current
`artifact-created` event. Schema 1.1 artifacts may point to that event with
`creationEventId`; this gives generated artifacts an explicit back-reference
without fabricating a capture. A valid 1.0-style artifact may omit the link
when its single current creation event is unambiguous. When supplied, the link
must resolve to that current event. An artifact cannot have multiple current
creation events, even when its capture also names it. A superseded capture no
longer introduces an artifact. The retained artifact must point to a current
correcting capture that declares it or have a current `artifact-created` event.
The storage array may be empty when evidence proves a response digest but does
not name a retained copy. Each named storage copy requires its own stable ID,
URI, storage class, access state, and creation time.

The validator ensures object, event, artifact, fixity, and storage-copy
references resolve and remain within one object. When a capture attempt names
an artifact, the artifact's originating capture must be that same event. The
model supports multiple captures, artifacts, and storage copies for the same
archive object. Every named storage copy must have exactly one matching
current `storage-copy-created` event; corrected predecessors remain in the
append-only history. The copy's `createdAt` must equal the current creation
event's `occurredAt` and cannot predate the artifact's current capture or
creation provenance. A current `artifact-created` event cannot predate the
artifact's originating capture, and a current fixity check cannot predate the
latest current artifact provenance. Content-addressed `urn:sha256:` artifact and
copy URIs must match the owning artifact digest, so storage state cannot change
through an artifact record edit alone.

## Rights and review boundaries

The schema represents rights states; it does not decide them. `rightsStatus`,
`accessDecision`, `publicDepositEligibility`, `policyVersion`, and
`decisionBasis` are required on rights events. Unknown rights can therefore be
recorded as an explicit private, undetermined hold while issue #700 establishes
the governing policy. Only cleared rights may declare public access or public
deposit eligibility, and those two public states must agree. Past events retain
the policy version used when they were made and are not silently reinterpreted
after a policy change. An embargo end must be later than the rights event that
declares it.

Review states are `not-reviewed`, `review-required`, `accepted`, `rejected`,
and `superseded`. Notes are optional in the schema but should explain holds,
rejections, and corrections.

## Derived index

`buildPreservationIndex(manifest)` first validates the manifest, then returns an
`objectsById` projection containing event, capture, artifact, and storage-copy
IDs plus the latest semantic outcome, rights decision, and review state.
Superseded events remain in the history and ID lists but do not supply those
latest assertions. Among the remaining events, semantic outcomes and rights
decisions use the greatest `occurredAt` timestamp, with the stable event ID as
the deterministic tie-break, rather than treating manifest array order as
event-time order. Review state first prefers a substantive state over
`not-reviewed`, then uses that same timestamp and event-ID ordering within each
class. This prevents later operational events from erasing an earlier human
review. The projection carries `derived: true` and its source manifest ID.
Consumers may persist that projection for queries, but must regenerate it after
any append or migration.

## Winer evidence compatibility

The existing `features/winer-method/capture-ingestion-evidence.mjs` output maps
without modifying or replacing `retrieval-evidence.json`:

| Winer evidence | Preservation field |
|---|---|
| record `id` | `sourceRecordId` and stable feature-record object ID |
| `retrievalUrl` | canonical, requested, and observed source URL |
| `retrieval.capturedAt` | retrieval and event timestamps |
| final URL, status, content type, and byte length | required retrieval fields; a distinct final URL is an explicit alternate source |
| `retrieval.client` and top-level `captureTool` | client name/version and task version |
| `retrieval.responseSha256` | record-scoped artifact ID plus content-addressed URI and SHA-256 |
| observations, field mapping, source locator, normalized digest | `normalizationEvidence` |
| `captureMode`, `recordSource`, and `runtimeNetworkAccess` | capture-level `normalizationEvidence` provenance on every projected event |

Verify the current 11-record artifact against schema v1:

```text
node preservation/import-winer-evidence.mjs --verify
```

The adapter records an empty storage-copy list because the existing evidence
names response digests, not durable storage locations. A later storage event may
append a named copy without rewriting the imported capture event.

## Social post preservation baseline

Per-post browser screenshots for `data/social_posts.csv` will take years to
reach every row. `import-social-baseline.mjs` (issue #717) does not wait for
that: it packages the rows that already exist today into a schema v1 baseline,
so the archive's own evidence survives even if a live post is deleted or a
platform disappears before its screenshot is captured.

This is a baseline import, not a live crawl. It never makes a network call and
never edits `data/social_posts.csv`. Each row becomes one `social-post` object,
one `artifact-created` event, and one generated `metadata` artifact. The
artifact event is not a capture attempt. Its `uri` is a content hash, not a
resolvable location, and `storageCopies` is empty because the importer does not
retain a separate generated JSON file.

Every source field is copied into `normalizationEvidence.observations`, for
rows with or without a canonical URL. One top-level `fieldMappings` entry holds
the shared column crosswalk, and every event references it by
`fieldMappingId`. This avoids copying the same mapping into every event.

The importer records three separate digests:

- `rawSourceSha256` and `inputHash` hash canonical JSON for the original parsed,
  pre-unescape CSV fields. They do not claim exact CSV row-byte fixity.
- `normalizedObjectSha256` hashes the normalized archive object and observations.
- The artifact `sha256` hashes the generated metadata representation containing
  the parsed source fields, normalized object, and mapping ID.

The artifact points back to its event with `creationEventId`. It has no
`captureEventId`, because no network capture occurred.

This importer derives a new package from the current CSV. Its generated
metadata envelope and corrected `artifact-created` assertion have their own
content-addressed artifact, event, and manifest IDs. It does not migrate or
overwrite a previously retained manifest. Keep any prior retained output as
history; converting that history would require the major-version migration
procedure in `MIGRATING.md`.

| Row state | Event | `httpOutcome` | `review.state` | Carries `normalizationEvidence`? |
|---|---|---|---|---|
| Has a canonical URL | `artifact-created` | n/a (no `retrieval` payload) | `not-reviewed` | Yes - every source field |
| No recoverable canonical URL | `artifact-created` | n/a (no `retrieval` payload) | `review-required` | Yes - every source field, with an explicit missing-URL URN |

`review.state` is `not-reviewed` on every baseline event with a source URL,
whether or not the row's own `verified` column is `TRUE`: no capture was attempted, so
nothing has actually been reviewed and accepted yet. `accepted` is reserved for
a real capture or an explicit `review-decision` event made later. The CSV's own
`verified` column is not discarded — it is preserved honestly as
`observations.verified` — it just does not get promoted to the event's review
state, which would conflate "the archive already checked this content" with
"this preservation event was reviewed."

A row with no canonical URL keeps an explicit
`urn:rosen:social-source:missing-url:<id>` placeholder instead of a fabricated
link. Its event is `review-required`, and its notes and observations remain in
the manifest. That records the known row while leaving source recovery open.

An image-only post with an empty `raw_text` is not treated as missing. It
keeps its real URL and generated artifact, and the preserved text is
honestly recorded as empty (`observations.preservedTextSource: "none"`).

For every row, `related_to` and `responds_to` are preserved verbatim inside
`normalizationEvidence.observations`, so thread and reply relationships survive
even though the schema has no dedicated relationship field yet.

A later stewardship stage (the live discovery-and-capture pipeline in
`docs/bluesky-stewardship-pipeline.md`) can append real `capture-attempt`,
`fixity-check`, `storage-copy-created`, and `rights-decision` events on top of
this baseline without touching it — the append-only model means the baseline
stays intact as better evidence arrives.

### Detecting drift

`import-social-baseline.mjs` rebuilds its manifest fresh from
`data/social_posts.csv` on every run. At 123 MB, the full manifest is too
large to commit, so nothing pins today's digests against tomorrow's — on its
own, `--verify` only re-derives digests from whatever the CSV currently says
and checks that the result is schema-valid, which cannot catch a later run
truncating or rewriting a batch of rows.

`preservation/social-baseline-checksums.json` closes that gap. It is a small,
committed file mapping each row's stable ID to its SHA-256 digest — a few MB,
not 123. `--verify` compares the current CSV against this pin and fails loudly
if any pinned row's digest changed:

```text
node preservation/import-social-baseline.mjs --verify
```

After an intentional data change (new rows added, a correction applied),
refresh the pin deliberately:

```text
node preservation/import-social-baseline.mjs --write-checksums
```

`--write-checksums` only ever runs against the real `data/social_posts.csv`,
so a test fixture or scratch CSV can never overwrite the committed pin.

The `--verify` run above validates the complete corpus (tens of thousands of
rows) and can take on the order of a minute; it is not part of `npm test`,
only `npm run validate:preservation`. `tests/social-baseline-preservation.test.js`
covers behavior with small fixtures plus bounded and full-corpus structural
checks against the real CSV, so `npm test` stays fast.

## Preservation sample compatibility

`data/preservation-sample.json` (issue #704) lists the 100 sources chosen for
the preservation pilot, each a plain `{ id, objectType, url }` under its own
`preservation-sample/1.0.0` schema. That shape predates this manifest's object
vocabulary, so `import-preservation-sample.mjs` (issue #857) projects it into
schema v1 objects without editing the sample file, its generator
(`scripts/select-preservation-sample.mjs`), or its schema:

| Sample field | Preservation field |
|---|---|
| `id` | `sourceRecordId` and the object ID's stable suffix |
| `objectType` | passed through as `objectType`, and the object ID's type segment |
| `url` | `canonicalSourceUrl`, or a `urn:rosen:social-source:missing-url:<id>` placeholder when the source has no url |

The pilot has not run a capture yet, so there is no retrieval evidence to
package: the projected manifest carries `objects` only, with `events` and
`artifacts` both empty (the schema allows either to be empty). A later
stewardship stage can append real `source-check` and `capture-attempt` events
on top of this projection without touching it.

Seven of the 100 sources have no recoverable url. Rather than invent one, they
reuse the same `urn:rosen:social-source:missing-url:<id>` convention the
social-post baseline above already established — all seven are `social-post`
sources, so the existing convention covers them as-is. A url-less source of
any other `objectType` has no established convention to borrow, so the
adapter fails loudly on one instead of fabricating a new placeholder scheme
for it.

Verify the current 100-source sample against schema v1:

```text
node preservation/import-preservation-sample.mjs --verify
```
