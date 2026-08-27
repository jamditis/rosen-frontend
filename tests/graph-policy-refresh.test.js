/**
 * Tests for the graph policy refresh used by record removals (#867).
 *
 * Two properties matter. The hold prune must leave the bytes of every surviving
 * entry alone, because reflowing the file buries the removals in noise. The
 * registry census must be a count of the rows it is handed, because its whole
 * value is that the numbers describe the table as it stands. The last test
 * checks the committed registry against a recount of the committed CSVs, so a
 * later removal that skips this step fails here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCanonicalCsv } from '../scripts/validate-graph-data.mjs';
import {
  pruneJsonArrayEntries,
  pruneRelationshipTypeHolds,
  recordIdOfRelationship,
  refreshRelationshipTypeCensus,
} from '../data/lib/graph-policy-refresh.js';

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const HOLDS_FIXTURE = `{
  "schemaVersion": 1,
  "relationshipTypeHolds": [
    {
      "relationshipId": "RECORD-00846_REL_030",
      "observedType": "Founded By",
      "reason": "Pending."
    },
    {
      "relationshipId": "RECORD-00847_REL_025",
      "observedType": "Founded By",
      "reason": "Pending."
    }
  ],
  "duplicateEdgeExceptions": [
    {
      "entityIds": ["O0903", "O0908"],
      "types": ["Owns", "Owned By"],
      "reason": "Pending."
    }
  ]
}
`;

/** A relationship row with just the fields the census reads. */
function row(id, type, source, target) {
  return {
    relationship_id: id,
    relationship_type: type,
    source_entity_id: source,
    target_entity_id: target,
  };
}

test('names the record a relationship was extracted from', () => {
  assert.equal(recordIdOfRelationship('RECORD-00846_REL_030'), 'RECORD-00846');
  assert.equal(recordIdOfRelationship('TWTR-07504_REL_001'), 'TWTR-07504');
  assert.equal(recordIdOfRelationship('not-a-relationship-id'), null);
});

test('prunes only the holds that name a dropped record', () => {
  const result = pruneRelationshipTypeHolds(HOLDS_FIXTURE, ['RECORD-00846']);

  assert.deepEqual(result.problems, []);
  assert.deepEqual(
    result.removed.map((entry) => entry.relationshipId),
    ['RECORD-00846_REL_030'],
  );
  assert.deepEqual(
    JSON.parse(result.text).relationshipTypeHolds.map((entry) => entry.relationshipId),
    ['RECORD-00847_REL_025'],
  );
});

test('leaves the bytes of every surviving entry alone', () => {
  const result = pruneRelationshipTypeHolds(HOLDS_FIXTURE, ['RECORD-00846']);

  // Re-serializing the file would reflow these two arrays onto six lines each,
  // which is the diff noise this surgery exists to avoid.
  assert.ok(result.text.includes('"entityIds": ["O0903", "O0908"],'));
  assert.ok(result.text.includes('"types": ["Owns", "Owned By"],'));
  assert.ok(result.text.endsWith('}\n'));
});

test('changes nothing when no entry matches', () => {
  const result = pruneRelationshipTypeHolds(HOLDS_FIXTURE, ['RECORD-09999']);

  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.removed, []);
  assert.equal(result.text, HOLDS_FIXTURE);
});

test('reports a missing array instead of writing a guess', () => {
  const result = pruneJsonArrayEntries('{"schemaVersion": 1}\n', 'relationshipTypeHolds', () => true);

  assert.deepEqual(result.removed, []);
  assert.equal(result.problems.length, 1);
});

test('recounts a divergence backlog and restates its note', () => {
  const registry = {
    types: {
      Mentions: {
        allowedSourceTypes: ['Person'],
        allowedTargetTypes: ['Work'],
        endpointEnforcement: 'deferred',
        endpointDivergence: {
          violatingRows: 9,
          totalRows: 99,
          asOfDate: '2026-01-01',
          exampleRelationshipIds: ['RECORD-00002_REL_001'],
          note: '9 of 99 current Mentions rows have a source or target entity type outside this allowlist.',
        },
      },
    },
  };
  const relationshipRows = [
    row('RECORD-00001_REL_001', 'Mentions', 'P0001', 'W0001'),
    row('RECORD-00002_REL_001', 'Mentions', 'W0001', 'W0001'),
  ];
  const entityRows = [
    { entity_id: 'P0001', entity_type: 'Person', entity_name: 'Jay Rosen' },
    { entity_id: 'W0001', entity_type: 'Work', entity_name: 'PressThink' },
  ];

  const result = refreshRelationshipTypeCensus(registry, {
    relationshipRows,
    entityRows,
    asOfDate: '2026-08-27',
  });

  assert.deepEqual(result.problems, []);
  const divergence = result.registry.types.Mentions.endpointDivergence;
  assert.equal(divergence.violatingRows, 1);
  assert.equal(divergence.totalRows, 2);
  assert.equal(divergence.asOfDate, '2026-08-27');
  assert.ok(divergence.note.startsWith('1 of 2 current Mentions rows'));
  assert.deepEqual(divergence.exampleRelationshipIds, ['RECORD-00002_REL_001']);
});

