#!/usr/bin/env node

import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePreservationManifest } from './validate-preservation-manifests.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultEvidencePath = path.resolve(
  moduleDir,
  '../features/winer-method/retrieval-evidence.json',
);

function requireText(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`Winer evidence ${field} is required`);
  }
  return value;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  }
  return value;
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

export function convertWinerEvidence(evidence) {
  requireText(evidence?.captureTool, 'captureTool');
  requireText(evidence?.captureMode, 'captureMode');
  requireText(evidence?.recordSource, 'recordSource');
  if (typeof evidence?.runtimeNetworkAccess !== 'boolean') {
    throw new TypeError('Winer evidence runtimeNetworkAccess must be a boolean');
  }
  if (!Array.isArray(evidence?.records) || evidence.records.length === 0) {
    throw new TypeError('Winer evidence records must be a non-empty array');
  }

  const createdAt = evidence.records
    .map(record => requireText(record?.retrieval?.capturedAt, `${record?.id}.retrieval.capturedAt`))
    .sort()
    .at(-1);
  const objects = [];
  const events = [];
  const artifacts = [];

  for (const record of evidence.records) {
    const id = requireText(record.id, 'record.id');
    const objectId = `urn:rosen:object:feature-record:${id}`;
    const eventSuffix = digest([id, record.retrieval.capturedAt, record.retrieval.responseSha256]);
    const eventId = `urn:rosen-preservation:event:winer:${id}:${eventSuffix}`;
    const artifactId = `urn:rosen-preservation:artifact:winer:${id}:sha256:${record.retrieval.responseSha256}`;
    const alternateSourceUrls = new URL(record.retrieval.finalUrl).href
      === new URL(record.retrievalUrl).href
      ? []
      : [record.retrieval.finalUrl];

    objects.push({
      objectId,
      objectType: 'feature-record',
      canonicalSourceUrl: record.retrievalUrl,
      ...(alternateSourceUrls.length > 0 ? { alternateSourceUrls } : {}),
      sourceRecordId: id,
      label: record.observations.sourceTitle,
    });
    events.push({
      eventId,
      eventType: 'capture-attempt',
      objectId,
      taskVersion: evidence.captureTool,
      inputHash: record.normalizedRecordSha256,
      actor: {
        actorType: 'automation',
        actorId: 'winer-method-capture-tool',
      },
      occurredAt: record.retrieval.capturedAt,
      review: {
        state: 'accepted',
        notes: 'Curator-supervised retrieval retained by the Winer method demonstration.',
      },
      retrieval: {
        requestedUrl: record.retrievalUrl,
        observedSourceUrl: record.retrievalUrl,
        retrievedAt: record.retrieval.capturedAt,
        finalUrl: record.retrieval.finalUrl,
        httpStatus: record.retrieval.httpStatus,
        httpOutcome: 'response-received',
        mediaType: record.retrieval.contentType,
        bytesReceived: record.retrieval.byteLength,
        client: {
          name: record.retrieval.client,
          version: evidence.captureTool,
        },
        semanticOutcome: 'intended-content',
      },
      artifactId,
      normalizationEvidence: {
        sourceLocator: record.sourceLocator,
        observations: record.observations,
        fieldMapping: record.fieldMapping,
        normalizedObjectSha256: record.normalizedRecordSha256,
        captureMode: evidence.captureMode,
        recordSource: evidence.recordSource,
        runtimeNetworkAccess: evidence.runtimeNetworkAccess,
      },
    });
    artifacts.push({
      artifactId,
      objectId,
      captureEventId: eventId,
      artifactType: 'http-response',
      uri: `urn:sha256:${record.retrieval.responseSha256}`,
      sha256: record.retrieval.responseSha256,
      byteSize: record.retrieval.byteLength,
      mediaType: record.retrieval.contentType,
      storageCopies: [],
    });
  }

  return {
    schemaVersion: '1.0.0',
    vocabularyVersion: '1.0.0',
    manifestId: `urn:rosen-preservation:manifest:winer-method:${digest(evidence)}`,
    createdAt,
    description: 'Compatibility projection of the Winer method retrieval evidence artifact.',
    objects,
    events,
    artifacts,
  };
}

function main() {
  const inputPath = process.argv.slice(2).find(argument => argument !== '--verify') ?? defaultEvidencePath;
  const evidence = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
  const manifest = convertWinerEvidence(evidence);
  validatePreservationManifest(manifest);
  if (process.argv.includes('--verify')) {
    console.log(`Verified ${manifest.objects.length} Winer evidence records against preservation schema v1`);
  } else {
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`Winer evidence import failed: ${error.message}`);
    process.exitCode = 1;
  }
}
