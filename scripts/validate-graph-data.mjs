#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import initSqlJs from 'sql.js';
import { unescapeRow } from '../data/lib/csv-unescape.js';

export class GraphValidationError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'GraphValidationError';
  }
}

const statementCaches = new WeakMap();

function requiredText(value, objectLabel, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new GraphValidationError(`${objectLabel}: ${field} is required`);
  }
  return value.trim();
}

function nullableText(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized === '' ? null : normalized;
}

function numericValue(value, objectLabel, field, { integer = false, required = false } = {}) {
  if (value === null || value === undefined || value === '') {
    if (required) throw new GraphValidationError(`${objectLabel}: ${field} is required`);
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || (integer && !Number.isInteger(number))) {
    throw new GraphValidationError(`${objectLabel}: ${field} must be a finite${integer ? ' integer' : ''} number`);
  }
  return number;
}

function assertUniqueIds(rows, label) {
  const seen = new Set();
  for (const row of rows) {
    const id = requiredText(row.id, label, 'id');
    if (seen.has(id)) {
      throw new GraphValidationError(`duplicate ${label} stable ID ${id}`);
    }
    seen.add(id);
  }
}

function execute(database, sql, params = []) {
  let cache = statementCaches.get(database);
  if (!cache) {
    cache = new Map();
    statementCaches.set(database, cache);
  }
  let statement = cache.get(sql);
  if (!statement) {
    statement = database.prepare(sql);
    cache.set(sql, statement);
  }
  statement.run(params);
}

function freeCachedStatements(database) {
  const cache = statementCaches.get(database);
  if (!cache) return;
  for (const statement of cache.values()) statement.free();
  statementCaches.delete(database);
}

function firstRow(database, sql, params = []) {
  const statement = database.prepare(sql);
  try {
    statement.bind(params);
    if (!statement.step()) return null;
    return statement.getAsObject();
  } finally {
    statement.free();
  }
}

