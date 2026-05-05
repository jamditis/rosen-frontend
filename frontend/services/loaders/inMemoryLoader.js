/**
 * inMemoryLoader — test Adapter for the EntityDataLoader port.
 *
 * Seeded with a fixture; resolves to it. Touches no browser API,
 * no fetch, no Web Storage. Lets the Entity Index be exercised
 * by node:test without jsdom or fetch shims.
 *
 * @param {{
 *   entities?: Array<{id: string, type: string, prominence?: number, name?: string}>,
 *   records?: Array<{id: string, relatedIds: string[]}>
 * }} fixture
 * @returns {import('./entityDataLoader.js').EntityDataLoader}
 */
export const createInMemoryLoader = (fixture = {}) => {
  const payload = {
    entities: fixture.entities ?? [],
    records: fixture.records ?? [],
  };
  return {
    loadEntityData: async () => payload,
  };
};
