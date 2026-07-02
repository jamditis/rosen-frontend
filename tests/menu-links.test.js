/**
 * Menu link integrity test (#411)
 *
 * Every dissertation-tool link rendered by the homepage Tools bar (App.js) and
 * the Tools modal (ToolsModal.js) must resolve to a tool that is
 * actually deployed under dissertation/. Links to retired tools (moved to
 * archived/dissertation-tools/ and dropped from the deploy) return 404 — or, in
 * the faq case, a 301 off the archive — on the live site. This guards against
 * the menu advertising tools that no longer ship.
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
  it('every dissertation-tool link points to a deployed tool, not a retired one', () => {
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
      `Menu links point to retired/undeployed dissertation tools:\n  ${missing.join('\n  ')}`);
  });
});
