/**
 * view-state serialisation tests
 *
 * Exercises the pure URL <-> view-state helper (frontend/services/viewState.js)
 * built for issue #133. The contract that matters most is the round-trip:
 * parseViewState(viewStateToUrl(state)) must reproduce the state exactly, so a
 * shared or reloaded URL restores the same route, filters, and selected record.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROUTES,
  DEFAULT_ROUTE,
  defaultFilters,
  parseViewState,
  viewStateToUrl,
  migrateLegacyHref,
} from '../frontend/services/viewState.js';

const BASE = 'https://pressthink.org/j/rosen-archive/';

describe('defaultFilters', () => {
  it('returns the canonical empty filter shape', () => {
    assert.deepStrictEqual(defaultFilters(), {
      search: '',
      categories: [],
      era: null,
      year: null,
      publication: [],
      type: null,
      includeReplies: false,
    });
  });

  it('returns a fresh object each call (no shared mutable state)', () => {
    const a = defaultFilters();
    const b = defaultFilters();
    a.categories.push('Criticism');
    assert.deepStrictEqual(b.categories, [], 'second call must be unaffected');
  });
});

describe('parseViewState', () => {
  it('parses a bare URL to the default route and empty filters', () => {
    const vs = parseViewState(BASE);
    assert.strictEqual(vs.route, DEFAULT_ROUTE);
    assert.deepStrictEqual(vs.filters, defaultFilters());
    assert.strictEqual(vs.selectedRecord, null);
  });

  it('reads each known route from the hash', () => {
    for (const route of Object.values(ROUTES)) {
      assert.strictEqual(parseViewState(`${BASE}#${route}`).route, route);
    }
  });

  it('parses nested wiki hashes as the wiki route', () => {
    const state = parseViewState('https://example.com/archive/#wiki/concept/public-journalism');
    assert.equal(state.route, ROUTES.wiki);
  });

  it('falls back to the default route for an unknown hash', () => {
    assert.strictEqual(parseViewState(`${BASE}#bogus`).route, DEFAULT_ROUTE);
  });

  it('parses string and array filter fields', () => {
    const vs = parseViewState(`${BASE}?q=press&cat=Criticism&cat=Theory&era=2000s&type=article`);
    assert.strictEqual(vs.filters.search, 'press');
    assert.deepStrictEqual(vs.filters.categories, ['Criticism', 'Theory']);
    assert.strictEqual(vs.filters.era, '2000s');
    assert.strictEqual(vs.filters.type, 'article');
  });

  it('parses year as a string (record.year is string-typed in the data)', () => {
    const vs = parseViewState(`${BASE}?year=1995`);
    assert.strictEqual(vs.filters.year, '1995');
    assert.strictEqual(typeof vs.filters.year, 'string');
  });

  it('treats a non-numeric year as unset', () => {
    assert.strictEqual(parseViewState(`${BASE}?year=abc`).filters.year, null);
    assert.strictEqual(parseViewState(`${BASE}?year=`).filters.year, null);
  });

  it('parses includeReplies only when replies=1', () => {
    assert.strictEqual(parseViewState(`${BASE}?replies=1`).filters.includeReplies, true);
    assert.strictEqual(parseViewState(`${BASE}?replies=0`).filters.includeReplies, false);
    assert.strictEqual(parseViewState(BASE).filters.includeReplies, false);
  });

  it('parses the selected record', () => {
    assert.strictEqual(parseViewState(`${BASE}?record=RECORD-00123`).selectedRecord, 'RECORD-00123');
  });

  it('strips a stray ?suffix from the hash defensively', () => {
    assert.strictEqual(parseViewState(`${BASE}#about?stale=1`).route, ROUTES.about);
  });
});

describe('viewStateToUrl', () => {
  it('produces a clean URL for a pristine view state', () => {
    const url = viewStateToUrl({ route: DEFAULT_ROUTE, filters: defaultFilters(), selectedRecord: null }, BASE);
    assert.strictEqual(url, BASE);
  });

  it('emits the route as a hash, except the default route', () => {
    assert.ok(viewStateToUrl({ route: ROUTES.entities }, BASE).endsWith('#entities'));
    assert.strictEqual(viewStateToUrl({ route: DEFAULT_ROUTE }, BASE).includes('#'), false);
  });

  it('omits default and empty filter fields', () => {
    const url = viewStateToUrl({ filters: { ...defaultFilters(), search: 'press' } }, BASE);
    assert.strictEqual(url, `${BASE}?q=press`);
  });

  it('emits array filters as repeated keys', () => {
    const url = viewStateToUrl({ filters: { ...defaultFilters(), categories: ['Criticism', 'Theory'] } }, BASE);
    assert.strictEqual(new URL(url).searchParams.getAll('cat').length, 2);
  });

  it('preserves the origin and pathname of the base href', () => {
    const url = new URL(viewStateToUrl({ route: ROUTES.about }, BASE));
    assert.strictEqual(url.origin, 'https://pressthink.org');
    assert.strictEqual(url.pathname, '/j/rosen-archive/');
  });

  it('discards any pre-existing query or hash on the base href', () => {
    const url = viewStateToUrl({ route: ROUTES.about }, `${BASE}?stale=1#old`);
    assert.strictEqual(url, `${BASE}#about`);
  });

  it('tolerates a partial filters object by filling defaults', () => {
    const url = viewStateToUrl({ filters: { year: '1986' } }, BASE);
    assert.strictEqual(url, `${BASE}?year=1986`);
  });

  it('throws a clear error when baseHref is missing', () => {
    assert.throws(() => viewStateToUrl({ route: ROUTES.about }), /requires a baseHref/);
  });
});

describe('round-trip', () => {
  const cases = {
    'empty state': {
      route: DEFAULT_ROUTE,
      filters: defaultFilters(),
      selectedRecord: null,
    },
    'fully populated state': {
      route: ROUTES.entities,
      filters: {
        search: 'audience atomization',
        categories: ['Criticism', 'Media theory'],
        era: '2010s',
        year: '2011',
        publication: ['PressThink', 'NYU'],
        type: 'article',
        includeReplies: true,
      },
      selectedRecord: 'RECORD-00456',
    },
    'route only': {
      route: ROUTES.dissertation,
      filters: defaultFilters(),
      selectedRecord: null,
    },
    'category name containing a comma': {
      route: DEFAULT_ROUTE,
      filters: { ...defaultFilters(), categories: ['Reviews, essays'] },
      selectedRecord: null,
    },
  };

  for (const [name, state] of Object.entries(cases)) {
    it(`survives a serialise -> parse cycle: ${name}`, () => {
      const restored = parseViewState(viewStateToUrl(state, BASE));
      assert.deepStrictEqual(restored, state);
    });
  }
});

describe('migrateLegacyHref', () => {
  it('migrates ?view=dissertation to the hash route', () => {
    assert.strictEqual(migrateLegacyHref(`${BASE}?view=dissertation`), `${BASE}#dissertation`);
  });

  it('migrates ?view=about to the hash route', () => {
    assert.strictEqual(migrateLegacyHref(`${BASE}?view=about`), `${BASE}#about`);
  });

  it('leaves a URL with no legacy view param unchanged', () => {
    assert.strictEqual(migrateLegacyHref(`${BASE}#entities`), `${BASE}#entities`);
  });

  it('does not migrate an unrecognised legacy view value', () => {
    const href = `${BASE}?view=archive`;
    assert.strictEqual(migrateLegacyHref(href), href);
  });
});
