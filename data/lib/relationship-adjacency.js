import { createHash } from 'node:crypto';

export const RELATIONSHIP_ADJACENCY_SCHEMA_VERSION = '1.0.0';
export const RELATIONSHIP_ADJACENCY_EXPORT_VERSION = '1.0.0';
export const RELATIONSHIP_ADJACENCY_MANIFEST_FILE = 'relationship-adjacency-manifest.json';
export const RELATIONSHIP_ADJACENCY_SHARD_IDS = Object.freeze([... '0123456789abcdef']);

const ASSERTION_KEYS = Object.freeze([
  'assertionId',
  'sourceEntityId',
  'targetEntityId',
  'relationshipType',
  'direction',
  'confidence',
  'decisionState',
  'evidence',
  'provenance',
]);

const OMITTED_REASONS = Object.freeze([
  'invalidRelationship',
  'unservedRecord',
  'heldRelationship',
  'unacceptedType',
  'invalidConfidence',
  'invalidProvenance',
  'duplicateAssertion',
]);

const asText = (value) => typeof value === 'string' ? value.trim() : '';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const byteLength = (value) => Buffer.byteLength(value, 'utf8');
export const compareStableText = (left, right) => {
  const normalizedLeft = asText(left);
  const normalizedRight = asText(right);
  if (normalizedLeft === normalizedRight) return 0;
  return normalizedLeft < normalizedRight ? -1 : 1;
};
const sortedObject = (entries) => Object.fromEntries(
  [...entries].sort(([left], [right]) => compareStableText(left, right))
);

export const relationshipAdjacencyShardFile = (shardId) =>
  `relationship-adjacency-${shardId}.json`;

export const relationshipAdjacencyArtifactFiles = () => [
  RELATIONSHIP_ADJACENCY_MANIFEST_FILE,
  ...RELATIONSHIP_ADJACENCY_SHARD_IDS.map(relationshipAdjacencyShardFile),
];

export const relationshipAdjacencyShardId = (recordId) =>
  sha256(asText(recordId)).slice(0, 1);

function increment(omitted, reason) {
  omitted[reason] += 1;
}

function exactKeys(value, expected, label) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort(compareStableText);
  const expectedKeys = [...expected].sort(compareStableText);
  if (actual.length !== expectedKeys.length || actual.some((key, index) => key !== expectedKeys[index])) {
    throw new Error(`${label} has an invalid shape`);
  }
}

function validExtractionDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function relationshipSortKey(row) {
  return [
    row.relationship_id,
    row.source_record_id,
    row.source_entity_id,
    row.relationship_type,
    row.target_entity_id,
    row.confidence_score,
    row.extracted_date,
  ].map(asText).join('\u0000');
}

/**
 * Build immutable, public-safe relationship adjacency artifacts.
 *
 * `approved` means that an assertion passes the active relationship type policy
 * and its record is part of the published archive. It does not claim a separate
 * human review event.
 */
