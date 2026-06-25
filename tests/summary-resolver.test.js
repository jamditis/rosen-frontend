/**
 * Tests for the authored-excerpt summary override (#309).
 *
 * Imports the real functions from data/lib/summary-resolver.js (no
 * re-implementation) so the test guards the actual export behavior.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadAuthoredExcerpts, resolveSummary } from '../data/lib/summary-resolver.js';

describe('loadAuthoredExcerpts', () => {
  it('returns an empty map for empty or missing file contents', () => {
    assert.strictEqual(loadAuthoredExcerpts('').size, 0);
    assert.strictEqual(loadAuthoredExcerpts('   ').size, 0);
    assert.strictEqual(loadAuthoredExcerpts(undefined).size, 0);
  });

  it('returns an empty map for a header-only sidecar', () => {
    assert.strictEqual(loadAuthoredExcerpts('record_id,authored_excerpt\n').size, 0);
  });

  it('maps record id to its authored excerpt', () => {
    const map = loadAuthoredExcerpts(
      'record_id,authored_excerpt\nRECORD-00902,Jay\'s own words about this post\n'
    );
    assert.strictEqual(map.get('RECORD-00902'), "Jay's own words about this post");
  });

  it('skips rows whose excerpt is blank so an empty cell never overrides', () => {
    const map = loadAuthoredExcerpts(
      'record_id,authored_excerpt\nRECORD-1,\nRECORD-2,   \nRECORD-3,real text\n'
    );
    assert.strictEqual(map.has('RECORD-1'), false);
    assert.strictEqual(map.has('RECORD-2'), false);
    assert.strictEqual(map.get('RECORD-3'), 'real text');
  });

  it('trims surrounding whitespace from id and excerpt', () => {
    const map = loadAuthoredExcerpts('record_id,authored_excerpt\nRECORD-9 ,  padded value  \n');
    assert.strictEqual(map.get('RECORD-9'), 'padded value');
  });

  it('unescapes the spreadsheet-safety apostrophe at the read boundary (#335)', () => {
    // An excerpt opening with "@" is stored as "'@..." for spreadsheet safety;
    // the public summary must show the original text, not the apostrophe.
    const map = loadAuthoredExcerpts(
      "record_id,authored_excerpt\nRECORD-7,\"'@JayRosen on the view from nowhere\"\n"
    );
    assert.strictEqual(map.get('RECORD-7'), '@JayRosen on the view from nowhere');
  });
});

describe('resolveSummary', () => {
  const authored = new Map([['RECORD-00902', 'Authored override text']]);

  it('prefers the authored excerpt over the CSV summary when one exists', () => {
    const row = { id: 'RECORD-00902', summary: 'auto-generated summary' };
    assert.strictEqual(resolveSummary(row, authored), 'Authored override text');
  });

  it('uses the authored excerpt even when the CSV summary is empty', () => {
    const row = { id: 'RECORD-00902', summary: '' };
    assert.strictEqual(resolveSummary(row, authored), 'Authored override text');
  });

  it('falls back to the CSV summary verbatim when no excerpt is authored', () => {
    const row = { id: 'RECORD-00001', summary: 'the existing summary' };
    assert.strictEqual(resolveSummary(row, authored), 'the existing summary');
  });

  it('returns an empty string when neither excerpt nor summary exists', () => {
    // This is the signal the social-post fallback in export-archive-data.js
    // keys on to generate a summary, so the override must not break it.
    const row = { id: 'BSKY-1' };
    assert.strictEqual(resolveSummary(row, authored), '');
  });

  it('reads the capitalized Summary column variant', () => {
    const row = { id: 'RECORD-00001', Summary: 'capitalized column' };
    assert.strictEqual(resolveSummary(row, authored), 'capitalized column');
  });

  it('ignores a whitespace-only authored value and falls back', () => {
    const row = { id: 'RECORD-5', summary: 'real summary' };
    assert.strictEqual(resolveSummary(row, new Map([['RECORD-5', '   ']])), 'real summary');
  });

  it('falls back to the summary when no map is supplied', () => {
    const row = { id: 'RECORD-00001', summary: 'still works' };
    assert.strictEqual(resolveSummary(row, undefined), 'still works');
  });

  it('looks up the explicit record id when one is passed', () => {
    // The export passes the record's resolved rawId so the override and the
    // served record agree by construction, even if the row's own id column is
    // absent or synthetic.
    const row = { summary: 'auto summary' };
    assert.strictEqual(resolveSummary(row, authored, 'RECORD-00902'), 'Authored override text');
  });
});
