import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildRelationshipAdjacencyArtifacts,
  compareStableText,
  RELATIONSHIP_ADJACENCY_SHARD_IDS,
  relationshipAdjacencyArtifactFiles,
  relationshipAdjacencyShardFile,
  validateRelationshipAdjacencyArtifacts,
} from '../data/lib/relationship-adjacency.js';
import { buildRepositoryRelationshipAdjacency } from '../data/export-relationship-adjacency.js';
import { createRecordRelationshipLoader } from '../frontend/services/relationshipAdjacencyService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const dataDir = path.join(rootDir, 'data');

const approvedAssertion = (recordId = 'RECORD-00001') => ({
  assertionId: 'REL-001',
  sourceEntityId: 'P0001',
  targetEntityId: 'O0001',
  relationshipType: 'Mentions',
  direction: 'source_to_target',
  confidence: 0.9,
  decisionState: 'approved',
  evidence: { kind: 'archive-record', recordId },
  provenance: {
    sourceDataset: 'extracted_relationships.csv',
    sourceRecordId: recordId,
    extractedDate: '2026-08-14',
  },
});

function buildFixture(rows) {
  return buildRelationshipAdjacencyArtifacts({
    relationships: rows,
    servedRecordIds: new Set(['RECORD-00001']),
    acceptedRelationshipTypes: ['Mentions'],
    relationshipTypeHolds: [{ relationshipId: 'REL-HELD' }],
    relationshipCsv: 'canonical relationship source',
  });
}

