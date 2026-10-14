import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  writeSync
} from 'node:fs';
import { TextDecoder } from 'node:util';

import { canonicalJson } from './proposal-contract.mjs';

export const TASK_EVENT_SCHEMA_VERSION = '1.0.0';
export const TASK_EVENT_VOCABULARY_VERSION = '1.0.0';
export const TASK_EVENT_TYPES = Object.freeze([
  'discovery',
  'eligibility',
  'lease',
  'attempt',
  'success',
  'retry',
  'block',
  'review',
  'rejection',
  'supersession',
  'cancellation'
]);

const OBJECT_TYPES = new Set([
  'archive-record',
  'social-post',
  'entity',
  'relationship',
  'dataset',
  'source-file',
  'generated-artifact',
  'feature-record'
]);
const EVENT_TYPES = new Set(TASK_EVENT_TYPES);
const EVENT_ID = /^urn:rosen-stewardship:task-event:[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const OBJECT_ID = /^urn:rosen:object:(archive-record|social-post|entity|relationship|dataset|source-file|generated-artifact|feature-record):[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const TASK_TYPE = /^[A-Za-z0-9][A-Za-z0-9._:@+/-]*$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._@+:-]*$/;
const ACTOR_ID = /^[A-Za-z0-9][A-Za-z0-9._:@+-]*$/;
const SHA256 = /^[a-f0-9]{64}$/;
const CAUSAL_TASK_KEY = /^urn:rosen-stewardship:task:[a-f0-9]{64}$/;
const TIMESTAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{3})?Z$/;
const REQUIRED_FIELDS = new Set([
  'schemaVersion',
  'vocabularyVersion',
  'eventId',
  'eventType',
  'causalTaskKey',
  'objectType',
  'objectId',
  'taskType',
  'taskVersion',
  'inputHash',
  'actor',
  'occurredAt',
  'toolVersion'
]);
const OPTIONAL_FIELDS = new Set(['supersedesEventId']);

export class TaskEventStreamError extends Error {
  constructor(message, { source = 'task-events.jsonl', line = 1 } = {}, options = {}) {
    super(`${source}:${line}: ${message}`, options);
    this.name = 'TaskEventStreamError';
    this.source = source;
    this.line = line;
    this.location = `${source}:${line}`;
  }
}

