/**
 * PressThink entity dedup (#859)
 *
 * PressThink was registered twice in the entity graph: once as Organization
 * O0033 and once as Work W0666, with identical names. That split forced two
 * separate Owns/Owned-By duplicateEdgeExceptions entries for what is really
 * one ownership fact, and polluted the graph with a phantom second entity.
 * These tests pin the merged state: W0666 is gone, every relationship that
 * used to point at it now points at O0033, and the exception list reflects
 * one entity pair instead of two.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCanonicalCsv } from '../scripts/validate-graph-data.mjs';

const repositoryRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadEntities() {
  return readCanonicalCsv(path.join(repositoryRoot, 'data/extracted_entities.csv'));
}

async function loadRelationships() {
  return readCanonicalCsv(path.join(repositoryRoot, 'data/extracted_relationships.csv'));
}

async function loadHoldPolicy() {
  return JSON.parse(await readFile(path.join(repositoryRoot, 'data/graph-validation-holds.json'), 'utf8'));
}

describe('PressThink entity dedup (#859)', () => {
  it('registers PressThink exactly once, as the Organization-typed entity O0033', async () => {
    const entities = await loadEntities();
    const pressthinkRows = entities.filter((row) => row.entity_name === 'PressThink');

    assert.deepEqual(
      pressthinkRows.map((row) => `${row.entity_id}:${row.entity_type}`),
      ['O0033:Organization'],
      'PressThink must resolve to a single entity row, not one per type',
    );
  });

  it('has no source entity row left for the retired Work-typed duplicate W0666', async () => {
    const entities = await loadEntities();
    assert.equal(
      entities.some((row) => row.entity_id === 'W0666'),
      false,
      'W0666 was PressThink\'s duplicate Work-typed entity and must be removed once merged into O0033',
    );
  });

  it('folds W0666\'s mention count into O0033 instead of dropping it', async () => {
    const entities = await loadEntities();
    const canonical = entities.find((row) => row.entity_id === 'O0033');
    assert.ok(canonical, 'O0033 must still exist as the canonical PressThink entity');
    // O0033 carried 251 mentions and W0666 carried 1 before the merge; the
    // combined total must equal that sum exactly.
    assert.equal(
      Number(canonical.total_mentions),
      252,
      `expected O0033 total_mentions to include W0666's folded-in mentions, got ${canonical.total_mentions}`,
    );
  });

  it('has no relationship row left pointing at W0666 as source or target', async () => {
    const relationships = await loadRelationships();
    const stray = relationships.filter(
      (row) => row.source_entity_id === 'W0666' || row.target_entity_id === 'W0666',
    );
    assert.deepEqual(
      stray.map((row) => row.relationship_id),
      [],
      'every relationship that used to reference W0666 must be re-pointed at O0033',
    );
  });

  it('re-points every relationship that used to reference W0666 at O0033 without losing any', async () => {
    // Before the merge: 131 relationship rows already referenced O0033 and
    // 104 referenced W0666 (source or target), so the merge alone leaves 235.
    // Two of those rows, RECORD-00846_REL_030 and RECORD-00857_REL_032, were
    // extracted from records the duplicate adjudication dropped in the same
    // release (issue #867), which takes the final total to 233. Every other
    // reference must still be present, now all pointed at O0033.
    const relationships = await loadRelationships();
    const referencingO0033 = relationships.filter(
      (row) => row.source_entity_id === 'O0033' || row.target_entity_id === 'O0033',
    );
    assert.equal(
      referencingO0033.length,
      233,
      `expected exactly 233 relationship rows referencing O0033 after the merge, got ${referencingO0033.length}`,
    );
  });

  it('collapses the two Owns/Owned-By duplicateEdgeExceptions entries for PressThink into one', async () => {
    const holdPolicy = await loadHoldPolicy();
    const exceptions = holdPolicy.duplicateEdgeExceptions ?? [];

    const mentionsW0666 = exceptions.filter((exception) => exception.entityIds.includes('W0666'));
    assert.deepEqual(
      mentionsW0666,
      [],
      'no duplicateEdgeExceptions entry should still name the retired W0666 entity',
    );

    const pressthinkOwnershipExceptions = exceptions.filter((exception) => (
      exception.entityIds.includes('P0005')
      && exception.entityIds.includes('O0033')
      && exception.types.includes('Owns')
      && exception.types.includes('Owned By')
    ));
    assert.equal(
      pressthinkOwnershipExceptions.length,
      1,
      'the Jay Rosen / PressThink Owns+Owned By duplicate must have exactly one exception entry, not one per former entity id',
    );
  });
});
