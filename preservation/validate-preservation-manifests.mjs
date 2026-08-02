#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileJsonSchema } from '../scripts/json-schema-validator.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(moduleDir, 'preservation-manifest.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const validateSchema = compileJsonSchema(schema, {
  source: 'preservation/preservation-manifest.schema.json',
});
const eventPayloadFields = [
  'retrieval',
  'wayback',
  'artifactId',
  'storageCopyId',
  'fixity',
  'rights',
  'normalizationEvidence',
];
const eventPayloads = new Map([
  ['source-check', new Set(['retrieval', 'normalizationEvidence'])],
  ['capture-attempt', new Set(['retrieval', 'artifactId', 'normalizationEvidence'])],
  ['wayback-reference', new Set(['wayback'])],
  ['artifact-created', new Set(['artifactId'])],
  ['storage-copy-created', new Set(['artifactId', 'storageCopyId'])],
  ['fixity-check', new Set(['fixity'])],
  ['rights-decision', new Set(['rights'])],
  ['review-decision', new Set()],
]);
const utcTimestampPattern = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{3})?Z$/;
const waybackTimestampPattern = /^[0-9]{14}$/;
const waybackReplayPattern = /^https?:\/\/web\.archive\.org\/web\/([0-9]{14})(?:[a-z]{2}_)?\/(https?:\/\/.+)$/;
const sha256UrnPrefix = 'urn:sha256:';
const outcomesWithoutHttpResponse = new Set(['network-error', 'timeout', 'not-requested']);
const semanticOutcomesForAbortedRetrieval = new Set(['uncertain', 'oversize-abort']);

export class PreservationValidationError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'PreservationValidationError';
  }
}

function schemaErrorMessage(errors) {
  return errors.map(error => {
    const location = error.instancePath || '/';
    const property = error.params?.missingProperty ? ` ${error.params.missingProperty}` : '';
    return `${location}${property}: ${error.keyword} ${error.message}`;
  }).join('; ');
}

function uniqueMap(items, key, label) {
  const result = new Map();
  for (const item of items) {
    const id = item[key];
    if (result.has(id)) {
      throw new PreservationValidationError(`duplicate ${key} ${id} in ${label}`);
    }
    result.set(id, item);
  }
  return result;
}

function validateUtcTimestamp(value, label) {
  const normalized = value.includes('.') ? value : value.replace(/Z$/, '.000Z');
  const parsed = Date.parse(value);
  if (
    !utcTimestampPattern.test(value)
    || !Number.isFinite(parsed)
    || new Date(parsed).toISOString() !== normalized
  ) {
    throw new PreservationValidationError(`${label} must be a valid UTC timestamp`);
  }
}

function validateWaybackTimestamp(value, label) {
  if (!waybackTimestampPattern.test(value)) {
    throw new PreservationValidationError(`${label} must be a valid UTC timestamp`);
  }
  validateUtcTimestamp(waybackTimestampToIso(value), label);
}

function waybackTimestampToIso(value) {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    + `T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}.000Z`;
}