function createSchema(database) {
  database.run(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE entity_types (
      name TEXT PRIMARY KEY
    );

    -- Gate: is this relationship type currently writable (accepted, per the
    -- active extraction schema) or explicitly held (per graph-validation-holds.json)?
    -- The richer per-type semantics (endpoint-type constraints, direction, inverse,
    -- self-link/multi-assertion policy, temporal scope) live in the JS-side
    -- relationship type registry (data/relationship-type-registry.json, issue #737)
    -- and are enforced in validateGraphDataset, not in this table.
    CREATE TABLE relationship_type_registry (
      name TEXT NOT NULL,
      validation_state TEXT NOT NULL CHECK (validation_state IN ('accepted', 'held')),
      PRIMARY KEY (name, validation_state)
    );

    CREATE TABLE relationship_holds (
      relationship_id TEXT PRIMARY KEY,
      observed_type TEXT NOT NULL,
      reason TEXT NOT NULL
    );

    CREATE TABLE source_records (
      id TEXT PRIMARY KEY
    );

    CREATE TABLE published_records (
      id TEXT PRIMARY KEY
    );

    CREATE TABLE generated_published_record_exceptions (
      id TEXT PRIMARY KEY REFERENCES published_records(id)
    );

    CREATE TABLE source_entities (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL REFERENCES entity_types(name),
      name TEXT NOT NULL,
      normalized_name TEXT,
      role TEXT,
      affiliation TEXT,
      prominence REAL,
      first_mention_record_id TEXT REFERENCES source_records(id),
      first_mention_state TEXT NOT NULL CHECK (first_mention_state IN ('known', 'unknown')),
      total_mentions INTEGER,
      CHECK (
        (first_mention_state = 'known' AND first_mention_record_id IS NOT NULL)
        OR (first_mention_state = 'unknown' AND first_mention_record_id IS NULL)
      )
    );

    CREATE TABLE published_entities (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL REFERENCES entity_types(name),
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      role TEXT,
      affiliation TEXT,
      prominence REAL NOT NULL,
      first_mention_record_id TEXT REFERENCES published_records(id),
      first_mention_state TEXT NOT NULL CHECK (first_mention_state IN ('known', 'unknown')),
      total_mentions INTEGER NOT NULL,
      FOREIGN KEY (id) REFERENCES source_entities(id),
      CHECK (
        (first_mention_state = 'known' AND first_mention_record_id IS NOT NULL)
        OR (first_mention_state = 'unknown' AND first_mention_record_id IS NULL)
      )
    );

    CREATE TABLE map_entities (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL REFERENCES entity_types(name),
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      role TEXT,
      affiliation TEXT,
      prominence REAL NOT NULL,
      first_mention_record_id TEXT REFERENCES published_records(id),
      first_mention_state TEXT NOT NULL CHECK (first_mention_state IN ('known', 'unknown')),
      total_mentions INTEGER NOT NULL,
      FOREIGN KEY (id) REFERENCES published_entities(id),
      CHECK (
        (first_mention_state = 'known' AND first_mention_record_id IS NOT NULL)
        OR (first_mention_state = 'unknown' AND first_mention_record_id IS NULL)
      )
    );

    CREATE TABLE relationships (
      id TEXT PRIMARY KEY,
      source_record_id TEXT NOT NULL REFERENCES source_records(id),
      source_entity_id TEXT NOT NULL REFERENCES source_entities(id),
      source_entity_name TEXT NOT NULL,
      relationship_type TEXT NOT NULL,
      target_entity_id TEXT NOT NULL REFERENCES source_entities(id),
      target_entity_name TEXT NOT NULL,
      confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
      validation_state TEXT NOT NULL CHECK (validation_state IN ('accepted', 'held')),
      FOREIGN KEY (relationship_type, validation_state)
        REFERENCES relationship_type_registry(name, validation_state)
    );

    CREATE TRIGGER require_exact_relationship_hold
    BEFORE INSERT ON relationships
    WHEN NEW.validation_state = 'held'
      AND NOT EXISTS (
        SELECT 1 FROM relationship_holds
        WHERE relationship_id = NEW.id AND observed_type = NEW.relationship_type
      )
    BEGIN
      SELECT RAISE(ABORT, 'held relationship lacks exact policy entry');
    END;

    CREATE TABLE runtime_record_entity_links (
      record_id TEXT NOT NULL REFERENCES published_records(id),
      entity_id TEXT NOT NULL REFERENCES published_entities(id),
      PRIMARY KEY (record_id, entity_id)
    );

    CREATE TABLE map_record_entity_links (
      record_id TEXT NOT NULL REFERENCES published_records(id),
      entity_id TEXT NOT NULL REFERENCES map_entities(id),
      PRIMARY KEY (record_id, entity_id)
    );

    CREATE INDEX relationship_source_idx ON relationships(source_entity_id);
    CREATE INDEX relationship_target_idx ON relationships(target_entity_id);
    CREATE INDEX runtime_record_entity_idx ON runtime_record_entity_links(entity_id, record_id);
    CREATE INDEX map_record_entity_idx ON map_record_entity_links(entity_id, record_id);
  `);
}

function insertEntity(database, table, entity, allowedEntityTypes, recordIds, label) {
  const id = requiredText(entity.id, label, 'id');
  const type = requiredText(entity.type, id, 'type');
  const name = requiredText(entity.name, id, 'name');
  const generatedCopy = table !== 'source_entities';
  const normalizedName = generatedCopy
    ? requiredText(entity.normalizedName, id, 'normalizedName')
    : nullableText(entity.normalizedName);
  const role = nullableText(entity.role);
  const affiliation = nullableText(entity.affiliation);
  const prominence = numericValue(entity.prominence, id, 'prominence', { required: generatedCopy });
  const totalMentions = numericValue(entity.totalMentions, id, 'totalMentions', {
    integer: true,
    required: generatedCopy,
  });
  if (!allowedEntityTypes.has(type)) {
    throw new GraphValidationError(`${id}: type ${type} is not in the entity type registry`);
  }

  const firstMentionRecordId = nullableText(entity.firstMentionRecordId);
  if (firstMentionRecordId && !recordIds.has(firstMentionRecordId)) {
    throw new GraphValidationError(
      `${id}: firstMentionRecordId ${firstMentionRecordId} does not reference a ${label} record`
    );
  }

  execute(
    database,
    `INSERT INTO ${table} (
      id, entity_type, name, normalized_name, role, affiliation, prominence,
      first_mention_record_id, first_mention_state, total_mentions
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, type, name, normalizedName, role, affiliation, prominence,
      firstMentionRecordId, firstMentionRecordId ? 'known' : 'unknown', totalMentions,
    ]
  );
}

function insertRecordEntityLink(database, table, recordId, entityId, sourceField) {
  try {
    execute(
      database,
      `INSERT INTO ${table} (record_id, entity_id) VALUES (?, ?)`,
      [recordId, entityId]
    );
  } catch (error) {
    const detail = String(error?.message ?? error);
    if (detail.includes('UNIQUE constraint failed')) {
      throw new GraphValidationError(
        `${recordId}: ${sourceField} contains duplicate entity ID ${entityId}`,
        { cause: error }
      );
    }
    throw new GraphValidationError(
      `${recordId}: ${sourceField} references missing record or entity ${entityId}`,
      { cause: error }
    );
  }
}

function assertEntityCopiesAgree(database) {
  const sourceOnly = firstRow(database, `
    SELECT id FROM source_entities
    EXCEPT
    SELECT id FROM published_entities
    LIMIT 1
  `);
  if (sourceOnly) {
    throw new GraphValidationError(
      `${sourceOnly.id}: source entity is missing from the published entity collection`
    );
  }

  const publishedOnly = firstRow(database, `
    SELECT id FROM published_entities
    EXCEPT
    SELECT id FROM source_entities
    LIMIT 1
  `);
  if (publishedOnly) {
    throw new GraphValidationError(
      `${publishedOnly.id}: published entity is missing from the source entity collection`
    );
  }

  const publishedMapOnly = firstRow(database, `
    SELECT id FROM published_entities
    EXCEPT
    SELECT id FROM map_entities
    LIMIT 1
  `);
  if (publishedMapOnly) {
    throw new GraphValidationError(
      `${publishedMapOnly.id}: published entity is missing from archive-entities`
    );
  }

  const mapOnly = firstRow(database, `
    SELECT id FROM map_entities
    EXCEPT
    SELECT id FROM published_entities
    LIMIT 1
  `);
  if (mapOnly) {
    throw new GraphValidationError(
      `${mapOnly.id}: archive-entities entity is missing from the published collection`
    );
  }

  const sourceMismatch = firstRow(database, `
    SELECT source.id,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM published_records
          WHERE published_records.id = source.first_mention_record_id
        ) AND source.first_mention_record_id IS NOT published.first_mention_record_id
        THEN 1 ELSE 0
      END AS first_mention_mismatch
    FROM source_entities source
    JOIN published_entities published ON published.id = source.id
    WHERE source.entity_type != published.entity_type
      OR source.name != published.name
      OR source.normalized_name IS NOT published.normalized_name
      OR source.role IS NOT published.role
      OR source.affiliation IS NOT published.affiliation
      OR source.prominence IS NOT published.prominence
      OR (
        EXISTS (
          SELECT 1 FROM published_records
          WHERE published_records.id = source.first_mention_record_id
        )
        AND source.first_mention_record_id IS NOT published.first_mention_record_id
      )
      OR source.total_mentions IS NOT published.total_mentions
    LIMIT 1
  `);
  if (sourceMismatch) {
    const field = sourceMismatch.first_mention_mismatch
      ? ' firstMentionRecordId'
      : '';
    throw new GraphValidationError(
      `${sourceMismatch.id}: source and published entity${field} fields disagree`
    );
  }

  const publishedMismatch = firstRow(database, `
    SELECT published.id,
      published.entity_type AS published_type, map.entity_type AS map_type,
      published.name AS published_name, map.name AS map_name,
      published.normalized_name AS published_normalized_name,
      map.normalized_name AS map_normalized_name,
      published.role AS published_role, map.role AS map_role,
      published.affiliation AS published_affiliation, map.affiliation AS map_affiliation,
      published.prominence AS published_prominence, map.prominence AS map_prominence,
      published.first_mention_record_id AS published_first_mention,
      map.first_mention_record_id AS map_first_mention,
      published.total_mentions AS published_total_mentions,
      map.total_mentions AS map_total_mentions
    FROM published_entities published
    JOIN map_entities map ON map.id = published.id
    WHERE published.entity_type != map.entity_type
      OR published.name != map.name
      OR published.normalized_name != map.normalized_name
      OR published.role IS NOT map.role
      OR published.affiliation IS NOT map.affiliation
      OR published.prominence != map.prominence
      OR published.first_mention_record_id IS NOT map.first_mention_record_id
      OR published.total_mentions != map.total_mentions
    LIMIT 1
  `);
  if (publishedMismatch) {
    throw new GraphValidationError(
      `${publishedMismatch.id}: archive-data and archive-entities entity fields disagree`
    );
  }
}

function assertPublishedRecordsHaveSources(database) {
  const publishedOnly = firstRow(database, `
    SELECT id FROM published_records
    EXCEPT
    SELECT id FROM source_records
    EXCEPT
    SELECT id FROM generated_published_record_exceptions
    LIMIT 1
  `);
  if (publishedOnly) {
    throw new GraphValidationError(
      `${publishedOnly.id}: published record is missing from source data and has no generated-record exception`
    );
  }

  const obsoleteException = firstRow(database, `
    SELECT generated.id
    FROM generated_published_record_exceptions generated
    JOIN source_records source ON source.id = generated.id
    LIMIT 1
  `);
  if (obsoleteException) {
    throw new GraphValidationError(
      `${obsoleteException.id}: generated-record exception is obsolete because the record now has a source row`
    );
  }
}

function assertRecordEntityMapsAgree(database) {
  const runtimeOnly = firstRow(database, `
    SELECT record_id, entity_id FROM runtime_record_entity_links
    EXCEPT
    SELECT record_id, entity_id FROM map_record_entity_links
    LIMIT 1
  `);
  if (runtimeOnly) {
    throw new GraphValidationError(
      `${runtimeOnly.record_id}: relatedIds and recordEntityMap disagree on ${runtimeOnly.entity_id} `
      + `(present only in relatedIds)`
    );
  }

  const mapOnly = firstRow(database, `
    SELECT record_id, entity_id FROM map_record_entity_links
    EXCEPT
    SELECT record_id, entity_id FROM runtime_record_entity_links
    LIMIT 1
  `);
  if (mapOnly) {
    throw new GraphValidationError(
      `${mapOnly.record_id}: relatedIds and recordEntityMap disagree on ${mapOnly.entity_id} `
      + `(present only in recordEntityMap)`
    );
  }
}

function assertSourceRelationshipLinksAgree(database) {
  const sourceLinks = `
    SELECT relationship.source_record_id AS record_id,
      relationship.source_entity_id AS entity_id
    FROM relationships relationship
    JOIN published_records published ON published.id = relationship.source_record_id
    UNION
    SELECT relationship.source_record_id AS record_id,
      relationship.target_entity_id AS entity_id
    FROM relationships relationship
    JOIN published_records published ON published.id = relationship.source_record_id
  `;
  const sourceOnly = firstRow(database, `
    SELECT record_id, entity_id FROM (${sourceLinks})
    EXCEPT
    SELECT record_id, entity_id FROM runtime_record_entity_links
    LIMIT 1
  `);
  if (sourceOnly) {
    throw new GraphValidationError(
      `${sourceOnly.record_id}: source relationships and generated record/entity links disagree `
      + `on ${sourceOnly.entity_id} (missing from relatedIds and recordEntityMap)`
    );
  }

  const generatedOnly = firstRow(database, `
    SELECT record_id, entity_id FROM runtime_record_entity_links
    EXCEPT
    SELECT record_id, entity_id FROM (${sourceLinks})
    LIMIT 1
  `);
  if (generatedOnly) {
    throw new GraphValidationError(
      `${generatedOnly.record_id}: source relationships and generated record/entity links disagree `
      + `on ${generatedOnly.entity_id} (present only in relatedIds and recordEntityMap)`
    );
  }
}

function asArray(value, label) {
  if (!Array.isArray(value)) throw new GraphValidationError(`${label} must be an array`);
  return value;
}

function asPlainObject(value, label) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new GraphValidationError(`${label} must be an object`);
  }
  return value;
}

