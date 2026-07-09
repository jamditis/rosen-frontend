/**
 * Menu link integrity test (#411)
 *
 * Every dissertation-tool link rendered by the homepage Tools bar (App.js) and
 * the Tools modal (ToolsModal.js) must resolve to a tool that is
 * actually deployed under dissertation/. Links to removed tools return 404 on
 * the live site. The FAQ moved to the top-level faq/ in #567 (a 301 covers its old
 * /dissertation/faq/ URL); because it no longer sits under dissertation/, it is
 * checked separately below. This guards against the menu advertising tools that
 * no longer ship.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Files that render dissertation-tool links.
const SOURCES = ['frontend/App.js', 'frontend/components/ToolsModal.js'];

// Collect every dissertation/<slug>/ referenced as a link target. ToolsModal
// hardcodes the absolute path; App.js builds it from the FEATURES_PATH template.
function collectDissertationToolSlugs(source) {
  const slugs = new Set();
  for (const m of source.matchAll(/\/dissertation\/([a-z0-9-]+)\//g)) {
    slugs.add(m[1]);
  }
  for (const m of source.matchAll(/\$\{FEATURES_PATH\}\/([a-z0-9-]+)\//g)) {
    slugs.add(m[1]);
  }
  return slugs;
}

describe('menu link integrity (#411)', () => {
  it('every dissertation-tool link points to a deployed tool', () => {
    const missing = [];
    for (const rel of SOURCES) {
      const source = fs.readFileSync(path.join(rootDir, rel), 'utf-8');
      for (const slug of collectDissertationToolSlugs(source)) {
        const indexPath = path.join(rootDir, 'dissertation', slug, 'index.html');
        if (!fs.existsSync(indexPath)) {
          missing.push(`${rel} -> /dissertation/${slug}/ (no dissertation/${slug}/index.html)`);
        }
      }
    }
    assert.deepStrictEqual(missing, [],
      `Menu links point to undeployed dissertation tools:\n  ${missing.join('\n  ')}`);
  });

  it('the FAQ menu link points to the deployed top-level faq/ page', () => {
    // The FAQ moved out of dissertation/ in #567. ToolsModal links to it as
    // `faq/` (resolved to the site root at runtime), so the deployed page must
    // exist at the repo-root faq/index.html, and the old location must be gone
    // (its old URL is handled by the .htaccess 301, not a duplicate page).
    const modal = fs.readFileSync(path.join(rootDir, 'frontend/components/ToolsModal.js'), 'utf-8');
    assert.match(modal, /href:\s*'faq\/'/, 'ToolsModal should link to the top-level faq/');
    assert.ok(fs.existsSync(path.join(rootDir, 'faq', 'index.html')),
      'faq/index.html must exist for the FAQ menu link');
    assert.ok(!fs.existsSync(path.join(rootDir, 'dissertation', 'faq', 'index.html')),
      'the old dissertation/faq/ page must be gone (redirected, not duplicated)');
  });
});
