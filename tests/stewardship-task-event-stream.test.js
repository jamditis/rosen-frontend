import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  TASK_EVENT_TYPES,
  appendTaskEvent,
  causalTaskKey,
  encodeTaskEvent,
  parseTaskEventStream,
  readTaskEventStream,
  validateTaskEvent,
  validateTaskEventSequence
} from '../stewardship/task-event-stream.mjs';
import {
  assertJsonSchemaDocument,
  compileJsonSchema
} from '../scripts/json-schema-validator.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDirectory = path.join(repoRoot, 'tests', 'fixtures', 'stewardship-task-events');
const lifecyclePath = path.join(fixtureDirectory, 'lifecycle.jsonl');
const lifecycleBytes = fs.readFileSync(lifecyclePath);
const expected = JSON.parse(
  fs.readFileSync(path.join(fixtureDirectory, 'lifecycle.expected.json'), 'utf8')
);
const lifecycle = parseTaskEventStream(lifecycleBytes, { source: lifecyclePath });
const schema = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'stewardship', 'task-event.schema.json'), 'utf8')
);
const validateSchema = compileJsonSchema(schema, {
  source: 'stewardship/task-event.schema.json'
});

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rosen-task-events-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function appendInFreshProcess(streamPath, eventPath) {
  const moduleUrl = pathToFileURL(
    path.join(repoRoot, 'stewardship', 'task-event-stream.mjs')
  ).href;
  const script = [
    "import fs from 'node:fs';",
    `import { appendTaskEvent } from ${JSON.stringify(moduleUrl)};`,
    "const event = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));",
    'appendTaskEvent(process.argv[2], event);'
  ].join('\n');
  return spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', script, eventPath, streamPath],
    { encoding: 'utf8' }
  );
}

describe('stewardship task event contract', () => {
  it('validates canonical fixture bytes for every lifecycle family', () => {
    assert.equal(lifecycleBytes[lifecycleBytes.length - 1], 0x0a);
    assert.equal(lifecycle.length, expected.recordCount);
    assert.deepEqual(lifecycle.map(event => event.eventType), expected.eventTypes);
    assert.deepEqual(TASK_EVENT_TYPES, [...new Set(expected.eventTypes)]);

    const sourceLines = lifecycleBytes.toString('utf8').slice(0, -1).split('\n');
    lifecycle.forEach((event, index) => {
      assertJsonSchemaDocument(validateSchema, event, {
        source: `lifecycle.jsonl:${index + 1}`
      });
      assert.equal(encodeTaskEvent(event), `${sourceLines[index]}\n`);
      assert.ok(event.actor.actorId);
      assert.ok(event.occurredAt);
      assert.ok(event.toolVersion);
      assert.ok(Object.isFrozen(event));
    });
  });

  it('matches an independent named-tuple SHA-256 oracle', () => {
    const oracleDigest = createHash('sha256')
      .update(Buffer.from(expected.canonicalCausalTupleJson, 'utf8'))
      .digest('hex');
    assert.equal(expected.causalTaskKey, `urn:rosen-stewardship:task:${oracleDigest}`);

    for (const event of lifecycle) {
      assert.equal(causalTaskKey(event), expected.causalTaskKey);
      assert.equal(event.causalTaskKey, expected.causalTaskKey);
    }
    assert.equal(
      causalTaskKey({
        inputHash: lifecycle[0].inputHash,
        taskVersion: lifecycle[0].taskVersion,
        objectId: lifecycle[0].objectId,
        taskType: lifecycle[0].taskType,
        objectType: lifecycle[0].objectType
      }),
      expected.causalTaskKey
    );
    assert.notEqual(
      causalTaskKey({ ...lifecycle[0], inputHash: 'b'.repeat(64) }),
      expected.causalTaskKey
    );
  });

  it('rejects identity drift and unsupported envelope fields at path:line', () => {
    const wrongObjectType = { ...lifecycle[0], objectType: 'social-post' };
    assert.throws(
      () => validateTaskEvent(wrongObjectType, { source: 'fixture/tasks.jsonl', line: 4 }),
      /fixture\/tasks\.jsonl:4: objectId must be a stable Rosen object URN/
    );

    const wrongKey = { ...lifecycle[0], causalTaskKey: `urn:rosen-stewardship:task:${'0'.repeat(64)}` };
    assert.throws(
      () => validateTaskEvent(wrongKey, { source: 'fixture/tasks.jsonl', line: 5 }),
      /fixture\/tasks\.jsonl:5: causalTaskKey does not match/
    );

    const extra = { ...lifecycle[0], schedulerState: 'ready' };
    assert.throws(
      () => validateTaskEvent(extra, { source: 'fixture/tasks.jsonl', line: 6 }),
      /fixture\/tasks\.jsonl:6: task event has unexpected fields: schedulerState/
    );
  });

  it('rejects duplicate event IDs across the full stream, including identical bodies', () => {
    const identical = `${encodeTaskEvent(lifecycle[0])}${encodeTaskEvent(lifecycle[0])}`;
    assert.throws(
      () => parseTaskEventStream(identical, { source: 'fixture/duplicate.jsonl' }),
      /fixture\/duplicate\.jsonl:2: duplicate eventId .* first seen at fixture\/duplicate\.jsonl:1/
    );
  });

  it('requires earlier same-type and same-object correction references', () => {
    const supersession = lifecycle.find(
      event => event.eventId.endsWith(':lifecycle-supersession-correction')
    );
    assert.throws(
      () => validateTaskEventSequence([supersession], { source: 'fixture/supersession.jsonl' }),
      /fixture\/supersession\.jsonl:1: supersedesEventId .* is missing or not earlier/
    );

    const predecessor = lifecycle.find(
      event => event.eventId.endsWith(':lifecycle-supersession')
    );
    const otherObject = {
      ...supersession,
      objectId: 'urn:rosen:object:archive-record:RECORD-00885',
      causalTaskKey: causalTaskKey({
        ...supersession,
        objectId: 'urn:rosen:object:archive-record:RECORD-00885'
      })
    };
    assert.throws(
      () => validateTaskEventSequence(
        [predecessor, otherObject],
        { source: 'fixture/supersession.jsonl' }
      ),
      /fixture\/supersession\.jsonl:2: supersedesEventId must reference an event for the same object/
    );

    const otherType = { ...supersession, eventType: 'review' };
    assert.throws(
      () => validateTaskEventSequence(
        [predecessor, otherType],
        { source: 'fixture/supersession.jsonl' }
      ),
      /fixture\/supersession\.jsonl:2: supersedesEventId must reference the same lifecycle event type/
    );
  });
});

