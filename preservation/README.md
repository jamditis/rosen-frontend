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
- `validate-preservation-manifests.mjs` validates schema rules, stable IDs,
  uniqueness, references, and append-only supersession.
- `import-winer-evidence.mjs` maps the existing Winer method evidence artifact
  into schema v1 without changing its source file.
- `examples/` contains successful capture, existing Wayback, bot-wall,
  oversize-abort, and rights-hold manifests.
- `MIGRATING.md` defines compatibility and migration rules.

Run all example and compatibility checks from the repository root:

```text
npm run validate:preservation
node --test tests/preservation-manifest.test.js
```

Validate one or more manifests directly:

```text
node preservation/validate-preservation-manifests.mjs path/to/manifest.json
```

## Data shape

The model uses normalized top-level arrays. An object may have any number of
events and artifacts. An artifact may have any number of storage copies. Stable
IDs join those arrays, so neither identity nor relationships depend on a local
filesystem layout.

### Manifest fields

| Field | Requirement | Meaning |
|---|---|---|
| `schemaVersion` | Required | Data-shape version. Version 1 requires `1.0.0`. |
| `vocabularyVersion` | Required | Event and state vocabulary version. Version 1 requires `1.0.0`. |
| `manifestId` | Required | Stable `urn:rosen-preservation:manifest:*` identifier. |
| `createdAt` | Required | UTC timestamp for this manifest representation, at or after every contained event and storage-copy creation. |
| `objects` | Required | Archive objects addressed by stable object IDs. |
| `events` | Required | Ordered, append-only preservation history. May be empty. |
| `artifacts` | Required | Captured or generated artifacts and their storage copies. May be empty. |
| `supersedesManifestId` | Optional | Prior manifest when a versioned migration creates a new representation. |
| `description` | Optional | Human-readable scope note. |

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
| `artifact-created` | `artifactId` | Record creation of a manifest artifact. |
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
`artifact-created` event. An artifact cannot have multiple current creation
events, even when its capture also names it. A superseded capture no longer
introduces an artifact. The retained artifact must point to a current correcting
capture that declares it or have a current `artifact-created` event. The storage
array may be empty when evidence proves a response digest but does not name a
retained copy. Each named storage copy requires its own stable ID, URI, storage
class, access state, and creation time.

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
