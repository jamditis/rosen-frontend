/**
 * Entity payload shape-drift coverage (#503).
 *
 * archiveService.fetchEntitiesData and buildEntityMaps both tolerated a
 * payload whose `entities` field had drifted away from an array (a renamed
 * key, a wrong type, a wrapped object) by silently building an empty entity
 * index instead of raising an error. A 200 response that parses fine but
 * has drifted shape looked identical to a legitimately empty Archive, with
 * nothing telling EntityBrowser (or a monitor) that the load had failed.
 *
 * This is a runtime test rather than the source-pattern style used
 * elsewhere for archiveService.js: fetchEntitiesData's fetch/cache state is
 * a module-global singleton, so each case dynamically imports a fresh
 * module instance (a cache-busting query string) instead of sharing one
 * import across cases, and stubs fetch/localStorage/sessionStorage so the
 * network branch runs under Node.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const SERVICE_PATH = '../frontend/services/archiveService.js';

let originalFetch;
let originalLocalStorage;
let originalSessionStorage;

const stubStorage = () => ({
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  length: 0,
  key: () => null,
});

beforeEach(() => {
  originalFetch = globalThis.fetch;
  originalLocalStorage = globalThis.localStorage;
  originalSessionStorage = globalThis.sessionStorage;
  globalThis.localStorage = stubStorage();
  globalThis.sessionStorage = stubStorage();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.localStorage = originalLocalStorage;
  globalThis.sessionStorage = originalSessionStorage;
});

// A fresh dynamic import per case so each test gets its own copy of the
// module-global entitiesCache/entitiesLoading state instead of reusing the
// first case's result.
let importCounter = 0;
const freshService = () => import(`${SERVICE_PATH}?probe=${Date.now()}-${importCounter++}`);

describe('fetchEntitiesData rejects a shape-drifted payload instead of masking it (#503)', () => {
  it('treats a non-array `entities` field as a load failure, not an empty success', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ entities: { unexpected: 'shape' }, recordEntityMap: {} }),
    });

    const { fetchEntitiesData } = await freshService();
    const result = await fetchEntitiesData();

    assert.equal(
      typeof result.error, 'string',
      'a drifted (non-array) entities field must surface as a shaped error, matching the fetch/parse failure contract'
    );
    assert.deepEqual(result.entities, []);
  });

  it('treats a present-but-malformed records field as a load failure', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      // `records` is present but not an array (e.g. a renamed/retyped
      // field); it must not silently take precedence in toRecords over a
      // perfectly good recordEntityMap sitting right next to it.
      json: async () => ({ entities: [], records: { not: 'an array' }, recordEntityMap: { 'R-1': ['E1'] } }),
    });

    const { fetchEntitiesData } = await freshService();
    const result = await fetchEntitiesData();

    assert.equal(
      typeof result.error, 'string',
      'a malformed (non-array) records field must surface as a shaped error'
    );
  });

  it('still accepts a well-shaped, legitimately empty payload', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ entities: [], recordEntityMap: {} }),
    });

    const { fetchEntitiesData } = await freshService();
    const result = await fetchEntitiesData();

    assert.equal(
      result.error, undefined,
      'a legitimately empty entity payload must not be treated as a failure'
    );
    assert.deepEqual(result.entities, []);
  });

  it('still loads a real, well-shaped payload', async () => {
    const entities = [{ id: 'E1', type: 'Person', name: 'Jay Rosen' }];
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ entities, recordEntityMap: { 'R-1': ['E1'] } }),
    });

    const { fetchEntitiesData } = await freshService();
    const result = await fetchEntitiesData();

    assert.equal(result.error, undefined);
    assert.deepEqual(result.entities, entities);
  });
});