describe('stewardship task event JSONL adapter', () => {
  it('reports malformed, truncated, and invalid UTF-8 records with path:line', () => {
    const first = Buffer.from(encodeTaskEvent(lifecycle[0]), 'utf8');
    const malformed = Buffer.concat([first, Buffer.from('{"eventId":\n', 'utf8')]);
    assert.throws(
      () => parseTaskEventStream(malformed, { source: '/tmp/malformed.jsonl' }),
      /\/tmp\/malformed\.jsonl:2: invalid JSON:/
    );

    const truncated = Buffer.concat([
      first,
      Buffer.from(encodeTaskEvent(lifecycle[1]).slice(0, -1), 'utf8')
    ]);
    assert.throws(
      () => parseTaskEventStream(truncated, { source: '/tmp/truncated.jsonl' }),
      /\/tmp\/truncated\.jsonl:2: truncated final record/
    );

    const invalidUtf8 = Buffer.concat([first, Buffer.from([0xc3, 0x28, 0x0a])]);
    assert.throws(
      () => parseTaskEventStream(invalidUtf8, { source: '/tmp/utf8.jsonl' }),
      /\/tmp\/utf8\.jsonl:2: record is not valid UTF-8/
    );
  });

  it('does not alter the last good bytes when an existing tail is invalid', (t) => {
    const directory = temporaryDirectory(t);
    const cases = new Map([
      ['malformed.jsonl', `${encodeTaskEvent(lifecycle[0])}{"eventId":\n`],
      ['truncated.jsonl', `${encodeTaskEvent(lifecycle[0])}${encodeTaskEvent(lifecycle[1]).slice(0, -1)}`]
    ]);

    for (const [name, content] of cases) {
      const streamPath = path.join(directory, name);
      fs.writeFileSync(streamPath, content);
      const before = fs.readFileSync(streamPath);
      assert.throws(() => appendTaskEvent(streamPath, lifecycle[2]), new RegExp(`${name}:2:`));
      assert.deepEqual(fs.readFileSync(streamPath), before);
    }
  });

  it('appends, fsyncs, closes, and reopens across fresh processes', (t) => {
    const directory = temporaryDirectory(t);
    const streamPath = path.join(directory, 'events.jsonl');
    const firstPath = path.join(directory, 'first.json');
    const secondPath = path.join(directory, 'second.json');
    fs.writeFileSync(firstPath, JSON.stringify(lifecycle[0]));
    fs.writeFileSync(secondPath, JSON.stringify(lifecycle[1]));

    const firstAppend = appendInFreshProcess(streamPath, firstPath);
    assert.equal(firstAppend.status, 0, firstAppend.stderr);
    assert.deepEqual(readTaskEventStream(streamPath).map(event => event.eventId), [
      lifecycle[0].eventId
    ]);

    const secondAppend = appendInFreshProcess(streamPath, secondPath);
    assert.equal(secondAppend.status, 0, secondAppend.stderr);
    const reopened = readTaskEventStream(streamPath);
    assert.deepEqual(reopened.map(event => event.eventId), [
      lifecycle[0].eventId,
      lifecycle[1].eventId
    ]);
    const bytes = fs.readFileSync(streamPath);
    assert.equal(bytes[bytes.length - 1], 0x0a);
    assert.equal(bytes.toString('utf8'), `${encodeTaskEvent(lifecycle[0])}${encodeTaskEvent(lifecycle[1])}`);
  });
});
