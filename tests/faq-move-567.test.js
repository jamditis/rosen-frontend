/**
 * FAQ move + rebrand structure guards (#567)
 *
 * Issue #567 had three parts:
 *   1. The FAQ back button went to the dissertation landing page; it must go to
 *      the archive home instead.
 *   2. The FAQ lived at /dissertation/faq/; it should live at /faq/ with a 301
 *      from the old URL, because it now covers the whole archive.
 *   3. The FAQ content only answered dissertation questions; it should also
 *      answer questions about the archive.
 *
 * These are cheap source-regex checks (same style as announce-banner.test.js)
 * that lock the pieces most likely to silently regress: the file location, the
 * back/nav link targets, the redirect, and the presence of archive Q&A content.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(rootDir, ...parts), 'utf8');

describe('FAQ move and rebrand (#567)', () => {
  it('lives at the top-level faq/, not under dissertation/', () => {
    assert.ok(fs.existsSync(path.join(rootDir, 'faq', 'index.html')),
      'faq/index.html must exist');
    assert.ok(fs.existsSync(path.join(rootDir, 'faq', 'data.js')),
      'faq/data.js must exist');
    assert.ok(!fs.existsSync(path.join(rootDir, 'dissertation', 'faq')),
      'the old dissertation/faq/ directory must be gone');
  });

  it('back button and logo point to the archive home, not the dissertation', () => {
    const html = read('faq', 'index.html');
    // The back arrow now returns to the archive home. From faq/ that is `../`
    // (the site root); its aria-label must say so, not "Back to dissertation".
    assert.match(html, /aria-label="Back to the archive[^"]*"/);
    assert.doesNotMatch(html, /aria-label="Back to dissertation"/);
    // The one deep link into the dissertation (the "Read the dissertation" nav
    // button) must be preview-safe from the new location: ../dissertation/reader/,
    // not the pre-move ../reader/ which would 404 one level up.
    assert.match(html, /href="\.\.\/dissertation\/reader\/"/);
    assert.doesNotMatch(html, /href="\.\.\/reader\/"/);
  });

  it('uses one-level-up (../) asset paths after the move', () => {
    const html = read('faq', 'index.html');
    // Two levels up (../../) would 404 now that the page sits one level below root.
    assert.doesNotMatch(html, /\.\.\/\.\.\//);
    assert.match(html, /href="\.\.\/favicon\.ico"/);
    assert.match(html, /href="\.\.\/frontend\/dist\/tailwind\.css(?:\?v=[\d.]+)?"/);
    // The ?v= cache-busting query is optional here: this asserts the ../ depth,
    // not the versioning (version-consistency.test.js owns the ?v= invariant).
    assert.match(html, /import \{ TextSelectionTool \} from '\.\.\/features\/shared\/text-selection\.js(\?v=[\d.]+)?'/);
  });

  it('redirects the old /dissertation/faq/ URL with a 301', () => {
    const htaccess = read('.htaccess');
    assert.match(htaccess, /RedirectMatch\s+301\s+[^\n]*dissertation\/faq[^\n]*faq\//,
      '.htaccess must 301 the old dissertation/faq/ URL to the new faq/');
  });

  it('covers the archive, not just the dissertation', () => {
    const data = read('faq', 'data.js');
    // A dedicated archive category plus its questions.
    assert.match(data, /id:\s*'archive',\s*name:\s*'The archive'/);
    for (const id of ['what-is-archive', 'archive-highlights', 'how-to-explore-archive', 'suggest-or-report']) {
      assert.match(data, new RegExp(`id:\\s*'${id}'`), `expected archive FAQ item ${id}`);
      assert.match(data, new RegExp(`'${id}':\\s*\\[`), `expected search keywords for ${id}`);
    }
  });

  it('rebrands the page away from a dissertation-only title', () => {
    const html = read('faq', 'index.html');
    assert.match(html, /<title>Frequently asked questions \| Jay Rosen's Internet Archive<\/title>/);
    // Full social tag set (web rules): og:url + twitter card must be present.
    assert.match(html, /property="og:url"/);
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
  });
});
