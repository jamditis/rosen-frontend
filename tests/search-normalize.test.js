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