/**
 * Build the lookup key used to find the reverse-direction edge of a
 * (source, type, target) triple: swap source and target and look up the
 * candidate type under the same key shape.
 */
function edgeKey(sourceEntityId, relationshipType, targetEntityId) {
  return `${sourceEntityId} ${relationshipType} ${targetEntityId}`;
}

/**
 * Reject relationships whose type registry entry marks the type symmetric,
 * gives it a resolved inverseType, or gives it a candidateInverseType, when
 * the reverse-direction edge is also present under the same (symmetric),
 * inverse, or candidate-inverse type -- that pair encodes the same
 * real-world fact twice and would otherwise silently duplicate an edge
 * (issue #737).
 *
 * `edges` must include both accepted and held relationships: an inverse pair
 * can straddle that boundary (an accepted Owns row and a held Owned By row
 * can assert the same fact), and a check that only sees accepted edges
 * cannot detect that.
 *
 * A symmetric-type match is scoped to edges that share the same
 * sourceRecordId: two different source records independently asserting a
 * symmetric fact in whichever order they each happened to name the entities
 * is exactly what allowMultipleAssertions permits, not a contradiction (a
 * nit filed with #737). An inverse or candidate-inverse match is not scoped
 * to one record -- the same fact encoded under two different type labels is
 * a duplicate no matter which records asserted each side.
 *
 * `inverseType` is a curator-confirmed inverse. `candidateInverseType` names
 * a label pair this registry has observed looking like an inverse pair
 * without asserting that as settled semantics (see the Owns and Founded
 * entries) -- issue #737's boundary lets automation detect this kind of
 * contradiction but not decide a legacy label's historical meaning. Either
 * one can surface a real duplicate already present in committed data, so a
 * caller-supplied, per-entity-pair `duplicateEdgeExceptions` list names the
 * ones pending curator review instead of failing validation on them; any
 * duplicate not covered by that list still fails. `markExceptionUsed` is
 * called for every exception that matched at least one duplicate, so the
 * caller can reject an exception that no longer matches anything (stale).
 * The callback also receives both exact edges in each matched pair so later
 * reporting cannot accidentally select a different, same-entity-pair edge
 * whose direction does not match the inverse.
 */
