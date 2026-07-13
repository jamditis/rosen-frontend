/**
 * Social preview image guard (issue #483 regression).
 *
 * The bug: a page declared an og:image / twitter:image that pointed at a file
 * no longer committed in the repo. The build has no source for it, the deploy
 * ships nothing at that path, and the URL 404s. Nothing warns, so the page just
 * renders a broken share card. #610 fixed the instances by hand; this stops the
 * class from coming back.
 *
 * The check resolves every site-origin social image URL back to its source file
 * and fails if that file is missing. Third-party URLs and relative paths are out
 * of scope: this only owns images the site itself is supposed to publish. It
 * reads the committed tree and never the network, so it stays deterministic.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// The site is served from these origins. A social image URL under either one
// resolves to a repo file at the path after the prefix; anything else (a real
// third-party image, a relative path) is not this check's to verify.
const SITE_PREFIXES = [
  'https://pressthink.org/j/rosen-archive/',
  'https://jamditis.github.io/rosen-frontend/'
];

// Directories that never ship a browsable page: dependencies, git internals, the
// Python backend, retired pages, and the test tree (whose fixtures hold markup
// that is malformed on purpose).
const SKIP_DIRS = new Set(['node_modules', '.git', 'backend', 'archived', 'tests']);

/**
 * Repo-relative source path a site-origin social image URL should resolve to,
 * or null when the URL is not one this check owns.
 */
function sourcePathForSocialImage(url) {
  for (const prefix of SITE_PREFIXES) {
    if (url.startsWith(prefix)) return url.slice(prefix.length);
  }
  return null;
}

/**
 * Every og:image and twitter:image content URL declared in one HTML document.
 * Matches on the exact tag name so og:image:width / og:image:height (which carry
 * pixel counts, not URLs) are left out, and is order-independent across the
 * property/name and content attributes.
 */
function socialImageUrls(html) {
  const urls = [];
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (!/(?:property|name)="(?:og:image|twitter:image)"/i.test(tag)) continue;
    const content = tag.match(/content="([^"]+)"/i);
    if (content) urls.push(content[1]);
  }
  return urls;
}

/** Every .html file under dir, minus the SKIP_DIRS subtrees and dot-directories. */
function htmlFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      found.push(...htmlFiles(full));
    } else if (entry.name.endsWith('.html')) {
      found.push(full);
    }
  }
  return found;
}

describe('social preview images (issue #483 regression guard)', () => {
  it('every og:image and twitter:image resolves to a committed file', () => {
    const dangling = [];
    for (const file of htmlFiles(rootDir)) {
      const html = fs.readFileSync(file, 'utf-8');
      for (const url of socialImageUrls(html)) {
        const rel = sourcePathForSocialImage(url);
        if (rel === null) continue; // third-party or relative: not ours to verify
        if (!fs.existsSync(path.join(rootDir, rel))) {
          dangling.push(`${path.relative(rootDir, file)} -> ${url}`);
        }
      }
    }
    assert.strictEqual(dangling.length, 0,
      'Social preview image(s) point at files not committed in the repo. Each ' +
      'renders a broken share card once deployed (issue #483). Commit the image, ' +
      'or repoint the tag at one that exists (e.g. og-image.png):\n  ' +
      dangling.join('\n  '));
  });

  it('maps site-origin URLs to a source path and ignores the rest', () => {
    assert.strictEqual(
      sourcePathForSocialImage('https://pressthink.org/j/rosen-archive/og-image.png'),
      'og-image.png');
    assert.strictEqual(
      sourcePathForSocialImage('https://jamditis.github.io/rosen-frontend/features/making-of/og-image.png'),
      'features/making-of/og-image.png');
    assert.strictEqual(
      sourcePathForSocialImage('https://cdn.example.com/x.png'), null);
  });

  it('extracts og:image and twitter:image but not the width/height tags', () => {
    const html = [
      '<meta property="og:image" content="A">',
      '<meta property="og:image:width" content="1200">',
      '<meta property="og:image:height" content="630">',
      '<meta name="twitter:image" content="B">',
      '<meta name="twitter:card" content="summary_large_image">'
    ].join('\n');
    assert.deepStrictEqual(socialImageUrls(html), ['A', 'B']);
  });

  it('catches a dangling site-origin reference (the #483 shape)', () => {
    const html = '<meta property="og:image" content="https://pressthink.org/j/rosen-archive/gone.png">';
    const rel = sourcePathForSocialImage(socialImageUrls(html)[0]);
    assert.strictEqual(rel, 'gone.png');
    assert.strictEqual(fs.existsSync(path.join(rootDir, rel)), false);
  });
});
