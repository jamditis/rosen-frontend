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
const SHIPPED_CONTENT_ROOTS = [
  'frontend',
  'dissertation',
  'faq',
  'dissertation-launch',
  'features/participate',
  'features/shared',
  'features/winer-method',
  'tools/active',
];
const SHIPPED_CONTENT_FILES = [
  'index.html',
  'shared-styles.css',
  'version.json',
  'metadata.json',
  '.htaccess',
  'ADDING-RECORDS.md',
];
const TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.md']);
const RETIRED_TOOL_REFERENCES = [
  ['comparison tool copy', /\bcomparison tools?\b/i],
  ['retired timeline source', /sources:\s*\[[^\]]*['"]Timeline['"]/i],
  ['retired dissertation route', /dissertation\/(?:comparison|concepts|context|excerpts|glossary|timeline)\//i],
  ['retired tool directory', /\.\/(?:comparison-tool|context-1986|annotated-excerpts|glossary|timeline)\//i],
];

function collectShippedContentFiles() {
  const files = SHIPPED_CONTENT_FILES.map((rel) => path.join(rootDir, rel));
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(fullPath);
      }
    }
  };
  for (const rel of SHIPPED_CONTENT_ROOTS) walk(path.join(rootDir, rel));
  return files;
}

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

  it('shipped content does not reference retired dissertation tools', () => {
    const staleReferences = [];
    for (const filePath of collectShippedContentFiles()) {
      const source = fs.readFileSync(filePath, 'utf-8');
      for (const [label, pattern] of RETIRED_TOOL_REFERENCES) {
        if (pattern.test(source)) {
          staleReferences.push(`${path.relative(rootDir, filePath)}: ${label}`);
        }
      }
    }
    assert.deepStrictEqual(staleReferences, [],
      `Shipped content references retired dissertation tools:\n  ${staleReferences.join('\n  ')}`);
  });
});