test('refuses to rule on a backlog that has reached zero', () => {
  const registry = {
    types: {
      Mentions: {
        allowedSourceTypes: ['Person'],
        allowedTargetTypes: ['Work'],
        endpointEnforcement: 'deferred',
        endpointDivergence: {
          violatingRows: 1,
          totalRows: 2,
          asOfDate: '2026-01-01',
          exampleRelationshipIds: ['RECORD-00002_REL_001'],
          note: '1 of 2 current Mentions rows have a source or target entity type outside this allowlist.',
        },
      },
    },
  };

  const result = refreshRelationshipTypeCensus(registry, {
    relationshipRows: [row('RECORD-00001_REL_001', 'Mentions', 'P0001', 'W0001')],
    entityRows: [
      { entity_id: 'P0001', entity_type: 'Person', entity_name: 'Jay Rosen' },
      { entity_id: 'W0001', entity_type: 'Work', entity_name: 'PressThink' },
    ],
    asOfDate: '2026-08-27',
  });

  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /endpointEnforcement can be flipped/);
  // Nothing was rewritten, so the curator sees the old numbers next to the note.
  assert.equal(result.registry.types.Mentions.endpointDivergence.violatingRows, 1);
});

test('drops a contradiction block once no reversed pair is left', () => {
  const registry = {
    types: {
      Mentions: {
        directionalContradictions: {
          pairCount: 1,
          rowsInvolved: 2,
          asOfDate: '2026-01-01',
          examplePairs: [
            {
              forwardId: 'RECORD-00001_REL_001',
              forwardAssertion: 'a -> b',
              backwardId: 'RECORD-00002_REL_001',
              backwardAssertion: 'b -> a',
            },
          ],
          note: '1 entity pairs (2 rows) currently have Mentions asserted in both directions.',
        },
      },
    },
  };

  const result = refreshRelationshipTypeCensus(registry, {
    relationshipRows: [row('RECORD-00001_REL_001', 'Mentions', 'P0001', 'W0001')],
    entityRows: [
      { entity_id: 'P0001', entity_type: 'Person', entity_name: 'Jay Rosen' },
      { entity_id: 'W0001', entity_type: 'Work', entity_name: 'PressThink' },
    ],
    asOfDate: '2026-08-27',
  });

  assert.deepEqual(result.problems, []);
  assert.equal(result.registry.types.Mentions.directionalContradictions, undefined);
});

test('the committed registry census still counts the committed relationship rows', async () => {
  const [registryText, relationshipRows, entityRows] = await Promise.all([
    import('node:fs/promises').then((fs) =>
      fs.readFile(path.join(rootDir, 'data/relationship-type-registry.json'), 'utf8'),
    ),
    readCanonicalCsv(path.join(rootDir, 'data/extracted_relationships.csv')),
    readCanonicalCsv(path.join(rootDir, 'data/extracted_entities.csv')),
  ]);

  const committed = JSON.parse(registryText);
  const result = refreshRelationshipTypeCensus(JSON.parse(registryText), {
    relationshipRows,
    entityRows,
    // The stamped dates are curator prose about when a figure was last reviewed,
    // so they are dropped from the comparison rather than pinned to today.
    asOfDate: 'ignored',
  });

  assert.deepEqual(result.problems, []);
  assert.deepEqual(
    withoutStampedDates(result.registry),
    withoutStampedDates(committed),
    'run the #867 migration script to recount the registry after removing rows',
  );
});

/** A copy of the registry with every asOfDate stamp removed. */
function withoutStampedDates(registry) {
  return JSON.parse(
    JSON.stringify(registry, (key, value) => (key === 'asOfDate' ? undefined : value)),
  );
}
