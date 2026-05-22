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
  // The port documents single-flight: concurrent calls share one Promise.
  // The fixture is already in memory, so one resolved Promise reused for
  // every call satisfies that contract and lets tests exercise the port
  // exactly as production code does against httpCachedLoader.
  const settled = Promise.resolve(payload);
  return {
    loadEntityData: () => settled,
  };
};
