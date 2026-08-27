import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GraphValidationError,
  loadRepositoryGraphDataset,
  readCanonicalCsv,
  validationPolicyFromSchemas,
  validateGraphDataset,
} from '../scripts/validate-graph-data.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.join(__dirname, '..');

function validFixture() {
  const sourceEntities = [
    {
      id: 'P0001',
      type: 'Person',
      name: 'Jay Rosen',
      normalizedName: 'Jay Rosen',
      role: 'Journalist',
      affiliation: 'New York University',
      prominence: 9,
      firstMentionRecordId: 'RECORD-00001',
      totalMentions: 4,
    },
    {
      id: 'O0001',
      type: 'Organization',
      name: 'PressThink',
      normalizedName: 'PressThink',
      role: 'Publication',
      affiliation: '',
      prominence: 7,
      firstMentionRecordId: 'RECORD-00001',
      totalMentions: 2,
    },
  ];
  const publishedEntities = sourceEntities.map(entity => ({ ...entity }));

  return {
    policy: {
      entityTypes: ['Person', 'Organization'],
      acceptedRelationshipTypes: ['Affiliated With'],
      relationshipTypeHolds: [],
      generatedPublishedRecordIds: [],
    },
    sourceRecords: [{ id: 'RECORD-00001' }],
    publishedRecords: [{
      id: 'RECORD-00001',
      relatedIds: ['P0001', 'O0001'],
    }],
    sourceEntities,
    publishedEntities,
    mapEntities: publishedEntities.map(entity => ({ ...entity })),
    relationships: [{
      id: 'REL-00001',
      sourceRecordId: 'RECORD-00001',
      sourceEntityId: 'P0001',
      sourceEntityName: 'Jay Rosen',
      type: 'Affiliated With',
      targetEntityId: 'O0001',
      targetEntityName: 'PressThink',
      confidence: 0.9,
    }],
    recordEntityMap: {
      'RECORD-00001': ['P0001', 'O0001'],
    },
  };
}

async function rejectsWith(fixture, ...messageParts) {
  await assert.rejects(
    validateGraphDataset(fixture),
    error => {
      assert.ok(error instanceof GraphValidationError);
      for (const part of messageParts) assert.match(error.message, new RegExp(part));
      return true;
    }
  );
}

