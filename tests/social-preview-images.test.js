/**
 * Social preview image guard (issue #483 regression).
 *
 * The bug: a page declared an og:image / twitter:image that pointed at a file
 * no longer committed in the repo. The build has no source for it, the deploy
 * ships nothing at that path, and the URL 404s. Nothing warns, so the page just
 * renders a broken share card. #610 fixed the instances by hand; this stops the
 * class from coming back.
 *
 * The check scopes to the pages the deploy manifest actually ships, resolves
 * every site-origin social image URL back to its source file, and fails if that
 * file is either missing or outside the deploy manifest -- a committed-but-not-
 * uploaded image 404s in production just like a deleted one (issue #483).
 * Third-party URLs and relative paths are out of scope: this only owns images
 * the site itself is supposed to publish. It reads the committed tree and the
 * deploy manifest, never the network, so it stays deterministic.
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

// The production deploy (backend/scripts/deploy_full_site.py) uploads only the
// files in _DEPLOY_FILES and the trees in _DEPLOY_DIRS; anything else in the repo
// -- a draft page, an intentionally held image -- stays local and 404s if a
// shipped page links to it. Read that manifest straight from the deploy script so
// this guard tracks the same source of truth the deploy uses instead of a third
// copy that could drift (the Python manifest and DEPLOYMENT.md are already
// drift-checked against each other by backend/tests/test_deploy_full_site.py).
function pythonStringTuple(source, name) {
  // Manifest tuples close with a ')' at column 0, so match up to the first such
  // line; then take the quoted literal from each entry, dropping trailing
  // comments (no manifest path contains '#').
  const block = source.match(new RegExp(`${name}[^=]*=\\s*\\(\\n([\\s\\S]*?)\\n\\)`));
  if (!block) throw new Error(`could not read ${name} from deploy_full_site.py`);
  const entries = [];
  for (const rawLine of block[1].split('\n')) {
    const quoted = rawLine.split('#')[0].match(/'([^']+)'|"([^"]+)"/);
    if (quoted) entries.push(quoted[1] ?? quoted[2]);
  }
  return entries;
}

function deployManifest() {
  const source = fs.readFileSync(
    path.join(rootDir, 'backend/scripts/deploy_full_site.py'), 'utf-8');
  const files = new Set(pythonStringTuple(source, '_DEPLOY_FILES'));
  const dirs = pythonStringTuple(source, '_DEPLOY_DIRS');
  assert.ok(files.size > 0 && dirs.length > 0,
    'deploy manifest parsed empty -- deploy_full_site.py format may have changed');
  return { files, dirs };
}

/** True when a repo-relative path is one the production deploy actually uploads. */
function isDeployed(rel, manifest) {
  if (manifest.files.has(rel)) return true;
  return manifest.dirs.some(dir => rel === dir || rel.startsWith(dir + '/'));
}

/**
 * Every og:image and twitter:image content URL declared in one HTML document.
 * Matches on the exact tag name so og:image:width / og:image:height (which carry
 * pixel counts, not URLs) are left out, and is order-independent across the
 * property/name and content attributes. Accepts the attribute quoting HTML
 * actually allows -- single or double quotes, and whitespace around the '=' --
 * so valid markup like content='...' or content = "..." is not silently skipped
 * and its image left unguarded.
 */
function socialImageUrls(html) {
  const urls = [];
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (!/(?:property|name)\s*=\s*(["'])(?:og:image|twitter:image)\1/i.test(tag)) continue;
    const content = tag.match(/content\s*=\s*(["'])(.*?)\1/i);
    if (content) urls.push(content[2]);
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
  it('every deployed page ships the social images it references', () => {
    const manifest = deployManifest();
    const dangling = [];
    for (const file of htmlFiles(rootDir)) {
      const pageRel = path.relative(rootDir, file);
      // A page the deploy never uploads cannot render a broken card in
      // production, so its references are out of scope -- and holding a draft's
      // image back is deliberate, not a regression.
      if (!isDeployed(pageRel, manifest)) continue;
      const html = fs.readFileSync(file, 'utf-8');
      for (const url of socialImageUrls(html)) {
        const rel = sourcePathForSocialImage(url);
        if (rel === null) continue; // third-party or relative: not ours to verify
        if (!fs.existsSync(path.join(rootDir, rel))) {
          dangling.push(`${pageRel} -> ${url} (source file not committed)`);
        } else if (!isDeployed(rel, manifest)) {
          dangling.push(`${pageRel} -> ${url} (committed but not in the deploy manifest)`);
        }
      }
    }
    assert.strictEqual(dangling.length, 0,
      'Deployed page(s) reference a social image that will 404 once shipped ' +
      '(issue #483): the file is either uncommitted or outside the deploy ' +
      'manifest (backend/scripts/deploy_full_site.py). Commit the image and add ' +
      'its path/dir to the manifest, or repoint the tag at one that ships ' +
      '(e.g. og-image.png):\n  ' +
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

  it('reads single-quoted and space-padded meta attributes, not just attr="value"', () => {
    const html = [
      "<meta property='og:image' content='A'>",       // single quotes
      '<meta property = "og:image" content = "B">',   // whitespace around =
      "<meta name='twitter:image' content='C'>"
    ].join('\n');
    assert.deepStrictEqual(socialImageUrls(html), ['A', 'B', 'C']);
  });

  it('treats manifest files/dirs as deployed and everything else as not', () => {
    const manifest = deployManifest();
    assert.ok(manifest.files.has('og-image.png'));          // the shipped social card
    assert.ok(isDeployed('index.html', manifest));          // a _DEPLOY_FILES entry
    assert.ok(isDeployed('dissertation/foreword/index.html', manifest)); // under a _DEPLOY_DIRS tree
    // features/making-of is intentionally held out of the manifest, so an image
    // there is committed but never uploaded -- exactly the 404 this guard adds.
    assert.strictEqual(isDeployed('features/making-of/og-image.png', manifest), false);
  });

  it('catches a dangling site-origin reference (the #483 shape)', () => {
    const html = '<meta property="og:image" content="https://pressthink.org/j/rosen-archive/gone.png">';
    const rel = sourcePathForSocialImage(socialImageUrls(html)[0]);
    assert.strictEqual(rel, 'gone.png');
    assert.strictEqual(fs.existsSync(path.join(rootDir, rel)), false);
  });
});