function assertNoDuplicateSymmetricOrInverseEdges(
  edges,
  relationshipTypeRegistry,
  duplicateEdgeExceptions,
  markExceptionUsed
) {
  // Every type in the registry allows multiple assertions, so a
  // (source, type, target) triple names a COLLECTION of edges -- one per
  // record that asserted it -- not a single edge. Keeping only the last one
  // per key let two unrelated records mask a real contradiction between them:
  // the reverse lookup for each half of a same-record symmetric pair could
  // resolve to some other record's edge, and the sourceRecordId comparison
  // below would then find no match. Store them all and compare against every
  // candidate.
  const edgesByKey = new Map();
  for (const edge of edges) {
    const key = edgeKey(edge.sourceEntityId, edge.relationshipType, edge.targetEntityId);
    const bucket = edgesByKey.get(key);
    if (bucket) bucket.push(edge);
    else edgesByKey.set(key, [edge]);
  }
  const edgesAt = (sourceEntityId, relationshipType, targetEntityId) => (
    edgesByKey.get(edgeKey(sourceEntityId, relationshipType, targetEntityId)) ?? []
  );

  function findMatchingException(entityIdA, entityIdB, typeA, typeB) {
    return duplicateEdgeExceptions.find(exception => {
      const [exceptionEntityA, exceptionEntityB] = exception.entityIds;
      const entitiesMatch = (
        (exceptionEntityA === entityIdA && exceptionEntityB === entityIdB)
        || (exceptionEntityA === entityIdB && exceptionEntityB === entityIdA)
      );
      if (!entitiesMatch) return false;
      const [exceptionTypeA, exceptionTypeB] = exception.types;
      return (
        (exceptionTypeA === typeA && exceptionTypeB === typeB)
        || (exceptionTypeA === typeB && exceptionTypeB === typeA)
      );
    });
  }

  for (const edge of edges) {
    // A self-link has no reverse direction to duplicate, so it is not part of
    // this analysis. Whether it is permitted at all is the registry's
    // allowSelfLinks check, enforced where the endpoint types are.
    if (edge.sourceEntityId === edge.targetEntityId) continue;
    const registryEntry = relationshipTypeRegistry[edge.relationshipType];
    if (!registryEntry) continue;

    if (registryEntry.directionality === 'symmetric') {
      const reverseEdge = edgesAt(edge.targetEntityId, edge.relationshipType, edge.sourceEntityId)
        .find(candidate => candidate.id !== edge.id && candidate.sourceRecordId === edge.sourceRecordId);
      if (reverseEdge) {
        throw new GraphValidationError(
          `${edge.id}: symmetric type ${edge.relationshipType} duplicates edge ${reverseEdge.id} asserted in the reverse direction`
        );
      }
    }

    const resolvedInverseType = registryEntry.inverseType || registryEntry.candidateInverseType;
    if (resolvedInverseType) {
      const inverseEdges = edgesAt(edge.targetEntityId, resolvedInverseType, edge.sourceEntityId);
      if (inverseEdges.length > 0) {
        const exception = findMatchingException(
          edge.sourceEntityId,
          edge.targetEntityId,
          edge.relationshipType,
          resolvedInverseType
        );
        if (exception) {
          for (const inverseEdge of inverseEdges) {
            markExceptionUsed(exception, edge, inverseEdge);
          }
          continue;
        }
        const [inverseEdge] = inverseEdges;
        const via = registryEntry.inverseType ? 'inverse type' : 'candidate inverse type';
        throw new GraphValidationError(
          `${edge.id}: type ${edge.relationshipType} duplicates edge ${inverseEdge.id} via its ${via} ${resolvedInverseType}`
        );
      }
    }
  }
}

/**
 * Normalize one entry of policy.duplicateEdgeExceptions: an unordered pair of
 * entity IDs plus an unordered pair of relationship types that are known,
 * pending curator review, to encode the same fact twice (issue #737). Kept
 * separate from relationshipTypeHolds because it names a pair of edges, not a
 * single relationship's type.
 */
function normalizeDuplicateEdgeException(entry, index) {
  const label = `duplicateEdgeExceptions[${index}]`;
  const entityIds = asArray(entry.entityIds, `${label}.entityIds`);
  if (entityIds.length !== 2) {
    throw new GraphValidationError(`${label}.entityIds must list exactly two entity IDs`);
  }
  const types = asArray(entry.types, `${label}.types`);
  if (types.length !== 2) {
    throw new GraphValidationError(`${label}.types must list exactly two relationship types`);
  }
  return {
    entityIds: entityIds.map((value, i) => requiredText(value, label, `entityIds[${i}]`)),
    types: types.map((value, i) => requiredText(value, label, `types[${i}]`)),
    reason: requiredText(entry.reason, label, 'reason'),
    used: false,
  };
}