export function buildRelationshipAdjacencyArtifacts({
  relationships,
  servedRecordIds,
  acceptedRelationshipTypes,
  relationshipTypeHolds,
  relationshipCsv,
}) {
  if (!Array.isArray(relationships)) throw new Error('relationships must be an array');
  if (!(servedRecordIds instanceof Set)) throw new Error('servedRecordIds must be a Set');
  if (!Array.isArray(acceptedRelationshipTypes)) {
    throw new Error('acceptedRelationshipTypes must be an array');
  }
  if (!Array.isArray(relationshipTypeHolds)) {
    throw new Error('relationshipTypeHolds must be an array');
  }
  if (typeof relationshipCsv !== 'string') throw new Error('relationshipCsv must be a string');

  const acceptedTypes = new Set(acceptedRelationshipTypes.map(asText).filter(Boolean));
  const heldRelationshipIds = new Set(
    relationshipTypeHolds.map(hold => asText(hold?.relationshipId)).filter(Boolean)
  );
  const policyJson = JSON.stringify({
    acceptedRelationshipTypes: [...acceptedTypes].sort(compareStableText),
    heldRelationshipIds: [...heldRelationshipIds].sort(compareStableText),
  });
  const omitted = Object.fromEntries(OMITTED_REASONS.map(reason => [reason, 0]));
  const assertionsByRecord = new Map();
  const seenAssertionIds = new Set();

  for (const row of [...relationships].sort((left, right) =>
    compareStableText(relationshipSortKey(left), relationshipSortKey(right))
  )) {
    const assertionId = asText(row.relationship_id);
    const sourceRecordId = asText(row.source_record_id);
    const sourceEntityId = asText(row.source_entity_id);
    const targetEntityId = asText(row.target_entity_id);
    const relationshipType = asText(row.relationship_type);
    const extractedDate = asText(row.extracted_date);

    if (!assertionId || !sourceRecordId || !sourceEntityId || !targetEntityId || !relationshipType) {
      increment(omitted, 'invalidRelationship');
      continue;
    }
    if (!servedRecordIds.has(sourceRecordId)) {
      increment(omitted, 'unservedRecord');
      continue;
    }
    if (heldRelationshipIds.has(assertionId)) {
      increment(omitted, 'heldRelationship');
      continue;
    }
    if (!acceptedTypes.has(relationshipType)) {
      increment(omitted, 'unacceptedType');
      continue;
    }

    const rawConfidence = asText(row.confidence_score);
    const confidence = Number(rawConfidence);
    if (!rawConfidence || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      increment(omitted, 'invalidConfidence');
      continue;
    }
    if (!validExtractionDate(extractedDate)) {
      increment(omitted, 'invalidProvenance');
      continue;
    }
    if (seenAssertionIds.has(assertionId)) {
      increment(omitted, 'duplicateAssertion');
      continue;
    }

    seenAssertionIds.add(assertionId);
    const assertion = {
      assertionId,
      sourceEntityId,
      targetEntityId,
      relationshipType,
      direction: 'source_to_target',
      confidence,
      decisionState: 'approved',
      evidence: {
        kind: 'archive-record',
        recordId: sourceRecordId,
      },
      provenance: {
        sourceDataset: 'extracted_relationships.csv',
        sourceRecordId,
        extractedDate,
      },
    };
    const assertions = assertionsByRecord.get(sourceRecordId) ?? [];
    assertions.push(assertion);
    assertionsByRecord.set(sourceRecordId, assertions);
  }

  const recordsByShard = new Map(RELATIONSHIP_ADJACENCY_SHARD_IDS.map(id => [id, new Map()]));
  for (const [recordId, assertions] of [...assertionsByRecord].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    assertions.sort((left, right) => compareStableText(left.assertionId, right.assertionId));
    recordsByShard.get(relationshipAdjacencyShardId(recordId)).set(recordId, assertions);
  }

  const shards = {};
  const serializedShards = {};
  const shardMetadata = {};
  for (const shardId of RELATIONSHIP_ADJACENCY_SHARD_IDS) {
    const records = sortedObject(recordsByShard.get(shardId));
    const shard = {
      schemaVersion: RELATIONSHIP_ADJACENCY_SCHEMA_VERSION,
      exportVersion: RELATIONSHIP_ADJACENCY_EXPORT_VERSION,
      shardId,
      records,
    };
    const serialized = JSON.stringify(shard);
    const assertionCount = Object.values(records).reduce((count, assertions) =>
      count + assertions.length, 0
    );
    shards[shardId] = shard;
    serializedShards[shardId] = serialized;
    shardMetadata[shardId] = {
      file: relationshipAdjacencyShardFile(shardId),
      sha256: sha256(serialized),
      bytes: byteLength(serialized),
      recordCount: Object.keys(records).length,
      assertionCount,
    };
  }

  const recordShards = sortedObject(
    [...assertionsByRecord.keys()].map(recordId => [recordId, relationshipAdjacencyShardId(recordId)])
  );
  const manifest = {
    schemaVersion: RELATIONSHIP_ADJACENCY_SCHEMA_VERSION,
    exportVersion: RELATIONSHIP_ADJACENCY_EXPORT_VERSION,
    source: {
      relationshipCsvSha256: sha256(relationshipCsv),
      policySha256: sha256(policyJson),
    },
    recordShards,
    shards: shardMetadata,
    omitted,
  };
  const serializedManifest = JSON.stringify(manifest);

  return {
    manifest,
    shards,
    serializedManifest,
    serializedShards,
  };
}

/**
 * Reject a malformed or unsafe generated artifact before it is committed.
 */