function encodeJson(payload) {
  return new TextEncoder().encode(JSON.stringify(payload));
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function bytesResponse(bytes, ok = true) {
  return {
    ok,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    json: async () => JSON.parse(new TextDecoder().decode(bytes)),
  };
}

async function shardFixture(payload) {
  const bytes = encodeJson(payload);
  return {
    bytes,
    metadata: {
      file: `relationship-adjacency-${payload.shardId}.json`,
      sha256: await sha256Hex(bytes),
      bytes: bytes.byteLength,
    },
  };
}

describe('public relationship adjacency exporter (#807)', () => {
  it('uses code-unit ordering for byte-stable artifacts across locales', () => {
    assert.deepEqual(
      ['RECORD-00150_REL_016', 'RECORD-00150REL016', 'RECORD-00150-REL-016']
        .sort(compareStableText),
      ['RECORD-00150-REL-016', 'RECORD-00150REL016', 'RECORD-00150_REL_016']
    );
    const exporter = fs.readFileSync(
      path.join(dataDir, 'lib', 'relationship-adjacency.js'),
      'utf8'
    );
    assert.doesNotMatch(exporter, /localeCompare/);
  });

  it('writes a deterministic, integrity-checked manifest and fixed shards', () => {
    const rows = [
      {
        relationship_id: 'REL-002',
        source_record_id: 'RECORD-00001',
        source_entity_id: 'P0002',
        source_entity_name: 'Private source name',
        relationship_type: 'Mentions',
        target_entity_id: 'O0002',
        target_entity_name: 'Private target name',
        context_snippet: 'Private source sentence that must never publish.',
        confidence_score: '0.8',
        extracted_date: '2026-08-14',
      },
      {
        relationship_id: 'REL-001',
        source_record_id: 'RECORD-00001',
        source_entity_id: 'P0001',
        relationship_type: 'Mentions',
        target_entity_id: 'O0001',
        confidence_score: '0.9',
        extracted_date: '2026-08-14',
      },
      {
        relationship_id: 'REL-HELD',
        source_record_id: 'RECORD-00001',
        source_entity_id: 'P0003',
        relationship_type: 'Mentions',
        target_entity_id: 'O0003',
        confidence_score: '1',
        extracted_date: '2026-08-14',
      },
      {
        relationship_id: 'REL-UNACCEPTED',
        source_record_id: 'RECORD-00001',
        source_entity_id: 'P0004',
        relationship_type: 'Invented type',
        target_entity_id: 'O0004',
        confidence_score: '1',
        extracted_date: '2026-08-14',
      },
      {
        relationship_id: 'REL-UNSERVED',
        source_record_id: 'RECORD-00002',
        source_entity_id: 'P0005',
        relationship_type: 'Mentions',
        target_entity_id: 'O0005',
        confidence_score: '1',
        extracted_date: '2026-08-14',
      },
      {
        relationship_id: 'REL-INVALID-CONFIDENCE',
        source_record_id: 'RECORD-00001',
        source_entity_id: 'P0006',
        relationship_type: 'Mentions',
        target_entity_id: 'O0006',
        confidence_score: '1.1',
        extracted_date: '2026-08-14',
      },
    ];
    const first = buildFixture(rows);
    const second = buildFixture([...rows].reverse());

    assert.deepEqual(second, first, 'input order cannot change a committed public artifact');
    assert.deepEqual(validateRelationshipAdjacencyArtifacts(first), { records: 1, assertions: 2 });
    assert.equal(Object.keys(first.manifest.shards).length, 16);
    assert.deepEqual(Object.keys(first.manifest.shards), RELATIONSHIP_ADJACENCY_SHARD_IDS);
    assert.deepEqual(
      Object.values(first.manifest.omitted),
      [0, 1, 1, 1, 1, 0, 0],
      'the manifest reports each non-public assertion without exposing its source content'
    );

    const published = Object.values(first.shards)
      .flatMap(shard => Object.values(shard.records).flat())
      .sort((left, right) => left.assertionId.localeCompare(right.assertionId));
    assert.deepEqual(published.map(assertion => assertion.assertionId), ['REL-001', 'REL-002']);
    assert.deepEqual(Object.keys(published[0]).sort(), [
      'assertionId', 'confidence', 'decisionState', 'direction', 'evidence',
      'provenance', 'relationshipType', 'sourceEntityId', 'targetEntityId',
    ].sort());
    const serialized = JSON.stringify(first);
    assert.doesNotMatch(serialized, /Private source name|Private target name|Private source sentence/);

    for (const shardId of RELATIONSHIP_ADJACENCY_SHARD_IDS) {
      const metadata = first.manifest.shards[shardId];
      assert.equal(metadata.file, relationshipAdjacencyShardFile(shardId));
      assert.equal(metadata.bytes, Buffer.byteLength(first.serializedShards[shardId]));
      assert.match(metadata.sha256, /^[a-f0-9]{64}$/);
    }
  });

  it('validates the committed artifacts and prohibits raw relationship fields', () => {
    const manifest = JSON.parse(fs.readFileSync(
      path.join(dataDir, 'relationship-adjacency-manifest.json'),
      'utf8'
    ));
    const shards = {};
    const serializedShards = {};
    for (const shardId of RELATIONSHIP_ADJACENCY_SHARD_IDS) {
      const file = relationshipAdjacencyShardFile(shardId);
      const serialized = fs.readFileSync(path.join(dataDir, file), 'utf8');
      serializedShards[shardId] = serialized;
      shards[shardId] = JSON.parse(serialized);
    }

    const summary = validateRelationshipAdjacencyArtifacts({ manifest, shards, serializedShards });
    assert.ok(summary.records > 0, 'the archive must expose at least one public relationship record');
    assert.ok(summary.assertions > 0, 'the archive must expose at least one approved relationship assertion');
    assert.deepEqual(
      relationshipAdjacencyArtifactFiles(),
      ['relationship-adjacency-manifest.json', ...RELATIONSHIP_ADJACENCY_SHARD_IDS.map(relationshipAdjacencyShardFile)]
    );
    const publishedText = Object.values(serializedShards).join('\n');
    assert.doesNotMatch(publishedText, /context_snippet|source_entity_name|target_entity_name/);
  });

  it('counts calendar-invalid extraction dates as invalid provenance', () => {
    const built = buildFixture([
      {
        relationship_id: 'REL-BAD-MONTH',
        source_record_id: 'RECORD-00001',
        source_entity_id: 'P0001',
        relationship_type: 'Mentions',
        target_entity_id: 'O0001',
        confidence_score: '0.9',
        extracted_date: '2026-99-99',
      },
      {
        relationship_id: 'REL-BAD-DAY',
        source_record_id: 'RECORD-00001',
        source_entity_id: 'P0001',
        relationship_type: 'Mentions',
        target_entity_id: 'O0001',
        confidence_score: '0.9',
        extracted_date: '2026-02-30',
      },
      {
        relationship_id: 'REL-OK',
        source_record_id: 'RECORD-00001',
        source_entity_id: 'P0001',
        relationship_type: 'Mentions',
        target_entity_id: 'O0001',
        confidence_score: '0.9',
        extracted_date: '2026-02-28',
      },
    ]);
    assert.equal(built.manifest.omitted.invalidProvenance, 2);
    const published = Object.values(built.shards)
      .flatMap(shard => Object.values(shard.records).flat());
    assert.deepEqual(published.map(assertion => assertion.assertionId), ['REL-OK']);
  });

  it('byte-matches committed shards to a rebuild from current canonical inputs', () => {
    const rebuilt = buildRepositoryRelationshipAdjacency(rootDir);
    const summary = validateRelationshipAdjacencyArtifacts(rebuilt);
    assert.ok(summary.records > 0);
    assert.ok(summary.assertions > 0);
    assert.equal(
      rebuilt.serializedManifest,
      fs.readFileSync(path.join(dataDir, 'relationship-adjacency-manifest.json'), 'utf8')
    );
    for (const shardId of RELATIONSHIP_ADJACENCY_SHARD_IDS) {
      assert.equal(
        rebuilt.serializedShards[shardId],
        fs.readFileSync(path.join(dataDir, relationshipAdjacencyShardFile(shardId)), 'utf8')
      );
    }
  });
});

describe('record relationship adjacency loader (#807)', () => {
  it('loads one manifest and one approved shard, never the full graph', async () => {
    const requested = [];
    const shardPayload = {
      schemaVersion: '1.0.0',
      exportVersion: '1.0.0',
      shardId: 'a',
      records: { 'RECORD-00001': [approvedAssertion()] },
    };
    const shard = await shardFixture(shardPayload);
    const responses = new Map([
      ['./data/relationship-adjacency-manifest.json', bytesResponse(encodeJson({
        schemaVersion: '1.0.0',
        exportVersion: '1.0.0',
        source: {},
        recordShards: { 'RECORD-00001': 'a' },
        shards: { a: shard.metadata },
        omitted: {},
      }))],
      ['./data/relationship-adjacency-a.json', bytesResponse(shard.bytes)],
    ]);
    const loader = createRecordRelationshipLoader({
      fetchImpl: async (url) => {
        requested.push(url);
        return responses.get(url) ?? { ok: false };
      },
    });

    assert.deepEqual(await loader('RECORD-00001'), [approvedAssertion()]);
    assert.deepEqual(requested, [
      './data/relationship-adjacency-manifest.json',
      './data/relationship-adjacency-a.json',
    ]);
    assert.deepEqual(await loader('RECORD-00001'), [approvedAssertion()]);
    assert.deepEqual(await loader('RECORD-NOT-PUBLISHED'), []);
    assert.equal(requested.length, 2, 'memoization avoids refetching the manifest or a known shard');
  });

  it('loads shards from the selected manifest directory', async () => {
    const manifestUrl = '/preview/data/relationship-adjacency-manifest.json?v=1';
    const requested = [];
    const shardPayload = {
      schemaVersion: '1.0.0',
      exportVersion: '1.0.0',
      shardId: 'a',
      records: { 'RECORD-00001': [approvedAssertion()] },
    };
    const shard = await shardFixture(shardPayload);
    const responses = new Map([
      [manifestUrl, bytesResponse(encodeJson({
        schemaVersion: '1.0.0',
        exportVersion: '1.0.0',
        source: {},
        recordShards: { 'RECORD-00001': 'a' },
        shards: { a: shard.metadata },
        omitted: {},
      }))],
      ['/preview/data/relationship-adjacency-a.json', bytesResponse(shard.bytes)],
    ]);
    const loader = createRecordRelationshipLoader({
      manifestUrl,
      fetchImpl: async (url) => {
        requested.push(url);
        return responses.get(url) ?? { ok: false };
      },
    });

    assert.deepEqual(await loader('RECORD-00001'), [approvedAssertion()]);
    assert.deepEqual(requested, [
      manifestUrl,
      '/preview/data/relationship-adjacency-a.json',
    ]);
  });

  it('refuses a manifest that tries to fetch an arbitrary path', async () => {
    const requested = [];
    const loader = createRecordRelationshipLoader({
      fetchImpl: async (url) => {
        requested.push(url);
        return bytesResponse(encodeJson({
          schemaVersion: '1.0.0',
          exportVersion: '1.0.0',
          source: {},
          recordShards: { 'RECORD-00001': 'a' },
          shards: { a: { file: '../private-data.json' } },
          omitted: {},
        }));
      },
    });

    await assert.rejects(loader('RECORD-00001'), /invalid file name/);
    assert.deepEqual(requested, ['./data/relationship-adjacency-manifest.json']);
  });

  it('rejects a structurally valid shard from the wrong release', async () => {
    const published = await shardFixture({
      schemaVersion: '1.0.0',
      exportVersion: '1.0.0',
      shardId: 'a',
      records: { 'RECORD-00001': [approvedAssertion()] },
    });
    const nextRelease = encodeJson({
      schemaVersion: '1.0.0',
      exportVersion: '1.0.0',
      shardId: 'a',
      records: { 'RECORD-00001': [{ ...approvedAssertion(), confidence: 0.1 }] },
    });
    const loader = createRecordRelationshipLoader({
      fetchImpl: async (url) => {
        if (url.endsWith('relationship-adjacency-manifest.json')) {
          return bytesResponse(encodeJson({
            schemaVersion: '1.0.0',
            exportVersion: '1.0.0',
            source: {},
            recordShards: { 'RECORD-00001': 'a' },
            shards: { a: published.metadata },
            omitted: {},
          }));
        }
        return bytesResponse(nextRelease);
      },
    });

    await assert.rejects(loader('RECORD-00001'), /hash does not match the manifest/);
  });
});
