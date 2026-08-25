/**
 * Dissertation reader footnote navigation (issue #782).
 *
 * The hand-maintained reader uses chapter-local note numbers. Each visible
 * reference must resolve to its note, and each referenced note must offer one
 * return link. The source and served HTML must keep the same complete marker
 * set so future reader work does not restore the three transcription gaps.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(
  join(here, '..', 'dissertation', 'reader', 'index.html'),
  'utf8',
);
const markdown = readFileSync(
  join(here, '..', 'dissertation', 'reader', 'src', 'impossible-press.md'),
  'utf8',
);

const references = [...html.matchAll(
  /<a class="footnote-ref" id="(fnref-([^"]+)-(\d+))" href="#(fn-\2-\3)" aria-label="Go to [^"]+ note \3">\3<\/a>/g,
)];
const notes = [...html.matchAll(
  /<p id="(fn-([^"]+)-(\d+))" class="footnote" tabindex="-1">\3\.([\s\S]*?)<\/p>/g,
)];
const backlinks = [...html.matchAll(
  /<a class="footnote-ref" href="#(fnref-([^"]+)-(\d+))" aria-label="Return to [^"]+ note \3 reference">↩<\/a>/g,
)];
const superscriptDigits = new Map([
  ['⁰', '0'], ['¹', '1'], ['²', '2'], ['³', '3'], ['⁴', '4'],
  ['⁵', '5'], ['⁶', '6'], ['⁷', '7'], ['⁸', '8'], ['⁹', '9'],
]);

describe('reader footnote navigation (issue #782)', () => {
  it('links every surviving superscript reference to a stable note target', () => {
    assert.equal(references.length, 105);
    const noteIds = new Set(notes.map((match) => match[1]));
    for (const reference of references) {
      assert.ok(noteIds.has(reference[4]), `missing target #${reference[4]}`);
    }

    const contentBeforeNotes = html.slice(0, html.indexOf('<h1 id="notes"'));
    const withoutLinkedReferences = contentBeforeNotes.replace(
      /<a class="footnote-ref"[^>]*>\d+<\/a>/g,
      '',
    );
    assert.doesNotMatch(withoutLinkedReferences, /[⁰¹²³⁴⁵⁶⁷⁸⁹]/,
      'plain superscript references must not remain');

    const markdownBeforeNotes = markdown.slice(0, markdown.indexOf('# **NOTES**'));
    const markdownNumbers = [...markdownBeforeNotes.matchAll(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g)]
      .map(([marker]) => marker.split('').map((digit) => superscriptDigits.get(digit)).join(''));
    assert.deepEqual(markdownNumbers, references.map((match) => match[3]),
      'served reference order must match the dissertation source');
  });

  it('gives every note a stable id and a return link', () => {
    assert.equal(notes.length, 105);
    assert.equal(backlinks.length, references.length);

    const referenceIds = new Set(references.map((match) => match[1]));
    const backlinkIds = backlinks.map((match) => match[1]);
    assert.equal(new Set(backlinkIds).size, backlinkIds.length,
      'each reference must have only one return link');
    for (const backlinkId of backlinkIds) {
      assert.ok(referenceIds.has(backlinkId), `missing reference #${backlinkId}`);
    }

    const noteIdsWithoutReferences = notes
      .map((match) => match[1])
      .filter((noteId) => !referenceIds.has(noteId.replace(/^fn-/, 'fnref-')));
    assert.deepEqual(noteIdsWithoutReferences, []);
  });
});
