import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync
} from 'node:fs';
import path from 'node:path';

import { canonicalJson } from './proposal-contract.mjs';
import {
  TASK_EVENT_SCHEMA_VERSION,
  TASK_EVENT_TYPES,
  TASK_EVENT_VOCABULARY_VERSION,
  encodeTaskEvent,
  parseTaskEventStream
} from './task-event-stream.mjs';

export const TASK_INDEX_SCHEMA_VERSION = 1;
export const TASK_INDEX_APPLICATION_ID = 0x52535449;
export const TASK_INDEX_MINIMUM_NODE_VERSION = '22.13.0';
export const TASK_FAILURE_EVENT_TYPES = Object.freeze([
  'retry',
  'block',
  'rejection',
  'cancellation'
]);

const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 13)) {
  throw new Error(
    `stewardship task indexes require Node ${TASK_INDEX_MINIMUM_NODE_VERSION} or newer`
  );
}

const { DatabaseSync } = await import('node:sqlite');
const TASK_EVENT_TYPE_SET = new Set(TASK_EVENT_TYPES);

const SCHEMA_V1 = `
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
) WITHOUT ROWID;

CREATE TABLE metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE events (
  stream_line INTEGER PRIMARY KEY CHECK (stream_line > 0),
  event_id TEXT NOT NULL UNIQUE,
  schema_version TEXT NOT NULL,
  vocabulary_version TEXT NOT NULL,
  event_type TEXT NOT NULL,
  causal_task_key TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  task_version TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  tool_version TEXT NOT NULL,
  supersedes_event_id TEXT REFERENCES events(event_id),
  is_superseded INTEGER NOT NULL DEFAULT 0 CHECK (is_superseded IN (0, 1)),
  superseded_by_event_id TEXT REFERENCES events(event_id),
  canonical_event_json TEXT NOT NULL
);

CREATE TABLE tasks (
  causal_task_key TEXT PRIMARY KEY,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  task_version TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  latest_event_id TEXT NOT NULL REFERENCES events(event_id),
  latest_event_type TEXT NOT NULL,
  latest_occurred_at TEXT NOT NULL,
  latest_stream_line INTEGER NOT NULL UNIQUE REFERENCES events(stream_line),
  effective_event_count INTEGER NOT NULL CHECK (effective_event_count > 0),
  attempt_count INTEGER NOT NULL CHECK (attempt_count >= 0),
  failure_event_count INTEGER NOT NULL CHECK (failure_event_count >= 0)
) WITHOUT ROWID;

CREATE INDEX idx_tasks_next
ON tasks(latest_event_type, latest_stream_line, causal_task_key);

CREATE INDEX idx_tasks_progress
ON tasks(object_type, task_type, latest_event_type, causal_task_key);

CREATE INDEX idx_events_object_history
ON events(object_id, stream_line, event_id);

CREATE INDEX idx_events_task_history
ON events(causal_task_key, stream_line, event_id);

CREATE INDEX idx_events_failures
ON events(is_superseded, event_type, stream_line DESC, event_id DESC);
`;

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function plainRows(rows) {
  return rows.map(row => ({ ...row }));
}

function freezeJson(value) {
  const detached = JSON.parse(canonicalJson(value));
  function freeze(node) {
    if (node && typeof node === 'object' && !Object.isFrozen(node)) {
      Object.freeze(node);
      for (const nested of Object.values(node)) freeze(nested);
    }
    return node;
  }
  return freeze(detached);
}

function canonicalLocation(filePath) {
  const absolute = path.resolve(filePath);
  if (existsSync(absolute)) return realpathSync.native(absolute);

  const suffix = [];
  let ancestor = absolute;
  while (!existsSync(ancestor)) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) break;
    suffix.unshift(path.basename(ancestor));
    ancestor = parent;
  }
  return path.join(realpathSync.native(ancestor), ...suffix);
}

