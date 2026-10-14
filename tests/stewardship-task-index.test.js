import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
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
    assert.equal(firstSnapshot.tasks[0].latest_event_type, 'supersession');
    assert.equal(firstSnapshot.tasks[0].attempt_count, 1);
    assert.equal(firstSnapshot.tasks[0].failure_event_count, 4);
    assert.equal(firstSnapshot.events[9].is_superseded, 1);
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
          latest_event_type: 'eligibility',
          task_count: 1
        },
        {
          object_type: 'archive-record',
          task_type: fixtureEvents[0].taskType,
          latest_event_type: 'supersession',
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
          "SELECT * FROM tasks WHERE latest_event_type = 'eligibility' ORDER BY latest_stream_line, causal_task_key",
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
});
