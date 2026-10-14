# Stewardship task-event stream

This directory defines the offline version 1 task-event stream for issue #884.
The stream is the authoritative input for a later rebuildable task index. This
slice does not add that projector or connect a production scheduler.

`task-event.schema.json` defines one event envelope. It keeps the stable object
identity and actor conventions from preservation issue #701. Event IDs are
stable caller identifiers in the
`urn:rosen-stewardship:task-event:*` namespace. They are not content addresses.
Every event records its object, task type and version, input SHA-256, actor, UTC
timestamp, tool version, lifecycle type, and causal task key.

The causal task key is a SHA-256 over the UTF-8 bytes of canonical JSON for this
named tuple:

```json
{"inputHash":"...","objectId":"...","objectType":"...","taskType":"...","taskVersion":"..."}
```

The key is written as `urn:rosen-stewardship:task:<sha256>`. Object key order in
caller input does not affect it because the implementation reuses
`proposal-contract.mjs`'s canonical JSON codec.

Vocabulary version `1.0.0` contains `discovery`, `eligibility`, `lease`,
`attempt`, `success`, `retry`, `block`, `review`, `rejection`, `supersession`,
and `cancellation`. This contract records those facts. It does not decide lease
ownership, retry timing, lifecycle transitions, or scheduling policy.

## JSONL and supersession

The file contains exactly one UTF-8 JSON object per line and every record ends
with LF, including the last record. The writer emits canonical JSON. The reader
uses one-based `path:line` diagnostics, rejects malformed UTF-8 or JSON, rejects
a final record without LF, and rejects duplicate event IDs across the full
stream even when their bodies are identical.

`supersedesEventId` follows the append-only correction convention from issue
#701. It must point to an earlier event of the same lifecycle type for the same
object, and one predecessor cannot have two correcting events. The
`supersession` lifecycle value records a task state; the optional link records a
correction to an earlier event. Earlier bytes remain in the stream.

## Durability boundary

`appendTaskEvent()` validates the existing stream and candidate before opening
the file. It opens with append mode, loops until all record bytes are written,
calls `fsync`, closes the descriptor, reopens the file, and validates the full
stream. A failed pre-append validation leaves every existing byte unchanged.

This is an offline, single-writer contract. It does not promise safe concurrent
append, compare-and-swap leases, or record-level recovery after a partial write.
Those guarantees belong at issue #706's atomic writer boundary. The SQLite
projector, index replacement, lease arbitration, retry policy, scheduler, and
source-discovery D1 migration are also outside this slice. No production task
events are created here.
