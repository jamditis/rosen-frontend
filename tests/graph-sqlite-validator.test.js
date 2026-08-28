import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GraphValidationError,
  buildEndpointReviewReport,
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
      endpointReviewRows: [],
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
    // Floors, not counts: they catch a graph that loaded empty or truncated.
    // The relationship floor dropped from 11,000 when the #867 duplicate
    // removal took the graph from 11,153 rows to 10,965.
    assert.ok(summary.relationships > 10_500);
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

  it('does not enforce endpoint types for a type marked endpointEnforcement: "deferred"', async () => {
    // A type can have a correct, schema-derived allowlist and still carry
    // known violations pending curator cleanup (issue #737). endpointEnforcement
    // is how the registry says "declared, not yet enforced" instead of the
    // allowlist silently widening to match the dirty data.
    const fixture = validFixture();
    fixture.policy.relationshipTypeRegistry = {
      'Affiliated With': {
        allowedSourceTypes: ['Organization'],
        allowedTargetTypes: ['Organization'],
        endpointEnforcement: 'deferred',
      },
    };

    const summary = await validateGraphDataset(fixture);
    assert.equal(summary.relationships, 1);
  });

  it('does not throw for a type marked endpointEnforcement: "reviewed", but records the row for review', async () => {
    // issue #868: "reviewed" means the endpoint rule is curator-settled (unlike
    // "deferred", which has no ruling yet), but a pre-existing violation is
    // still not a validation failure -- it lands in endpointReviewRows instead,
    // for the caller to write into the committed review report.
    const fixture = validFixture();
    fixture.policy.relationshipTypeRegistry = {
      'Affiliated With': {
        allowedSourceTypes: ['Organization'],
        allowedTargetTypes: ['Organization'],
        endpointEnforcement: 'reviewed',
      },
    };

    const summary = await validateGraphDataset(fixture);
    assert.equal(summary.relationships, 1);
    assert.deepStrictEqual(summary.endpointReviewRows, [{
      relationshipId: 'REL-00001',
      relationshipType: 'Affiliated With',
      sourceEntityId: 'P0001',
      sourceEntityType: 'Person',
      sourceEntityName: 'Jay Rosen',
      targetEntityId: 'O0001',
      targetEntityType: 'Organization',
      targetEntityName: 'PressThink',
      validationState: 'accepted',
    }]);
  });

  it('collects a "reviewed" violation from a held relationship too, not just accepted ones', async () => {
    // Founded By and Owned By (issue #868) are always held, never accepted --
    // they sit outside the active extraction schema -- but the review
    // collection still needs to see their rows.
    const fixture = validFixture();
    fixture.relationships[0].type = 'Owned By';
    fixture.policy.relationshipTypeHolds = [{
      relationshipId: 'REL-00001',
      observedType: 'Owned By',
      reason: 'Legacy inverse relationship type awaiting semantic normalization in issue #737.',
    }];
    fixture.policy.relationshipTypeRegistry = {
      'Owned By': {
        allowedSourceTypes: ['Organization', 'Work'],
        allowedTargetTypes: ['Organization', 'Person'],
        endpointEnforcement: 'reviewed',
      },
    };

    const summary = await validateGraphDataset(fixture);
    assert.equal(summary.heldRelationships, 1);
    assert.equal(summary.endpointReviewRows.length, 1);
    assert.equal(summary.endpointReviewRows[0].validationState, 'held');
  });

  it('puts a curator-approved retype recommendation in the review report', async () => {
    const fixture = validFixture();
    fixture.relationships[0].type = 'Created';
    fixture.policy.relationshipTypeHolds = [{
      relationshipId: 'REL-00001',
      observedType: 'Created',
      reason: 'Legacy label pending the issue #737 ruling.',
    }];
    fixture.policy.relationshipTypeRegistry = {
      Created: { recommendedRetypeTo: 'Pioneered' },
    };

    const summary = await validateGraphDataset(fixture);
    assert.deepStrictEqual(summary.endpointReviewRows, [{
      relationshipId: 'REL-00001',
      relationshipType: 'Created',
      sourceEntityId: 'P0001',
      sourceEntityType: 'Person',
      sourceEntityName: 'Jay Rosen',
      targetEntityId: 'O0001',
      targetEntityType: 'Organization',
      targetEntityName: 'PressThink',
      validationState: 'held',
      reviewReason: 'recommended-retype',
      recommendedType: 'Pioneered',
    }]);
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

  it('allows a symmetric type asserted by two different source records in opposite directions', async () => {
    // allowMultipleAssertions is true for every type: two different records
    // each independently reporting a symmetric fact, in whichever order they
    // happened to name the entities, is corroboration, not a contradiction.
    const fixture = validFixture();
    fixture.policy.acceptedRelationshipTypes = ['Mentions'];
    fixture.policy.relationshipTypeRegistry = {
      Mentions: { directionality: 'symmetric' },
    };
    fixture.sourceRecords.push({ id: 'RECORD-00002' });
    fixture.publishedRecords.push({ id: 'RECORD-00002', relatedIds: ['P0001', 'O0001'] });
    fixture.recordEntityMap['RECORD-00002'] = ['P0001', 'O0001'];
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
        sourceRecordId: 'RECORD-00002',
        sourceEntityId: 'O0001',
        sourceEntityName: 'PressThink',
        type: 'Mentions',
        targetEntityId: 'P0001',
        targetEntityName: 'Jay Rosen',
        confidence: 0.9,
      },
    ];

    const summary = await validateGraphDataset(fixture);
    assert.equal(summary.relationships, 2);
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

  it('rejects an inverse-type duplicate even when the inverse row is held, not accepted', async () => {
    // A held type is real data in the graph, just not endpoint-constrained.
    // A duplicate check that only looked at accepted edges could never see a
    // duplicate that straddles the accepted/held boundary (issue #737).
    const fixture = validFixture();
    fixture.policy.acceptedRelationshipTypes = ['Owns'];
    fixture.policy.relationshipTypeRegistry = {
      Owns: { inverseType: 'Owned By' },
    };
    fixture.policy.relationshipTypeHolds = [{
      relationshipId: 'REL-00002',
      observedType: 'Owned By',
      reason: 'Legacy inverse relationship type awaiting semantic normalization in issue #737.',
    }];
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

  it('rejects a duplicate found only via candidateInverseType, using the softer wording', async () => {
    const fixture = validFixture();
    fixture.policy.acceptedRelationshipTypes = ['Owns', 'Owned By'];
    fixture.policy.relationshipTypeRegistry = {
      Owns: { candidateInverseType: 'Owned By' },
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

    await rejectsWith(fixture, 'REL-00001', 'Owns', 'duplicates edge REL-00002', 'candidate inverse type Owned By');
  });

  it('tolerates a candidateInverseType duplicate named in duplicateEdgeExceptions', async () => {
    const fixture = validFixture();
    fixture.policy.acceptedRelationshipTypes = ['Owns', 'Owned By'];
    fixture.policy.relationshipTypeRegistry = {
      Owns: {
        candidateInverseType: 'Owned By',
        duplicateReviewPolicy: {
          reviewType: 'Owned By',
          recommendedAction: 'remove-duplicate',
        },
      },
    };
    fixture.policy.duplicateEdgeExceptions = [{
      entityIds: ['P0001', 'O0001'],
      types: ['Owns', 'Owned By'],
      reason: 'Same fact asserted under both labels; which to keep is a pending curator decision.',
    }];
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

    const summary = await validateGraphDataset(fixture);
    assert.equal(summary.relationships, 2);
    assert.deepStrictEqual(summary.endpointReviewRows, [{
      relationshipId: 'REL-00002',
      relationshipType: 'Owned By',
      sourceEntityId: 'O0001',
      sourceEntityType: 'Organization',
      sourceEntityName: 'PressThink',
      targetEntityId: 'P0001',
      targetEntityType: 'Person',
      targetEntityName: 'Jay Rosen',
      validationState: 'accepted',
      reviewReason: 'duplicate-inverse',
      recommendedAction: 'remove-duplicate',
      canonicalType: 'Owns',
    }]);
  });

  it('rejects a duplicateEdgeException that no longer matches any duplicate edge', async () => {
    const fixture = validFixture();
    fixture.policy.duplicateEdgeExceptions = [{
      entityIds: ['P0001', 'O0001'],
      types: ['Owns', 'Owned By'],
      reason: 'No longer applies; curator already resolved this pair.',
    }];

    await rejectsWith(fixture, 'duplicateEdgeException', 'P0001', 'O0001', 'stale');
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

  it('still finds a same-record symmetric duplicate when other records overwrite both directional keys', async () => {
    // allowMultipleAssertions lets several records assert the same directional
    // edge, so a (source, type, target) key names a COLLECTION of edges, not
    // one. Keeping only the last edge per key let two unrelated records hide a
    // real contradiction: RECORD-00001 asserts the symmetric fact in both
    // directions, but the reverse lookup for each of its edges resolves to a
    // different record's edge, so neither comparison matches on sourceRecordId.
    const fixture = validFixture();
    fixture.policy.acceptedRelationshipTypes = ['Mentions'];
    fixture.policy.relationshipTypeRegistry = { Mentions: { directionality: 'symmetric' } };
    for (const id of ['RECORD-00002', 'RECORD-00003']) {
      fixture.sourceRecords.push({ id });
      fixture.publishedRecords.push({ id, relatedIds: ['P0001', 'O0001'] });
      fixture.recordEntityMap[id] = ['P0001', 'O0001'];
    }
    const forward = (id, sourceRecordId) => ({
      id,
      sourceRecordId,
      sourceEntityId: 'P0001',
      sourceEntityName: 'Jay Rosen',
      type: 'Mentions',
      targetEntityId: 'O0001',
      targetEntityName: 'PressThink',
      confidence: 0.9,
    });
    const reverse = (id, sourceRecordId) => ({
      id,
      sourceRecordId,
      sourceEntityId: 'O0001',
      sourceEntityName: 'PressThink',
      type: 'Mentions',
      targetEntityId: 'P0001',
      targetEntityName: 'Jay Rosen',
      confidence: 0.9,
    });
    // Order matters: the last write for each directional key must belong to a
    // record other than RECORD-00001, which is what masked the duplicate.
    fixture.relationships = [
      forward('REL-00001', 'RECORD-00001'),
      forward('REL-00002', 'RECORD-00002'),
      reverse('REL-00003', 'RECORD-00001'),
      reverse('REL-00004', 'RECORD-00003'),
    ];

    await rejectsWith(fixture, 'symmetric', 'Mentions', 'REL-0000(1|3)');
  });

  it('rejects a self-referential edge whose registry entry disallows self-links', async () => {
    const fixture = validFixture();
    fixture.policy.relationshipTypeRegistry = { 'Affiliated With': { allowSelfLinks: false } };
    fixture.publishedRecords[0].relatedIds = ['P0001'];
    fixture.recordEntityMap['RECORD-00001'] = ['P0001'];
    fixture.relationships = [{
      id: 'REL-00001',
      sourceRecordId: 'RECORD-00001',
      sourceEntityId: 'P0001',
      sourceEntityName: 'Jay Rosen',
      type: 'Affiliated With',
      targetEntityId: 'P0001',
      targetEntityName: 'Jay Rosen',
      confidence: 0.9,
    }];

    await rejectsWith(fixture, 'REL-00001', 'Affiliated With', 'self');
  });

  it('allows a self-referential edge whose registry entry permits self-links', async () => {
    const fixture = validFixture();
    fixture.policy.relationshipTypeRegistry = { 'Affiliated With': { allowSelfLinks: true } };
    fixture.publishedRecords[0].relatedIds = ['P0001'];
    fixture.recordEntityMap['RECORD-00001'] = ['P0001'];
    fixture.relationships = [{
      id: 'REL-00001',
      sourceRecordId: 'RECORD-00001',
      sourceEntityId: 'P0001',
      sourceEntityName: 'Jay Rosen',
      type: 'Affiliated With',
      targetEntityId: 'P0001',
      targetEntityName: 'Jay Rosen',
      confidence: 0.9,
    }];

    const summary = await validateGraphDataset(fixture);
    assert.equal(summary.relationships, 1);
  });

  it('leaves a self-referential edge alone when its type has no registry entry', async () => {
    // A type absent from the registry is not self-link-constrained here, the
    // same way it is not endpoint-constrained: the registry is the only source
    // of that policy, and silence in it is not a prohibition.
    const fixture = validFixture();
    fixture.publishedRecords[0].relatedIds = ['P0001'];
    fixture.recordEntityMap['RECORD-00001'] = ['P0001'];
    fixture.relationships = [{
      id: 'REL-00001',
      sourceRecordId: 'RECORD-00001',
      sourceEntityId: 'P0001',
      sourceEntityName: 'Jay Rosen',
      type: 'Affiliated With',
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

  it('derives every accepted type\'s endpoint types from the extraction schema, not from current usage', async () => {
    // A prior version of this registry inferred allowedSourceTypes/
    // allowedTargetTypes from extracted_relationships.csv itself, which made
    // the constraint pass no matter how dirty the data was. Pinning equality
    // against the curator-authored schema is what would have caught that.
    const [registry, activeSchema] = await Promise.all([
      loadRegistry(),
      readFile(path.join(repositoryRoot, 'backend/entity_extraction_schema_v3.json'), 'utf8').then(JSON.parse),
    ]);

    for (const [name, entry] of Object.entries(registry.types)) {
      if (entry.status !== 'accepted') continue;
      const schemaEntry = activeSchema.relationship_types[name];
      assert.ok(schemaEntry, `${name}: missing from the active extraction schema`);
      assert.deepStrictEqual(
        [...entry.allowedSourceTypes].sort(),
        [...schemaEntry.valid_source_types].sort(),
        `${name}: allowedSourceTypes must match the schema's valid_source_types exactly`
      );
      assert.deepStrictEqual(
        [...entry.allowedTargetTypes].sort(),
        [...schemaEntry.valid_target_types].sort(),
        `${name}: allowedTargetTypes must match the schema's valid_target_types exactly`
      );
    }
  });

  it('marks a type endpointEnforcement: "enforced", "reviewed", or "deferred" consistently with whether it has a recorded divergence', async () => {
    // "deferred" (no curator ruling yet) and "reviewed" (issue #868: the
    // endpoint rule is curator-settled, but pre-existing violations are not
    // failures) both carry a divergence snapshot; "enforced" (zero known
    // violations) must not.
    const registry = await loadRegistry();

    for (const [name, entry] of Object.entries(registry.types)) {
      if (entry.status !== 'accepted') continue;
      assert.ok(
        entry.endpointEnforcement === 'enforced'
          || entry.endpointEnforcement === 'reviewed'
          || entry.endpointEnforcement === 'deferred',
        `${name}: endpointEnforcement must be "enforced", "reviewed", or "deferred"`
      );
      if (entry.endpointEnforcement === 'deferred' || entry.endpointEnforcement === 'reviewed') {
        assert.ok(entry.endpointDivergence, `${name}: deferred/reviewed enforcement must record an endpointDivergence`);
      } else {
        assert.equal(entry.endpointDivergence, undefined, `${name}: enforced types must not carry an endpointDivergence`);
      }
    }
  });

  it('grounds endpointDivergence examples in relationship rows that are still real violations', async () => {
    const [registry, relationshipRows, entityRows] = await Promise.all([
      loadRegistry(),
      readCanonicalCsv(path.join(repositoryRoot, 'data/extracted_relationships.csv')),
      readCanonicalCsv(path.join(repositoryRoot, 'data/extracted_entities.csv')),
    ]);
    const rowById = new Map(relationshipRows.map(row => [row.relationship_id, row]));
    const entityTypeById = new Map(entityRows.map(row => [row.entity_id, row.entity_type]));

    let sawAtLeastOneDivergence = false;
    for (const [name, entry] of Object.entries(registry.types)) {
      const divergence = entry.endpointDivergence;
      if (!divergence) continue;
      sawAtLeastOneDivergence = true;
      assert.ok(divergence.violatingRows > 0, `${name}: violatingRows must be positive`);
      assert.ok(divergence.violatingRows <= divergence.totalRows, `${name}: violatingRows cannot exceed totalRows`);
      assert.ok(Array.isArray(divergence.exampleRelationshipIds) && divergence.exampleRelationshipIds.length > 0, `${name}: exampleRelationshipIds`);
      for (const relationshipId of divergence.exampleRelationshipIds) {
        const row = rowById.get(relationshipId);
        assert.ok(row, `${name}: example ${relationshipId} no longer exists`);
        assert.equal(row.relationship_type, name, `${name}: example ${relationshipId} is not a ${name} row`);
        const sourceType = entityTypeById.get(row.source_entity_id);
        const targetType = entityTypeById.get(row.target_entity_id);
        const stillViolates = (
          !entry.allowedSourceTypes.includes(sourceType) || !entry.allowedTargetTypes.includes(targetType)
        );
        assert.ok(stillViolates, `${name}: example ${relationshipId} no longer violates the declared endpoint types`);
      }
    }
    assert.ok(sawAtLeastOneDivergence, 'expected at least one accepted type to carry a recorded endpointDivergence');
  });

  it('grounds directionalContradictions examples in relationship rows that are still reversed pairs', async () => {
    const [registry, relationshipRows] = await Promise.all([
      loadRegistry(),
      readCanonicalCsv(path.join(repositoryRoot, 'data/extracted_relationships.csv')),
    ]);
    const rowById = new Map(relationshipRows.map(row => [row.relationship_id, row]));

    let sawAtLeastOneContradiction = false;
    for (const [name, entry] of Object.entries(registry.types)) {
      const contradiction = entry.directionalContradictions;
      if (!contradiction) continue;
      sawAtLeastOneContradiction = true;
      assert.ok(contradiction.pairCount > 0, `${name}: pairCount must be positive`);
      assert.ok(contradiction.rowsInvolved >= contradiction.pairCount * 2, `${name}: rowsInvolved must cover both directions`);
      assert.ok(Array.isArray(contradiction.examplePairs) && contradiction.examplePairs.length > 0, `${name}: examplePairs`);
      for (const pair of contradiction.examplePairs) {
        const forwardRow = rowById.get(pair.forwardId);
        const backwardRow = rowById.get(pair.backwardId);
        assert.ok(forwardRow, `${name}: example ${pair.forwardId} no longer exists`);
        assert.ok(backwardRow, `${name}: example ${pair.backwardId} no longer exists`);
        assert.equal(forwardRow.relationship_type, name, `${name}: ${pair.forwardId} is not a ${name} row`);
        assert.equal(backwardRow.relationship_type, name, `${name}: ${pair.backwardId} is not a ${name} row`);
        assert.equal(forwardRow.source_entity_id, backwardRow.target_entity_id, `${name}: ${pair.forwardId}/${pair.backwardId} are not a reversed pair`);
        assert.equal(forwardRow.target_entity_id, backwardRow.source_entity_id, `${name}: ${pair.forwardId}/${pair.backwardId} are not a reversed pair`);
      }
    }
    assert.ok(sawAtLeastOneContradiction, 'expected at least one type to carry a recorded directionalContradictions entry');
  });

  it('marks Created and Covers deferred instead of guessing their semantics', async () => {
    // Covers stays fully deferred per the issue #737 ruling (2026-08-27): the
    // sheet found the data genuinely split and left it undecided. Created is
    // recommended for retirement (see the next test) but its own direction
    // was never in question, so it also keeps a null directionality here --
    // nothing about its semantics is newly guessed by this ruling.
    const registry = await loadRegistry();

    for (const name of ['Created', 'Covers']) {
      const entry = registry.types[name];
      assert.ok(entry, `${name}: missing from registry`);
      assert.equal(entry.status, 'deferred', `${name}: status`);
      assert.equal(entry.directionality, null, `${name}: directionality must not be guessed`);
      assert.equal(entry.inverseType, null, `${name}: inverseType must not be guessed`);
      assert.equal(entry.temporalScope, 'deferred', `${name}: temporalScope must not be guessed`);
      assert.equal(typeof entry.deferralReason, 'string', `${name}: deferralReason`);
      assert.ok(entry.deferralReason.length > 0, `${name}: deferralReason`);
      assert.equal(typeof entry.rulingNote, 'string', `${name}: rulingNote`);
      assert.match(entry.rulingNote, /737/, `${name}: rulingNote should cite issue #737`);
    }
    assert.equal(registry.types.Created.recommendedRetypeTo, 'Pioneered');
  });

  it('gives Founded By and Owned By a curator-confirmed direction, but keeps them outside the active schema', async () => {
    // issue #868: the curator ruled on the direction of both legacy labels
    // (source = founded/owned entity, target = founder/owner), so it is no
    // longer guessed -- but both stay "deferred" here because neither is
    // part of the active extraction schema (backend/entity_extraction_schema_v3.json),
    // and status: "accepted" is reserved for types the schema derives.
    const registry = await loadRegistry();
    const validEntityTypes = new Set(registry.entityTypes);

    for (const name of ['Founded By', 'Owned By']) {
      const entry = registry.types[name];
      assert.ok(entry, `${name}: missing from registry`);
      assert.equal(entry.status, 'deferred', `${name}: status stays deferred outside the active schema`);
      assert.equal(entry.directionality, 'directed', `${name}: direction is now curator-confirmed`);
      assert.equal(entry.inverseType, null, `${name}: inverseType stays unresolved (not promoted to accepted)`);
      assert.ok(Array.isArray(entry.allowedSourceTypes) && entry.allowedSourceTypes.length > 0, `${name}: allowedSourceTypes`);
      assert.ok(Array.isArray(entry.allowedTargetTypes) && entry.allowedTargetTypes.length > 0, `${name}: allowedTargetTypes`);
      for (const type of [...entry.allowedSourceTypes, ...entry.allowedTargetTypes]) {
        assert.ok(validEntityTypes.has(type), `${name}: ${type} is not a registered entity type`);
      }
      assert.equal(entry.endpointEnforcement, 'reviewed', `${name}: rows that read backward go to the review report, not a validation failure`);
      assert.ok(entry.endpointDivergence, `${name}: reviewed enforcement must record an endpointDivergence`);
      assert.equal(typeof entry.rulingNote, 'string', `${name}: rulingNote`);
      assert.match(entry.rulingNote, /737/, `${name}: rulingNote should cite issue #737`);
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

  it('validates the current repository data against the committed registry', async () => {
    const dataset = await loadRepositoryGraphDataset(repositoryRoot);
    assert.ok(Object.keys(dataset.policy.relationshipTypeRegistry).length > 0);

    const summary = await validateGraphDataset(dataset);
    assert.ok(summary.relationships > 10_500);
  });

  it('has zero endpoint-type violations among types whose enforcement is not deferred', async () => {
    // This is the test the "zero endpoint-type violations" claim actually
    // needs: recompute violations directly from the CSVs against each
    // enforced type's declared allowlist, independent of whether the
    // validator itself would currently throw. A type with recorded
    // violations must be marked endpointEnforcement: "deferred" (checked
    // above); this test is the converse -- an "enforced" type must have none.
    const [registry, relationshipRows, entityRows] = await Promise.all([
      loadRegistry(),
      readCanonicalCsv(path.join(repositoryRoot, 'data/extracted_relationships.csv')),
      readCanonicalCsv(path.join(repositoryRoot, 'data/extracted_entities.csv')),
    ]);
    const entityTypeById = new Map(entityRows.map(row => [row.entity_id, row.entity_type]));

    for (const row of relationshipRows) {
      const entry = registry.types[row.relationship_type];
      if (!entry || entry.status !== 'accepted' || entry.endpointEnforcement !== 'enforced') continue;
      const sourceType = entityTypeById.get(row.source_entity_id);
      const targetType = entityTypeById.get(row.target_entity_id);
      assert.ok(
        entry.allowedSourceTypes.includes(sourceType),
        `${row.relationship_id}: source entity type ${sourceType} is not allowed for enforced type ${row.relationship_type}`
      );
      assert.ok(
        entry.allowedTargetTypes.includes(targetType),
        `${row.relationship_id}: target entity type ${targetType} is not allowed for enforced type ${row.relationship_type}`
      );
    }
  });

  it('has a duplicateEdgeExceptions entry for every Owns/Owned By pair that encodes the same fact twice', async () => {
    const [holdPolicy, relationshipRows] = await Promise.all([
      readFile(path.join(repositoryRoot, 'data/graph-validation-holds.json'), 'utf8').then(JSON.parse),
      readCanonicalCsv(path.join(repositoryRoot, 'data/extracted_relationships.csv')),
    ]);
    const owns = relationshipRows.filter(row => row.relationship_type === 'Owns');
    const ownedBy = relationshipRows.filter(row => row.relationship_type === 'Owned By');
    const exceptions = holdPolicy.duplicateEdgeExceptions ?? [];

    function hasException(entityIdA, entityIdB) {
      return exceptions.some(exception => {
        const [exA, exB] = exception.entityIds;
        const entitiesMatch = (exA === entityIdA && exB === entityIdB) || (exA === entityIdB && exB === entityIdA);
        const typesMatch = exception.types.includes('Owns') && exception.types.includes('Owned By');
        return entitiesMatch && typesMatch;
      });
    }

    let sawAtLeastOnePair = false;
    for (const ownsRow of owns) {
      for (const ownedByRow of ownedBy) {
        if (ownsRow.source_entity_id === ownedByRow.target_entity_id && ownsRow.target_entity_id === ownedByRow.source_entity_id) {
          sawAtLeastOnePair = true;
          assert.ok(
            hasException(ownsRow.source_entity_id, ownsRow.target_entity_id),
            `${ownsRow.relationship_id}/${ownedByRow.relationship_id}: Owns/Owned By pair has no duplicateEdgeExceptions entry`
          );
        }
      }
    }
    assert.ok(sawAtLeastOnePair, 'expected at least one Owns/Owned By pair encoding the same fact twice in the live data');
  });
});

describe('endpoint review report (#868)', () => {
  it('groups review rows by type, sorted, without mutating the input', () => {
    const rows = [
      { relationshipId: 'RECORD-00002_REL_001', relationshipType: 'Mentions' },
      { relationshipId: 'RECORD-00001_REL_001', relationshipType: 'Mentions' },
      { relationshipId: 'RECORD-00003_REL_001', relationshipType: 'Affiliated With' },
    ];
    const originalOrder = rows.map(row => row.relationshipId);

    const report = buildEndpointReviewReport(rows);

    assert.deepStrictEqual(rows.map(row => row.relationshipId), originalOrder, 'must not mutate the input array');
    assert.equal(report.totalRows, 3);
    assert.equal(report.sourceIssue, 737);
    assert.deepStrictEqual(Object.keys(report.byType), ['Affiliated With', 'Mentions']);
    assert.equal(report.byType.Mentions.count, 2);
    assert.deepStrictEqual(
      report.byType.Mentions.rows.map(row => row.relationshipId),
      ['RECORD-00001_REL_001', 'RECORD-00002_REL_001'],
      'rows within a type must be sorted by relationshipId for a stable diff'
    );
  });

  it('returns a byte-identical report for the same input across two calls (no wall-clock field)', () => {
    const rows = [{ relationshipId: 'RECORD-00001_REL_001', relationshipType: 'Mentions' }];
    assert.deepStrictEqual(buildEndpointReviewReport(rows), buildEndpointReviewReport(rows));
  });

  it('produces an empty-but-valid report when nothing is flagged', () => {
    const report = buildEndpointReviewReport([]);
    assert.equal(report.totalRows, 0);
    assert.deepStrictEqual(report.byType, {});
  });

  it('records the settled Created retype and Owned By duplicate policy', async () => {
    const [registry, report] = await Promise.all([
      readFile(path.join(repositoryRoot, 'data/relationship-type-registry.json'), 'utf8').then(JSON.parse),
      readFile(path.join(repositoryRoot, 'data/relationship-review-report.json'), 'utf8').then(JSON.parse),
    ]);

    assert.equal(registry.types.Created.recommendedRetypeTo, 'Pioneered');
    assert.deepStrictEqual(registry.types.Owns.duplicateReviewPolicy, {
      reviewType: 'Owned By',
      recommendedAction: 'remove-duplicate',
    });

    assert.deepStrictEqual(
      report.byType.Created.rows.map(row => ({
        relationshipId: row.relationshipId,
        reviewReason: row.reviewReason,
        recommendedType: row.recommendedType,
      })),
      [{
        relationshipId: 'TWTR-17930_REL_001',
        reviewReason: 'recommended-retype',
        recommendedType: 'Pioneered',
      }],
    );

    const duplicateRows = report.byType['Owned By'].rows.filter(
      row => row.reviewReason === 'duplicate-inverse',
    );
    assert.deepStrictEqual(
      duplicateRows.map(row => row.relationshipId),
      ['RECORD-00374_REL_014', 'RECORD-00483_REL_002', 'RECORD-00716_REL_003'],
    );
    assert.ok(duplicateRows.every(row => (
      row.recommendedAction === 'remove-duplicate' && row.canonicalType === 'Owns'
    )));
  });

  it('matches the committed data/relationship-review-report.json for the current repository data', async () => {
    // The committed file is a build artifact of validateGraphDataset +
    // buildEndpointReviewReport, exactly like scripts/validate-graph-data.mjs
    // writes when run directly. Regenerating it here and comparing catches a
    // stale commit -- a registry or CSV edit that should have refreshed the
    // report but didn't.
    const [dataset, committedReport] = await Promise.all([
      loadRepositoryGraphDataset(repositoryRoot),
      readFile(path.join(repositoryRoot, 'data/relationship-review-report.json'), 'utf8').then(JSON.parse),
    ]);
    const summary = await validateGraphDataset(dataset);
    const freshReport = buildEndpointReviewReport(summary.endpointReviewRows);

    assert.deepStrictEqual(
      freshReport,
      committedReport,
      'data/relationship-review-report.json is stale; regenerate it with `node scripts/validate-graph-data.mjs`'
    );
  });
});

describe('data/SCHEMA.md reconciliation with the registry (#737)', () => {
  it('distinguishes settled legacy directions from active-schema admission', async () => {
    const schemaMd = await readFile(path.join(repositoryRoot, 'data/SCHEMA.md'), 'utf8');

    assert.match(schemaMd, /`Owned By` and `Founded By` now have a curator-confirmed direction/);
    assert.match(schemaMd, /stay `"status": "deferred"`/);
    assert.match(schemaMd, /`Created` has a settled review action/);
    assert.match(
      schemaMd,
      /relationship-type-registry\.json/,
      'SCHEMA.md should point readers at relationship-type-registry.json as the source of truth for endpoint types, direction, and inverse relationships'
    );
  });
});