export async function validateGraphDataset(dataset) {
  const policy = dataset?.policy ?? {};
  const entityTypes = asArray(policy.entityTypes ?? [], 'policy.entityTypes');
  const acceptedRelationshipTypes = asArray(
    policy.acceptedRelationshipTypes ?? [],
    'policy.acceptedRelationshipTypes'
  );
  const relationshipTypeHolds = asArray(
    policy.relationshipTypeHolds ?? [],
    'policy.relationshipTypeHolds'
  );
  const relationshipTypeRegistry = asPlainObject(
    policy.relationshipTypeRegistry ?? {},
    'policy.relationshipTypeRegistry'
  );
  const duplicateEdgeExceptions = asArray(
    policy.duplicateEdgeExceptions ?? [],
    'policy.duplicateEdgeExceptions'
  ).map(normalizeDuplicateEdgeException);
  const generatedPublishedRecordIds = asArray(
    policy.generatedPublishedRecordIds ?? [],
    'policy.generatedPublishedRecordIds'
  );
  const sourceRecords = asArray(dataset?.sourceRecords ?? [], 'sourceRecords');
  const publishedRecords = asArray(dataset?.publishedRecords ?? [], 'publishedRecords');
  const sourceEntities = asArray(dataset?.sourceEntities ?? [], 'sourceEntities');
  const publishedEntities = asArray(dataset?.publishedEntities ?? [], 'publishedEntities');
  const mapEntities = asArray(dataset?.mapEntities ?? [], 'mapEntities');
  const relationships = asArray(dataset?.relationships ?? [], 'relationships');
  const recordEntityMap = dataset?.recordEntityMap ?? {};

  if (!recordEntityMap || Array.isArray(recordEntityMap) || typeof recordEntityMap !== 'object') {
    throw new GraphValidationError('recordEntityMap must be an object');
  }

  assertUniqueIds(sourceRecords, 'source record');
  assertUniqueIds(publishedRecords, 'published record');
  assertUniqueIds(sourceEntities, 'source entity');
  assertUniqueIds(publishedEntities, 'published entity');
  assertUniqueIds(mapEntities, 'entity-map entity');
  assertUniqueIds(relationships, 'relationship');

  const sourceRecordIds = new Set(sourceRecords.map(record => record.id.trim()));
  const publishedRecordIds = new Set(publishedRecords.map(record => record.id.trim()));
  const sourceEntityIds = new Set(sourceEntities.map(entity => entity.id.trim()));
  const sourceEntityById = new Map(sourceEntities.map(entity => [entity.id, entity]));
  const acceptedTypeSet = new Set(acceptedRelationshipTypes);
  const entityTypeSet = new Set(entityTypes);
  const holdByRelationshipId = new Map();
  const generatedRecordIds = new Set();

  for (const value of generatedPublishedRecordIds) {
    const id = requiredText(value, 'generated published record', 'id');
    if (generatedRecordIds.has(id)) {
      throw new GraphValidationError(`duplicate generated published record stable ID ${id}`);
    }
    generatedRecordIds.add(id);
  }

  for (const hold of relationshipTypeHolds) {
    const relationshipId = requiredText(hold.relationshipId, 'relationship hold', 'relationshipId');
    if (holdByRelationshipId.has(relationshipId)) {
      throw new GraphValidationError(`duplicate relationship hold stable ID ${relationshipId}`);
    }
    const observedType = requiredText(hold.observedType, relationshipId, 'observedType');
    if (acceptedTypeSet.has(observedType)) {
      throw new GraphValidationError(
        `${relationshipId}: relationship hold is obsolete; type ${observedType} is now accepted`
      );
    }
    holdByRelationshipId.set(relationshipId, {
      observedType,
      reason: requiredText(hold.reason, relationshipId, 'reason'),
    });
  }

  const SQL = await initSqlJs();
  const database = new SQL.Database();
  try {
    createSchema(database);
    database.run('BEGIN');

    for (const type of entityTypeSet) {
      execute(database, 'INSERT INTO entity_types (name) VALUES (?)', [requiredText(type, 'entity type', 'name')]);
    }
    for (const type of acceptedTypeSet) {
      execute(
        database,
        'INSERT INTO relationship_type_registry (name, validation_state) VALUES (?, ?)',
        [requiredText(type, 'relationship type', 'name'), 'accepted']
      );
    }
    for (const [relationshipId, hold] of holdByRelationshipId) {
      execute(
        database,
        'INSERT OR IGNORE INTO relationship_type_registry (name, validation_state) VALUES (?, ?)',
        [hold.observedType, 'held']
      );
      execute(
        database,
        `INSERT INTO relationship_holds (relationship_id, observed_type, reason)
         VALUES (?, ?, ?)`,
        [relationshipId, hold.observedType, hold.reason]
      );
    }

    for (const record of sourceRecords) {
      execute(database, 'INSERT INTO source_records (id) VALUES (?)', [record.id.trim()]);
    }
    for (const record of publishedRecords) {
      execute(database, 'INSERT INTO published_records (id) VALUES (?)', [record.id.trim()]);
    }
    for (const id of generatedRecordIds) {
      if (!publishedRecordIds.has(id)) {
        throw new GraphValidationError(
          `${id}: generated-record exception is stale because the published record is missing`
        );
      }
      execute(database, 'INSERT INTO generated_published_record_exceptions (id) VALUES (?)', [id]);
    }

    assertPublishedRecordsHaveSources(database);

    for (const entity of sourceEntities) {
      insertEntity(database, 'source_entities', entity, entityTypeSet, sourceRecordIds, 'source');
    }
    for (const entity of publishedEntities) {
      insertEntity(database, 'published_entities', entity, entityTypeSet, publishedRecordIds, 'published');
    }
    for (const entity of mapEntities) {
      insertEntity(database, 'map_entities', entity, entityTypeSet, publishedRecordIds, 'published');
    }

    assertEntityCopiesAgree(database);

    const graphEdges = [];
    const endpointReviewRows = [];
    for (const relationship of relationships) {
      const id = requiredText(relationship.id, 'relationship', 'id');
      const sourceRecordId = requiredText(relationship.sourceRecordId, id, 'sourceRecordId');
      const sourceEntityId = requiredText(relationship.sourceEntityId, id, 'sourceEntityId');
      const sourceEntityName = requiredText(relationship.sourceEntityName, id, 'sourceEntityName');
      const relationshipType = requiredText(relationship.type, id, 'type');
      const targetEntityId = requiredText(relationship.targetEntityId, id, 'targetEntityId');
      const targetEntityName = requiredText(relationship.targetEntityName, id, 'targetEntityName');

      if (!sourceRecordIds.has(sourceRecordId)) {
        throw new GraphValidationError(`${id}: sourceRecordId ${sourceRecordId} does not reference a source record`);
      }
      if (!sourceEntityIds.has(sourceEntityId)) {
        throw new GraphValidationError(`${id}: sourceEntityId ${sourceEntityId} does not reference a source entity`);
      }
      if (!sourceEntityIds.has(targetEntityId)) {
        throw new GraphValidationError(`${id}: targetEntityId ${targetEntityId} does not reference a source entity`);
      }

      const hold = holdByRelationshipId.get(id);
      let validationState;
      if (acceptedTypeSet.has(relationshipType)) {
        validationState = 'accepted';
      } else if (hold?.observedType === relationshipType) {
        validationState = 'held';
      } else {
        throw new GraphValidationError(`${id}: type ${relationshipType} is not accepted or explicitly held`);
      }

      // Looked up regardless of validationState: the endpoint-type review
      // collection below (issue #868) applies to held relationships too --
      // Founded By and Owned By carry a curator-confirmed direction now, but
      // every row of theirs is "held", not "accepted" (they remain outside
      // the active extraction schema).
      const sourceEntity = sourceEntityById.get(sourceEntityId);
      const targetEntity = sourceEntityById.get(targetEntityId);
      const registryEntry = relationshipTypeRegistry[relationshipType];

      if (validationState === 'accepted') {
        if (sourceEntity.name !== sourceEntityName) {
          throw new GraphValidationError(
            `${id}: sourceEntityName does not match source entity ${sourceEntityId}`
          );
        }
        if (targetEntity.name !== targetEntityName) {
          throw new GraphValidationError(
            `${id}: targetEntityName does not match target entity ${targetEntityId}`
          );
        }

        // Endpoint-type constraints (issue #737): enforced by default for any
        // type with a registry entry and resolved allowed source/target
        // types, UNLESS that entry marks endpointEnforcement: "deferred" (no
        // curator ruling yet) or "reviewed" (issue #868: the endpoint rule is
        // curator-settled, but pre-existing violations are not failures --
        // they are collected into endpointReviewRows below instead, together
        // with held relationships whose type carries the same enforcement
        // level). Cleaning up existing rows that predate a narrowed allowlist
        // is a curator decision, not something this validator enforces
        // silently by widening the allowlist to match the dirty data.
        const endpointTypesEnforced = registryEntry
          && registryEntry.endpointEnforcement !== 'deferred'
          && registryEntry.endpointEnforcement !== 'reviewed';
        if (endpointTypesEnforced && registryEntry.allowedSourceTypes && !registryEntry.allowedSourceTypes.includes(sourceEntity.type)) {
          throw new GraphValidationError(
            `${id}: source entity type ${sourceEntity.type} is not an allowed source type for ${relationshipType}`
          );
        }
        if (endpointTypesEnforced && registryEntry.allowedTargetTypes && !registryEntry.allowedTargetTypes.includes(targetEntity.type)) {
          throw new GraphValidationError(
            `${id}: target entity type ${targetEntity.type} is not an allowed target type for ${relationshipType}`
          );
        }

        // Self-link policy (issue #737). The registry records allowSelfLinks
        // for every type and nothing read it, so an edge pointing an entity at
        // itself passed validation under a type that forbids it -- "Jay Rosen
        // interviewed Jay Rosen". Enforced only when the registry entry says
        // so explicitly: a type absent from the registry, or one that leaves
        // the field unset, is not self-link-constrained here, the same way it
        // is not endpoint-constrained. No committed row is a self-link, so
        // this needs no grandfathering list; if one is ever needed it belongs
        // alongside duplicateEdgeExceptions in data/graph-validation-holds.json.
        if (registryEntry?.allowSelfLinks === false && sourceEntityId === targetEntityId) {
          throw new GraphValidationError(
            `${id}: ${relationshipType} does not allow self-links, but source and target are both ${sourceEntityId}`
          );
        }
      }

      // Endpoint-type review collection (issue #868). A "reviewed" type has
      // a curator-settled endpoint rule (unlike "deferred", which has none
      // yet), but pre-existing rows that don't fit it are not validation
      // failures -- they land here instead, and the caller writes them to a
      // committed review report. Runs for accepted AND held relationships
      // (Founded By and Owned By are always held, never accepted, since they
      // sit outside the active extraction schema).
      if (
        registryEntry?.endpointEnforcement === 'reviewed'
        && registryEntry.allowedSourceTypes
        && registryEntry.allowedTargetTypes
        && (!registryEntry.allowedSourceTypes.includes(sourceEntity.type)
          || !registryEntry.allowedTargetTypes.includes(targetEntity.type))
      ) {
        endpointReviewRows.push({
          relationshipId: id,
          relationshipType,
          sourceEntityId,
          sourceEntityType: sourceEntity.type,
          sourceEntityName,
          targetEntityId,
          targetEntityType: targetEntity.type,
          targetEntityName,
          validationState,
        });
      }

      // A curator can settle a legacy label by recommending a retype without
      // authorizing an automatic source edit. Put that action in the review
      // report alongside endpoint exceptions (issue #868).
      if (registryEntry?.recommendedRetypeTo) {
        endpointReviewRows.push({
          relationshipId: id,
          relationshipType,
          sourceEntityId,
          sourceEntityType: sourceEntity.type,
          sourceEntityName,
          targetEntityId,
          targetEntityType: targetEntity.type,
          targetEntityName,
          validationState,
          reviewReason: 'recommended-retype',
          recommendedType: registryEntry.recommendedRetypeTo,
        });
      }

      // Collected for the duplicate-edge check below regardless of
      // validationState: an inverse pair can straddle the accepted/held
      // boundary (issue #737), so held edges must be visible to it too.
      graphEdges.push({
        id,
        sourceRecordId,
        sourceEntityId,
        sourceEntityType: sourceEntity.type,
        sourceEntityName,
        relationshipType,
        targetEntityId,
        targetEntityType: targetEntity.type,
        targetEntityName,
        validationState,
      });

      const confidence = relationship.confidence === null || relationship.confidence === undefined
        ? null
        : Number(relationship.confidence);
      if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
        throw new GraphValidationError(`${id}: confidence must be between 0 and 1`);
      }

      execute(
        database,
        `INSERT INTO relationships (
          id, source_record_id, source_entity_id, source_entity_name, relationship_type,
          target_entity_id, target_entity_name, confidence, validation_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, sourceRecordId, sourceEntityId, sourceEntityName, relationshipType,
          targetEntityId, targetEntityName, confidence, validationState,
        ]
      );
    }

    const duplicateExceptionMatches = [];
    assertNoDuplicateSymmetricOrInverseEdges(
      graphEdges,
      relationshipTypeRegistry,
      duplicateEdgeExceptions,
      (exception, edge, inverseEdge) => {
        exception.used = true;
        duplicateExceptionMatches.push({ exception, edge, inverseEdge });
      }
    );

    // The #737 ruling settled the current Owns/Owned By exceptions: keep Owns
    // and review the Owned By rows for removal. A machine-readable registry
    // policy identifies that side of the pair; this collector reports it but
    // deliberately leaves the relationship CSV untouched.
    const reportedDuplicateIds = new Set();
    for (const { exception, edge, inverseEdge } of duplicateExceptionMatches) {
      const canonicalType = exception.types.find(type => (
        relationshipTypeRegistry[type]?.duplicateReviewPolicy
      ));
      const policy = canonicalType
        ? relationshipTypeRegistry[canonicalType].duplicateReviewPolicy
        : null;
      if (!canonicalType || !policy) continue;

      const reviewEdges = [edge, inverseEdge].filter(
        matchedEdge => matchedEdge.relationshipType === policy.reviewType
      );
      for (const reviewEdge of reviewEdges) {
        if (reportedDuplicateIds.has(reviewEdge.id)) continue;
        reportedDuplicateIds.add(reviewEdge.id);
        endpointReviewRows.push({
          relationshipId: reviewEdge.id,
          relationshipType: reviewEdge.relationshipType,
          sourceEntityId: reviewEdge.sourceEntityId,
          sourceEntityType: reviewEdge.sourceEntityType,
          sourceEntityName: reviewEdge.sourceEntityName,
          targetEntityId: reviewEdge.targetEntityId,
          targetEntityType: reviewEdge.targetEntityType,
          targetEntityName: reviewEdge.targetEntityName,
          validationState: reviewEdge.validationState,
          reviewReason: 'duplicate-inverse',
          recommendedAction: policy.recommendedAction,
          canonicalType,
        });
      }
    }

    for (const exception of duplicateEdgeExceptions) {
      if (!exception.used) {
        throw new GraphValidationError(
          `duplicateEdgeException for entities ${exception.entityIds.join('/')} `
          + `(${exception.types.join('/')}) is stale; no matching duplicate edge was found`
        );
      }
    }

    for (const [relationshipId, hold] of holdByRelationshipId) {
      const matchingRelationship = relationships.find(relationship => (
        relationship.id === relationshipId && relationship.type === hold.observedType
      ));
      if (!matchingRelationship) {
        throw new GraphValidationError(
          `${relationshipId}: relationship hold is stale; expected type ${hold.observedType}`
        );
      }
    }

    for (const record of publishedRecords) {
      const recordId = record.id.trim();
      const relatedIds = asArray(record.relatedIds ?? [], `${recordId}.relatedIds`);
      for (const entityId of relatedIds) {
        insertRecordEntityLink(
          database,
          'runtime_record_entity_links',
          recordId,
          requiredText(entityId, recordId, 'relatedIds'),
          'relatedIds'
        );
      }
    }

    for (const [recordId, entityIds] of Object.entries(recordEntityMap)) {
      requiredText(recordId, 'recordEntityMap', 'record ID');
      for (const entityId of asArray(entityIds, `recordEntityMap.${recordId}`)) {
        insertRecordEntityLink(
          database,
          'map_record_entity_links',
          recordId,
          requiredText(entityId, recordId, 'recordEntityMap'),
          'recordEntityMap'
        );
      }
    }

    assertRecordEntityMapsAgree(database);
    assertSourceRelationshipLinksAgree(database);
    database.run('COMMIT');

    const linkCount = firstRow(
      database,
      'SELECT COUNT(*) AS count FROM runtime_record_entity_links'
    ).count;
    const heldCount = firstRow(
      database,
      "SELECT COUNT(*) AS count FROM relationships WHERE validation_state = 'held'"
    ).count;

    return {
      database: ':memory:',
      sourceRecords: sourceRecords.length,
      publishedRecords: publishedRecords.length,
      sourceEntities: sourceEntities.length,
      publishedEntities: publishedEntities.length,
      relationships: relationships.length,
      recordEntityLinks: linkCount,
      heldRelationships: heldCount,
      endpointReviewRows,
    };
  } catch (error) {
    try {
      database.run('ROLLBACK');
    } catch {
      // A pre-transaction schema error leaves nothing to roll back.
    }
    if (error instanceof GraphValidationError) throw error;
    throw new GraphValidationError(`SQLite graph validation failed: ${error.message}`, { cause: error });
  } finally {
    freeCachedStatements(database);
    database.close();
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

/**
 * Turn the flat endpointReviewRows list from validateGraphDataset into the
 * committed review report (issue #868): one section per relationship type,
 * sorted for a stable diff, so a curator can see endpoint mismatches, approved
 * retypes, and settled inverse duplicates without any review-only action
 * failing validation or mutating source rows.
 */
export function buildEndpointReviewReport(endpointReviewRows) {
  // No wall-clock timestamp: the report is a pure function of the current
  // data and registry, so two runs against the same input produce a
  // byte-identical file. That keeps `git diff` meaningful (the file only
  // changes when a row or rule actually changes) and this function testable
  // without mocking the clock.
  const byType = {};
  for (const row of [...endpointReviewRows].sort((a, b) => a.relationshipId.localeCompare(b.relationshipId))) {
    const bucket = byType[row.relationshipType] ?? (byType[row.relationshipType] = { count: 0, rows: [] });
    bucket.count += 1;
    bucket.rows.push(row);
  }
  for (const type of Object.keys(byType).sort()) {
    // Re-insert in sorted key order so the committed file's top-level key
    // order is stable regardless of relationship input order.
    const bucket = byType[type];
    delete byType[type];
    byType[type] = bucket;
  }
  return {
    sourceIssue: 737,
    implementedByIssue: 868,
    note:
      'Rows a curator-settled relationship-type rule flags but does not fail validation on. This includes '
      + 'endpointEnforcement: "reviewed" mismatches, recommended retypes, and settled inverse duplicates '
      + 'recorded in data/relationship-type-registry.json. Regenerated by '
      + '`node scripts/validate-graph-data.mjs` every run; edit the registry or the source CSVs, not this '
      + 'file, to change its contents. Row presence here is not a claim that the row is wrong -- see each '
      + "type's endpointDivergence.note and directionNote in the registry for what the rule is and why.",
    totalRows: endpointReviewRows.length,
    byType,
  };
}

export async function readCanonicalCsv(filePath) {
  return parse(await readFile(filePath, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
  }).map(unescapeRow);
}

function sourceEntityFromCsv(row) {
  return {
    id: row.entity_id,
    type: row.entity_type,
    name: row.entity_name,
    normalizedName: row.normalized_name,
    role: row.role_or_description || '',
    affiliation: row.affiliation,
    prominence: Number.parseInt(row.prominence_score, 10) || 0,
    firstMentionRecordId: row.first_mention_record_id,
    totalMentions: Number.parseInt(row.total_mentions, 10) || 1,
  };
}

function publishedEntityFromJson(entity) {
  return {
    id: entity.id,
    type: entity.type,
    name: entity.name,
    normalizedName: entity.normalizedName,
    role: entity.role,
    affiliation: entity.affiliation,
    prominence: entity.prominence,
    firstMentionRecordId: entity.firstMentionRecordId,
    totalMentions: entity.totalMentions,
  };
}

export function validationPolicyFromSchemas(
  activeSchema,
  holdPolicy,
  relationshipTypeRegistry = {}
) {
  return {
    entityTypes: Object.keys(activeSchema.entity_types ?? {}),
    acceptedRelationshipTypes: Object.keys(activeSchema.relationship_types ?? {}),
    relationshipTypeHolds: holdPolicy.relationshipTypeHolds,
    generatedPublishedRecordIds: holdPolicy.generatedPublishedRecordIds ?? [],
    relationshipTypeRegistry,
    duplicateEdgeExceptions: holdPolicy.duplicateEdgeExceptions ?? [],
  };
}

export async function loadRepositoryGraphDataset(repositoryRoot) {
  const root = path.resolve(repositoryRoot);
  const [
    archiveRecords,
    socialRecords,
    sourceEntityRows,
    relationshipRows,
    archiveData,
    archiveEntities,
    extractionSchemaV3,
    holdPolicy,
    relationshipTypeRegistryFile,
  ] = await Promise.all([
    readCanonicalCsv(path.join(root, 'data/archive_records-public.csv')),
    readCanonicalCsv(path.join(root, 'data/social_posts.csv')),
    readCanonicalCsv(path.join(root, 'data/extracted_entities.csv')),
    readCanonicalCsv(path.join(root, 'data/extracted_relationships.csv')),
    readJson(path.join(root, 'data/archive-data.json')),
    readJson(path.join(root, 'data/archive-entities.json')),
    readJson(path.join(root, 'backend/entity_extraction_schema_v3.json')),
    readJson(path.join(root, 'data/graph-validation-holds.json')),
    readJson(path.join(root, 'data/relationship-type-registry.json')),
  ]);

  return {
    policy: validationPolicyFromSchemas(extractionSchemaV3, holdPolicy, relationshipTypeRegistryFile.types),
    sourceRecords: [...archiveRecords, ...socialRecords].map(record => ({ id: record.id })),
    publishedRecords: archiveData.records.map(record => ({
      id: record.id,
      relatedIds: Array.isArray(record.relatedIds) ? record.relatedIds : [],
    })),
    sourceEntities: sourceEntityRows.map(sourceEntityFromCsv),
    publishedEntities: archiveData.entities.map(publishedEntityFromJson),
    mapEntities: archiveEntities.entities.map(publishedEntityFromJson),
    relationships: relationshipRows.map(row => ({
      id: row.relationship_id,
      sourceRecordId: row.source_record_id,
      sourceEntityId: row.source_entity_id,
      sourceEntityName: row.source_entity_name,
      type: row.relationship_type,
      targetEntityId: row.target_entity_id,
      targetEntityName: row.target_entity_name,
      confidence: row.confidence_score === '' ? null : Number(row.confidence_score),
    })),
    recordEntityMap: archiveEntities.recordEntityMap,
  };
}

async function main() {
  try {
    const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const dataset = await loadRepositoryGraphDataset(repositoryRoot);
    const summary = await validateGraphDataset(dataset);

    const reportPath = path.join(repositoryRoot, 'data/relationship-review-report.json');
    const report = buildEndpointReviewReport(summary.endpointReviewRows);
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

    console.log(
      `Graph validation passed: ${summary.sourceRecords} source records, `
      + `${summary.publishedRecords} published records, ${summary.sourceEntities} entities, `
      + `${summary.relationships} relationships, ${summary.recordEntityLinks} record/entity links, `
      + `${summary.heldRelationships} explicit holds, ${report.totalRows} rows flagged for curator review `
      + `across ${Object.keys(report.byType).length} types (written to data/relationship-review-report.json; `
      + `generated ${summary.database} SQLite database)`
    );
  } catch (error) {
    console.error(`Graph validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
