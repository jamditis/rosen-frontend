# Preservation manifest

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
| `createdAt` | Required | UTC timestamp for this manifest representation. |
| `objects` | Required | Archive objects addressed by stable object IDs. |
| `events` | Required | Ordered, append-only preservation history. May be empty. |
| `artifacts` | Required | Captured or generated artifacts and their storage copies. May be empty. |
| `supersedesManifestId` | Optional | Prior manifest when a versioned migration creates a new representation. |
| `description` | Optional | Human-readable scope note. |

### Object fields

`objectId`, `objectType`, and `canonicalSourceUrl` are required. `sourceRecordId`
and `label` are optional conveniences. Object IDs use the form
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

Retrieval events always retain the requested and observed source URLs,
retrieval time, final URL, nullable HTTP status, HTTP outcome, nullable media
type, bytes received, client name and version, and semantic outcome. Optional
`reportedByteLength` and `limitBytes` distinguish an oversize abort from a
completed download.

Semantic outcomes are `intended-content`, `bot-wall`, `login-wall`, `missing`,
`redirect`, `uncertain`, and `oversize-abort`. Unknown values fail validation;
new vocabulary requires a version change.

## Artifacts, storage, and fixity

An artifact requires a stable artifact ID, owning object ID, originating
capture-event ID, artifact type, URI, SHA-256, byte size, and `storageCopies`
array. The array may be empty when evidence proves a response digest but does
not name a retained copy. Each named storage copy requires its own stable ID,
URI, storage class, access state, and creation time.

The validator ensures object, event, artifact, fixity, and storage-copy
references resolve and remain within one object. When a capture attempt names
an artifact, the artifact's originating capture must be that same event. The
model supports multiple captures, artifacts, and storage copies for the same
archive object. Every named storage copy must have exactly one matching
current `storage-copy-created` event; corrected predecessors remain in the
append-only history, and storage state cannot appear through an artifact record
edit alone.

## Rights and review boundaries

The schema represents rights states; it does not decide them. `rightsStatus`,
`accessDecision`, `publicDepositEligibility`, `policyVersion`, and
`decisionBasis` are required on rights events. Unknown rights can therefore be
recorded as an explicit private, undetermined hold while issue #700 establishes
the governing policy. Past events retain the policy version used when they were
made and are not silently reinterpreted after a policy change.

Review states are `not-reviewed`, `review-required`, `accepted`, `rejected`,
and `superseded`. Notes are optional in the schema but should explain holds,
rejections, and corrections.

## Derived index

`buildPreservationIndex(manifest)` first validates the manifest, then returns an
`objectsById` projection containing event, capture, artifact, and storage-copy
IDs plus the latest semantic outcome, rights decision, and review state.
Superseded events remain in the history and ID lists but do not supply those
latest assertions. Among the remaining events, latest fields use the greatest
`occurredAt` timestamp, with the stable event ID as the deterministic tie-break,
rather than treating manifest array order as event-time order. The projection
carries `derived: true` and its source manifest ID. Consumers may
persist that projection for queries, but must regenerate it after any append or
migration.

## Winer evidence compatibility

The existing `features/winer-method/capture-ingestion-evidence.mjs` output maps
without modifying or replacing `retrieval-evidence.json`:

| Winer evidence | Preservation field |
|---|---|
| record `id` | `sourceRecordId` and stable feature-record object ID |
| `retrievalUrl` | canonical, requested, and observed source URL |
| `retrieval.capturedAt` | retrieval and event timestamps |
| final URL, status, content type, and byte length | required retrieval fields |
| `retrieval.client` and top-level `captureTool` | client name/version and task version |
| `retrieval.responseSha256` | record-scoped artifact ID plus content-addressed URI and SHA-256 |
| observations, field mapping, source locator, normalized digest | `normalizationEvidence` |

Verify the current 11-record artifact against schema v1:

```text
node preservation/import-winer-evidence.mjs --verify
```

The adapter records an empty storage-copy list because the existing evidence
names response digests, not durable storage locations. A later storage event may
append a named copy without rewriting the imported capture event.
