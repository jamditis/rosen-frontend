# Preservation manifest migration rules

The manifest is an interchange and audit contract. Producers and consumers
must fail closed on unsupported schema or vocabulary versions; they must not
guess at renamed fields or reinterpret an old event using current policy.

## Version meanings

`schemaVersion` and `vocabularyVersion` use semantic versions but serve
different purposes.

- A schema major version changes required fields, field meaning, identity, or
  relationships. It receives a new schema `$id` and requires a migration.
- A schema minor version adds optional structure without changing existing
  meaning. Old consumers may ignore the new optional fields only when their
  validator allows that declared minor version.
- A schema patch version clarifies constraints without changing valid data.
- A vocabulary minor version adds an event type or enum state. Strict v1
  consumers reject it until upgraded, which prevents silent reinterpretation.
- A vocabulary major version changes or removes the meaning of an existing
  event or state and requires a migration plan.

Version 1.0.0 deliberately uses `const` values in the schema. A producer must
not emit a different version while claiming validation against the v1 schema.

## Compatible and incompatible changes

| Change | Treatment |
|---|---|
| Add prose, examples, or derived-index fields | Patch when no manifest validity changes. |
| Add an optional manifest field | Schema minor version. |
| Add an enum value or event type | Vocabulary minor version and consumer upgrade. |
| Make an optional field required | Schema major version and migration. |
| Rename, remove, or change a field's meaning | Schema major version and migration. |
| Change stable-ID construction | New major version; preserve all old IDs in the migrated representation. |
| Change a rights policy | New `policyVersion` in appended rights events, not a schema migration. |

## Migration procedure

1. Validate the source manifest with its declared schema and vocabulary.
2. Run a deterministic, versioned migration tool against a copy. Record the
   source manifest's hash as the migration input.
3. Assign a new `manifestId`, set `createdAt` at or after every migrated event
   and storage-copy creation, and set `supersedesManifestId` to the source
   manifest. Never overwrite the source artifact.
4. Preserve object, event, artifact, and copy IDs when their identities have not
   changed. If an event's assertion must be corrected, append a new event with
   `supersedesEventId`; do not edit or delete the old event.
5. Preserve original `taskVersion`, actor, event time, review, and
   `policyVersion` values. A migration must not make a historical decision look
   as if it used a newer policy.
6. Validate the new manifest with the destination schema, rebuild the derived
   index, and compare object/event/artifact counts plus stable-ID sets.
7. Retain both manifests and the migration tool so another curator can replay
   and verify the transformation.

A migration is incomplete if it only makes the new file validate. It must also
prove that the append-only history and referenced artifacts remain reachable.

## Winer method v1 compatibility migration

`import-winer-evidence.mjs` is the reference compatibility adapter for the
pre-schema `features/winer-method/retrieval-evidence.json` artifact. It maps the
existing capture fields, response and normalized-record digests, supervised
observations, and field mappings without altering the source evidence.

Run the compatibility check:

```text
node preservation/import-winer-evidence.mjs --verify
```

The adapter is deterministic: stable object, event, and artifact IDs derive
from the feature record ID and retained response digest, never from a local
path. Because the source artifact does not record a storage URI, the migrated
artifact has no named storage copies. A later storage-copy event can add that
fact append-only.

## Recovery and rollback

Rollback means returning consumers to the earlier retained manifest and
rebuilding its derived index. It never means deleting events from the newer
manifest. If a migration defect is found after use, publish a corrected
manifest that supersedes the defective one and append correction events where
historical assertions changed.