function validateReferences(manifest) {
  validateUtcTimestamp(manifest.createdAt, 'manifest createdAt');
  const objects = uniqueMap(manifest.objects, 'objectId', 'objects');
  const events = uniqueMap(manifest.events, 'eventId', 'events');
  const artifacts = uniqueMap(manifest.artifacts, 'artifactId', 'artifacts');
  const sourceUrlsByObject = new Map();
  const copies = new Map();
  const artifactCreationEvents = new Map();
  const storageCopyEvents = new Map();

  for (const object of manifest.objects) {
    const objectIdType = object.objectId.match(/^urn:rosen:object:([^:]+):/)?.[1];
    if (objectIdType !== object.objectType) {
      throw new PreservationValidationError(
        `${object.objectId}: objectId type ${objectIdType} must match objectType ${object.objectType}`,
      );
    }
    sourceUrlsByObject.set(object.objectId, new Set([
      object.canonicalSourceUrl,
      ...(object.alternateSourceUrls ?? []),
    ].map(url => new URL(url).href)));
  }

  for (const artifact of manifest.artifacts) {
    if (
      artifact.uri.startsWith(sha256UrnPrefix)
      && artifact.uri.slice(sha256UrnPrefix.length) !== artifact.sha256
    ) {
      throw new PreservationValidationError(
        `${artifact.artifactId}: uri SHA-256 digest must match sha256`,
      );
    }
    for (const copy of artifact.storageCopies) {
      validateUtcTimestamp(copy.createdAt, `${copy.copyId} storage copy createdAt`);
      if (
        copy.uri.startsWith(sha256UrnPrefix)
        && copy.uri.slice(sha256UrnPrefix.length) !== artifact.sha256
      ) {
        throw new PreservationValidationError(
          `${copy.copyId}: storage copy uri SHA-256 digest must match the artifact sha256`,
        );
      }
      if (copies.has(copy.copyId)) {
        throw new PreservationValidationError(`duplicate copyId ${copy.copyId} in storage copies`);
      }
      copies.set(copy.copyId, { ...copy, artifactId: artifact.artifactId, objectId: artifact.objectId });
    }
  }

  const earlierEvents = new Map();
  const supersededEvents = new Set();
  for (const event of manifest.events) {
    validateUtcTimestamp(event.occurredAt, `${event.eventId} event occurredAt`);
    if (event.retrieval) {
      if (event.retrieval.retrievedAt !== undefined) {
        validateUtcTimestamp(
          event.retrieval.retrievedAt,
          `${event.eventId} retrieval retrievedAt`,
        );
        if (Date.parse(event.retrieval.retrievedAt) > Date.parse(event.occurredAt)) {
          throw new PreservationValidationError(
            `${event.eventId}: retrieval retrievedAt cannot be after event occurredAt`,
          );
        }
      }
      if (
        event.retrieval.httpOutcome === 'response-received'
        && event.retrieval.httpStatus === null
      ) {
        throw new PreservationValidationError(
          `${event.eventId}: httpOutcome response-received requires an httpStatus`,
        );
      }
      if (
        outcomesWithoutHttpResponse.has(event.retrieval.httpOutcome)
        && event.retrieval.httpStatus !== null
      ) {
        throw new PreservationValidationError(
          `${event.eventId}: httpOutcome ${event.retrieval.httpOutcome} requires httpStatus null`,
        );
      }
      if (
        outcomesWithoutHttpResponse.has(event.retrieval.httpOutcome)
        && event.retrieval.semanticOutcome !== 'uncertain'
      ) {
        throw new PreservationValidationError(
          `${event.eventId}: httpOutcome ${event.retrieval.httpOutcome} requires semanticOutcome uncertain`,
        );
      }
      if (
        outcomesWithoutHttpResponse.has(event.retrieval.httpOutcome)
        && event.retrieval.bytesReceived !== 0
      ) {
        throw new PreservationValidationError(
          `${event.eventId}: httpOutcome ${event.retrieval.httpOutcome} requires bytesReceived to be zero`,
        );
      }
      if (
        outcomesWithoutHttpResponse.has(event.retrieval.httpOutcome)
        && event.retrieval.mediaType !== null
      ) {
        throw new PreservationValidationError(
          `${event.eventId}: httpOutcome ${event.retrieval.httpOutcome} requires mediaType null`,
        );
      }
      if (
        event.retrieval.semanticOutcome === 'oversize-abort'
        && event.retrieval.reportedByteLength <= event.retrieval.limitBytes
      ) {
        throw new PreservationValidationError(
          `${event.eventId}: oversize-abort reportedByteLength must be greater than limitBytes`,
        );
      }
      if (
        event.retrieval.semanticOutcome === 'oversize-abort'
        && event.retrieval.httpOutcome !== 'aborted'
      ) {
        throw new PreservationValidationError(
          `${event.eventId}: semanticOutcome oversize-abort requires httpOutcome aborted`,
        );
      }
      if (
        event.retrieval.httpOutcome === 'aborted'
        && !semanticOutcomesForAbortedRetrieval.has(event.retrieval.semanticOutcome)
      ) {
        throw new PreservationValidationError(
          `${event.eventId}: httpOutcome aborted requires semanticOutcome uncertain or oversize-abort`,
        );
      }
    }
    if (event.rights?.embargoUntil) {
      validateUtcTimestamp(
        event.rights.embargoUntil,
        `${event.eventId} rights embargoUntil`,
      );
      if (Date.parse(event.rights.embargoUntil) <= Date.parse(event.occurredAt)) {
        throw new PreservationValidationError(
          `${event.eventId}: rights embargoUntil must be after event occurredAt`,
        );
      }
    }
    if (event.wayback) {
      validateWaybackTimestamp(
        event.wayback.captureTimestamp,
        `${event.eventId} Wayback captureTimestamp`,
      );
      if (
        Date.parse(waybackTimestampToIso(event.wayback.captureTimestamp))
        > Date.parse(event.occurredAt)
      ) {
        throw new PreservationValidationError(
          `${event.eventId}: Wayback captureTimestamp cannot be after event occurredAt`,
        );
      }
      const replayMatch = event.wayback.replayUrl.match(waybackReplayPattern);
      const replayTimestamp = replayMatch?.[1];
      if (replayTimestamp !== event.wayback.captureTimestamp) {
        throw new PreservationValidationError(
          `${event.eventId}: replayUrl timestamp must match captureTimestamp`,
        );
      }
      const allowedSourceUrls = sourceUrlsByObject.get(event.objectId);
      if (
        allowedSourceUrls
        && !allowedSourceUrls.has(new URL(replayMatch[2]).href)
      ) {
        throw new PreservationValidationError(
          `${event.eventId}: replayUrl target must match object canonicalSourceUrl or alternateSourceUrls`,
        );
      }
    }

    if (!objects.has(event.objectId)) {
      throw new PreservationValidationError(
        `${event.eventId}: objectId ${event.objectId} references a missing object`,
      );
    }

    if (event.retrieval) {
      const allowedSourceUrls = sourceUrlsByObject.get(event.objectId);
      for (const field of ['requestedUrl', 'observedSourceUrl', 'finalUrl']) {
        if (event.retrieval[field] == null) continue;
        if (!allowedSourceUrls.has(new URL(event.retrieval[field]).href)) {
          throw new PreservationValidationError(
            `${event.eventId}: retrieval ${field} must match object canonicalSourceUrl or alternateSourceUrls`,
          );
        }
      }
    }

    const allowedPayloads = eventPayloads.get(event.eventType);
    for (const field of eventPayloadFields) {
      if (Object.hasOwn(event, field) && !allowedPayloads.has(field)) {
        throw new PreservationValidationError(
          `${event.eventId}: ${field} is not allowed for ${event.eventType}`,
        );
      }
    }

    if (event.supersedesEventId) {
      const target = events.get(event.supersedesEventId);
      if (!target) {
        throw new PreservationValidationError(
          `${event.eventId}: supersedesEventId ${event.supersedesEventId} is missing`,
        );
      }
      if (!earlierEvents.has(event.supersedesEventId)) {
        throw new PreservationValidationError(
          `${event.eventId}: append-only supersedesEventId must reference an earlier event`,
        );
      }
      if (target.objectId !== event.objectId) {
        throw new PreservationValidationError(
          `${event.eventId}: supersedesEventId must belong to the same object`,
        );
      }
      if (target.eventType !== event.eventType) {
        throw new PreservationValidationError(
          `${event.eventId}: supersedesEventId must identify an event of the same event type`,
        );
      }
      if (supersededEvents.has(event.supersedesEventId)) {
        throw new PreservationValidationError(
          `${event.eventId}: supersedesEventId ${event.supersedesEventId} already has a correction`,
        );
      }
      supersededEvents.add(event.supersedesEventId);
    }

    if (event.artifactId) {
      const artifact = artifacts.get(event.artifactId);
      if (!artifact) {
        throw new PreservationValidationError(
          `${event.eventId}: artifactId ${event.artifactId} references a missing artifact`,
        );
      }
      if (artifact.objectId !== event.objectId) {
        throw new PreservationValidationError(`${event.eventId}: artifactId belongs to another object`);
      }
      if (
        event.eventType === 'capture-attempt'
        && artifact.captureEventId !== event.eventId
      ) {
        throw new PreservationValidationError(
          `${event.eventId}: artifactId captureEventId must identify the same capture-attempt`,
        );
      }
      if (event.eventType === 'artifact-created') {
        const creationEvents = artifactCreationEvents.get(event.artifactId) ?? [];
        creationEvents.push(event);
        artifactCreationEvents.set(event.artifactId, creationEvents);
      }
    }

    if (event.storageCopyId) {
      const copy = copies.get(event.storageCopyId);
      if (!copy) {
        throw new PreservationValidationError(
          `${event.eventId}: storageCopyId ${event.storageCopyId} references a missing copy`,
        );
      }
      if (copy.objectId !== event.objectId || copy.artifactId !== event.artifactId) {
        throw new PreservationValidationError(
          `${event.eventId}: storageCopyId does not belong to the event artifact and object`,
        );
      }
      const creationEvents = storageCopyEvents.get(event.storageCopyId) ?? [];
      creationEvents.push(event);
      storageCopyEvents.set(event.storageCopyId, creationEvents);
    }

    if (event.fixity) {
      const artifact = artifacts.get(event.fixity.artifactId);
      if (!artifact) {
        throw new PreservationValidationError(
          `${event.eventId}: fixity artifactId ${event.fixity.artifactId} is missing`,
        );
      }
      if (artifact.objectId !== event.objectId) {
        throw new PreservationValidationError(`${event.eventId}: fixity artifact belongs to another object`);
      }
      if (event.fixity.expectedDigest !== artifact.sha256) {
        throw new PreservationValidationError(
          `${event.eventId}: fixity expectedDigest does not match the artifact sha256`,
        );
      }
      const digestsMatch = event.fixity.observedDigest === event.fixity.expectedDigest;
      if (event.fixity.outcome === 'match' && !digestsMatch) {
        throw new PreservationValidationError(
          `${event.eventId}: fixity outcome match requires identical expected and observed digests`,
        );
      }
      if (event.fixity.outcome === 'mismatch' && digestsMatch) {
        throw new PreservationValidationError(
          `${event.eventId}: fixity outcome mismatch requires different expected and observed digests`,
        );
      }
    }

    earlierEvents.set(event.eventId, event);
  }

  for (const artifact of manifest.artifacts) {
    if (!objects.has(artifact.objectId)) {
      throw new PreservationValidationError(
        `${artifact.artifactId}: objectId ${artifact.objectId} references a missing object`,
      );
    }
    let captureEvent;
    if (artifact.captureEventId !== undefined) {
      captureEvent = events.get(artifact.captureEventId);
      if (!captureEvent) {
        throw new PreservationValidationError(
          `${artifact.artifactId}: captureEventId ${artifact.captureEventId} is missing`,
        );
      }
      if (captureEvent.eventType !== 'capture-attempt' || captureEvent.objectId !== artifact.objectId) {
        throw new PreservationValidationError(
          `${artifact.artifactId}: captureEventId must identify a capture-attempt for the same object`,
        );
      }
      if (captureEvent.artifactId && captureEvent.artifactId !== artifact.artifactId) {
        throw new PreservationValidationError(
          `${artifact.artifactId}: captureEventId declares a different artifactId`,
        );
      }
    }
    const currentArtifactCreationEvents = (artifactCreationEvents.get(artifact.artifactId) ?? [])
      .filter(event => !supersededEvents.has(event.eventId));
    const captureDeclaresArtifact = captureEvent?.artifactId === artifact.artifactId
      && !supersededEvents.has(captureEvent.eventId);
    if (!captureDeclaresArtifact && currentArtifactCreationEvents.length === 0) {
      throw new PreservationValidationError(
        `${artifact.artifactId}: retained artifact requires current provenance from an artifact-created event or declaring capture-attempt`,
      );
    }
    if (currentArtifactCreationEvents.length > 1) {
      throw new PreservationValidationError(
        `${artifact.artifactId}: retained artifact has multiple current artifact-created events`,
      );
    }
    const provenanceEvents = [
      ...currentArtifactCreationEvents,
      ...(captureDeclaresArtifact ? [captureEvent] : []),
    ];
    const artifactProvenanceTime = Math.max(
      ...provenanceEvents.map(event => Date.parse(event.occurredAt)),
    );
    if (
      artifact.artifactType === 'http-response'
      && outcomesWithoutHttpResponse.has(captureEvent.retrieval.httpOutcome)
    ) {
      throw new PreservationValidationError(
        `${artifact.artifactId}: http-response artifact requires an HTTP response`,
      );
    }
    if (
      artifact.artifactType === 'http-response'
      && artifact.byteSize !== captureEvent.retrieval.bytesReceived
    ) {
      throw new PreservationValidationError(
        `${artifact.artifactId}: http-response byteSize must match capture retrieval bytesReceived`,
      );
    }
    if (
      artifact.artifactType === 'http-response'
      && artifact.mediaType !== undefined
      && artifact.mediaType !== captureEvent.retrieval.mediaType
    ) {
      throw new PreservationValidationError(
        `${artifact.artifactId}: http-response mediaType must match capture retrieval mediaType`,
      );
    }
    for (const copy of artifact.storageCopies) {
      const currentCreationEvents = (storageCopyEvents.get(copy.copyId) ?? [])
        .filter(event => !supersededEvents.has(event.eventId));
      if (currentCreationEvents.length === 0) {
        throw new PreservationValidationError(
          `${copy.copyId}: named storage copy requires a storage-copy-created event`,
        );
      }
      if (currentCreationEvents.length > 1) {
        throw new PreservationValidationError(
          `${copy.copyId}: named storage copy has multiple current storage-copy-created events`,
        );
      }
      if (currentCreationEvents[0].occurredAt !== copy.createdAt) {
        throw new PreservationValidationError(
          `${copy.copyId}: storage copy createdAt must match its current storage-copy-created event occurredAt`,
        );
      }
      if (Date.parse(copy.createdAt) < artifactProvenanceTime) {
        throw new PreservationValidationError(
          `${copy.copyId}: storage copy cannot be created before current artifact provenance`,
        );
      }
    }
  }

  const manifestCreatedAt = Date.parse(manifest.createdAt);
  for (const artifact of manifest.artifacts) {
    for (const copy of artifact.storageCopies) {
      if (Date.parse(copy.createdAt) > manifestCreatedAt) {
        throw new PreservationValidationError(
          `manifest createdAt cannot be earlier than storage copy ${copy.copyId} createdAt`,
        );
      }
    }
  }
  for (const event of manifest.events) {
    if (Date.parse(event.occurredAt) > manifestCreatedAt) {
      throw new PreservationValidationError(
        `manifest createdAt cannot be earlier than event ${event.eventId} occurredAt`,
      );
    }
  }
}