describe('generated SQLite graph validator (#731)', () => {
  it('uses the canonical CSV unescape boundary before comparing generated data', async () => {
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'rosen-graph-csv-'));
    const csvPath = path.join(temporaryDirectory, 'entities.csv');
    try {
      await writeFile(csvPath, "entity_id,entity_name,notes\nP0001,'@JayRosen,'tis\n", 'utf8');
      const [row] = await readCanonicalCsv(csvPath);

      assert.equal(row.entity_name, '@JayRosen');
      assert.equal(row.notes, "'tis");
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('builds and validates an in-memory database from text-source fixtures', async () => {
    const summary = await validateGraphDataset(validFixture());

    assert.deepStrictEqual(summary, {
      database: ':memory:',
      sourceRecords: 1,
      publishedRecords: 1,
      sourceEntities: 2,
      publishedEntities: 2,
      relationships: 1,
      recordEntityLinks: 2,
      heldRelationships: 0,
    });
  });

  it('reports a dangling first mention with the object, field, and target', async () => {
    const fixture = validFixture();
    fixture.publishedEntities[0].firstMentionRecordId = 'RECORD-MISSING';

    await rejectsWith(fixture, 'P0001', 'firstMentionRecordId', 'RECORD-MISSING');
  });

  it('reports cross-file record/entity-map disagreement', async () => {
    const fixture = validFixture();
    fixture.recordEntityMap['RECORD-00001'] = ['P0001'];

    await rejectsWith(fixture, 'RECORD-00001', 'relatedIds', 'recordEntityMap', 'O0001');
  });

  it('reports generated record/entity links that disagree with source relationships', async () => {
    const fixture = validFixture();
    fixture.publishedRecords[0].relatedIds = ['P0001'];
    fixture.recordEntityMap['RECORD-00001'] = ['P0001'];

    await rejectsWith(fixture, 'RECORD-00001', 'source relationships', 'O0001');
  });

  it('reports cross-file entity disagreement', async () => {
    const sourceFixture = validFixture();
    sourceFixture.publishedEntities[0].name = 'Different published name';
    sourceFixture.mapEntities[0].name = 'Different published name';
    await rejectsWith(sourceFixture, 'P0001', 'source', 'published', 'disagree');

    const generatedFixture = validFixture();
    generatedFixture.mapEntities[0].firstMentionRecordId = null;
    await rejectsWith(generatedFixture, 'P0001', 'archive-data', 'archive-entities', 'disagree');

    const duplicatedFields = {
      normalizedName: 'J. Rosen',
      role: 'Professor',
      affiliation: 'Different university',
      prominence: 1,
      totalMentions: 99,
    };
    for (const [field, value] of Object.entries(duplicatedFields)) {
      const fieldFixture = validFixture();
      fieldFixture.mapEntities[0][field] = value;
      await rejectsWith(fieldFixture, 'P0001', 'archive-data', 'archive-entities', 'disagree');
    }

    const sourceFields = {
      normalizedName: 'J. Rosen',
      role: 'Professor',
      affiliation: 'Different university',
      prominence: 1,
      totalMentions: 99,
    };
    for (const [field, value] of Object.entries(sourceFields)) {
      const fieldFixture = validFixture();
      fieldFixture.sourceEntities[0][field] = value;
      await rejectsWith(fieldFixture, 'P0001', 'source', 'published', 'disagree');
    }

    const servedFirstMentionFixture = validFixture();
    servedFirstMentionFixture.sourceRecords.push({ id: 'RECORD-00002' });
    servedFirstMentionFixture.publishedRecords.push({ id: 'RECORD-00002', relatedIds: [] });
    servedFirstMentionFixture.sourceEntities[0].firstMentionRecordId = 'RECORD-00002';
    await rejectsWith(
      servedFirstMentionFixture,
      'P0001',
      'source',
      'published',
      'firstMentionRecordId',
      'disagree'
    );

    const unservedFirstMentionFixture = validFixture();
    unservedFirstMentionFixture.sourceRecords.push({ id: 'RECORD-UNSERVED' });
    unservedFirstMentionFixture.sourceEntities[0].firstMentionRecordId = 'RECORD-UNSERVED';
    const unservedSummary = await validateGraphDataset(unservedFirstMentionFixture);
    assert.equal(unservedSummary.publishedEntities, 2);

    const missingPublishedFixture = validFixture();
    missingPublishedFixture.sourceEntities.push({
      id: 'P0002',
      type: 'Person',
      name: 'Source-only person',
      firstMentionRecordId: 'RECORD-00001',
    });
    await rejectsWith(missingPublishedFixture, 'P0002', 'missing', 'published');

    const missingMapFixture = validFixture();
    missingMapFixture.mapEntities.pop();
    await rejectsWith(missingMapFixture, 'O0001', 'missing', 'archive-entities');
  });

  it('rejects a published record that no longer has a canonical source row', async () => {
    const fixture = validFixture();
    fixture.publishedRecords.push({ id: 'RECORD-STALE', relatedIds: [] });

    await rejectsWith(fixture, 'RECORD-STALE', 'published record', 'source');
  });

  it('allows only exact generated-record exceptions and rejects obsolete ones', async () => {
    const fixture = validFixture();
    fixture.publishedRecords.push({ id: 'THREAD-00001', relatedIds: [] });
    fixture.policy.generatedPublishedRecordIds = ['THREAD-00001'];

    const summary = await validateGraphDataset(fixture);
    assert.equal(summary.publishedRecords, 2);

    const obsoleteFixture = validFixture();
    obsoleteFixture.policy.generatedPublishedRecordIds = ['RECORD-00001'];
    await rejectsWith(obsoleteFixture, 'RECORD-00001', 'generated', 'obsolete');
  });

  it('rejects duplicate stable IDs and invalid relationship endpoints', async () => {
    const duplicateFixture = validFixture();
    duplicateFixture.sourceEntities.push({ ...duplicateFixture.sourceEntities[0] });
    await rejectsWith(duplicateFixture, 'duplicate', 'source entity', 'P0001');

    const endpointFixture = validFixture();
    endpointFixture.relationships[0].targetEntityId = 'O-MISSING';
    await rejectsWith(endpointFixture, 'REL-00001', 'targetEntityId', 'O-MISSING');

    const recordFixture = validFixture();
    recordFixture.relationships[0].sourceRecordId = 'RECORD-MISSING';
    await rejectsWith(recordFixture, 'REL-00001', 'sourceRecordId', 'RECORD-MISSING');
  });

  it('rejects unknown entity and relationship enumerations', async () => {
    const entityFixture = validFixture();
    entityFixture.sourceEntities[0].type = 'UnknownEntityType';
    await rejectsWith(entityFixture, 'P0001', 'type', 'UnknownEntityType');

    const relationshipFixture = validFixture();
    relationshipFixture.relationships[0].type = 'Invented Relationship';
    await rejectsWith(relationshipFixture, 'REL-00001', 'type', 'Invented Relationship');
  });

  it('requires non-empty typed endpoints and matching duplicated entity names', async () => {
    const emptyEndpointFixture = validFixture();
    emptyEndpointFixture.relationships[0].sourceEntityId = '';
    await rejectsWith(emptyEndpointFixture, 'REL-00001', 'sourceEntityId', 'required');

    const nameFixture = validFixture();
    nameFixture.relationships[0].targetEntityName = 'Different organization';
    await rejectsWith(nameFixture, 'REL-00001', 'targetEntityName', 'O0001');
  });

  it('accepts an unregistered relationship type only through an exact explicit hold', async () => {
    const fixture = validFixture();
    fixture.relationships[0].type = 'Created';
    fixture.policy.relationshipTypeHolds = [{
      relationshipId: 'REL-00001',
      observedType: 'Created',
      reason: 'Semantic classification awaits issue #737.',
    }];

    const summary = await validateGraphDataset(fixture);
    assert.strictEqual(summary.heldRelationships, 1);

    fixture.relationships[0].id = 'REL-OTHER';
    await rejectsWith(fixture, 'REL-OTHER', 'type', 'Created');
  });

  it('rejects stale explicit holds', async () => {
    const fixture = validFixture();
    fixture.policy.relationshipTypeHolds = [{
      relationshipId: 'REL-MISSING',
      observedType: 'Created',
      reason: 'Semantic classification awaits issue #737.',
    }];

    await rejectsWith(fixture, 'REL-MISSING', 'stale', 'Created');
  });

  it('rejects an obsolete hold after its relationship type becomes accepted', async () => {
    const fixture = validFixture();
    fixture.policy.relationshipTypeHolds = [{
      relationshipId: 'REL-00001',
      observedType: 'Affiliated With',
      reason: 'This hold should have been removed when the type was accepted.',
    }];

    await rejectsWith(fixture, 'REL-00001', 'hold', 'obsolete', 'Affiliated With');
  });

  it('derives accepted relationship types solely from the active writer schema', async () => {
    const [dataset, activeSchema] = await Promise.all([
      loadRepositoryGraphDataset(repositoryRoot),
      readFile(path.join(repositoryRoot, 'backend/entity_extraction_schema_v3.json'), 'utf8')
        .then(JSON.parse),
    ]);

    assert.deepStrictEqual(
      [...dataset.policy.acceptedRelationshipTypes].sort(),
      Object.keys(activeSchema.relationship_types).sort()
    );
  });

  it('derives accepted entity types solely from the active writer schema', async () => {
    const [dataset, activeSchema] = await Promise.all([
      loadRepositoryGraphDataset(repositoryRoot),
      readFile(path.join(repositoryRoot, 'backend/entity_extraction_schema_v3.json'), 'utf8')
        .then(JSON.parse),
    ]);

    assert.deepStrictEqual(
      [...dataset.policy.entityTypes].sort(),
      Object.keys(activeSchema.entity_types).sort()
    );

    const policy = validationPolicyFromSchemas(
      { entity_types: { Person: {} }, relationship_types: { ActiveLink: {} } },
      {
        relationshipTypeHolds: [],
        generatedPublishedRecordIds: ['THREAD-EXPECTED'],
      }
    );
    assert.deepStrictEqual(policy.entityTypes, ['Person']);
    assert.deepStrictEqual(policy.acceptedRelationshipTypes, ['ActiveLink']);
    assert.deepStrictEqual(policy.generatedPublishedRecordIds, ['THREAD-EXPECTED']);
  });

  it('validates the current repository data', async () => {
    const dataset = await loadRepositoryGraphDataset(repositoryRoot);
    const summary = await validateGraphDataset(dataset);

    assert.ok(summary.sourceRecords > 30_000);
    assert.ok(summary.publishedRecords > 26_000);
    assert.ok(summary.sourceEntities > 7_000);
    assert.ok(summary.relationships > 11_000);
    assert.strictEqual(
      summary.heldRelationships,
      dataset.policy.relationshipTypeHolds.length,
      'every explicit policy hold must correspond to a held source relationship'
    );
  });
});

describe('relationship type registry enforcement (#737)', () => {
  it('rejects a source entity type that is not allowed for the relationship type', async () => {
    const fixture = validFixture();
    fixture.policy.relationshipTypeRegistry = {
      'Affiliated With': { allowedSourceTypes: ['Organization'], allowedTargetTypes: ['Organization'] },
    };

    await rejectsWith(fixture, 'REL-00001', 'source entity type', 'Person', 'Affiliated With');
  });

  it('rejects a target entity type that is not allowed for the relationship type', async () => {
    const fixture = validFixture();
    fixture.policy.relationshipTypeRegistry = {
      'Affiliated With': { allowedSourceTypes: ['Person'], allowedTargetTypes: ['Person'] },
    };

    await rejectsWith(fixture, 'REL-00001', 'target entity type', 'Organization', 'Affiliated With');
  });

  it('does not constrain a type absent from the registry', async () => {
    const fixture = validFixture();
    fixture.policy.relationshipTypeRegistry = {
      'Some Other Type': { allowedSourceTypes: ['Organization'], allowedTargetTypes: ['Organization'] },
    };

    const summary = await validateGraphDataset(fixture);
    assert.equal(summary.relationships, 1);
  });

  it('rejects a symmetric type asserted redundantly in both directions', async () => {
    const fixture = validFixture();
    fixture.policy.acceptedRelationshipTypes = ['Mentions'];
    fixture.policy.relationshipTypeRegistry = {
      Mentions: { directionality: 'symmetric' },
    };
    fixture.relationships = [
      {
        id: 'REL-00001',
        sourceRecordId: 'RECORD-00001',
        sourceEntityId: 'P0001',
        sourceEntityName: 'Jay Rosen',
        type: 'Mentions',
        targetEntityId: 'O0001',
        targetEntityName: 'PressThink',
        confidence: 0.9,
      },
      {
        id: 'REL-00002',
        sourceRecordId: 'RECORD-00001',
        sourceEntityId: 'O0001',
        sourceEntityName: 'PressThink',
        type: 'Mentions',
        targetEntityId: 'P0001',
        targetEntityName: 'Jay Rosen',
        confidence: 0.9,
      },
    ];

    await rejectsWith(fixture, 'REL-00001', 'symmetric', 'Mentions', 'duplicates edge REL-00002');
  });

  it('rejects a type duplicating an edge already asserted under its inverse type', async () => {
    const fixture = validFixture();
    fixture.policy.acceptedRelationshipTypes = ['Owns', 'Owned By'];
    fixture.policy.relationshipTypeRegistry = {
      Owns: { inverseType: 'Owned By' },
      'Owned By': { inverseType: 'Owns' },
    };
    fixture.relationships = [
      {
        id: 'REL-00001',
        sourceRecordId: 'RECORD-00001',
        sourceEntityId: 'P0001',
        sourceEntityName: 'Jay Rosen',
        type: 'Owns',
        targetEntityId: 'O0001',
        targetEntityName: 'PressThink',
        confidence: 0.9,
      },
      {
        id: 'REL-00002',
        sourceRecordId: 'RECORD-00001',
        sourceEntityId: 'O0001',
        sourceEntityName: 'PressThink',
        type: 'Owned By',
        targetEntityId: 'P0001',
        targetEntityName: 'Jay Rosen',
        confidence: 0.9,
      },
    ];

    await rejectsWith(fixture, 'REL-00001', 'Owns', 'duplicates edge REL-00002', 'inverse type Owned By');
  });

  it('allows a self-referential symmetric-type edge without treating it as a duplicate', async () => {
    const fixture = validFixture();
    fixture.policy.acceptedRelationshipTypes = ['Mentions'];
    fixture.policy.relationshipTypeRegistry = { Mentions: { directionality: 'symmetric' } };
    fixture.publishedRecords[0].relatedIds = ['P0001'];
    fixture.recordEntityMap['RECORD-00001'] = ['P0001'];
    fixture.relationships = [{
      id: 'REL-00001',
      sourceRecordId: 'RECORD-00001',
      sourceEntityId: 'P0001',
      sourceEntityName: 'Jay Rosen',
      type: 'Mentions',
      targetEntityId: 'P0001',
      targetEntityName: 'Jay Rosen',
      confidence: 0.9,
    }];

    const summary = await validateGraphDataset(fixture);
    assert.equal(summary.relationships, 1);
  });
});

describe('committed relationship type registry (#737)', () => {
  async function loadRegistry() {
    return JSON.parse(
      await readFile(path.join(repositoryRoot, 'data/relationship-type-registry.json'), 'utf8')
    );
  }

  it('has a schema version and at least one migration note', async () => {
    const registry = await loadRegistry();

    assert.equal(typeof registry.schemaVersion, 'string');
    assert.ok(registry.schemaVersion.length > 0);
    assert.ok(Array.isArray(registry.migrationNotes));
    assert.ok(registry.migrationNotes.length > 0);
    for (const note of registry.migrationNotes) {
      assert.equal(typeof note.version, 'string');
      assert.equal(typeof note.summary, 'string');
    }
  });

  it('covers every relationship type currently present in extracted_relationships.csv', async () => {
    const [registry, relationshipRows] = await Promise.all([
      loadRegistry(),
      readCanonicalCsv(path.join(repositoryRoot, 'data/extracted_relationships.csv')),
    ]);

    const observedTypes = new Set(relationshipRows.map(row => row.relationship_type).filter(Boolean));
    const missing = [...observedTypes].filter(type => !registry.types[type]);
    assert.deepStrictEqual(missing, [], 'every type observed in the CSV must have a registry entry');
  });

  it('covers every relationship type in the active extraction schema, matching its accepted set', async () => {
    const [registry, activeSchema] = await Promise.all([
      loadRegistry(),
      readFile(path.join(repositoryRoot, 'backend/entity_extraction_schema_v3.json'), 'utf8').then(JSON.parse),
    ]);

    const schemaTypes = Object.keys(activeSchema.relationship_types ?? {}).sort();
    const acceptedRegistryTypes = Object.entries(registry.types)
      .filter(([, entry]) => entry.status === 'accepted')
      .map(([name]) => name)
      .sort();

    assert.deepStrictEqual(
      acceptedRegistryTypes,
      schemaTypes,
      'accepted registry entries must derive from (and only from) the active writer schema'
    );
  });

  it('gives every accepted type resolved endpoint types drawn from the registry entity types', async () => {
    const registry = await loadRegistry();
    const validEntityTypes = new Set(registry.entityTypes);

    for (const [name, entry] of Object.entries(registry.types)) {
      if (entry.status !== 'accepted') continue;
      assert.ok(Array.isArray(entry.allowedSourceTypes) && entry.allowedSourceTypes.length > 0, `${name}: allowedSourceTypes`);
      assert.ok(Array.isArray(entry.allowedTargetTypes) && entry.allowedTargetTypes.length > 0, `${name}: allowedTargetTypes`);
      for (const type of [...entry.allowedSourceTypes, ...entry.allowedTargetTypes]) {
        assert.ok(validEntityTypes.has(type), `${name}: ${type} is not a registered entity type`);
      }
      assert.equal(typeof entry.directionality, 'string', `${name}: directionality`);
      assert.equal(typeof entry.temporalScope, 'string', `${name}: temporalScope`);
      assert.notEqual(entry.temporalScope, 'deferred', `${name}: accepted types must not defer temporal scope`);
    }
  });

  it('marks semantically ambiguous legacy types deferred instead of guessing their semantics', async () => {
    const registry = await loadRegistry();

    for (const name of ['Founded By', 'Owned By', 'Created', 'Covers']) {
      const entry = registry.types[name];
      assert.ok(entry, `${name}: missing from registry`);
      assert.equal(entry.status, 'deferred', `${name}: status`);
      assert.equal(entry.directionality, null, `${name}: directionality must not be guessed`);
      assert.equal(entry.inverseType, null, `${name}: inverseType must not be guessed`);
      assert.equal(entry.temporalScope, 'deferred', `${name}: temporalScope must not be guessed`);
      assert.equal(typeof entry.deferralReason, 'string', `${name}: deferralReason`);
      assert.ok(entry.deferralReason.length > 0, `${name}: deferralReason`);
    }
  });

  it('records an explicit deferral for influence modeling pending issues #344 and #548', async () => {
    const registry = await loadRegistry();
    const entry = registry.types.Influenced;

    assert.ok(entry, 'Influenced entry is missing from the registry');
    assert.equal(entry.status, 'deferred');
    assert.deepStrictEqual(entry.relatedIssues, [344, 548]);
    assert.match(entry.deferralReason, /344/);
    assert.match(entry.deferralReason, /548/);
  });

  it('grounds its temporal-scope examples in relationship rows that still exist', async () => {
    const [registry, relationshipRows] = await Promise.all([
      loadRegistry(),
      readCanonicalCsv(path.join(repositoryRoot, 'data/extracted_relationships.csv')),
    ]);
    const rowById = new Map(relationshipRows.map(row => [row.relationship_id, row]));

    assert.ok(registry.examples?.temporalScope?.length > 0);
    assert.ok(registry.examples?.disputedAssertions?.length > 0);

    for (const example of registry.examples.temporalScope) {
      const row = rowById.get(example.relationshipId);
      assert.ok(row, `${example.relationshipId}: example relationship no longer exists`);
      const entry = registry.types[row.relationship_type];
      assert.equal(
        entry.temporalScope,
        example.temporalScope,
        `${example.relationshipId}: example temporalScope does not match its type's registry entry`
      );
    }
  });

  it('validates the current repository data against the committed registry with zero endpoint-type violations', async () => {
    const dataset = await loadRepositoryGraphDataset(repositoryRoot);
    assert.ok(Object.keys(dataset.policy.relationshipTypeRegistry).length > 0);

    const summary = await validateGraphDataset(dataset);
    assert.ok(summary.relationships > 11_000);
  });
});
