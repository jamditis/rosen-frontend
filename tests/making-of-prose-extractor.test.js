import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(repoRoot, 'scripts', 'extract-making-of-prose.py');
const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function runExtractor(source) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'making-of-prose-'));
  temporaryDirectories.push(directory);
  const sourcePath = path.join(directory, 'making-of.html');
  const markdownPath = path.join(directory, 'making-of.md');
  const mapPath = path.join(directory, 'anchor-map.json');
  fs.writeFileSync(sourcePath, source);

  execFileSync('python3', [script, sourcePath, markdownPath, mapPath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  return {
    markdown: fs.readFileSync(markdownPath, 'utf8'),
    anchorMap: JSON.parse(fs.readFileSync(mapPath, 'utf8')),
  };
}

describe('making-of prose extractor', () => {
  it('does not replace the last chapter title with a later section heading', () => {
    const { markdown, anchorMap } = runExtractor(`
      <section class="chapter">
        <span class="ch-ref">Chapter 1</span>
        <h2>A record of the record</h2>
        <p class="ch-date">July 2026</p>
        <div class="m-article prose">
          <p>Chapter body.</p>
        </div>
      </section>
      <section class="colophon">
        <h2>Three rules the archive won't break</h2>
      </section>
    `);

    assert.equal(anchorMap['C1.T'].text, 'A record of the record');
    assert.equal(markdown.match(/\[C1\.T\]/g)?.length, 1);
    assert.doesNotMatch(markdown, /Three rules the archive won't break/);
  });

  it('does not invent a chapter title when the heading is missing', () => {
    const { markdown, anchorMap } = runExtractor(`
      <section class="chapter">
        <div class="ch-head">
          <span class="ch-ref">Chapter 1</span>
          <p class="ch-date">July 2026</p>
        </div>
        <div class="prose">
          <p>Chapter body.</p>
        </div>
      </section>
      <section class="colophon">
        <h2>Three rules the archive won't break</h2>
      </section>
    `);

    assert.equal(anchorMap['C1.T'], undefined);
    assert.doesNotMatch(markdown, /Three rules the archive won't break/);
  });

  it('extracts article prose after the case-file class is removed', () => {
    const { markdown, anchorMap } = runExtractor(`
      <article class="chapter">
        <span class="ch-ref">Chapter 1</span>
        <h2>Chapter title</h2>
        <p class="ch-date">July 2026</p>
        <div class="prose">
          <p class="lead">The opening.</p>
          <p>The body.</p>
          <p class="pull">The pull quote.</p>
        </div>
      </article>
    `);

    assert.equal(anchorMap['C1.L'].text, 'The opening.');
    assert.equal(anchorMap['C1.P1'].text, 'The body.');
    assert.equal(anchorMap['C1.Q1'].text, 'The pull quote.');
    assert.match(markdown, /\[C1\.P1\] The body\./);
  });

  it('keeps prose that wraps across source lines', () => {
    const { markdown, anchorMap } = runExtractor(`
      <article class="chapter">
        <span class="ch-ref">Chapter 1</span>
        <h2>Chapter title</h2>
        <p class="ch-date">July 2026</p>
        <div class="prose">
          <p>The body starts
            on one line, includes <em>emphasis</em>,
            and finishes on another.</p>
        </div>
      </article>
    `);

    assert.equal(
      anchorMap['C1.P1'].text,
      'The body starts on one line, includes emphasis, and finishes on another.',
    );
    assert.match(markdown, /\[C1\.P1\] The body starts on one line/);
  });

  it('extracts generic prose paragraphs that carry attributes', () => {
    const { anchorMap } = runExtractor(`
      <article class="chapter">
        <span class="ch-ref">Chapter 1</span>
        <h2>Chapter title</h2>
        <p class="ch-date">July 2026</p>
        <div class="prose">
          <p id="context">The context.</p>
          <p class="note">The note.</p>
        </div>
      </article>
    `);

    assert.equal(anchorMap['C1.P1'].text, 'The context.');
    assert.equal(anchorMap['C1.P2'].text, 'The note.');
  });

  it('preserves word boundaries around inline break tags', () => {
    const { anchorMap } = runExtractor(`
      <article class="chapter">
        <span class="ch-ref">Chapter 1</span>
        <h2>Chapter title</h2>
        <p class="ch-date">July 2026</p>
        <div class="prose">
          <p>First<br>second<br/>third<br />fourth.</p>
        </div>
      </article>
    `);

    assert.equal(anchorMap['C1.P1'].text, 'First second third fourth.');
  });

  it('continues extracting until the prose container closes', () => {
    const { anchorMap } = runExtractor(`
      <article class="chapter">
        <span class="ch-ref">Chapter 1</span>
        <h2>Chapter title</h2>
        <p class="ch-date">July 2026</p>
        <div class="prose">
          <p>Before the callout.</p>
          <div class="callout">
            <p>Inside the callout.</p>
          </div>
          <p>After the callout.</p>
        </div>
      </article>
    `);

    assert.equal(anchorMap['C1.P1'].text, 'Before the callout.');
    assert.equal(anchorMap['C1.P2'].text, 'Inside the callout.');
    assert.equal(anchorMap['C1.P3'].text, 'After the callout.');
  });

  it('extracts the full current page into one unique 62-anchor manifest', () => {
    const source = fs.readFileSync(
      path.join(repoRoot, 'features', 'making-of', 'index.html'),
      'utf8',
    );
    const { markdown, anchorMap } = runExtractor(source);
    const anchors = Object.keys(anchorMap);

    assert.equal(anchors.length, 62);
    assert.deepEqual(
      Array.from({ length: 8 }, (_value, index) => anchorMap[`C${index + 1}.T`].text),
      [
        'What was disappearing',
        'Learning git in public',
        'The pipeline and its potholes',
        'Working with the machines',
        'From records to a web of ideas',
        'Making it look like what it is',
        'The part nobody automates',
        'A record of the record',
      ],
    );
    for (const anchor of anchors) {
      const escaped = anchor.replaceAll('.', '\\.');
      assert.equal(markdown.match(new RegExp(`\\[${escaped}\\]`, 'g'))?.length, 1, anchor);
    }
    assert.doesNotMatch(markdown, /Three rules the archive won't break/);
  });
});
