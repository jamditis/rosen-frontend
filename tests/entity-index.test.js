/**
 * Tests for the deepened Entity Index module.
 *
 * The Entity Index is a pure projection over (entities, records). It is
 * built once from a Loader's payload and answers questions like
 * "what Entities are in this Record?" and "which Records mention this
 * Entity?". The Loader is injected — these tests use the in-memory
 * Adapter, never fetch or Web Storage.
 *
 * The interface contract under test is documented in CONTEXT.md
 * (Entity Index) and the JSDoc on entityDataLoader.js.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEntityIndex } from '../frontend/services/entityIndex.js';
import { createInMemoryLoader } from '../frontend/services/loaders/inMemoryLoader.js';

// Fixture mirrors the real shape: 4 Entities across 3 Records, plus the
// dissertation Record that has no relatedIds.
const fixture = () => ({
  entities: [
    { id: 'e:lippmann', type: 'Person',       prominence: 9, name: 'Walter Lippmann' },
    { id: 'e:dewey',    type: 'Person',       prominence: 7, name: 'John Dewey' },
    { id: 'e:nyt',      type: 'Organization', prominence: 5, name: 'New York Times' },
    { id: 'e:public',   type: 'Concept',      prominence: 8, name: 'Public Sphere' },
  ],
  records: [
    { id: 'r:1',                 relatedIds: ['e:lippmann', 'e:dewey', 'e:public'] },
    { id: 'r:2',                 relatedIds: ['e:lippmann', 'e:nyt'] },
    { id: 'r:3',                 relatedIds: ['e:dewey'] },
    { id: 'dissertation-1986',   relatedIds: [] },
  ],
});

describe('createEntityIndex', () => {
  it('returns a Promise that resolves to a Query', async () => {
    const idx = createEntityIndex({ loader: createInMemoryLoader(fixture()) });
    assert.ok(idx instanceof Promise, 'createEntityIndex must return a Promise');
    const q = await idx;
    assert.equal(typeof q, 'object');
    for (const method of ['entity', 'entitiesOf', 'recordsOf', 'shared', 'strength', 'types']) {
      assert.equal(typeof q[method], 'function', `Query must expose ${method}()`);
    }
  });

  it('produces a frozen Query (cannot mutate or add methods)', async () => {
    const q = await createEntityIndex({ loader: createInMemoryLoader(fixture()) });
    assert.ok(Object.isFrozen(q), 'Query must be frozen');
    assert.throws(() => { q.malicious = () => 'no'; }, /./);
  });

  it('calls the Loader exactly once per index', async () => {
    let calls = 0;
    const loader = {
      loadEntityData: async () => {
        calls += 1;
        return fixture();
      },
    };
    const q = await createEntityIndex({ loader });
    // Make several queries
    q.entity('e:lippmann');
    q.entitiesOf('r:1');
    q.types();
    assert.equal(calls, 1, 'Loader must be invoked exactly once during construction');
  });
});

describe('Query.entity', () => {
  it('returns the Entity object for a known id', async () => {
    const q = await createEntityIndex({ loader: createInMemoryLoader(fixture()) });
    const e = q.entity('e:lippmann');
    assert.equal(e.id, 'e:lippmann');
    assert.equal(e.type, 'Person');
  });

  it('returns undefined for an unknown id', async () => {
    const q = await createEntityIndex({ loader: createInMemoryLoader(fixture()) });
    assert.equal(q.entity('e:nope'), undefined);
  });
});

describe('Query.entitiesOf(recordId)', () => {
  it('returns the Record\'s Entities in prominence-descending order', async () => {
    const q = await createEntityIndex({ loader: createInMemoryLoader(fixture()) });
    const ents = q.entitiesOf('r:1');
    assert.deepEqual(
      ents.map(e => e.id),
      ['e:lippmann', 'e:public', 'e:dewey'],
      'expected sort by prominence desc: 9, 8, 7',
    );
  });

  it('returns [] for the dissertation Record (relatedIds:[])', async () => {
    const q = await createEntityIndex({ loader: createInMemoryLoader(fixture()) });
    assert.deepEqual(q.entitiesOf('dissertation-1986'), []);
  });

  it('returns [] for an unknown Record id', async () => {
    const q = await createEntityIndex({ loader: createInMemoryLoader(fixture()) });
    assert.deepEqual(q.entitiesOf('r:nope'), []);
  });

  it('skips entity ids with no matching Entity record', async () => {
    // Defensive: a Record may reference an entity id that is not in the entities array.
    const f = fixture();
    f.records.push({ id: 'r:dangling', relatedIds: ['e:lippmann', 'e:does-not-exist'] });
    const q = await createEntityIndex({ loader: createInMemoryLoader(f) });
    assert.deepEqual(q.entitiesOf('r:dangling').map(e => e.id), ['e:lippmann']);
  });
});

describe('Query.recordsOf(entityId)', () => {
  it('returns Record ids that mention the Entity', async () => {
    const q = await createEntityIndex({ loader: createInMemoryLoader(fixture()) });
    const recs = q.recordsOf('e:lippmann');
    assert.deepEqual(recs.sort(), ['r:1', 'r:2']);
  });

  it('returns [] for an unknown Entity id', async () => {
    const q = await createEntityIndex({ loader: createInMemoryLoader(fixture()) });
    assert.deepEqual(q.recordsOf('e:nope'), []);
  });
});

describe('Query.shared(recordA, recordB, { type? })', () => {
  it('returns the shared Entities between two Records', async () => {
    const q = await createEntityIndex({ loader: createInMemoryLoader(fixture()) });
    const shared = q.shared('r:1', 'r:2');
    assert.deepEqual(shared.map(e => e.id), ['e:lippmann']);
  });

  it('respects the type filter', async () => {
    const q = await createEntityIndex({ loader: createInMemoryLoader(fixture()) });
    // r:1 ∩ r:2 = {lippmann (Person)}; filter to Organization yields nothing.
    assert.deepEqual(q.shared('r:1', 'r:2', { type: 'Organization' }), []);
    assert.deepEqual(q.shared('r:1', 'r:2', { type: 'Person' }).map(e => e.id), ['e:lippmann']);
  });

  it('returns [] for non-overlapping Records', async () => {
    const q = await createEntityIndex({ loader: createInMemoryLoader(fixture()) });
    // r:3 has only e:dewey; dissertation has nothing.
    assert.deepEqual(q.shared('r:3', 'dissertation-1986'), []);
  });

  it('returns [] for unknown Record ids', async () => {
    const q = await createEntityIndex({ loader: createInMemoryLoader(fixture()) });
    assert.deepEqual(q.shared('r:nope', 'r:1'), []);
  });
});

describe('Query.strength(recordA, recordB, { type? })', () => {
  it('returns strength + shared + prominence score', async () => {
    const q = await createEntityIndex({ loader: createInMemoryLoader(fixture()) });
    const s = q.strength('r:1', 'r:2');
    assert.equal(s.strength, 1);
    assert.equal(s.sharedEntities.length, 1);
    assert.equal(s.prominenceScore, 9, 'lippmann prominence');
  });

  it('returns zero-shape when there is no overlap', async () => {
    const q = await createEntityIndex({ loader: createInMemoryLoader(fixture()) });
    const s = q.strength('r:3', 'dissertation-1986');
    assert.deepEqual(s, { strength: 0, sharedEntities: [], prominenceScore: 0 });
  });
});

describe('Query.types()', () => {
  it('returns sorted unique Entity types present in the data', async () => {
    const q = await createEntityIndex({ loader: createInMemoryLoader(fixture()) });
    assert.deepEqual(q.types(), ['Concept', 'Organization', 'Person']);
  });

  it('returns [] when no Entities have a type', async () => {
    const q = await createEntityIndex({
      loader: createInMemoryLoader({ entities: [], records: [] }),
    });
    assert.deepEqual(q.types(), []);
  });
});

describe('createInMemoryLoader port conformance', () => {
  it('shares one Promise across calls (single-flight, as the port documents)', async () => {
    const loader = createInMemoryLoader(fixture());
    assert.equal(
      loader.loadEntityData(),
      loader.loadEntityData(),
      'every loadEntityData call must return the same Promise, matching httpCachedLoader',
    );
    await loader.loadEntityData();
  });
});