function requirePath(value, label, { optional = false } = {}) {
  if (optional && value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} must be a non-empty path string`);
  }
  return path.resolve(value);
}

export function taskIndexConfig(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('task index configuration must be an object');
  }
  const eventPath = requirePath(value.eventPath, 'eventPath');
  const indexPath = requirePath(value.indexPath, 'indexPath');
  const backupPath = requirePath(value.backupPath, 'backupPath', { optional: true });
  const locations = [
    ['eventPath', eventPath],
    ['indexPath', indexPath],
    ...(backupPath === undefined ? [] : [['backupPath', backupPath]])
  ].map(([label, filePath]) => [label, canonicalLocation(filePath)]);

  for (let left = 0; left < locations.length; left += 1) {
    for (let right = left + 1; right < locations.length; right += 1) {
      if (locations[left][1] === locations[right][1]) {
        throw new Error(`${locations[left][0]} and ${locations[right][0]} must not alias`);
      }
    }
  }
  return Object.freeze({ eventPath, indexPath, backupPath });
}

function pragmaNumber(database, name) {
  const row = database.prepare(`PRAGMA ${name}`).get();
  return Number(row[name]);
}

function assertCurrentSchema(database) {
  const version = pragmaNumber(database, 'user_version');
  if (version !== TASK_INDEX_SCHEMA_VERSION) {
    throw new Error(
      `task index schema version ${version} is not supported; expected ${TASK_INDEX_SCHEMA_VERSION}`
    );
  }
  const applicationId = pragmaNumber(database, 'application_id');
  if (applicationId !== TASK_INDEX_APPLICATION_ID) {
    throw new Error(`task index application_id ${applicationId} is not recognized`);
  }
}

export function migrateTaskIndex(database) {
  const version = pragmaNumber(database, 'user_version');
  if (version > TASK_INDEX_SCHEMA_VERSION) {
    throw new Error(
      `task index schema version ${version} is newer than supported version ${TASK_INDEX_SCHEMA_VERSION}`
    );
  }
  if (version === TASK_INDEX_SCHEMA_VERSION) {
    assertCurrentSchema(database);
    return TASK_INDEX_SCHEMA_VERSION;
  }

  database.exec('BEGIN IMMEDIATE');
  try {
    database.exec(SCHEMA_V1);
    database.prepare(
      'INSERT INTO schema_migrations(version, name) VALUES (?, ?)'
    ).run(1, 'initial task event projection');
    database.exec(`PRAGMA application_id = ${TASK_INDEX_APPLICATION_ID}`);
    database.exec(`PRAGMA user_version = ${TASK_INDEX_SCHEMA_VERSION}`);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  return TASK_INDEX_SCHEMA_VERSION;
}

function sourceStamp(filePath) {
  const stats = statSync(filePath, { bigint: true });
  if (!stats.isFile()) throw new Error(`${filePath} must be a regular task-event file`);
  return Object.freeze({
    device: stats.dev,
    inode: stats.ino,
    size: stats.size,
    modified: stats.mtimeNs,
    changed: stats.ctimeNs
  });
}

function sameSourceStamp(left, right) {
  return Object.keys(left).every(key => left[key] === right[key]);
}

function readSourceSnapshot(eventPath) {
  const before = sourceStamp(eventPath);
  const bytes = readFileSync(eventPath);
  const after = sourceStamp(eventPath);
  if (!sameSourceStamp(before, after)) {
    throw new Error(`${eventPath}: task-event source changed while it was read`);
  }
  const events = parseTaskEventStream(bytes, { source: eventPath });
  return {
    bytes,
    events,
    stamp: after,
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
}

function assertSourceUnchanged(eventPath, expected) {
  let current;
  try {
    current = sourceStamp(eventPath);
  } catch (error) {
    throw new Error(`${eventPath}: task-event source moved before index replacement`, {
      cause: error
    });
  }
  if (!sameSourceStamp(current, expected)) {
    throw new Error(`${eventPath}: task-event source moved before index replacement`);
  }
}

function siblingTemporaryPath(destination, purpose) {
  return path.join(
    path.dirname(destination),
    `.${path.basename(destination)}.${purpose}-${process.pid}-${randomUUID()}.tmp`
  );
}

function fsyncFile(filePath) {
  const descriptor = openSync(filePath, 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function fsyncDirectory(directory) {
  if (process.platform !== 'linux') return;

  const descriptor = openSync(directory, 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function metadataFor(snapshot, effectiveEventCount) {
  return {
    event_count: String(snapshot.events.length),
    event_schema_version: TASK_EVENT_SCHEMA_VERSION,
    event_vocabulary_version: TASK_EVENT_VOCABULARY_VERSION,
    index_schema_version: String(TASK_INDEX_SCHEMA_VERSION),
    source_byte_length: String(snapshot.bytes.length),
    source_sha256: snapshot.sha256,
    source_snapshot: 'validated-complete-jsonl-file',
    effective_event_count: String(effectiveEventCount)
  };
}

function buildIndexDatabase(databasePath, snapshot) {
  const database = new DatabaseSync(databasePath);
  try {
    database.exec('PRAGMA foreign_keys = ON');
    database.exec('PRAGMA journal_mode = DELETE');
    database.exec('PRAGMA synchronous = FULL');
    migrateTaskIndex(database);

    const insertEvent = database.prepare(`
      INSERT INTO events(
        stream_line, event_id, schema_version, vocabulary_version, event_type,
        causal_task_key, object_type, object_id, task_type, task_version,
        input_hash, actor_type, actor_id, occurred_at, tool_version,
        supersedes_event_id, canonical_event_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const markSuperseded = database.prepare(`
      UPDATE events
      SET is_superseded = 1, superseded_by_event_id = ?
      WHERE event_id = ? AND is_superseded = 0
    `);

    database.exec('BEGIN IMMEDIATE');
    try {
      snapshot.events.forEach((event, index) => {
        insertEvent.run(
          index + 1,
          event.eventId,
          event.schemaVersion,
          event.vocabularyVersion,
          event.eventType,
          event.causalTaskKey,
          event.objectType,
          event.objectId,
          event.taskType,
          event.taskVersion,
          event.inputHash,
          event.actor.actorType,
          event.actor.actorId,
          event.occurredAt,
          event.toolVersion,
          event.supersedesEventId ?? null,
          encodeTaskEvent(event).slice(0, -1)
        );
        if (event.supersedesEventId !== undefined) {
          const result = markSuperseded.run(event.eventId, event.supersedesEventId);
          if (Number(result.changes) !== 1) {
            throw new Error(`failed to supersede indexed event ${event.supersedesEventId}`);
          }
        }
      });

      database.exec(`
        INSERT INTO tasks(
          causal_task_key, object_type, object_id, task_type, task_version,
          input_hash, latest_event_id, latest_event_type, latest_occurred_at,
          latest_stream_line, effective_event_count, attempt_count,
          failure_event_count
        )
        WITH aggregates AS (
          SELECT
            causal_task_key,
            MAX(stream_line) AS latest_stream_line,
            COUNT(*) AS effective_event_count,
            SUM(CASE WHEN event_type = 'attempt' THEN 1 ELSE 0 END) AS attempt_count,
            SUM(CASE WHEN event_type IN ('retry', 'block', 'rejection', 'cancellation')
              THEN 1 ELSE 0 END) AS failure_event_count
          FROM events
          WHERE is_superseded = 0
          GROUP BY causal_task_key
        )
        SELECT
          latest.causal_task_key,
          latest.object_type,
          latest.object_id,
          latest.task_type,
          latest.task_version,
          latest.input_hash,
          latest.event_id,
          latest.event_type,
          latest.occurred_at,
          latest.stream_line,
          aggregates.effective_event_count,
          aggregates.attempt_count,
          aggregates.failure_event_count
        FROM aggregates
        JOIN events AS latest
          ON latest.stream_line = aggregates.latest_stream_line
        ORDER BY latest.causal_task_key
      `);

      const effectiveEventCount = Number(
        database.prepare('SELECT COUNT(*) AS count FROM events WHERE is_superseded = 0').get().count
      );
      const insertMetadata = database.prepare(
        'INSERT INTO metadata(key, value) VALUES (?, ?)'
      );
      for (const [key, value] of Object.entries(metadataFor(snapshot, effectiveEventCount))
        .sort(([left], [right]) => compareCodeUnits(left, right))) {
        insertMetadata.run(key, value);
      }
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }

    const foreignKeyProblem = database.prepare('PRAGMA foreign_key_check').get();
    if (foreignKeyProblem !== undefined) {
      throw new Error(`rebuilt task index failed foreign-key check: ${canonicalJson(foreignKeyProblem)}`);
    }
    const integrity = database.prepare('PRAGMA integrity_check').get().integrity_check;
    if (integrity !== 'ok') throw new Error(`rebuilt task index failed integrity check: ${integrity}`);
  } finally {
    database.close();
  }
  fsyncFile(databasePath);
}

