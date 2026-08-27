/**
 * Hybrid ranking and its sort key (#279), tested as behavior.
 *
 * These are the decisions App.js makes on every keystroke and every flip of the
 * semantic toggle. They live in frontend/utils/searchRanking.js so they can run
 * here without a browser: App only holds the state and calls them.
 *
 * The sort-key checks guard a bug that shipped once: the toggle selected
 * "Relevance" with an empty search box, but the sort control only lists that
 * option while a query is active, so the control rendered blank.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SORT,
  LEXICAL_SIGNAL,
  RELEVANCE_SORT,
  buildSearchRanking,
  orderByFusedRank,
  presentSearchSignal,
  sortForQueryChange,
  sortForSemanticToggle,
} from '../frontend/utils/searchRanking.js';

const records = ids => ids.map(id => ({ id }));
const idsOf = list => list.map(record => record.id);

test('fuses both legs into one ranking', () => {
  const { fusedRanks } = buildSearchRanking({
    lexicalOrder: ['a', 'b', 'c'],
    semanticOrder: ['c', 'b', 'z'],
  });
  // b and c appear in both legs, so they outrank the single-leg hits.
  const order = [...fusedRanks.entries()]
    .sort((one, two) => one[1] - two[1])
    .map(entry => entry[0]);
  assert.deepEqual([...order.slice(0, 2)].sort(), ['b', 'c']);
  assert.deepEqual([...order.slice(2)].sort(), ['a', 'z']);
  // The union of both legs, not their intersection.
  assert.equal(fusedRanks.size, 4);
});

test('labels each hit with the legs it came from', () => {
  const { searchSignals } = buildSearchRanking({
    lexicalOrder: ['a', 'b'],
    semanticOrder: ['b', 'z'],
  });
  assert.equal(searchSignals.get('a'), 'kw');
  assert.equal(searchSignals.get('z'), 'sem');
  assert.equal(searchSignals.get('b'), 'kw·sem');
});

test('presents internal source codes in plain English', () => {
  assert.deepEqual(presentSearchSignal('kw'), {
    label: 'Matching words',
    description: 'This record uses words from your search.',
  });
  assert.deepEqual(presentSearchSignal('sem'), {
    label: 'Related meaning',
    description: 'This record discusses the idea in your search, even when it uses different words.',
  });
  assert.deepEqual(presentSearchSignal('kw·sem'), {
    label: 'Words and meaning',
    description: 'This record matches both the words and the idea in your search.',
  });
});

test('shows no chips while only one leg can contribute', () => {
  const { searchSignals } = buildSearchRanking({ lexicalOrder: ['a', 'b'] });
  assert.equal(searchSignals, null);
});

test('a record the ranked legs missed still gets the keyword chip', () => {
  // The archive also matches by substring, which no ranked leg covers. The
  // fallback keeps every card labelled once chips are on.
  const { searchSignals } = buildSearchRanking({
    lexicalOrder: ['a'],
    semanticOrder: ['z'],
  });
  assert.equal(searchSignals.get('substring-only') ?? LEXICAL_SIGNAL, 'kw');
  assert.equal(LEXICAL_SIGNAL, 'kw');
});

test('reports membership sets the filter step can ask', () => {
  const ranking = buildSearchRanking({
    lexicalOrder: ['a'],
    semanticOrder: ['z'],
  });
  assert.equal(ranking.semanticIds.has('z'), true);
  assert.equal(ranking.lexicalIds.has('a'), true);
  // Null, not an empty set, so the caller can skip the lookup entirely.
  assert.equal(buildSearchRanking({ semanticOrder: ['z'] }).lexicalIds, null);
});

test('orders ranked records first and leaves the rest as they came', () => {
  const { fusedRanks } = buildSearchRanking({
    lexicalOrder: ['b'],
    semanticOrder: ['d'],
  });
  // Input order stands in for newest-first.
  const ordered = orderByFusedRank(records(['a', 'b', 'c', 'd', 'e']), fusedRanks);
  assert.deepEqual(idsOf(ordered).slice(0, 2).sort(), ['b', 'd']);
  assert.deepEqual(idsOf(ordered).slice(2), ['a', 'c', 'e']);
});

test('leaves the order alone when nothing is ranked', () => {
  const list = records(['a', 'b', 'c']);
  assert.equal(orderByFusedRank(list, new Map()), list);
});

test('turning the toggle on with an empty search box keeps the current sort', () => {
  // Regression: selecting relevance here leaves the sort control with a value
  // no option carries, and the browser renders it blank.
  assert.equal(
    sortForSemanticToggle(DEFAULT_SORT, { enabled: true, hasQuery: false }),
    DEFAULT_SORT,
  );
  assert.equal(
    sortForSemanticToggle('title-asc', { enabled: true, hasQuery: false }),
    'title-asc',
  );
});

test('turning the toggle on with a query ranks by fused relevance', () => {
  assert.equal(
    sortForSemanticToggle(DEFAULT_SORT, { enabled: true, hasQuery: true }),
    RELEVANCE_SORT,
  );
});

test('turning the toggle off gives back the default sort', () => {
  assert.equal(
    sortForSemanticToggle(RELEVANCE_SORT, { enabled: false, hasQuery: true }),
    DEFAULT_SORT,
  );
  // A sort the reader picked is theirs, not the toggle's, so it survives.
  assert.equal(
    sortForSemanticToggle('date-asc', { enabled: false, hasQuery: true }),
    'date-asc',
  );
});

test('clearing the search box drops relevance', () => {
  assert.equal(
    sortForQueryChange(RELEVANCE_SORT, { hasQuery: false, hadQuery: true }),
    DEFAULT_SORT,
  );
  assert.equal(
    sortForQueryChange('title-asc', { hasQuery: false, hadQuery: true }),
    'title-asc',
  );
});

test('a fresh query picks relevance back up while semantic search is on', () => {
  assert.equal(
    sortForQueryChange(DEFAULT_SORT, {
      hasQuery: true,
      hadQuery: false,
      semanticEnabled: true,
    }),
    RELEVANCE_SORT,
  );
  // Off, the reader gets no automatic re-sort.
  assert.equal(
    sortForQueryChange(DEFAULT_SORT, {
      hasQuery: true,
      hadQuery: false,
      semanticEnabled: false,
    }),
    DEFAULT_SORT,
  );
});

test('editing an active query does not fight the reader\'s chosen sort', () => {
  assert.equal(
    sortForQueryChange('date-asc', {
      hasQuery: true,
      hadQuery: true,
      semanticEnabled: true,
    }),
    'date-asc',
  );
});

test('no sort path can select relevance without a query', () => {
  // The whole family, swept: relevance is only ever reachable with a query.
  for (const current of [DEFAULT_SORT, 'date-asc', 'title-asc', RELEVANCE_SORT]) {
    for (const enabled of [true, false]) {
      assert.notEqual(
        sortForSemanticToggle(current, { enabled, hasQuery: false }),
        RELEVANCE_SORT,
      );
      for (const hadQuery of [true, false]) {
        assert.notEqual(
          sortForQueryChange(current, {
            hasQuery: false,
            hadQuery,
            semanticEnabled: enabled,
          }),
          RELEVANCE_SORT,
        );
      }
    }
  }
});