export function validatePreservationManifest(manifest) {
  if (!validateSchema(manifest)) {
    throw new PreservationValidationError(
      `preservation manifest schema validation failed: ${schemaErrorMessage(validateSchema.errors)}`,
    );
  }
  validateReferences(manifest);
  return manifest;
}

export function loadPreservationManifest(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new PreservationValidationError(`could not read ${filePath}: ${error.message}`, { cause: error });
  }
}

function eventIsLater(candidate, current) {
  if (!current) return true;
  const timeDifference = Date.parse(candidate.occurredAt) - Date.parse(current.occurredAt);
  return timeDifference > 0 || (timeDifference === 0 && candidate.eventId > current.eventId);
}

export function buildPreservationIndex(manifest) {
  validatePreservationManifest(manifest);
  const supersededEventIds = new Set(
    manifest.events.map(event => event.supersedesEventId).filter(Boolean),
  );
  const objectsById = Object.fromEntries(manifest.objects.map(object => [object.objectId, {
    objectType: object.objectType,
    canonicalSourceUrl: object.canonicalSourceUrl,
    eventIds: [],
    captureEventIds: [],
    artifactIds: [],
    storageCopyIds: [],
    latestSemanticOutcome: null,
    latestRightsDecision: null,
    latestReviewState: null,
  }]));
  const latestEventsByObject = new Map(manifest.objects.map(object => [object.objectId, {
    semanticOutcome: null,
    rightsDecision: null,
    reviewState: null,
  }]));

  for (const event of manifest.events) {
    const entry = objectsById[event.objectId];
    const latest = latestEventsByObject.get(event.objectId);
    entry.eventIds.push(event.eventId);
    if (event.eventType === 'capture-attempt') entry.captureEventIds.push(event.eventId);
    if (
      !supersededEventIds.has(event.eventId)
      && event.retrieval
      && eventIsLater(event, latest.semanticOutcome)
    ) {
      latest.semanticOutcome = event;
      entry.latestSemanticOutcome = event.retrieval.semanticOutcome;
    }
    if (
      !supersededEventIds.has(event.eventId)
      && event.rights
      && eventIsLater(event, latest.rightsDecision)
    ) {
      latest.rightsDecision = event;
      entry.latestRightsDecision = event.rights;
    }
    const reviewIsSubstantive = event.review.state !== 'not-reviewed';
    const latestReviewIsSubstantive = latest.reviewState !== null
      && latest.reviewState.review.state !== 'not-reviewed';
    const reviewHasPriority = latest.reviewState === null
      || (reviewIsSubstantive && !latestReviewIsSubstantive)
      || (
        reviewIsSubstantive === latestReviewIsSubstantive
        && eventIsLater(event, latest.reviewState)
      );
    if (
      !supersededEventIds.has(event.eventId)
      && reviewHasPriority
    ) {
      latest.reviewState = event;
      entry.latestReviewState = event.review.state;
    }
  }

  for (const artifact of manifest.artifacts) {
    const entry = objectsById[artifact.objectId];
    entry.artifactIds.push(artifact.artifactId);
    entry.storageCopyIds.push(...artifact.storageCopies.map(copy => copy.copyId));
  }

  return {
    schemaVersion: manifest.schemaVersion,
    sourceManifestId: manifest.manifestId,
    derived: true,
    objectsById,
  };
}

function examplePaths() {
  const examplesDir = path.join(moduleDir, 'examples');
  return fs.readdirSync(examplesDir)
    .filter(filename => filename.endsWith('.json'))
    .sort()
    .map(filename => path.join(examplesDir, filename));
}

function main() {
  const paths = process.argv.slice(2);
  const manifestPaths = paths.length > 0 ? paths.map(filePath => path.resolve(filePath)) : examplePaths();
  for (const manifestPath of manifestPaths) {
    validatePreservationManifest(loadPreservationManifest(manifestPath));
  }
  console.log(`Validated ${manifestPaths.length} preservation manifest${manifestPaths.length === 1 ? '' : 's'}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`Preservation validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
