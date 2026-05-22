/**
 * Entity Index — bidirectional lookup over Records and Entities.
 *
 * See CONTEXT.md for vocabulary. The Entity Index is a pure projection
 * over loaded Archive data. It owns no fetching, no caching, no storage.
 * The Loader is injected as a port (see ./loaders/entityDataLoader.js);
 * production wires httpCachedLoader, tests wire inMemoryLoader.
 *
 * The factory returns a Promise that resolves to a frozen Query. Holding
 * a Query is proof the index is built — there is no third state in which
 * a query could silently return wrong results.
 *
 * @typedef {import('./loaders/entityDataLoader.js').EntityDataLoader} EntityDataLoader
 *
 * @typedef {Object} Query
 * @property {(entityId: string) => object | undefined} entity
 * @property {(recordId: string) => Array<object>}      entitiesOf
 * @property {(entityId: string) => string[]}           recordsOf
 * @property {(a: string, b: string, opts?: {type?: string}) => Array<object>} shared
 * @property {(a: string, b: string, opts?: {type?: string}) => {strength: number, sharedEntities: Array<object>, prominenceScore: number}} strength
 * @property {() => string[]}                            types
 *
 * @param {{ loader: EntityDataLoader }} options
 * @returns {Promise<Query>}
 */
export const createEntityIndex = async ({ loader }) => {
  const { entities, records } = await loader.loadEntityData();

  const entityById = new Map();
  const entityToRecords = new Map();
  const recordToEntities = new Map();

  for (const e of entities) {
    entityById.set(e.id, e);
  }

  for (const rec of records) {
    const ids = rec.relatedIds ?? [];
    recordToEntities.set(rec.id, ids);
    for (const eid of ids) {
      let bucket = entityToRecords.get(eid);
      if (!bucket) {
        bucket = new Set();
        entityToRecords.set(eid, bucket);
      }
      bucket.add(rec.id);
    }
  }

  const sortByProminence = (a, b) => (b.prominence ?? 0) - (a.prominence ?? 0);

  const entitiesOf = (recordId) => {
    const ids = recordToEntities.get(recordId);
    if (!ids) return [];
    const out = [];
    for (const id of ids) {
      const e = entityById.get(id);
      if (e) out.push(e);
    }
    return out.sort(sortByProminence);
  };

  const recordsOf = (entityId) => {
    const set = entityToRecords.get(entityId);
    return set ? Array.from(set) : [];
  };

  const shared = (a, b, opts = {}) => {
    const aIds = recordToEntities.get(a);
    const bIds = recordToEntities.get(b);
    if (!aIds || !bIds) return [];
    // Build the lookup Set from the longer list and iterate the shorter
    // one, so the scan is bounded by min(|aIds|, |bIds|).
    const largerSet = aIds.length > bIds.length ? new Set(aIds) : new Set(bIds);
    const smallerIds = aIds.length > bIds.length ? bIds : aIds;
    const out = [];
    for (const id of smallerIds) {
      if (!largerSet.has(id)) continue;
      const e = entityById.get(id);
      if (!e) continue;
      if (opts.type && e.type !== opts.type) continue;
      out.push(e);
    }
    return out.sort(sortByProminence);
  };

  const strength = (a, b, opts = {}) => {
    const sharedEntities = shared(a, b, opts);
    if (sharedEntities.length === 0) {
      return { strength: 0, sharedEntities: [], prominenceScore: 0 };
    }
    const prominenceScore = sharedEntities.reduce(
      (sum, e) => sum + (e.prominence ?? 1),
      0,
    );
    return { strength: sharedEntities.length, sharedEntities, prominenceScore };
  };

  const types = () => {
    const set = new Set();
    for (const e of entityById.values()) {
      if (e.type) set.add(e.type);
    }
    return Array.from(set).sort();
  };

  return Object.freeze({
    entity: (id) => entityById.get(id),
    entitiesOf,
    recordsOf,
    shared,
    strength,
    types,
  });
};
