import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import {
  TASK_INDEX_APPLICATION_ID,
  TASK_INDEX_SCHEMA_VERSION,
  TaskIndex,
  migrateTaskIndex,
  rebuildTaskIndex,
  snapshotTaskIndex,
  taskIndexConfig
} from '../stewardship/task-index.mjs';
import {
  causalTaskKey,
  encodeTaskEvent,
  parseTaskEventStream
} from '../stewardship/task-event-stream.mjs';

const fixturePath = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'stewardship-task-events',
  'lifecycle.jsonl'
);
const fixtureBytes = fs.readFileSync(fixturePath);
const fixtureEvents = parseTaskEventStream(fixtureBytes, { source: fixturePath });
let temporaryRoot;

before(() => {
  temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rosen-task-index-'));
});

after(() => {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
});

function directory(name) {
  const target = path.join(temporaryRoot, name);
  fs.mkdirSync(target, { recursive: true });
  return target;
}

function writeStream(filePath, events) {
  fs.writeFileSync(filePath, events.map(encodeTaskEvent).join(''));
}

function additionalEvent({ suffix, objectId, eventType = 'eligibility' }) {
  const base = fixtureEvents[0];
  const identity = {
    objectType: 'archive-record',
    objectId,
    taskType: base.taskType,
    taskVersion: base.taskVersion,
    inputHash: base.inputHash
  };
  return {
    ...base,
    ...identity,
    eventId: `urn:rosen-stewardship:task-event:${suffix}`,
    eventType,
    causalTaskKey: causalTaskKey(identity),
    occurredAt: '2026-10-14T15:00:00.000Z'
  };
}

function metadata(snapshot) {
  return Object.fromEntries(snapshot.metadata.map(row => [row.key, row.value]));
}

function writeForeignDestination(filePath, kind) {
  if (kind === 'non-sqlite') {
    fs.writeFileSync(filePath, 'not a SQLite database\n');
    return;
  }

  const database = new DatabaseSync(filePath);
  try {
    if (kind === 'unrelated-sqlite') {
      database.exec('CREATE TABLE unrelated_records(value TEXT)');
      database.exec(`PRAGMA user_version = ${TASK_INDEX_SCHEMA_VERSION}`);
      return;
    }
    if (kind === 'newer-task-index') {
      database.exec(`PRAGMA application_id = ${TASK_INDEX_APPLICATION_ID}`);
      database.exec(`PRAGMA user_version = ${TASK_INDEX_SCHEMA_VERSION + 1}`);
      return;
    }
    throw new Error(`unsupported destination fixture ${kind}`);
  } finally {
    database.close();
  }
}

