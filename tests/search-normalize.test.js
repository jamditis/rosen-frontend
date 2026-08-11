/**
 * Tests for the archive search normalization (#456).
 *
 * Jay reported on the 2026-06-19 call that searching the exact headline of a
 * piece he knows is in the archive sometimes returns nothing. The cause: the
 * filter compared with `toLowerCase().includes()`, so a title stored with a
 * curly apostrophe (and 33 article titles carry typographic punctuation) never
 * matched the straight ASCII a user types. These tests pin the normalized
 * matcher that fixes the whole class.
 *
 * Typographic characters are built with String.fromCharCode so this test source
 * stays pure ASCII and reviewable.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeForSearch,
  buildSearchText,
  matchesSearch,
  findSearchSuggestions,
  matchesParsedSearchText,
  parseSearchQuery,
  searchLoadedIndexes,
} from '../frontend/utils/searchNormalize.js';

const RSQUO = String.fromCharCode(0x2019); // right single quote
const LDQUO = String.fromCharCode(0x201c); // left double quote
const RDQUO = String.fromCharCode(0x201d); // right double quote
const EMDASH = String.fromCharCode(0x2014); // em dash
const ENDASH = String.fromCharCode(0x2013); // en dash
const ELLIPSIS = String.fromCharCode(0x2026); // horizontal ellipsis
const EACUTE = String.fromCharCode(0x00e9); // precomposed e-acute

describe('normalizeForSearch (#456)', () => {
  it('folds a curly single quote to an ASCII apostrophe', () => {
    assert.equal(normalizeForSearch('Google' + RSQUO + 's'), "google's");
  });

  it('folds curly double quotes to ASCII quotes', () => {
    assert.equal(normalizeForSearch(LDQUO + 'Citizens' + RDQUO), '"citizens"');
  });

  it('folds em and en dashes to a hyphen', () => {
    assert.equal(normalizeForSearch('a' + EMDASH + 'b'), 'a-b');
    assert.equal(normalizeForSearch('a' + ENDASH + 'b'), 'a-b');
  });

  it('folds an ellipsis to three periods', () => {
    assert.equal(normalizeForSearch('end' + ELLIPSIS), 'end...');
  });

  it('folds the prime to an apostrophe', () => {
    const PRIME = String.fromCharCode(0x2032);
    assert.equal(normalizeForSearch('20' + PRIME + 's role'), "20's role");
  });

  it('folds diacritics to base letters', () => {
    assert.equal(normalizeForSearch('caf' + EACUTE), 'cafe');
  });

  it('lower-cases and collapses whitespace', () => {
    assert.equal(normalizeForSearch('  The   View   from  Nowhere '), 'the view from nowhere');
  });

  it('returns an empty string for null/undefined/non-strings', () => {
    assert.equal(normalizeForSearch(null), '');
    assert.equal(normalizeForSearch(undefined), '');
    assert.equal(normalizeForSearch(42), '42');
  });
});

describe('matchesSearch (#456) - the reported false negative', () => {
  // Shaped after RECORD-00591: a curly apostrophe lives in the headline.
  const record = {
    title: 'ABC goes too far; plus, Google' + RSQUO + 's AI assault, and Jay Rosen moves on',
    categories: ['Press Criticism'],
    summaryPreview: 'A note on the week' + RSQUO + 's media news.',
  };

  it('matches a straight-apostrophe query against a curly-apostrophe title', () => {
    // This is the bug: the old toLowerCase().includes() returned false here.
    assert.equal(matchesSearch(record, "google's ai assault"), true);
  });

  it('still matches an exact curly-apostrophe query', () => {
    assert.equal(matchesSearch(record, 'Google' + RSQUO + 's AI assault'), true);
  });

  it('matches a plain substring of the title', () => {
    assert.equal(matchesSearch(record, 'jay rosen moves on'), true);
  });

  it('matches against the summary', () => {
    assert.equal(matchesSearch(record, "week's media news"), true);
  });

  it('matches a category', () => {
    assert.equal(matchesSearch(record, 'press criticism'), true);
  });

  it('treats an empty or whitespace term as matching everything', () => {
    assert.equal(matchesSearch(record, ''), true);
    assert.equal(matchesSearch(record, '   '), true);
  });

  it('does not match a term that is absent from every field', () => {
    assert.equal(matchesSearch(record, 'nonexistent zebra'), false);
  });
});

describe('buildSearchText (#456) keeps matches within a field', () => {
  it('does not let a query span the title/summary boundary', () => {
    const record = { title: 'the press', summaryPreview: 'freedom rings', categories: [] };
    assert.equal(matchesSearch(record, 'press freedom'), false);
    assert.equal(matchesSearch(record, 'press'), true);
    assert.equal(matchesSearch(record, 'freedom'), true);
  });

  it('does not match across two separate categories', () => {
    const record = { title: 't', categories: ['press criticism', 'media theory'] };
    assert.equal(matchesSearch(record, 'criticism media'), false);
    assert.equal(matchesSearch(record, 'press criticism'), true);
  });

  it('handles missing fields and null records without throwing', () => {
    assert.equal(typeof buildSearchText({}), 'string');
    assert.equal(matchesSearch({}, 'anything'), false);
    assert.equal(matchesSearch({}, ''), true);
    assert.equal(matchesSearch(null, 'anything'), false);
    assert.equal(matchesSearch(null, ''), true);
  });
});

describe('findSearchSuggestions (#683)', () => {
  it('folds case and typographic-apostrophe variants into one suggestion', () => {
    const terms = [
      "Citizen's Agenda",
      "Citizen's agenda",
      'Citizen' + RSQUO + 's Agenda',
      'The Citizens Agenda',
    ];

    assert.deepEqual(findSearchSuggestions(terms, 'citizen'), [
      "Citizen's Agenda",
      'The Citizens Agenda',
    ]);
  });

  it('applies the result limit after deduplication and preserves first-seen display text', () => {
    const terms = [
      'Alpha',
      'ALPHA',
      'alpha',
      'Alpine',
      'Almanac',
    ];

    assert.deepEqual(findSearchSuggestions(terms, 'al', 3), [
      'Alpha',
      'Alpine',
      'Almanac',
    ]);
  });

  it('ignores malformed terms and invalid queries or limits', () => {
    assert.deepEqual(
      findSearchSuggestions([null, '  ', 'Alpha', 42, 'Alpine'], 'al'),
      ['Alpha', 'Alpine'],
    );
    assert.deepEqual(findSearchSuggestions(['Alpha'], '   '), []);
    assert.deepEqual(findSearchSuggestions(['Alpha'], 'al', 0), []);
    assert.deepEqual(findSearchSuggestions(null, 'al'), []);
  });
});

describe('quoted phrase search (#792)', () => {
  it('parses a quoted phrase while keeping unquoted terms in the full-text query', () => {
    const parsed = parseSearchQuery('"he said, she said" journalism');

    assert.equal(parsed.miniQuery, 'he said, she said journalism');
    assert.deepEqual(parsed.phraseKeys, ['he~said~she~said']);
    assert.deepEqual(parsed.unquotedTokens, ['journalism']);
  });

  it('treats commas, slashes, and curly quotes as phrase boundaries', () => {
    assert.deepEqual(
      parseSearchQuery(LDQUO + 'he said/she said' + RDQUO).phraseKeys,
      ['he~said~she~said'],
    );
  });

  it('treats symbols as phrase boundaries and supports phrases longer than six words', () => {
    const parsed = parseSearchQuery('"one+two three/four five#six seven eight"');

    assert.equal(parsed.miniQuery, 'one+two three/four five#six seven eight');
    assert.deepEqual(parsed.phraseKeys, ['one~two~three~four~five~six~seven~eight']);
  });

  it('treats an unmatched double quote as an ordinary query', () => {
    const query = '"he said, she said" journalism "unfinished';
    const parsed = parseSearchQuery(query);

    assert.equal(parsed.miniQuery, query);
    assert.deepEqual(parsed.phraseKeys, []);
  });

  it('leaves plain unquoted MiniSearch queries unchanged', () => {
    const query = '  he said, she said journalism  ';
    const parsed = parseSearchQuery(query);

    assert.equal(parsed.miniQuery, query.trim());
    assert.deepEqual(parsed.phraseKeys, []);
  });

  it('requires quoted words to be adjacent in one in-memory card field', () => {
    const parsed = parseSearchQuery('"he said, she said" journalism');
    const exact = buildSearchText({
      title: 'He said/she said journalism',
      summary: 'A reporting formula',
      categories: [],
    });
    const separated = buildSearchText({
      title: 'What he said about journalism',
      summary: 'She said something else much later',
      categories: [],
    });

    assert.equal(matchesParsedSearchText(exact, parsed), true);
    assert.equal(matchesParsedSearchText(separated, parsed), false);
  });

  it('filters quoted article hits through exact postings and excludes unverifiable social hits', () => {
    const calls = [];
    const article = {
      phrasePostings: new Map([
        ['he~said~she~said', new Set(['EXACT'])],
      ]),
      search(query, options) {
        calls.push({ source: 'article', query, options });
        return [{ id: 'EXACT' }, { id: 'SEPARATED' }];
      },
    };
    const social = {
      search(query, options) {
        calls.push({ source: 'social', query, options });
        return [{ id: 'SOCIAL-UNVERIFIED' }];
      },
    };

    const hits = searchLoadedIndexes([article, social], '"he said, she said" journalism');

    assert.deepEqual(hits.map(hit => hit.id), ['EXACT']);
    assert.deepEqual(calls, [
      {
        source: 'article',
        query: 'he said, she said journalism',
        options: { prefix: true, combineWith: 'AND' },
      },
      {
        source: 'social',
        query: 'he said, she said journalism',
        options: { prefix: true, combineWith: 'AND' },
      },
    ]);
  });

  it('keeps a social hit when its shared phrase posting verifies adjacency', () => {
    const social = {
      phrasePostings: new Map([
        ['he~said~she~said', new Set(['SOCIAL-EXACT'])],
      ]),
      search: () => [{ id: 'SOCIAL-EXACT' }, { id: 'SOCIAL-SEPARATED' }],
    };

    const hits = searchLoadedIndexes([social], '"he said, she said" journalism');

    assert.deepEqual(hits.map(hit => hit.id), ['SOCIAL-EXACT']);
  });

  it('returns no deep-index hits when a quoted phrase has no posting vocabulary', () => {
    const article = {
      phrasePostings: new Map(),
      search: () => [{ id: 'BROAD-AND-MATCH' }],
    };

    assert.deepEqual(searchLoadedIndexes([article], '"unknown exact phrase"'), []);
  });

  it('keeps symbols in the MiniSearch candidate query before applying exact postings', () => {
    const seenQueries = [];
    const article = {
      phrasePostings: new Map([
        ['one~two~three', new Set(['SYMBOL-MATCH'])],
      ]),
      search(query) {
        seenQueries.push(query);
        return query === 'one+two/three' ? [{ id: 'SYMBOL-MATCH' }] : [];
      },
    };

    const hits = searchLoadedIndexes([article], '"one+two/three"');

    assert.deepEqual(seenQueries, ['one+two/three']);
    assert.deepEqual(hits.map(hit => hit.id), ['SYMBOL-MATCH']);
  });

  it('preserves the exact unquoted query and unions article and social hits', () => {
    const calls = [];
    const makeIndex = (id) => ({
      search(query, options) {
        calls.push({ query, options });
        return [{ id }];
      },
    });

    const hits = searchLoadedIndexes(
      [makeIndex('ARTICLE'), makeIndex('SOCIAL')],
      'he said, she said journalism',
    );

    assert.deepEqual(hits.map(hit => hit.id), ['ARTICLE', 'SOCIAL']);
    assert.deepEqual(calls, [
      {
        query: 'he said, she said journalism',
        options: { prefix: true, combineWith: 'AND' },
      },
      {
        query: 'he said, she said journalism',
        options: { prefix: true, combineWith: 'AND' },
      },
    ]);
  });
});
