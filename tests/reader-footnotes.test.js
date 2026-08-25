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

import ReaderNavigation from '../dissertation/reader/src/js/navigation.js';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(
  join(here, '..', 'dissertation', 'reader', 'index.html'),
  'utf8',
);
const markdown = readFileSync(
  join(here, '..', 'dissertation', 'reader', 'src', 'impossible-press.md'),
  'utf8',
);
const layoutCss = readFileSync(
  join(here, '..', 'dissertation', 'reader', 'src', 'css', 'layout.css'),
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

  it('puts each multi-block note backlink after all note content', () => {
    const multiBlockIds = new Set([
      'fn-chapter-6-5',
      'fn-chapter-6-6',
      'fn-chapter-6-8',
      'fn-chapter-6-9',
      'fn-chapter-6-11',
      'fn-chapter-6-12',
      'fn-chapter-6-13',
    ]);
    const noteStarts = [...html.matchAll(
      /<p id="(fn-[^"]+)" class="footnote" tabindex="-1">/g,
    )];
    const foundMultiBlockIds = new Set();

    for (let index = 0; index < noteStarts.length; index += 1) {
      const noteId = noteStarts[index][1];
      if (!multiBlockIds.has(noteId)) continue;
      foundMultiBlockIds.add(noteId);

      const start = noteStarts[index].index;
      const end = noteStarts[index + 1]?.index ?? html.length;
      const block = html.slice(start, end);
      const initialParagraphEnd = block.indexOf('</p>') + 4;
      const returnParagraphStart = block.indexOf('<p class="footnote-return">');
      const returnParagraphEnd = block.indexOf('</p>', returnParagraphStart) + 4;

      assert.ok(returnParagraphStart > initialParagraphEnd,
        `${noteId} return link must follow its continuation blocks`);
      assert.doesNotMatch(block.slice(0, initialParagraphEnd), /Return to /,
        `${noteId} initial paragraph must not contain an early return link`);
      assert.match(block.slice(initialParagraphEnd, returnParagraphStart),
        /<(?:blockquote|p)[^>]*>[\s\S]*<\/(?:blockquote|p)>/,
        `${noteId} must retain its continuation blocks before the return link`);
      assert.equal(block.slice(returnParagraphEnd).trim(), '',
        `${noteId} return link must be the final part of the note`);
    }

    assert.deepEqual(foundMultiBlockIds, multiBlockIds);
  });

  it('preserves explicit footnote hashes during scroll tracking', () => {
    const originalDocument = globalThis.document;
    const originalWindow = globalThis.window;
    const originalHistory = globalThis.history;
    const originalCustomEvent = globalThis.CustomEvent;
    const replacements = [];
    const target = {
      scrollIntoView() {},
      setAttribute() {},
      focus() {},
    };

    try {
      globalThis.window = { location: { hash: '#fn-chapter-1-1' } };
      globalThis.history = {
        replaceState(_state, _unused, hash) {
          replacements.push(hash);
          globalThis.window.location.hash = hash;
        },
      };
      globalThis.document = {
        dispatchEvent() {},
        getElementById() { return target; },
      };
      globalThis.CustomEvent = class CustomEvent {};

      const navigation = new ReaderNavigation();
      navigation.setActiveSection('notes');
      assert.deepEqual(replacements, [], 'scroll tracking must preserve a note hash');

      globalThis.window.location.hash = '#fnref-chapter-1-1';
      navigation.setActiveSection('chapter-1');
      assert.deepEqual(replacements, [], 'scroll tracking must preserve a reference hash');

      navigation.scrollToSection('chapter-2');
      assert.deepEqual(replacements, ['#chapter-2'],
        'explicit section navigation must leave the footnote round trip');

      navigation.setActiveSection('chapter-3');
      assert.deepEqual(replacements, ['#chapter-2', '#chapter-3'],
        'normal section tracking must resume after explicit navigation');
    } finally {
      if (originalDocument === undefined) delete globalThis.document;
      else globalThis.document = originalDocument;
      if (originalWindow === undefined) delete globalThis.window;
      else globalThis.window = originalWindow;
      if (originalHistory === undefined) delete globalThis.history;
      else globalThis.history = originalHistory;
      if (originalCustomEvent === undefined) delete globalThis.CustomEvent;
      else globalThis.CustomEvent = originalCustomEvent;
    }
  });

  it('hides nonfunctional return links when printing', () => {
    assert.match(layoutCss,
      /@media print[\s\S]*\.footnote-return,[\s\S]*a\.footnote-ref\[href\^="#fnref-"\][\s\S]*display:\s*none !important/);
  });
});
