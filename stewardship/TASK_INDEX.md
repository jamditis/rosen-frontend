# Stewardship task index

`task-index.mjs` projects the versioned [task-event stream](TASK_EVENTS.md) into
a SQLite index. The newline-terminated JSONL file remains authoritative. The
SQLite file is disposable and can be rebuilt from that source without changing
the source bytes.

The projector requires Node 22.13 or newer and uses the built-in `node:sqlite`
module. Schema version 1 stores every event and its one-based stream line. A
correction remains in history and marks its referenced predecessor as
superseded. It inherits the original event's effective order, including through
a chain of corrections, because it replaces that earlier fact instead of adding
a later lifecycle step. The `tasks` table derives one current row per causal
task key from effective order while retaining actual stream lines for history.

The read-only `TaskIndex` API provides indexed queries for:

- candidate tasks selected by caller-supplied lifecycle types;
- full object and causal-task history;
- effective retry, block, rejection, and cancellation events; and
- counts grouped by object type, task type, and latest lifecycle type.

The candidate query does not define scheduling or retry policy. Its caller
must select the lifecycle types that are eligible for that caller's workflow.

`failures()` is a history query. It returns unsuperseded failure facts in
descending written stream order, so a newly recorded correction appears before
older records. It can include failures from tasks that later succeeded. Use
`nextTasks()` to select tasks by their current lifecycle state; that query uses
effective lifecycle order and does not revive completed tasks after corrections.

## State paths and rebuilds

`rebuildTaskIndex()` requires an `eventPath` and an `indexPath`. An optional
`backupPath` receives the prior closed index. The three paths must not resolve
to the same location, including through a symbolic link. Operators should keep
these mutable state files outside the source checkout.
Create and persist the index and backup parent directories before a rebuild;
the projector requires those directories to exist and does not create them.
The index and backup files must not be symbolic links, including dangling links.
Directory links are allowed when the three state paths remain distinct.

An existing index or backup destination must identify itself with this task
index's SQLite application ID and supported schema version. A rebuild refuses
an unrelated SQLite database, a non-SQLite file, or an index from a newer
schema without changing its bytes. There is no overwrite override.
A destination with a SQLite `-wal`, `-shm`, or `-journal` sidecar is refused
before it is opened and again before replacement. Close all writers and complete
SQLite checkpoint/recovery before rebuilding. The projector does not remove
sidecars or copy a live database.

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

If the final directory sync fails after the index rename, the caller receives
`TaskIndexPostReplaceError` with `indexReplaced: true`, the state paths, and the
original error as its cause. The new index is visible, but crash durability is
unconfirmed. Inspect its source metadata and preserve the prior backup before
retrying; a retry would replace that backup with the already published index.

This sequence assumes an offline single writer. It detects simple source
movement during a rebuild but does not provide a concurrent append or lease
guarantee. The task-event JSONL file needs its own backup because an index
backup cannot replace the authoritative source.

## Schema versions

SQLite `user_version` and `application_id` identify the index schema. The
version 1 migration requires an empty version-zero database with an unassigned
or matching application ID, creates the index transactionally, and records the
migration. Reopening version 1 is idempotent. A newer unknown schema fails
without modification.

This layer does not append events, assign leases, schedule retries, compact
history, connect external adapters, or create production state.
