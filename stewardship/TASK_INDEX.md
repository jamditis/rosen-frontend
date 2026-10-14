# Stewardship task index

`task-index.mjs` projects the versioned [task-event stream](TASK_EVENTS.md) into
a SQLite index. The newline-terminated JSONL file remains authoritative. The
SQLite file is disposable and can be rebuilt from that source without changing
the source bytes.

The projector requires Node 22.13 or newer and uses the built-in `node:sqlite`
module. Schema version 1 stores every event and its one-based stream line. A
correction remains in history and marks its referenced predecessor as
superseded. The `tasks` table derives one current row per causal task key from
events that have not been superseded.

The read-only `TaskIndex` API provides indexed queries for:

- candidate tasks selected by caller-supplied lifecycle types;
- full object and causal-task history;
- effective retry, block, rejection, and cancellation events; and
- counts grouped by object type, task type, and latest lifecycle type.

The candidate query does not define scheduling or retry policy. Its caller
must select the lifecycle types that are eligible for that caller's workflow.

## State paths and rebuilds

`rebuildTaskIndex()` requires an `eventPath` and an `indexPath`. An optional
`backupPath` receives the prior closed index. The three paths must not resolve
to the same location, including through a symbolic link. Operators should keep
these mutable state files outside the source checkout.

A rebuild validates the complete source stream, builds and checks a sibling
temporary database, and records the source byte length, SHA-256, event count,
schema version, and vocabulary version. It verifies that the source file has
not moved before replacement. When a backup is configured, it copies the live
index into a sibling temporary backup, flushes it, and renames it into place.
Only then does it atomically rename the rebuilt index over the live index. A
failure before the final rename leaves the live index intact.

On Linux, the supported deployment platform, each replacement also opens,
syncs, and closes its parent directory before the rebuild returns. Directory
sync errors are not suppressed. Other platforms retain the file flush and
atomic rename but do not claim that a replacement directory entry survives a
crash.

This sequence assumes an offline single writer. It detects simple source
movement during a rebuild but does not provide a concurrent append or lease
guarantee. The task-event JSONL file needs its own backup because an index
backup cannot replace the authoritative source.

## Schema versions

SQLite `user_version` and `application_id` identify the index schema. The
version 1 migration creates an empty index transactionally and records the
migration. Reopening version 1 is idempotent. A newer unknown schema fails
without modification.

This layer does not append events, assign leases, schedule retries, compact
history, connect external adapters, or create production state.