export function validateRelationshipAdjacencyArtifacts({
  manifest,
  shards,
  serializedShards = {},
}) {
  exactKeys(manifest, ['schemaVersion', 'exportVersion', 'source', 'recordShards', 'shards', 'omitted'], 'manifest');
  if (manifest.schemaVersion !== RELATIONSHIP_ADJACENCY_SCHEMA_VERSION) {
    throw new Error('manifest schemaVersion is unsupported');
  }
  if (manifest.exportVersion !== RELATIONSHIP_ADJACENCY_EXPORT_VERSION) {
    throw new Error('manifest exportVersion is unsupported');
  }
  exactKeys(manifest.source, ['relationshipCsvSha256', 'policySha256'], 'manifest.source');
  for (const [key, value] of Object.entries(manifest.source)) {
    if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`manifest.source.${key} must be a SHA-256 hash`);
  }
  exactKeys(manifest.omitted, OMITTED_REASONS, 'manifest.omitted');
  for (const [reason, count] of Object.entries(manifest.omitted)) {
    if (!Number.isInteger(count) || count < 0) throw new Error(`manifest.omitted.${reason} must be a count`);
  }
  if (!manifest.recordShards || Array.isArray(manifest.recordShards) || typeof manifest.recordShards !== 'object') {
    throw new Error('manifest.recordShards must be an object');
  }
  if (!manifest.shards || Array.isArray(manifest.shards) || typeof manifest.shards !== 'object') {
    throw new Error('manifest.shards must be an object');
  }

  const expectedRecordShards = new Map();
  for (const shardId of RELATIONSHIP_ADJACENCY_SHARD_IDS) {
    const shard = shards?.[shardId];
    const metadata = manifest.shards[shardId];
    if (!shard || !metadata) throw new Error(`missing shard ${shardId}`);
    exactKeys(shard, ['schemaVersion', 'exportVersion', 'shardId', 'records'], `shard ${shardId}`);
    exactKeys(metadata, ['file', 'sha256', 'bytes', 'recordCount', 'assertionCount'], `manifest.shards.${shardId}`);
    if (shard.schemaVersion !== manifest.schemaVersion || shard.exportVersion !== manifest.exportVersion) {
      throw new Error(`shard ${shardId} version does not match manifest`);
    }
    if (shard.shardId !== shardId) throw new Error(`shard ${shardId} has the wrong shardId`);
    if (metadata.file !== relationshipAdjacencyShardFile(shardId)) {
      throw new Error(`shard ${shardId} has an unsafe file name`);
    }
    if (!shard.records || Array.isArray(shard.records) || typeof shard.records !== 'object') {
      throw new Error(`shard ${shardId}.records must be an object`);
    }

    const serialized = serializedShards[shardId] ?? JSON.stringify(shard);
    if (metadata.sha256 !== sha256(serialized) || metadata.bytes !== byteLength(serialized)) {
      throw new Error(`shard ${shardId} hash or byte size does not match manifest`);
    }
    const recordIds = Object.keys(shard.records);
    const assertionCount = recordIds.reduce((count, recordId) => {
      if (!recordId || recordId !== asText(recordId)) {
        throw new Error(`shard ${shardId} has an invalid record ID`);
      }
      const assertions = shard.records[recordId];
      if (!Array.isArray(assertions) || assertions.length === 0) {
        throw new Error(`${recordId} must contain at least one assertion`);
      }
      if (relationshipAdjacencyShardId(recordId) !== shardId) {
        throw new Error(`${recordId} is in the wrong shard`);
      }
      expectedRecordShards.set(recordId, shardId);
      for (const assertion of assertions) {
        exactKeys(assertion, ASSERTION_KEYS, `${recordId} assertion`);
        if (
          !asText(assertion.assertionId)
          || !asText(assertion.sourceEntityId)
          || !asText(assertion.targetEntityId)
          || !asText(assertion.relationshipType)
        ) {
          throw new Error(`${recordId} assertion has invalid identifiers`);
        }
        if (assertion.direction !== 'source_to_target' || assertion.decisionState !== 'approved') {
          throw new Error(`${recordId} assertion has an unsupported direction or decision state`);
        }
        if (!Number.isFinite(assertion.confidence) || assertion.confidence < 0 || assertion.confidence > 1) {
          throw new Error(`${recordId} assertion has invalid confidence`);
        }
        exactKeys(assertion.evidence, ['kind', 'recordId'], `${recordId} assertion evidence`);
        exactKeys(assertion.provenance, ['sourceDataset', 'sourceRecordId', 'extractedDate'], `${recordId} assertion provenance`);
        if (
          assertion.evidence.kind !== 'archive-record'
          || assertion.evidence.recordId !== recordId
          || assertion.provenance.sourceDataset !== 'extracted_relationships.csv'
          || assertion.provenance.sourceRecordId !== recordId
          || !validExtractionDate(assertion.provenance.extractedDate)
        ) {
          throw new Error(`${recordId} assertion has invalid public provenance`);
        }
      }
      return count + assertions.length;
    }, 0);
    if (metadata.recordCount !== recordIds.length || metadata.assertionCount !== assertionCount) {
      throw new Error(`shard ${shardId} counts do not match manifest`);
    }
  }

  if (Object.keys(manifest.shards).length !== RELATIONSHIP_ADJACENCY_SHARD_IDS.length) {
    throw new Error('manifest must describe every stable shard');
  }
  if (Object.keys(manifest.recordShards).length !== expectedRecordShards.size) {
    throw new Error('manifest recordShards count does not match shard contents');
  }
  for (const [recordId, shardId] of expectedRecordShards) {
    if (manifest.recordShards[recordId] !== shardId) {
      throw new Error(`${recordId} recordShards entry does not match shard contents`);
    }
  }

  return {
    records: expectedRecordShards.size,
    assertions: Object.values(manifest.shards).reduce(
      (count, metadata) => count + metadata.assertionCount,
      0
    ),
  };
}