function fail(message, context, options) {
  throw new TaskEventStreamError(message, context, options);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function detached(value) {
  return JSON.parse(canonicalJson(value));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

function isValidTimestamp(value) {
  if (typeof value !== 'string' || !TIMESTAMP.test(value)) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const normalized = value.includes('.') ? value : value.replace('Z', '.000Z');
  return parsed.toISOString() === normalized;
}

function validateFields(value, context) {
  if (!isPlainObject(value)) fail('task event must be a JSON object', context);
  const fields = new Set(Object.keys(value));
  const missing = [...REQUIRED_FIELDS].filter(field => !fields.has(field));
  if (missing.length) fail(`task event is missing ${missing.join(', ')}`, context);
  const unexpected = [...fields].filter(
    field => !REQUIRED_FIELDS.has(field) && !OPTIONAL_FIELDS.has(field)
  );
  if (unexpected.length) fail(`task event has unexpected fields: ${unexpected.join(', ')}`, context);
}

export function causalTaskKey({ objectType, objectId, taskType, taskVersion, inputHash }) {
  const tuple = { objectType, objectId, taskType, taskVersion, inputHash };
  const digest = createHash('sha256').update(canonicalJson(tuple), 'utf8').digest('hex');
  return `urn:rosen-stewardship:task:${digest}`;
}

export function validateTaskEvent(value, context = { source: 'task-events.jsonl', line: 1 }) {
  validateFields(value, context);
  if (value.schemaVersion !== TASK_EVENT_SCHEMA_VERSION) {
    fail(`unsupported schemaVersion ${JSON.stringify(value.schemaVersion)}`, context);
  }
  if (value.vocabularyVersion !== TASK_EVENT_VOCABULARY_VERSION) {
    fail(`unsupported vocabularyVersion ${JSON.stringify(value.vocabularyVersion)}`, context);
  }
  if (typeof value.eventId !== 'string' || !EVENT_ID.test(value.eventId)) {
    fail('eventId must use the Rosen stewardship task-event URN', context);
  }
  if (!EVENT_TYPES.has(value.eventType)) fail('eventType is not supported', context);
  if (!OBJECT_TYPES.has(value.objectType)) fail('objectType is not supported', context);
  const objectMatch = typeof value.objectId === 'string' ? OBJECT_ID.exec(value.objectId) : null;
  if (!objectMatch || objectMatch[1] !== value.objectType) {
    fail('objectId must be a stable Rosen object URN that matches objectType', context);
  }
  if (typeof value.taskType !== 'string' || !TASK_TYPE.test(value.taskType)) {
    fail('taskType must be a stable task name', context);
  }
  if (typeof value.taskVersion !== 'string' || !VERSION.test(value.taskVersion)) {
    fail('taskVersion must be a stable version', context);
  }
  if (typeof value.inputHash !== 'string' || !SHA256.test(value.inputHash)) {
    fail('inputHash must be a lowercase SHA-256 digest', context);
  }
  if (typeof value.causalTaskKey !== 'string' || !CAUSAL_TASK_KEY.test(value.causalTaskKey)) {
    fail('causalTaskKey must use the Rosen stewardship task URN', context);
  }
  const expectedTaskKey = causalTaskKey(value);
  if (value.causalTaskKey !== expectedTaskKey) {
    fail(`causalTaskKey does not match the causal identity tuple; expected ${expectedTaskKey}`, context);
  }
  if (
    !isPlainObject(value.actor)
    || Object.keys(value.actor).sort().join(',') !== 'actorId,actorType'
    || !['human', 'automation'].includes(value.actor.actorType)
    || typeof value.actor.actorId !== 'string'
    || !ACTOR_ID.test(value.actor.actorId)
  ) {
    fail('actor must contain a supported actorType and stable actorId', context);
  }
  if (!isValidTimestamp(value.occurredAt)) {
    fail('occurredAt must be a valid UTC timestamp', context);
  }
  if (typeof value.toolVersion !== 'string' || !VERSION.test(value.toolVersion)) {
    fail('toolVersion must be a stable version', context);
  }
  if (
    value.supersedesEventId !== undefined
    && (typeof value.supersedesEventId !== 'string' || !EVENT_ID.test(value.supersedesEventId))
  ) {
    fail('supersedesEventId must use the Rosen stewardship task-event URN', context);
  }
  if (value.supersedesEventId === value.eventId) {
    fail('an event cannot supersede itself', context);
  }
  return deepFreeze(detached(value));
}

export function validateTaskEventSequence(
  values,
  { source = 'task-events.jsonl' } = {}
) {
  if (!Array.isArray(values)) throw new TypeError('task event sequence must be an array');
  const events = [];
  const eventLocations = new Map();
  const eventsById = new Map();
  const correctedEvents = new Map();

  for (const [index, value] of values.entries()) {
    const line = index + 1;
    const context = { source, line };
    const event = validateTaskEvent(value, context);
    const firstLine = eventLocations.get(event.eventId);
    if (firstLine !== undefined) {
      fail(
        `duplicate eventId ${event.eventId}; first seen at ${source}:${firstLine}`,
        context
      );
    }
    if (event.supersedesEventId !== undefined) {
      const predecessor = eventsById.get(event.supersedesEventId);
      if (!predecessor) {
        fail(`supersedesEventId ${event.supersedesEventId} is missing or not earlier`, context);
      }
      if (predecessor.objectId !== event.objectId) {
        fail('supersedesEventId must reference an event for the same object', context);
      }
      if (predecessor.eventType !== event.eventType) {
        fail('supersedesEventId must reference the same lifecycle event type', context);
      }
      const correctionLine = correctedEvents.get(event.supersedesEventId);
      if (correctionLine !== undefined) {
        fail(
          `supersedesEventId ${event.supersedesEventId} was already superseded at ${source}:${correctionLine}`,
          context
        );
      }
      correctedEvents.set(event.supersedesEventId, line);
    }
    eventLocations.set(event.eventId, line);
    eventsById.set(event.eventId, event);
    events.push(event);
  }
  return deepFreeze(events);
}

function bytes(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  throw new TypeError('task event stream must be a string, Buffer, or Uint8Array');
}

function newlineCount(value) {
  let count = 0;
  for (const byte of value) if (byte === 0x0a) count += 1;
  return count;
}

export function parseTaskEventStream(value, { source = 'task-events.jsonl' } = {}) {
  const content = bytes(value);
  if (content.length === 0) return Object.freeze([]);
  if (content[content.length - 1] !== 0x0a) {
    fail('truncated final record; JSONL records must end with LF', {
      source,
      line: newlineCount(content) + 1
    });
  }

  const decoder = new TextDecoder('utf-8', { fatal: true });
  const values = [];
  let start = 0;
  let line = 1;
  for (let offset = 0; offset < content.length; offset += 1) {
    if (content[offset] !== 0x0a) continue;
    const lineBytes = content.subarray(start, offset);
    let text;
    try {
      text = decoder.decode(lineBytes);
    } catch (error) {
      fail('record is not valid UTF-8', { source, line }, { cause: error });
    }
    try {
      values.push(JSON.parse(text));
    } catch (error) {
      fail(`invalid JSON: ${error.message}`, { source, line }, { cause: error });
    }
    start = offset + 1;
    line += 1;
  }
  return validateTaskEventSequence(values, { source });
}

export function encodeTaskEvent(value) {
  return `${canonicalJson(validateTaskEvent(value))}\n`;
}

export function readTaskEventStream(filePath) {
  return parseTaskEventStream(readFileSync(filePath), { source: String(filePath) });
}

/**
 * Append one validated record, sync the file, close it, and validate a reopened
 * stream. Callers must provide single-writer access; this function does not
 * claim concurrent append or crash-atomic repair guarantees.
 */
export function appendTaskEvent(filePath, value) {
  const source = String(filePath);
  const current = existsSync(filePath) ? readTaskEventStream(filePath) : Object.freeze([]);
  const next = validateTaskEventSequence([...current, value], { source });
  const encoded = Buffer.from(`${canonicalJson(next[next.length - 1])}\n`, 'utf8');

  let descriptor;
  try {
    descriptor = openSync(filePath, 'a', 0o600);
    let offset = 0;
    while (offset < encoded.length) {
      const written = writeSync(descriptor, encoded, offset, encoded.length - offset, null);
      if (written <= 0) throw new Error('task event append made no write progress');
      offset += written;
    }
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }

  const reopened = readTaskEventStream(filePath);
  const appended = next[next.length - 1];
  if (
    reopened.length !== next.length
    || reopened[reopened.length - 1].eventId !== appended.eventId
  ) {
    throw new Error(`${source}: append verification did not find the committed event`);
  }
  return reopened[reopened.length - 1];
}

export default {
  TASK_EVENT_SCHEMA_VERSION,
  TASK_EVENT_VOCABULARY_VERSION,
  TASK_EVENT_TYPES,
  TaskEventStreamError,
  causalTaskKey,
  validateTaskEvent,
  validateTaskEventSequence,
  parseTaskEventStream,
  encodeTaskEvent,
  readTaskEventStream,
  appendTaskEvent
};
