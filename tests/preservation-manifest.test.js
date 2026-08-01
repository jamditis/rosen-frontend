import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  PreservationValidationError,
  buildPreservationIndex,
  loadPreservationManifest,
  validatePreservationManifest,
} from '../preservation/validate-preservation-manifests.mjs';
import { convertWinerEvidence } from '../preservation/import-winer-evidence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const preservationDir = path.join(root, 'preservation');
const examplesDir = path.join(preservationDir, 'examples');
const schema = JSON.parse(fs.readFileSync(
  path.join(preservationDir, 'preservation-manifest.schema.json'),
  'utf8',
));

const exampleNames = [
  'successful-capture',
  'existing-wayback-reference',
  'bot-wall',
  'oversize-abort',
  'rights-hold',
];

function clone(value) {
  return structuredClone(value);
}

function example(name) {
  return JSON.parse(fs.readFileSync(path.join(examplesDir, `${name}.json`), 'utf8'));
}

function rejectsManifest(manifest, ...messageParts) {
  assert.throws(
    () => validatePreservationManifest(manifest),
    error => {
      assert.ok(error instanceof PreservationValidationError);
      for (const part of messageParts) assert.match(error.message, new RegExp(part));
      return true;
    },
  );
}

describe('preservation manifest schema (#701)', () => {
  it('validates every required representative example', () => {
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.$id, 'https://pressthink.org/j/rosen-archive/schemas/preservation-manifest-v1.json');
    assert.deepEqual(schema.required, [
      'schemaVersion',
      'vocabularyVersion',
      'manifestId',
      'createdAt',
      'objects',
      'events',
      'artifacts',
    ]);
    assert.equal(schema.additionalProperties, false);

    for (const name of exampleNames) {
      const manifest = loadPreservationManifest(path.join(examplesDir, `${name}.json`));
      assert.equal(validatePreservationManifest(manifest), manifest, name);
    }
  });

  it('makes required and optional fields behaviorally explicit', () => {
    const manifest = example('bot-wall');
    const withoutNotes = clone(manifest);
    delete withoutNotes.events[0].review.notes;
    assert.equal(validatePreservationManifest(withoutNotes), withoutNotes);

    const withoutObjectId = clone(manifest);
    delete withoutObjectId.objects[0].objectId;
    rejectsManifest(withoutObjectId, 'objectId', 'required');

    const withoutRetrievalTime = clone(manifest);
    delete withoutRetrievalTime.events[0].retrieval.retrievedAt;
    rejectsManifest(withoutRetrievalTime, 'retrievedAt', 'required');

    const withoutReviewState = clone(manifest);
    delete withoutReviewState.events[0].review.state;
    rejectsManifest(withoutReviewState, 'state', 'required');
  });

  it('rejects unstable identifiers, malformed digests, and unknown vocabulary', () => {
    const unstableId = example('bot-wall');
    unstableId.objects[0].objectId = '/tmp/captures/record-1.html';
    rejectsManifest(unstableId, 'objectId', 'pattern');

    const malformedDigest = example('successful-capture');
    malformedDigest.artifacts[0].sha256 = 'not-a-sha256';
    rejectsManifest(malformedDigest, 'sha256', 'pattern');

    const unknownOutcome = example('bot-wall');
    unknownOutcome.events[0].retrieval.semanticOutcome = 'probably-fine';
    rejectsManifest(unknownOutcome, 'semanticOutcome', 'enum');
  });

  it('rejects impossible calendar timestamps across the manifest contract', () => {
    const invalidCases = [
      {
        label: 'manifest createdAt',
        manifest: example('bot-wall'),
        mutate: manifest => { manifest.createdAt = '2026-99-99T99:99:99.000Z'; },
      },
      {
        label: 'event occurredAt',
        manifest: example('bot-wall'),
        mutate: manifest => { manifest.events[0].occurredAt = '2026-02-30T15:15:00.000Z'; },
      },
      {
        label: 'retrieval retrievedAt',
        manifest: example('bot-wall'),
        mutate: manifest => { manifest.events[0].retrieval.retrievedAt = '2026-02-29T15:15:00Z'; },
      },
      {
        label: 'rights embargoUntil',
        manifest: example('rights-hold'),
        mutate: manifest => { manifest.events[1].rights.embargoUntil = '2026-13-01T00:00:00.000Z'; },
      },
      {
        label: 'storage copy createdAt',
        manifest: example('successful-capture'),
        mutate: manifest => { manifest.artifacts[0].storageCopies[0].createdAt = '2026-04-31T14:23:00.000Z'; },
      },
      {
        label: 'Wayback captureTimestamp',
        manifest: example('existing-wayback-reference'),
        mutate: manifest => { manifest.events[0].wayback.captureTimestamp = '20160230112233'; },
      },
    ];

    for (const testCase of invalidCases) {
      testCase.mutate(testCase.manifest);
      rejectsManifest(testCase.manifest, testCase.label, 'valid UTC timestamp');
    }
  });

  it('rejects payloads that do not belong to the declared event type', () => {
    const manifest = example('bot-wall');
    manifest.events[0].rights = {
      rightsStatus: 'hold',
      accessDecision: 'restricted',
      publicDepositEligibility: 'ineligible',
      policyVersion: 'draft-0.2.0',
      decisionBasis: 'This payload belongs on a rights-decision event.',
    };

    rejectsManifest(manifest, 'rights', 'capture-attempt', 'not allowed');
  });

  it('relates multiple captures and storage copies to one stable object', () => {
    const manifest = example('successful-capture');
    const objectId = manifest.objects[0].objectId;
    const captureEvents = manifest.events.filter(event => (
      event.objectId === objectId && event.eventType === 'capture-attempt'
    ));
    assert.equal(captureEvents.length, 2);
    assert.equal(manifest.artifacts.length, 1);
    assert.equal(manifest.artifacts[0].objectId, objectId);
    assert.equal(manifest.artifacts[0].storageCopies.length, 2);
    const fixityEvent = manifest.events.find(event => event.eventType === 'fixity-check');
    assert.equal(fixityEvent.fixity.artifactId, manifest.artifacts[0].artifactId);
    assert.equal(fixityEvent.fixity.outcome, 'match');

    const index = buildPreservationIndex(manifest);
    assert.deepEqual(index.objectsById[objectId].captureEventIds, captureEvents.map(event => event.eventId));
    assert.deepEqual(
      index.objectsById[objectId].storageCopyIds,
      manifest.artifacts[0].storageCopies.map(copy => copy.copyId),
    );
    assert.equal(index.derived, true);
  });

  it('derives latest index state by event time instead of manifest array order', () => {
    const rightsManifest = example('rights-hold');
    const staleRightsEvent = clone(rightsManifest.events[0]);
    staleRightsEvent.eventId = 'urn:rosen-preservation:event:stale-rights-import';
    staleRightsEvent.occurredAt = '2025-01-01T00:00:00.000Z';
    staleRightsEvent.review.state = 'rejected';
    delete staleRightsEvent.supersedesEventId;
    rightsManifest.events.push(staleRightsEvent);

    const rightsEntry = buildPreservationIndex(rightsManifest)
      .objectsById[rightsManifest.objects[0].objectId];
    assert.deepEqual(rightsEntry.latestRightsDecision, rightsManifest.events[1].rights);
    assert.equal(rightsEntry.latestReviewState, rightsManifest.events[1].review.state);

    const captureManifest = example('successful-capture');
    const retrievalEvents = captureManifest.events.filter(event => event.retrieval);
    const newestRetrieval = retrievalEvents.toSorted((left, right) => (
      Date.parse(right.occurredAt) - Date.parse(left.occurredAt)
    ))[0];
    const staleRetrievalEvent = clone(retrievalEvents[0]);
    staleRetrievalEvent.eventId = 'urn:rosen-preservation:event:stale-retrieval-import';
    staleRetrievalEvent.occurredAt = '2025-01-01T00:00:00.000Z';
    delete staleRetrievalEvent.supersedesEventId;
    captureManifest.events.push(staleRetrievalEvent);

    const captureEntry = buildPreservationIndex(captureManifest)
      .objectsById[captureManifest.objects[0].objectId];
    assert.equal(
      captureEntry.latestSemanticOutcome,
      newestRetrieval.retrieval.semanticOutcome
    );
  });

  it('excludes superseded assertions from the derived latest state', () => {
    const manifest = example('rights-hold');
    const original = manifest.events[0];
    const correction = manifest.events[1];
    correction.occurredAt = '2025-01-01T00:00:00.000Z';

    const entry = buildPreservationIndex(manifest).objectsById[manifest.objects[0].objectId];
    assert.deepEqual(entry.latestRightsDecision, correction.rights);
    assert.equal(entry.latestReviewState, correction.review.state);
    assert.notDeepEqual(entry.latestRightsDecision, original.rights);
  });

  it('requires append-only corrections to supersede an earlier event for the same object', () => {
    const manifest = example('rights-hold');
    assert.equal(manifest.events.length, 2);
    assert.equal(manifest.events[1].supersedesEventId, manifest.events[0].eventId);
    validatePreservationManifest(manifest);

    const missingTarget = clone(manifest);
    missingTarget.events[1].supersedesEventId = 'urn:rosen-preservation:event:missing';
    rejectsManifest(missingTarget, 'supersedesEventId', 'missing');

    const forwardReference = clone(manifest);
    forwardReference.events.reverse();
    rejectsManifest(forwardReference, 'append-only', 'earlier');

    const duplicateEvent = clone(manifest);
    duplicateEvent.events[1].eventId = duplicateEvent.events[0].eventId;
    rejectsManifest(duplicateEvent, 'duplicate', 'eventId');

    const crossTypeCorrection = clone(manifest);
    crossTypeCorrection.events[1].eventType = 'review-decision';
    delete crossTypeCorrection.events[1].rights;
    rejectsManifest(crossTypeCorrection, 'supersedesEventId', 'same event type');
  });

  it('rejects orphaned object, artifact, and storage-copy references', () => {
    const orphanedEvent = example('successful-capture');
    orphanedEvent.events[0].objectId = 'urn:rosen:object:archive-record:RECORD-MISSING';
    rejectsManifest(orphanedEvent, 'objectId', 'missing');

    const orphanedArtifact = example('successful-capture');
    orphanedArtifact.artifacts[0].captureEventId = 'urn:rosen-preservation:event:missing';
    rejectsManifest(orphanedArtifact, 'captureEventId', 'missing');

    const duplicateCopy = example('successful-capture');
    duplicateCopy.artifacts[0].storageCopies[1].copyId = duplicateCopy.artifacts[0].storageCopies[0].copyId;
    rejectsManifest(duplicateCopy, 'duplicate', 'copyId');
  });

  it('binds each declared capture artifact to the same capture event', () => {
    const manifest = example('successful-capture');
    const artifact = manifest.artifacts[0];
    const otherCapture = manifest.events.find(event => (
      event.eventType === 'capture-attempt' && event.eventId !== artifact.captureEventId
    ));
    artifact.captureEventId = otherCapture.eventId;

    rejectsManifest(manifest, 'artifactId', 'captureEventId', 'same capture-attempt');

    const duplicateOrigin = example('successful-capture');
    const secondArtifact = clone(duplicateOrigin.artifacts[0]);
    secondArtifact.artifactId = 'urn:rosen-preservation:artifact:example-success-alternate';
    secondArtifact.uri = 'urn:sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    secondArtifact.sha256 = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    secondArtifact.storageCopies = [];
    duplicateOrigin.artifacts.push(secondArtifact);
    rejectsManifest(duplicateOrigin, 'captureEventId', 'different artifactId');
  });

  it('binds a Wayback replay URL to its declared capture timestamp', () => {
    const manifest = example('existing-wayback-reference');
    manifest.events[0].wayback.replayUrl =
      'https://web.archive.org/web/20170405122334id_/https://example.org/missing-story';

    rejectsManifest(manifest, 'replayUrl', 'captureTimestamp', 'match');
  });

  it('binds fixity outcomes to the referenced artifact digest', () => {
    const wrongExpectedDigest = example('successful-capture');
    const wrongExpectedEvent = wrongExpectedDigest.events.find(event => event.eventType === 'fixity-check');
    wrongExpectedEvent.fixity.expectedDigest = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    rejectsManifest(wrongExpectedDigest, 'expectedDigest', 'artifact');

    const falseMatch = example('successful-capture');
    const falseMatchEvent = falseMatch.events.find(event => event.eventType === 'fixity-check');
    falseMatchEvent.fixity.observedDigest = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    rejectsManifest(falseMatch, 'outcome match', 'identical');
  });
});

