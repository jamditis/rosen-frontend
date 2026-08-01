/**
 * Tests for the build-time search index builder (issue #276, step 1).
 *
 * The load-bearing claim of #276 is a recall win: a phrase that appears only in
 * an article's body (raw_text) is unfindable by today's substring search over
 * title + summary + categories, but findable once raw_text is indexed. The
 * first test proves exactly that contrast, using the issue's own example.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import MiniSearch from 'minisearch';
import {
  buildSearchIndex,
  recordToSearchDoc,
  searchIndexOptions,
  socialSearchIndexOptions,
  RAW_TEXT_INDEX_CHARS,
} from '../data/lib/search-index-builder.js';

// Rebuild a queryable index the way the frontend will: serialize the artifact,
// then load it back with the SAME options that built it.
function loadBuilt(rows, opts) {
  const { json, count } = buildSearchIndex(rows, opts);
  const loaded = MiniSearch.loadJSON(JSON.stringify(json), searchIndexOptions());
  return { mini: loaded, count };
}

// Replica of today's search predicate (frontend/App.js filteredRecords) so the
// recall test can assert the OLD path misses what the NEW path finds.
function oldSubstringMatch(row, term) {
  const t = term.toLowerCase();
  const title = (row.title || '').toLowerCase();
  const summary = (row.summary || '').toLowerCase();
  const cats = (row.thematic_categories || '').toLowerCase();
  return title.includes(t) || summary.includes(t) || cats.includes(t);
}

// The distinctive phrase lives ONLY in the body, never in title/summary/concepts/
// tags/categories -- so a hit can come from one place: raw_text being indexed.
const NEEDLE = {
  id: 'RECORD-NEEDLE',
  title: 'A press think piece',
  summary: 'Notes on the press and its publics.',
  key_concepts: 'press; publics',
  tags: 'essay',
  thematic_categories: 'Press criticism',
  raw_text:
    'Rosen argues that the press makes an objectivity bid for trust with its audience, ' +
    'a wager that detachment will be read as credibility.',
};
const NOISE = {
  id: 'RECORD-NOISE',
  title: 'Unrelated item',
  summary: 'Something about local news funding.',
  key_concepts: 'funding',
  tags: 'news',
  thematic_categories: 'Business models',
  raw_text: 'A piece about grants and revenue.',
};
const NEEDLE_PHRASE = 'objectivity bid for trust';

test('indexes raw_text so a body-only phrase becomes findable (the #276 recall win)', () => {
  // Today's search misses it: the phrase is not a substring of any indexed-today field.
  assert.equal(oldSubstringMatch(NEEDLE, NEEDLE_PHRASE), false, 'old substring search should miss the body-only phrase');

  // The new index finds it and ranks it first.
  const { mini } = loadBuilt([NEEDLE, NOISE]);
  const hits = mini.search(NEEDLE_PHRASE);
  const ids = hits.map((h) => h.id);
  assert.ok(ids.includes('RECORD-NEEDLE'), 'body-only phrase should be findable via raw_text');
  assert.equal(hits[0].id, 'RECORD-NEEDLE', 'the matching record should rank first');
});

test('the recall win comes specifically from raw_text (negative control)', () => {
  // Rebuild the SAME records with the body excluded. If the phrase still matched,
  // the win above would be coming from some other field, not raw_text. Excluding
  // it must drop the needle -- this pins the recall gain to body indexing and
  // guards against a future change that silently stops indexing raw_text.
  const { mini } = loadBuilt([NEEDLE, NOISE], { rawTextChars: 0 });
  const ids = mini.search(NEEDLE_PHRASE).map((h) => h.id);
  assert.ok(!ids.includes('RECORD-NEEDLE'), 'with no body indexed, the body-only phrase must not match');
});

test('supports prefix matching (BM25 + prefix is the point of MiniSearch over includes)', () => {
  const rows = [
    { id: 'A', title: 'Objectivity and its discontents', raw_text: '' },
    { id: 'B', title: 'Local news deserts', raw_text: '' },
  ];
  const { mini } = loadBuilt(rows);
  const ids = mini.search('object', { prefix: true }).map((h) => h.id);
  assert.deepEqual(ids, ['A'], 'prefix query should match the partial term');
});

test('caps the indexed raw_text slice at the configured boundary', () => {
  const rawTextChars = 40;
  const row = {
    id: 'CAP',
    title: 'capped',
    // EARLYTOKEN is within the cap; LATETOKEN is pushed past it by padding.
    raw_text: 'EARLYTOKEN ' + 'x '.repeat(60) + 'LATETOKEN',
  };
  const { mini } = loadBuilt([row], { rawTextChars });
  assert.equal(mini.search('EARLYTOKEN').length, 1, 'a term inside the cap is indexed');
  assert.equal(mini.search('LATETOKEN').length, 0, 'a term past the cap is not indexed');
});

test('indexes the author field so a name in the byline is findable (#276)', () => {
  // The card-only substring search never reads author, so a person credited
  // only in the author column was unfindable. Indexing author fixes the class,
  // not just the one record whose summary was reworded.
  const rows = [
    { id: 'BYLINE', title: 'A guest piece', author: 'Joe Amditis', raw_text: '' },
    { id: 'OTHER', title: 'Something else', author: 'Jane Doe', raw_text: '' },
  ];
  const { mini } = loadBuilt(rows);
  const ids = mini.search('Joe Amditis').map((h) => h.id);
  assert.ok(ids.includes('BYLINE'), 'a name in the author field should be findable');
  assert.ok(!ids.includes('OTHER'), 'an unrelated record should not match');
});

test('recordToSearchDoc maps CSV column names and tolerates missing fields', () => {
  const doc = recordToSearchDoc({ id: 'X', title: 'T', author: 'Jane Doe', key_concepts: 'c1; c2', thematic_categories: 'cat' });
  assert.equal(doc.author, 'Jane Doe', 'author maps through');
  assert.equal(doc.concepts, 'c1; c2', 'key_concepts maps to concepts');
  assert.equal(doc.categories, 'cat', 'thematic_categories maps to categories');
  assert.equal(doc.summary, '', 'missing summary becomes an empty string, not undefined');
  assert.equal(doc.body, '', 'missing raw_text becomes an empty string, not undefined');
  const bare = recordToSearchDoc({ id: 'Y' });
  assert.equal(bare.author, '', 'missing author becomes an empty string, not undefined');
});

test('skips rows without an id but keeps the rest', () => {
  const { count } = buildSearchIndex([
    { id: 'KEEP', title: 'kept' },
    { title: 'no id here' },
    { id: '', title: 'empty id' },
  ]);
  assert.equal(count, 1, 'only the row with a non-empty id is indexed');
});

test('default raw_text cap is exported and applied', () => {
  assert.equal(RAW_TEXT_INDEX_CHARS, 8000);
  const doc = recordToSearchDoc({ id: 'L', raw_text: 'y'.repeat(20000) });
  assert.equal(doc.body.length, 8000, 'raw_text is truncated to the default cap');
});

test('the social schema indexes uncapped body text without duplicate metadata fields (#669)', () => {
  const phrase = 'tail phrase unique to this social post';
  const { json, count } = buildSearchIndex(
    [{
      id: 'SOCIAL-LONG',
      title: 'metadata that belongs to the card search',
      raw_text: `${'x '.repeat(RAW_TEXT_INDEX_CHARS)}${phrase}`,
    }],
    {
      rawTextChars: Number.POSITIVE_INFINITY,
      indexOptions: socialSearchIndexOptions(),
    },
  );
  const mini = MiniSearch.loadJSON(JSON.stringify(json), socialSearchIndexOptions());

  assert.equal(count, 1);
  assert.deepEqual(Object.keys(json.fieldIds), ['body']);
  assert.equal(mini.search(phrase, { combineWith: 'AND' })[0]?.id, 'SOCIAL-LONG');
  assert.equal(mini.search('metadata').length, 0, 'social metadata must stay out of the body-only index');
});
