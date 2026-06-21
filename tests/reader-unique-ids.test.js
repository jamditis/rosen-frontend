/**
 * Reader heading-id integrity (#RDR-02, #RDR-19).
 *
 * The dissertation reader inlines the full text as HTML with per-heading ids.
 * The table of contents and on-load deep links resolve targets via
 * getElementById, which returns the FIRST element with a given id. Duplicate
 * ids therefore silently send a TOC click or `#conclusion` deep link to the
 * wrong heading. This test fails if any id repeats, and if any in-page TOC
 * target does not resolve to exactly one element.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(
  join(here, '..', 'dissertation', 'reader', 'index.html'),
  'utf8'
);

const allIds = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
const tocTargets = [...html.matchAll(/class="toc-link"[^>]*href="#([^"]+)"/g)].map(m => m[1])
  .concat([...html.matchAll(/href="#([^"]+)"[^>]*class="toc-link"/g)].map(m => m[1]));

describe('reader heading ids', () => {
  it('has no duplicate ids', () => {
    const seen = new Map();
    for (const id of allIds) seen.set(id, (seen.get(id) || 0) + 1);
    const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id} (${n}x)`);
    assert.deepStrictEqual(dupes, [], `duplicate ids: ${dupes.join(', ')}`);
  });

  it('resolves every TOC target to exactly one heading', () => {
    assert.ok(tocTargets.length > 0, 'expected to find toc-link targets');
    const idCount = id => allIds.filter(x => x === id).length;
    for (const target of tocTargets) {
      assert.strictEqual(idCount(target), 1, `TOC target #${target} resolves to ${idCount(target)} elements`);
    }
  });

  it('points the Conclusion TOC link at the top-level CONCLUSION h1', () => {
    // The canonical conclusion is the <h1>, not a chapter subhead.
    assert.match(html, /<h1 id="conclusion"><strong>CONCLUSION<\/strong><\/h1>/);
  });
});
