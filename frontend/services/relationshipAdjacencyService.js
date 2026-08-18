const DEFAULT_MANIFEST_URL = './data/relationship-adjacency-manifest.json';
const SHARD_FILE_RE = /^relationship-adjacency-[0-9a-f]\.json$/;
const SCHEMA_VERSION = '1.0.0';
const EXPORT_VERSION = '1.0.0';

function requireObject(value, label) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireExactKeys(value, expected, label) {
  const object = requireObject(value, label);
  const actual = Object.keys(object).sort();
  const expectedKeys = [...expected].sort();
  if (actual.length !== expectedKeys.length || actual.some((key, index) => key !== expectedKeys[index])) {
    throw new Error(`${label} has an invalid shape`);
  }
  return object;
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

function requireApprovedAssertion(value, recordId) {
  const assertion = requireExactKeys(value, [
    'assertionId', 'sourceEntityId', 'targetEntityId', 'relationshipType',
    'direction', 'confidence', 'decisionState', 'evidence', 'provenance',
  ], 'relationship assertion');
  if (
    typeof assertion.assertionId !== 'string'
    || typeof assertion.sourceEntityId !== 'string'
    || typeof assertion.targetEntityId !== 'string'
    || typeof assertion.relationshipType !== 'string'
    || !assertion.assertionId.trim()
    || !assertion.sourceEntityId.trim()
    || !assertion.targetEntityId.trim()
    || !assertion.relationshipType.trim()
    || assertion.decisionState !== 'approved'
    || assertion.direction !== 'source_to_target'
    || !Number.isFinite(assertion.confidence)
    || assertion.confidence < 0
    || assertion.confidence > 1
  ) {
    throw new Error(`${recordId} has an invalid relationship assertion`);
  }
  const evidence = requireExactKeys(assertion.evidence, ['kind', 'recordId'], 'relationship evidence');
  const provenance = requireExactKeys(
    assertion.provenance,
    ['sourceDataset', 'sourceRecordId', 'extractedDate'],
    'relationship provenance'
  );
  if (
    evidence.kind !== 'archive-record'
    || evidence.recordId !== recordId
    || provenance.sourceRecordId !== recordId
    || provenance.sourceDataset !== 'extracted_relationships.csv'
    || !validExtractionDate(provenance.extractedDate)
  ) {
    throw new Error(`${recordId} has invalid relationship provenance`);
  }
  return assertion;
}

async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function fetchJson(fetchImpl, url) {
  const response = await fetchImpl(url);
  if (!response?.ok) throw new Error(`Could not load ${url}`);
  return response.json();
}

async function fetchVerifiedShard(fetchImpl, url, metadata, shardId) {
  if (
    typeof metadata.sha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(metadata.sha256)
    || !Number.isInteger(metadata.bytes)
    || metadata.bytes < 0
  ) {
    throw new Error(`Relationship shard ${shardId} is missing integrity metadata`);
  }
  const response = await fetchImpl(url);
  if (!response?.ok) throw new Error(`Could not load ${url}`);
  if (typeof response.arrayBuffer !== 'function') {
    throw new Error(`Could not read ${url}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== metadata.bytes) {
    throw new Error(`Relationship shard ${shardId} size does not match the manifest`);
  }
  if (await sha256Hex(bytes) !== metadata.sha256) {
    throw new Error(`Relationship shard ${shardId} hash does not match the manifest`);
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function relationshipShardUrl(manifestUrl, shardFile) {
  const manifestPath = manifestUrl.split(/[?#]/, 1)[0];
  const directoryEnd = manifestPath.lastIndexOf('/');
  return directoryEnd === -1
    ? shardFile
    : `${manifestPath.slice(0, directoryEnd + 1)}${shardFile}`;
}

/**
 * Create a memoized record lookup. Each known record loads one manifest and one
 * fixed shard. It never loads or reconstructs the complete relationship graph.
 */
export function createRecordRelationshipLoader({
  manifestUrl = DEFAULT_MANIFEST_URL,
  fetchImpl = fetch,
} = {}) {
  let manifestPromise;
  const shardPromises = new Map();

  const loadManifest = () => {
    if (!manifestPromise) {
      manifestPromise = fetchJson(fetchImpl, manifestUrl).then(payload => {
        const manifest = requireExactKeys(payload, [
          'schemaVersion', 'exportVersion', 'source', 'recordShards', 'shards', 'omitted',
        ], 'relationship adjacency manifest');
        if (manifest.schemaVersion !== SCHEMA_VERSION || manifest.exportVersion !== EXPORT_VERSION) {
          throw new Error('Relationship adjacency manifest has an unsupported version');
        }
        requireObject(manifest.recordShards, 'relationship adjacency recordShards');
        requireObject(manifest.shards, 'relationship adjacency shards');
        return manifest;
      }).catch(error => {
        manifestPromise = undefined;
        throw error;
      });
    }
    return manifestPromise;
  };

  return async (recordId) => {
    if (typeof recordId !== 'string' || !recordId.trim()) return [];

    const manifest = await loadManifest();
    const shardId = manifest.recordShards[recordId];
    if (typeof shardId !== 'string') return [];
    const shardMetadata = requireObject(manifest.shards[shardId], `relationship shard ${shardId}`);
    const shardFile = shardMetadata.file;
    if (!SHARD_FILE_RE.test(shardFile)) {
      throw new Error(`Relationship shard ${shardId} has an invalid file name`);
    }

    if (!shardPromises.has(shardId)) {
      shardPromises.set(shardId, fetchVerifiedShard(
        fetchImpl,
        relationshipShardUrl(manifestUrl, shardFile),
        shardMetadata,
        shardId
      ).then(payload => {
        const shard = requireExactKeys(payload, [
          'schemaVersion', 'exportVersion', 'shardId', 'records',
        ], `relationship shard ${shardId}`);
        if (
          shard.schemaVersion !== SCHEMA_VERSION
          || shard.exportVersion !== EXPORT_VERSION
          || shard.shardId !== shardId
        ) {
          throw new Error(`Relationship shard ${shardId} has an unsupported version or ID`);
        }
        requireObject(shard.records, `relationship shard ${shardId} records`);
        return shard;
      }).catch(error => {
        shardPromises.delete(shardId);
        throw error;
      }));
    }

    const shard = await shardPromises.get(shardId);
    const assertions = shard.records[recordId] ?? [];
    if (!Array.isArray(assertions)) throw new Error(`${recordId} relationship data must be an array`);
    return assertions.map(assertion => requireApprovedAssertion(assertion, recordId));
  };
}