describe('rebuildable stewardship task index', () => {
  it('rebuilds equivalent query state twice from the authoritative byte snapshot', () => {
    const root = directory('deterministic');
    const eventPath = path.join(root, 'events.jsonl');
    const firstPath = path.join(root, 'first.sqlite');
    const secondPath = path.join(root, 'second.sqlite');
    fs.writeFileSync(eventPath, fixtureBytes);

    const first = rebuildTaskIndex({ eventPath, indexPath: firstPath });
    const second = rebuildTaskIndex({ eventPath, indexPath: secondPath });
    const firstSnapshot = snapshotTaskIndex(firstPath);
    const secondSnapshot = snapshotTaskIndex(secondPath);

    assert.deepEqual(firstSnapshot, secondSnapshot);
    assert.equal(first.stateFingerprint, second.stateFingerprint);
    assert.equal(first.eventCount, 12);
    assert.equal(first.effectiveEventCount, 11);
    assert.equal(first.sourceByteLength, fixtureBytes.length);
    assert.equal(
      first.sourceSha256,
      createHash('sha256').update(fixtureBytes).digest('hex')
    );
    assert.deepEqual(metadata(firstSnapshot), {
      effective_event_count: '11',
      event_count: '12',
      event_schema_version: '1.0.0',
      event_vocabulary_version: '1.0.0',
      index_schema_version: '1',
      source_byte_length: String(fixtureBytes.length),
      source_sha256: first.sourceSha256,
      source_snapshot: 'validated-complete-jsonl-file'
    });
    // A correction replaces line 10 at line 10's logical position. It does not
    // move that fact after the cancellation at line 11.
    assert.equal(firstSnapshot.tasks[0].latest_event_type, 'cancellation');
    assert.equal(firstSnapshot.tasks[0].latest_stream_line, 11);
    assert.equal(firstSnapshot.tasks[0].latest_effective_order, 11);
    assert.equal(firstSnapshot.tasks[0].attempt_count, 1);
    assert.equal(firstSnapshot.tasks[0].failure_event_count, 4);
    assert.equal(firstSnapshot.events[9].is_superseded, 1);
    assert.equal(firstSnapshot.events[9].effective_order, 10);
    assert.equal(firstSnapshot.events[11].effective_order, 10);
    assert.equal(
      firstSnapshot.events[9].superseded_by_event_id,
      fixtureEvents[11].eventId
    );
  });

  it('supports indexed next-task, object-history, failure, and progress queries', () => {
    const root = directory('queries');
    const eventPath = path.join(root, 'events.jsonl');
    const indexPath = path.join(root, 'tasks.sqlite');
    const extra = additionalEvent({
      suffix: 'second-task-eligibility',
      objectId: 'urn:rosen:object:archive-record:RECORD-00885'
    });
    writeStream(eventPath, [...fixtureEvents, extra]);
    rebuildTaskIndex({ eventPath, indexPath });

    const index = new TaskIndex(indexPath);
    try {
      const next = index.nextTasks({ eventTypes: ['eligibility'], limit: 10 });
      assert.deepEqual(next.map(task => task.causal_task_key), [extra.causalTaskKey]);
      assert.deepEqual(
        index.objectHistory(extra.objectId).map(event => event.event_id),
        [extra.eventId]
      );
      assert.equal(index.taskHistory(fixtureEvents[0].causalTaskKey).length, 12);
      assert.deepEqual(index.failures().map(event => event.event_type), [
        'cancellation',
        'rejection',
        'block',
        'retry'
      ]);
      assert.deepEqual(index.progress(), [
        {
          object_type: 'archive-record',
          task_type: fixtureEvents[0].taskType,
          latest_event_type: 'cancellation',
          task_count: 1
        },
        {
          object_type: 'archive-record',
          task_type: fixtureEvents[0].taskType,
          latest_event_type: 'eligibility',
          task_count: 1
        }
      ]);
      assert.ok(Object.isFrozen(next));
    } finally {
      index.close();
    }

    const database = new DatabaseSync(indexPath, { readOnly: true });
    try {
      const plans = [
        [
          "SELECT * FROM tasks WHERE latest_event_type = 'eligibility' ORDER BY latest_effective_order, causal_task_key",
          'idx_tasks_next'
        ],
        [
          `SELECT * FROM events WHERE object_id = '${extra.objectId}' ORDER BY stream_line`,
          'idx_events_object_history'
        ],
        [
          "SELECT * FROM events WHERE is_superseded = 0 AND event_type = 'retry' ORDER BY stream_line DESC",
          'idx_events_failures'
        ],
        [
          'SELECT object_type, task_type, latest_event_type, COUNT(*) FROM tasks GROUP BY object_type, task_type, latest_event_type',
          'idx_tasks_progress'
        ]
      ];
      for (const [sql, indexName] of plans) {
        const detail = database.prepare(`EXPLAIN QUERY PLAN ${sql}`)
          .all()
          .map(row => row.detail)
          .join('\n');
        assert.match(detail, new RegExp(indexName), `${indexName} was not used:\n${detail}`);
      }
    } finally {
      database.close();
    }
  });

  it('keeps old retry corrections before a later successful lifecycle state', () => {
    const root = directory('corrected-retry-order');
    const eventPath = path.join(root, 'events.jsonl');
    const indexPath = path.join(root, 'tasks.sqlite');
    const objectId = 'urn:rosen:object:archive-record:RECORD-00889';
    const retry = {
      ...additionalEvent({ suffix: 'old-retry', objectId, eventType: 'retry' }),
      occurredAt: '2026-10-14T15:00:00.000Z'
    };
    const attempt = {
      ...additionalEvent({ suffix: 'later-attempt', objectId, eventType: 'attempt' }),
      occurredAt: '2026-10-14T15:01:00.000Z'
    };
    const success = {
      ...additionalEvent({ suffix: 'later-success', objectId, eventType: 'success' }),
      occurredAt: '2026-10-14T15:02:00.000Z'
    };
    const retryCorrection = {
      ...retry,
      eventId: 'urn:rosen-stewardship:task-event:old-retry-correction',
      occurredAt: '2026-10-14T15:03:00.000Z',
      supersedesEventId: retry.eventId
    };
    const chainedCorrection = {
      ...retryCorrection,
      eventId: 'urn:rosen-stewardship:task-event:old-retry-correction-two',
      occurredAt: '2026-10-14T15:04:00.000Z',
      supersedesEventId: retryCorrection.eventId
    };
    writeStream(eventPath, [
      retry,
      attempt,
      success,
      retryCorrection,
      chainedCorrection
    ]);

    rebuildTaskIndex({ eventPath, indexPath });
    const snapshot = snapshotTaskIndex(indexPath);
    assert.equal(snapshot.tasks[0].latest_event_type, 'success');
    assert.equal(snapshot.tasks[0].latest_stream_line, 3);
    assert.equal(snapshot.tasks[0].latest_effective_order, 3);
    assert.deepEqual(
      snapshot.events.map(event => event.effective_order),
      [1, 2, 3, 1, 1]
    );

    const index = new TaskIndex(indexPath);
    try {
      assert.deepEqual(index.nextTasks({ eventTypes: ['retry'] }), []);
      assert.deepEqual(index.nextTasks({ eventTypes: ['success'] }).map(task => task.object_id), [
        objectId
      ]);
    } finally {
      index.close();
    }
  });

  it('migrates an empty version-zero database and rejects future schemas', () => {
    const root = directory('migration');
    const databasePath = path.join(root, 'migration.sqlite');
    const database = new DatabaseSync(databasePath);
    try {
      assert.equal(migrateTaskIndex(database), TASK_INDEX_SCHEMA_VERSION);
      assert.equal(migrateTaskIndex(database), TASK_INDEX_SCHEMA_VERSION);
      assert.equal(database.prepare('PRAGMA user_version').get().user_version, 1);
      assert.equal(
        database.prepare('PRAGMA application_id').get().application_id,
        TASK_INDEX_APPLICATION_ID
      );
      assert.deepEqual(
        database.prepare('SELECT version, name FROM schema_migrations').all().map(row => ({ ...row })),
        [{ version: 1, name: 'initial task event projection' }]
      );
    } finally {
      database.close();
    }

    const future = new DatabaseSync(path.join(root, 'future.sqlite'));
    try {
      future.exec('PRAGMA user_version = 2');
      assert.throws(
        () => migrateTaskIndex(future),
        /schema version 2 is newer than supported version 1/
      );
    } finally {
      future.close();
    }
  });

  it('preserves the current index across invalid input and an interrupted pre-swap rebuild', () => {
    const root = directory('interrupted');
    const eventPath = path.join(root, 'events.jsonl');
    const indexPath = path.join(root, 'tasks.sqlite');
    fs.writeFileSync(eventPath, fixtureBytes);
    rebuildTaskIndex({ eventPath, indexPath });
    const current = snapshotTaskIndex(indexPath);

    fs.writeFileSync(eventPath, `${encodeTaskEvent(fixtureEvents[0])}{"eventId":\n`);
    assert.throws(
      () => rebuildTaskIndex({ eventPath, indexPath }),
      new RegExp(`${eventPath.replaceAll('/', '\\/')}:2: invalid JSON`)
    );
    assert.deepEqual(snapshotTaskIndex(indexPath), current);

    fs.writeFileSync(
      eventPath,
      `${encodeTaskEvent(fixtureEvents[0])}${encodeTaskEvent(fixtureEvents[0])}`
    );
    assert.throws(
      () => rebuildTaskIndex({ eventPath, indexPath }),
      new RegExp(`${eventPath.replaceAll('/', '\\/')}:2: duplicate eventId`)
    );
    assert.deepEqual(snapshotTaskIndex(indexPath), current);

    fs.writeFileSync(eventPath, encodeTaskEvent(fixtureEvents[0]).slice(0, -1));
    assert.throws(
      () => rebuildTaskIndex({ eventPath, indexPath }),
      new RegExp(`${eventPath.replaceAll('/', '\\/')}:1: truncated final record`)
    );
    assert.deepEqual(snapshotTaskIndex(indexPath), current);

    const extra = additionalEvent({
      suffix: 'interrupted-extra',
      objectId: 'urn:rosen:object:archive-record:RECORD-00886'
    });
    writeStream(eventPath, [...fixtureEvents, extra]);
    assert.throws(
      () => rebuildTaskIndex(
        { eventPath, indexPath },
        { beforeReplace: () => { throw new Error('simulated interruption'); } }
      ),
      /simulated interruption/
    );
    assert.deepEqual(snapshotTaskIndex(indexPath), current);
    assert.deepEqual(
      fs.readdirSync(root).filter(name => name.includes('.rebuild-')),
      []
    );
  });

  it('rejects source movement before swap and preserves the current index on backup failure', () => {
    const root = directory('movement-backup');
    const eventPath = path.join(root, 'events.jsonl');
    const indexPath = path.join(root, 'tasks.sqlite');
    const backupPath = path.join(root, 'tasks.previous.sqlite');
    fs.writeFileSync(eventPath, fixtureBytes);
    rebuildTaskIndex({ eventPath, indexPath });
    const original = snapshotTaskIndex(indexPath);

    const extra = additionalEvent({
      suffix: 'movement-extra',
      objectId: 'urn:rosen:object:archive-record:RECORD-00887'
    });
    writeStream(eventPath, [...fixtureEvents, extra]);
    assert.throws(
      () => rebuildTaskIndex(
        { eventPath, indexPath, backupPath },
        { beforeReplace: () => fs.appendFileSync(eventPath, encodeTaskEvent({
          ...additionalEvent({
            suffix: 'movement-during-rebuild',
            objectId: 'urn:rosen:object:archive-record:RECORD-00888'
          }),
          occurredAt: '2026-10-14T15:01:00.000Z'
        })) }
      ),
      /task-event source moved before index replacement/
    );
    assert.deepEqual(snapshotTaskIndex(indexPath), original);
    assert.equal(fs.existsSync(backupPath), false);

    writeStream(eventPath, [...fixtureEvents, extra]);
    rebuildTaskIndex({ eventPath, indexPath, backupPath });
    assert.deepEqual(snapshotTaskIndex(backupPath), original);
    const updated = snapshotTaskIndex(indexPath);
    assert.equal(updated.tasks.length, 2);

    const backupDirectory = path.join(root, 'backup-is-directory');
    fs.mkdirSync(backupDirectory);
    assert.throws(
      () => rebuildTaskIndex({ eventPath, indexPath, backupPath: backupDirectory })
    );
    assert.deepEqual(snapshotTaskIndex(indexPath), updated);
  });

  it('refuses foreign index and backup destinations without changing their bytes', () => {
    for (const kind of ['non-sqlite', 'unrelated-sqlite', 'newer-task-index']) {
      const indexRoot = directory(`foreign-index-${kind}`);
      const indexEventPath = path.join(indexRoot, 'events.jsonl');
      const foreignIndexPath = path.join(indexRoot, 'tasks.sqlite');
      fs.writeFileSync(indexEventPath, fixtureBytes);
      writeForeignDestination(foreignIndexPath, kind);
      const foreignIndexBytes = fs.readFileSync(foreignIndexPath);

      assert.throws(
        () => rebuildTaskIndex({ eventPath: indexEventPath, indexPath: foreignIndexPath }),
        /indexPath .* exists but is not a supported stewardship task index/
      );
      assert.deepEqual(fs.readFileSync(foreignIndexPath), foreignIndexBytes);

      const backupRoot = directory(`foreign-backup-${kind}`);
      const backupEventPath = path.join(backupRoot, 'events.jsonl');
      const validIndexPath = path.join(backupRoot, 'tasks.sqlite');
      const foreignBackupPath = path.join(backupRoot, 'tasks.previous.sqlite');
      fs.writeFileSync(backupEventPath, fixtureBytes);
      rebuildTaskIndex({ eventPath: backupEventPath, indexPath: validIndexPath });
      const validIndexBytes = fs.readFileSync(validIndexPath);
      writeForeignDestination(foreignBackupPath, kind);
      const foreignBackupBytes = fs.readFileSync(foreignBackupPath);

      assert.throws(
        () => rebuildTaskIndex({
          eventPath: backupEventPath,
          indexPath: validIndexPath,
          backupPath: foreignBackupPath
        }),
        /backupPath .* exists but is not a supported stewardship task index/
      );
      assert.deepEqual(fs.readFileSync(validIndexPath), validIndexBytes);
      assert.deepEqual(fs.readFileSync(foreignBackupPath), foreignBackupBytes);
    }
  });

  it('requires explicit non-aliasing state paths', () => {
    const root = directory('configuration');
    const eventPath = path.join(root, 'events.jsonl');
    fs.writeFileSync(eventPath, fixtureBytes);

    assert.throws(
      () => taskIndexConfig({ eventPath, indexPath: eventPath }),
      /eventPath and indexPath must not alias/
    );
    assert.throws(
      () => taskIndexConfig({
        eventPath,
        indexPath: path.join(root, 'tasks.sqlite'),
        backupPath: path.join(root, 'tasks.sqlite')
      }),
      /indexPath and backupPath must not alias/
    );
    assert.throws(
      () => taskIndexConfig({ indexPath: path.join(root, 'tasks.sqlite') }),
      /eventPath must be a non-empty path string/
    );
  });

  it('reports an already replaced index when the final directory sync fails', () => {
    if (process.platform !== 'linux') return;
    const root = directory('post-replace-error');
    const backupRoot = directory('post-replace-backup');
    const eventPath = path.join(root, 'events.jsonl');
    const indexPath = path.join(root, 'tasks.sqlite');
    const backupPath = path.join(backupRoot, 'prior.sqlite');
    fs.writeFileSync(eventPath, fixtureBytes);
    rebuildTaskIndex({ eventPath, indexPath });
    const prior = fs.readFileSync(indexPath);
    writeStream(eventPath, [...fixtureEvents, additionalEvent({
      suffix: 'post-replace-extra',
      objectId: 'urn:rosen:object:archive-record:RECORD-00925'
    })]);
    const originalSync = fs.fsyncSync;
    const directoryStats = fs.statSync(root);
    const failure = Object.assign(new Error('injected directory sync failure'), { code: 'EIO' });
    // Fault only the filesystem boundary for the live index directory. The
    // backup has a different parent, so its successful sync remains real.
    fs.fsyncSync = (descriptor) => {
      const stats = fs.fstatSync(descriptor);
      if (stats.isDirectory() && stats.dev === directoryStats.dev && stats.ino === directoryStats.ino) {
        throw failure;
      }
      return originalSync(descriptor);
    };
    syncBuiltinESMExports();
    try {
      assert.throws(() => rebuildTaskIndex({ eventPath, indexPath, backupPath }), error => {
        assert.equal(error.name, 'TaskIndexPostReplaceError');
        assert.equal(error.indexReplaced, true);
        assert.equal(error.indexPath, indexPath);
        assert.equal(error.backupPath, backupPath);
        assert.equal(error.cause, failure);
        return true;
      });
    } finally {
      fs.fsyncSync = originalSync;
      syncBuiltinESMExports();
    }
    assert.equal(snapshotTaskIndex(indexPath).tasks.length, 2);
    assert.deepEqual(fs.readFileSync(backupPath), prior);
    assert.deepEqual(fs.readdirSync(root).filter(name => name.includes('.rebuild-')), []);
  });

  it('preserves symbolic-link index and backup destinations and their targets', () => {
    for (const role of ['index', 'backup']) {
      for (const dangling of [false, true]) {
        const root = directory(`symlink-${role}-${dangling}`);
        const eventPath = path.join(root, 'events.jsonl');
        const target = path.join(root, 'target.sqlite');
        const link = path.join(root, 'link.sqlite');
        fs.writeFileSync(eventPath, fixtureBytes);
        if (!dangling) rebuildTaskIndex({ eventPath, indexPath: target });
        const targetBytes = dangling ? null : fs.readFileSync(target);
        fs.symlinkSync(target, link);
        const indexPath = role === 'index' ? link : path.join(root, 'index.sqlite');
        if (role === 'backup') rebuildTaskIndex({ eventPath, indexPath });
        const config = { eventPath, indexPath,
          ...(role === 'backup' ? { backupPath: link } : {}) };
        assert.throws(() => rebuildTaskIndex(config), /must not be a symbolic link/);
        assert.ok(fs.lstatSync(link).isSymbolicLink());
        assert.equal(fs.readlinkSync(link), target);
        if (dangling) assert.equal(fs.existsSync(target), false);
        else assert.deepEqual(fs.readFileSync(target), targetBytes);
      }
    }
  });

  it('refuses foreign version-zero migrations without changing database bytes', () => {
    for (const applicationId of [12345, 0]) {
      const root = directory(`migration-foreign-${applicationId}`);
      const filePath = path.join(root, 'foreign.sqlite');
      const database = new DatabaseSync(filePath);
      try {
        database.exec('CREATE TABLE foreign_records(value TEXT)');
        database.exec("INSERT INTO foreign_records VALUES ('retained')");
        database.exec(`PRAGMA application_id = ${applicationId}`);
        const before = fs.readFileSync(filePath);
        assert.throws(() => migrateTaskIndex(database),
          /application_id .* is not recognized|version-zero database must be empty/);
        assert.deepEqual(fs.readFileSync(filePath), before);
        assert.equal(database.prepare('PRAGMA application_id').get().application_id,
          applicationId);
        assert.equal(database.prepare('SELECT value FROM foreign_records').get().value,
          'retained');
      } finally {
        database.close();
      }
    }
  });

  it('requires existing destination directories without creating partial state', () => {
    for (const role of ['index', 'backup']) {
      const root = directory(`missing-parent-${role}`);
      const eventPath = path.join(root, 'events.jsonl');
      const missing = path.join(root, 'not-created', 'nested');
      fs.writeFileSync(eventPath, fixtureBytes);
      const indexPath = role === 'index'
        ? path.join(missing, 'index.sqlite') : path.join(root, 'index.sqlite');
      if (role === 'backup') rebuildTaskIndex({ eventPath, indexPath });
      const prior = role === 'backup' ? fs.readFileSync(indexPath) : null;
      assert.throws(() => rebuildTaskIndex({ eventPath, indexPath,
        ...(role === 'backup' ? { backupPath: path.join(missing, 'backup.sqlite') } : {})
      }), /parent directory must already exist/);
      assert.equal(fs.existsSync(path.join(root, 'not-created')), false);
      if (prior) assert.deepEqual(fs.readFileSync(indexPath), prior);
    }
  });

  it('rejects real WAL state on index and backup targets before reading or swapping', () => {
    for (const role of ['index', 'backup']) {
      for (const late of [false, true]) {
        const root = directory(`wal-${role}-${late}`);
        const eventPath = path.join(root, 'events.jsonl');
        const indexPath = path.join(root, 'index.sqlite');
        const backupPath = path.join(root, 'backup.sqlite');
        fs.writeFileSync(eventPath, fixtureBytes);
        rebuildTaskIndex({ eventPath, indexPath });
        if (role === 'backup') fs.copyFileSync(indexPath, backupPath);
        const target = role === 'index' ? indexPath : backupPath;
        let writer;
        let before;
        const openWriter = () => {
          writer = new DatabaseSync(target);
          writer.exec('PRAGMA journal_mode = WAL');
          writer.exec('PRAGMA wal_autocheckpoint = 0');
          writer.exec('DELETE FROM tasks');
          before = ['', '-wal', '-shm'].map(suffix => fs.readFileSync(target + suffix));
        };
        try {
          if (!late) openWriter();
          assert.throws(() => rebuildTaskIndex({ eventPath, indexPath,
            ...(role === 'backup' ? { backupPath } : {}) },
          late ? { beforeReplace: openWriter } : {}), /SQLite sidecar/);
          assert.deepEqual(['', '-wal', '-shm'].map(suffix =>
            fs.readFileSync(target + suffix)), before);
          assert.deepEqual(fs.readdirSync(root).filter(name => name.includes('.rebuild-')), []);
        } finally {
          writer?.close();
        }
      }
    }
  });
});
