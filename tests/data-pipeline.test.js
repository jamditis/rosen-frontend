/**
 * Data pipeline helper function tests
 *
 * Tests the pure functions used in export-archive-data.js.
 * Since the functions aren't exported, we re-implement them here
 * and verify they produce correct output for known inputs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Re-implement helper functions from export-archive-data.js
// These must stay in sync with the source file

function cleanTags(str) {
  if (!str) return [];
  return str.replace(/[\[\]"']/g, '').split(/[;,]/)
    .map(s => s.trim())
    .filter(s => s && s.length > 0 && !s.startsWith('='));
}

function formatDate(str) {
  if (!str) return '';
  const d = new Date(str);
  return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
}

const ERAS = [
  "Public Journalism (90s)",
  "Web & Blogging (00s)",
  "View from Nowhere (10s)",
  "Democracy in Crisis (20s)"
];

function getEra(dateStr) {
  const y = new Date(dateStr).getFullYear();
  if (y < 2000) return ERAS[0];
  if (y < 2010) return ERAS[1];
  if (y < 2020) return ERAS[2];
  return ERAS[3];
}

function buildRelationshipsMap(relationshipsData) {
  const relationshipsMap = {};

  for (const rel of relationshipsData) {
    const source = rel.source_record_id || rel.Source || rel.source;
    const target = rel.target_entity_id || rel.Target || rel.target;

    if (source && target) {
      if (!relationshipsMap[source]) relationshipsMap[source] = [];
      if (!relationshipsMap[target]) relationshipsMap[target] = [];
      if (!relationshipsMap[source].includes(target)) relationshipsMap[source].push(target);
      if (!relationshipsMap[target].includes(source)) relationshipsMap[target].push(source);
    }
  }

  return relationshipsMap;
}

// ============================================
// cleanTags tests
// ============================================

describe('cleanTags', () => {
  it('returns empty array for null/undefined/empty input', () => {
    assert.deepStrictEqual(cleanTags(null), []);
    assert.deepStrictEqual(cleanTags(undefined), []);
    assert.deepStrictEqual(cleanTags(''), []);
  });

  it('splits comma-separated values', () => {
    assert.deepStrictEqual(cleanTags('foo, bar, baz'), ['foo', 'bar', 'baz']);
  });

  it('splits semicolon-separated values', () => {
    assert.deepStrictEqual(cleanTags('foo; bar; baz'), ['foo', 'bar', 'baz']);
  });

  it('strips brackets and quotes', () => {
    assert.deepStrictEqual(cleanTags('["Press Criticism", "Media Theory"]'), ['Press Criticism', 'Media Theory']);
  });

  it('filters out entries starting with =', () => {
    assert.deepStrictEqual(cleanTags('good, =bad, ok'), ['good', 'ok']);
  });

  it('filters out empty strings after split', () => {
    assert.deepStrictEqual(cleanTags('a,,b,  ,c'), ['a', 'b', 'c']);
  });

  it('handles single value without delimiter', () => {
    assert.deepStrictEqual(cleanTags('Journalism Theory'), ['Journalism Theory']);
  });

  it('trims whitespace from each tag', () => {
    const result = cleanTags('  Press Criticism , Media Theory  ,  Public Life  ');
    assert.deepStrictEqual(result, ['Press Criticism', 'Media Theory', 'Public Life']);
  });
});

// ============================================
// formatDate tests
// ============================================

describe('formatDate', () => {
  it('returns empty string for null/undefined/empty input', () => {
    assert.strictEqual(formatDate(null), '');
    assert.strictEqual(formatDate(undefined), '');
    assert.strictEqual(formatDate(''), '');
  });

  it('formats ISO date string to YYYY-MM-DD', () => {
    assert.strictEqual(formatDate('2024-03-15T10:30:00Z'), '2024-03-15');
  });

  it('formats date-only string', () => {
    assert.strictEqual(formatDate('2024-03-15'), '2024-03-15');
  });

  it('formats various date formats', () => {
    const result = formatDate('March 15, 2024');
    assert.strictEqual(result, '2024-03-15');
  });

  it('returns empty string for invalid date', () => {
    assert.strictEqual(formatDate('not-a-date'), '');
  });

  it('handles dates from the 1980s', () => {
    const result = formatDate('1986-01-01');
    assert.strictEqual(result, '1986-01-01');
  });
});

// ============================================
// getEra tests
// ============================================

describe('getEra', () => {
  // Note: Use mid-year dates to avoid UTC→local timezone offset issues.
  // new Date('2000-01-01') parses as UTC midnight, which in EST = Dec 31 1999.

  it('returns "Public Journalism (90s)" for dates before 2000', () => {
    assert.strictEqual(getEra('1986-06-15'), 'Public Journalism (90s)');
    assert.strictEqual(getEra('1999-06-15'), 'Public Journalism (90s)');
  });

  it('returns "Web & Blogging (00s)" for 2000-2009', () => {
    assert.strictEqual(getEra('2000-06-15'), 'Web & Blogging (00s)');
    assert.strictEqual(getEra('2005-06-15'), 'Web & Blogging (00s)');
  });

  it('returns "View from Nowhere (10s)" for 2010-2019', () => {
    assert.strictEqual(getEra('2010-06-15'), 'View from Nowhere (10s)');
    assert.strictEqual(getEra('2015-06-15'), 'View from Nowhere (10s)');
  });

  it('returns "Democracy in Crisis (20s)" for 2020+', () => {
    assert.strictEqual(getEra('2020-06-15'), 'Democracy in Crisis (20s)');
    assert.strictEqual(getEra('2025-06-15'), 'Democracy in Crisis (20s)');
  });
});

// ============================================
// buildRelationshipsMap tests
// ============================================

describe('buildRelationshipsMap', () => {
  it('returns empty object for empty input', () => {
    assert.deepStrictEqual(buildRelationshipsMap([]), {});
  });

  it('builds bidirectional relationships', () => {
    const data = [
      { source_record_id: 'A', target_entity_id: 'B' }
    ];
    const map = buildRelationshipsMap(data);
    assert.deepStrictEqual(map['A'], ['B']);
    assert.deepStrictEqual(map['B'], ['A']);
  });

  it('does not create duplicate entries', () => {
    const data = [
      { source_record_id: 'A', target_entity_id: 'B' },
      { source_record_id: 'A', target_entity_id: 'B' }
    ];
    const map = buildRelationshipsMap(data);
    assert.strictEqual(map['A'].length, 1);
    assert.strictEqual(map['B'].length, 1);
  });

  it('handles multiple relationships per record', () => {
    const data = [
      { source_record_id: 'A', target_entity_id: 'B' },
      { source_record_id: 'A', target_entity_id: 'C' },
      { source_record_id: 'A', target_entity_id: 'D' }
    ];
    const map = buildRelationshipsMap(data);
    assert.strictEqual(map['A'].length, 3);
    assert.ok(map['A'].includes('B'));
    assert.ok(map['A'].includes('C'));
    assert.ok(map['A'].includes('D'));
  });

  it('skips entries with missing source or target', () => {
    const data = [
      { source_record_id: 'A', target_entity_id: '' },
      { source_record_id: '', target_entity_id: 'B' },
      { source_record_id: 'C', target_entity_id: 'D' }
    ];
    const map = buildRelationshipsMap(data);
    assert.strictEqual(Object.keys(map).length, 2); // Only C and D
  });

  it('handles alternative column names (Source/Target)', () => {
    const data = [
      { Source: 'X', Target: 'Y' }
    ];
    const map = buildRelationshipsMap(data);
    assert.deepStrictEqual(map['X'], ['Y']);
    assert.deepStrictEqual(map['Y'], ['X']);
  });
});

// ============================================
// Generic title pattern tests
// ============================================

describe('generic title filtering pattern', () => {
  const GENERIC_TITLE_PATTERN = /^(Reply|Tweet|Post|Quote) by/i;

  it('matches "Reply by Jay Rosen"', () => {
    assert.ok(GENERIC_TITLE_PATTERN.test('Reply by Jay Rosen'));
  });

  it('matches "Tweet by Jay Rosen"', () => {
    assert.ok(GENERIC_TITLE_PATTERN.test('Tweet by Jay Rosen'));
  });

  it('matches "Post by Jay Rosen"', () => {
    assert.ok(GENERIC_TITLE_PATTERN.test('Post by Jay Rosen'));
  });

  it('matches "Quote by Jay Rosen"', () => {
    assert.ok(GENERIC_TITLE_PATTERN.test('Quote by Jay Rosen'));
  });

  it('is case-insensitive', () => {
    assert.ok(GENERIC_TITLE_PATTERN.test('reply by Jay Rosen'));
    assert.ok(GENERIC_TITLE_PATTERN.test('TWEET BY Jay Rosen'));
  });

  it('does not match normal titles', () => {
    assert.ok(!GENERIC_TITLE_PATTERN.test('The View from Nowhere'));
    assert.ok(!GENERIC_TITLE_PATTERN.test('PressThink: Winter Is Coming'));
  });

  it('does not match titles containing "Reply" in the middle', () => {
    assert.ok(!GENERIC_TITLE_PATTERN.test('In Reply to the Critics'));
  });
});

// ============================================
// Text cleaning for short reply detection
// ============================================

describe('short reply text cleaning', () => {
  function cleanText(text) {
    return (text || '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/^(\s*@\S+\s*)+/, '')
      .replace(/@\S+/g, '')
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  it('strips URLs', () => {
    assert.strictEqual(cleanText('Check this https://example.com out'), 'Check this out');
  });

  it('strips leading @mentions', () => {
    assert.strictEqual(cleanText('@user @other hello world'), 'hello world');
  });

  it('strips inline @mentions', () => {
    assert.strictEqual(cleanText('hey @user whats up'), 'hey whats up');
  });

  it('strips emoji', () => {
    const result = cleanText('\u{1F600}\u{1F44D}');
    assert.strictEqual(result, '');
  });

  it('collapses whitespace', () => {
    assert.strictEqual(cleanText('lots   of    spaces'), 'lots of spaces');
  });

  it('returns empty for emoji-only post', () => {
    const result = cleanText('\u{1F525}\u{1F525}\u{1F525}');
    assert.strictEqual(result, '');
  });

  it('keeps meaningful text intact', () => {
    assert.strictEqual(cleanText('This is an important point about journalism'), 'This is an important point about journalism');
  });

  it('correctly identifies short posts (<10 chars)', () => {
    assert.ok(cleanText('Yes.').length < 10);
    assert.ok(cleanText('Thanks.').length < 10);
    assert.ok(cleanText('\u{1F44D}').length < 10);
  });

  it('correctly identifies longer posts (>=10 chars)', () => {
    assert.ok(cleanText('This is a longer reply with substance').length >= 10);
  });
});
