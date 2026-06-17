/**
 * Standalone dissertation tool path tests (#415)
 *
 * The standalone tools under dissertation/ (reader/, foreword/,
 * network-effect/, faq/) are plain HTML pages — they can't ES-import the
 * SPA's pathResolver, so their asset and nav paths are written statically.
 *
 * They previously hard-coded production-absolute paths like
 * `/j/rosen-archive/shared-styles.css` and `/j/rosen-archive/dissertation/`.
 * The documented local preview flows (`python3 -m http.server` and
 * `npm run preview`) serve the repo from `/`, not from `/j/rosen-archive/`,
 * so every such path 404s: the pages load unstyled and their nav links break.
 *
 * The fix is location-relative paths, which resolve correctly under all three
 * deploy surfaces (localhost, *.github.io, production) because every tool sits
 * two levels below the repo root (`dissertation/<tool>/`), so `../../` is the
 * root everywhere. The one exception is assets that are deploy-only and not in
 * the repo (the dissertation PDF, the social card image): those stay full
 * `https://` production URLs so they resolve in local preview too instead of
 * 404ing on a file the repo doesn't contain.
 *
 * These tests assert no root-relative `/j/rosen-archive/...` reference survives
 * in a rendered or navigational position. A full `https://.../j/rosen-archive/`
 * URL is fine (the quote is followed by `https`, not `/j`), so social-card
 * meta and the deploy-only PDF link pass.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Every standalone page under dissertation/ plus the dissertation landing page
// itself. The landing page is one level shallower (dissertation/index.html), so
// its root-relative prefix is `../`, not `../../` — the navigation the tools
// link back to has to be preview-safe too, or a relative Back link drops the
// user straight onto a page with the same 404 class.
const PAGES = [
  { rel: 'dissertation/reader/index.html', favicon: '../../favicon.ico' },
  { rel: 'dissertation/foreword/index.html', favicon: '../../favicon.ico' },
  { rel: 'dissertation/network-effect/index.html', favicon: '../../favicon.ico' },
  { rel: 'dissertation/faq/index.html', favicon: '../../favicon.ico' },
  { rel: 'dissertation/index.html', favicon: '../favicon.ico' },
];

// A root-relative production path in an attribute or import specifier — the
// breakage class. `["']/j/rosen-archive/` matches href/src/import="/j/..."
// but not `"https://pressthink.org/j/rosen-archive/..."`.
const ROOT_RELATIVE_PROD_PATH = /["']\/j\/rosen-archive\//;

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('standalone dissertation tools use preview-safe paths (#415)', () => {
  for (const page of PAGES) {
    const file = path.join(rootDir, page.rel);

    it(`${page.rel} has no root-relative /j/rosen-archive/ paths`, () => {
      const html = fs.readFileSync(file, 'utf-8');
      const offenders = html
        .split('\n')
        .map((line, i) => [i + 1, line])
        .filter(([, line]) => ROOT_RELATIVE_PROD_PATH.test(line))
        .map(([n, line]) => `  line ${n}: ${line.trim()}`);
      assert.equal(
        offenders.length,
        0,
        `${page.rel} still hard-codes production-absolute paths that 404 ` +
          `in local preview:\n${offenders.join('\n')}`,
      );
    });

    it(`${page.rel} references its favicon relatively`, () => {
      const html = fs.readFileSync(file, 'utf-8');
      assert.match(
        html,
        new RegExp(`rel="icon"\\s+href="${escapeRegExp(page.favicon)}"`),
        `${page.rel} should load the favicon via ${page.favicon} so local preview finds it`,
      );
    });
  }
});