function copyPreviousIndex(indexPath, backupPath) {
  mkdirSync(path.dirname(backupPath), { recursive: true });
  const temporary = siblingTemporaryPath(backupPath, 'backup');
  try {
    copyFileSync(indexPath, temporary, fsConstants.COPYFILE_EXCL);
    fsyncFile(temporary);
    renameSync(temporary, backupPath);
    fsyncDirectory(path.dirname(backupPath));
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

function databaseSnapshot(database) {
  return {
    schemaMigrations: plainRows(database.prepare(
      'SELECT * FROM schema_migrations ORDER BY version'
    ).all()),
    metadata: plainRows(database.prepare(
      'SELECT * FROM metadata ORDER BY key'
    ).all()),
    tasks: plainRows(database.prepare(
      'SELECT * FROM tasks ORDER BY causal_task_key'
    ).all()),
    events: plainRows(database.prepare(
      'SELECT * FROM events ORDER BY stream_line'
    ).all())
  };
}

function indexFingerprint(database) {
  return createHash('sha256')
    .update(canonicalJson(databaseSnapshot(database)), 'utf8')
    .digest('hex');
}

export function rebuildTaskIndex(configValue, { beforeReplace } = {}) {
  const config = taskIndexConfig(configValue);
  if (beforeReplace !== undefined && typeof beforeReplace !== 'function') {
    throw new TypeError('beforeReplace must be a function');
  }
  const snapshot = readSourceSnapshot(config.eventPath);
  mkdirSync(path.dirname(config.indexPath), { recursive: true });
  const temporaryIndex = siblingTemporaryPath(config.indexPath, 'rebuild');
  const descriptor = openSync(temporaryIndex, 'wx', 0o600);
  closeSync(descriptor);

  try {
    buildIndexDatabase(temporaryIndex, snapshot);
    const rebuilt = new DatabaseSync(temporaryIndex, { readOnly: true });
    let stateFingerprint;
    let effectiveEventCount;
    try {
      assertCurrentSchema(rebuilt);
      stateFingerprint = indexFingerprint(rebuilt);
      effectiveEventCount = Number(
        rebuilt.prepare("SELECT value FROM metadata WHERE key = 'effective_event_count'").get().value
      );
    } finally {
      rebuilt.close();
    }

    beforeReplace?.(Object.freeze({ sourceSha256: snapshot.sha256 }));
    assertSourceUnchanged(config.eventPath, snapshot.stamp);

    if (config.backupPath !== undefined && existsSync(config.indexPath)) {
      copyPreviousIndex(config.indexPath, config.backupPath);
    }
    assertSourceUnchanged(config.eventPath, snapshot.stamp);
    renameSync(temporaryIndex, config.indexPath);
    fsyncDirectory(path.dirname(config.indexPath));

    return Object.freeze({
      indexPath: config.indexPath,
      backupPath: config.backupPath,
      eventCount: snapshot.events.length,
      effectiveEventCount,
      sourceByteLength: snapshot.bytes.length,
      sourceSha256: snapshot.sha256,
      stateFingerprint
    });
  } catch (error) {
    rmSync(temporaryIndex, { force: true });
    throw error;
  }
}

function validateLimit(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError('limit must be a positive safe integer');
  }
}

function validateEventTypes(eventTypes) {
  if (!Array.isArray(eventTypes) || eventTypes.length === 0) {
    throw new TypeError('eventTypes must be a non-empty array');
  }
  const unique = [...new Set(eventTypes)];
  for (const eventType of unique) {
    if (!TASK_EVENT_TYPE_SET.has(eventType)) {
      throw new TypeError(`unsupported task event type ${JSON.stringify(eventType)}`);
    }
  }
  return unique.sort(compareCodeUnits);
}

export class TaskIndex {
  constructor(indexPath) {
    this.path = path.resolve(indexPath);
    if (!existsSync(this.path)) throw new Error(`task index does not exist: ${this.path}`);
    this.database = new DatabaseSync(this.path, { readOnly: true });
    try {
      assertCurrentSchema(this.database);
    } catch (error) {
      this.database.close();
      throw error;
    }
  }

  close() {
    this.database.close();
  }

  nextTasks({ eventTypes, limit = 100 }) {
    const types = validateEventTypes(eventTypes);
    validateLimit(limit);
    const placeholders = types.map(() => '?').join(', ');
    return freezeJson(plainRows(this.database.prepare(`
      SELECT * FROM tasks
      WHERE latest_event_type IN (${placeholders})
      ORDER BY latest_stream_line, causal_task_key
      LIMIT ?
    `).all(...types, limit)));
  }

  objectHistory(objectId) {
    if (typeof objectId !== 'string' || objectId === '') {
      throw new TypeError('objectId must be a non-empty string');
    }
    return freezeJson(plainRows(this.database.prepare(`
      SELECT * FROM events
      WHERE object_id = ?
      ORDER BY stream_line
    `).all(objectId)));
  }

  taskHistory(causalTaskKey) {
    if (typeof causalTaskKey !== 'string' || causalTaskKey === '') {
      throw new TypeError('causalTaskKey must be a non-empty string');
    }
    return freezeJson(plainRows(this.database.prepare(`
      SELECT * FROM events
      WHERE causal_task_key = ?
      ORDER BY stream_line
    `).all(causalTaskKey)));
  }

  failures({ limit = 100 } = {}) {
    validateLimit(limit);
    const placeholders = TASK_FAILURE_EVENT_TYPES.map(() => '?').join(', ');
    return freezeJson(plainRows(this.database.prepare(`
      SELECT * FROM events
      WHERE is_superseded = 0
        AND event_type IN (${placeholders})
      ORDER BY stream_line DESC, event_id DESC
      LIMIT ?
    `).all(...TASK_FAILURE_EVENT_TYPES, limit)));
  }

  progress() {
    return freezeJson(plainRows(this.database.prepare(`
      SELECT object_type, task_type, latest_event_type, COUNT(*) AS task_count
      FROM tasks
      GROUP BY object_type, task_type, latest_event_type
      ORDER BY object_type, task_type, latest_event_type
    `).all()));
  }

  snapshot() {
    return freezeJson(databaseSnapshot(this.database));
  }

  stateFingerprint() {
    return indexFingerprint(this.database);
  }
}

export function snapshotTaskIndex(indexPath) {
  const index = new TaskIndex(indexPath);
  try {
    return index.snapshot();
  } finally {
    index.close();
  }
}

export default {
  TASK_INDEX_SCHEMA_VERSION,
  TASK_INDEX_APPLICATION_ID,
  TASK_INDEX_MINIMUM_NODE_VERSION,
  TASK_FAILURE_EVENT_TYPES,
  taskIndexConfig,
  migrateTaskIndex,
  rebuildTaskIndex,
  TaskIndex,
  snapshotTaskIndex
};