describe('Winer evidence compatibility', () => {
  it('maps the existing capture tool output into valid preservation events without losing evidence', () => {
    const evidence = JSON.parse(fs.readFileSync(
      path.join(root, 'features', 'winer-method', 'retrieval-evidence.json'),
      'utf8',
    ));
    const manifest = convertWinerEvidence(evidence);
    validatePreservationManifest(manifest);

    assert.equal(manifest.objects.length, evidence.records.length);
    assert.equal(manifest.events.length, evidence.records.length);
    assert.equal(manifest.artifacts.length, evidence.records.length);

    const source = evidence.records[0];
    const event = manifest.events[0];
    const artifact = manifest.artifacts[0];
    assert.equal(event.taskVersion, evidence.captureTool);
    assert.equal(event.retrieval.requestedUrl, source.retrievalUrl);
    assert.equal(event.retrieval.finalUrl, source.retrieval.finalUrl);
    assert.equal(event.retrieval.bytesReceived, source.retrieval.byteLength);
    assert.equal(event.retrieval.client.name, source.retrieval.client);
    assert.equal(event.normalizationEvidence.sourceLocator, source.sourceLocator);
    assert.deepEqual(event.normalizationEvidence.observations, source.observations);
    assert.deepEqual(event.normalizationEvidence.fieldMapping, source.fieldMapping);
    assert.equal(event.normalizationEvidence.normalizedObjectSha256, source.normalizedRecordSha256);
    assert.equal(artifact.sha256, source.retrieval.responseSha256);
    assert.equal(artifact.byteSize, source.retrieval.byteLength);
  });
});
