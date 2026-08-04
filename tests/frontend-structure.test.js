/**
 * Frontend structure tests
 *
 * Validates that the frontend codebase has consistent structure,
 * all components export defaults, and no broken references exist.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');

// ============================================
// Component export structure
// ============================================

describe('component exports', () => {
  it('all components have a default export', () => {
    const componentsDir = path.join(frontendDir, 'components');
    // Exclude data-only files (they export named constants, not components)
    const dataFiles = new Set(['dissertationData.js']);
    const componentFiles = fs.readdirSync(componentsDir)
      .filter(f => f.endsWith('.js') && !f.startsWith('.') && !dataFiles.has(f));

    const missingExports = [];

    for (const file of componentFiles) {
      const content = fs.readFileSync(path.join(componentsDir, file), 'utf-8');
      if (!content.includes('export default')) {
        missingExports.push(file);
      }
    }

    assert.strictEqual(missingExports.length, 0,
      `Components missing default export: ${missingExports.join(', ')}`);
  });

  it('all components import html from html.js', () => {
    const componentsDir = path.join(frontendDir, 'components');
    const componentFiles = fs.readdirSync(componentsDir)
      .filter(f => f.endsWith('.js') && !f.startsWith('.'));

    const missingHtml = [];

    for (const file of componentFiles) {
      const content = fs.readFileSync(path.join(componentsDir, file), 'utf-8');
      // Components that use html tagged template literals need the import
      if (content.includes('html`') && !content.includes("from '../html.js")) {
        missingHtml.push(file);
      }
    }

    assert.strictEqual(missingHtml.length, 0,
      `Components using html template but missing html.js import: ${missingHtml.join(', ')}`);
  });
});

// ============================================
// HTML entry point
// ============================================

describe('index.html structure', () => {
  let indexContent;

  it('exists and is valid HTML', () => {
    indexContent = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
    assert.ok(indexContent.includes('<!DOCTYPE html>'), 'Missing DOCTYPE');
    assert.ok(indexContent.includes('<html'), 'Missing html tag');
    assert.ok(indexContent.includes('</html>'), 'Missing closing html tag');
  });

  it('has a root div for React', () => {
    indexContent = indexContent || fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
    assert.ok(indexContent.includes('id="root"'), 'Missing root div');
  });

  it('loads the main entry point', () => {
    indexContent = indexContent || fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
    assert.ok(indexContent.includes('frontend/index.js'), 'Missing main entry point script');
  });

  it('has an import map with required dependencies', () => {
    indexContent = indexContent || fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
    assert.ok(indexContent.includes('"importmap"'), 'Missing import map');
    assert.ok(indexContent.includes('"react"'), 'Missing react in import map');
    assert.ok(indexContent.includes('"react-dom/client"'), 'Missing react-dom in import map');
    assert.ok(indexContent.includes('"htm"'), 'Missing htm in import map');
    assert.ok(indexContent.includes('"lucide-react"'), 'Missing lucide-react in import map');
  });

  it('has meta tags for SEO', () => {
    indexContent = indexContent || fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
    assert.ok(indexContent.includes('meta name="description"'), 'Missing meta description');
    assert.ok(indexContent.includes('og:title'), 'Missing Open Graph title');
    assert.ok(indexContent.includes('twitter:card'), 'Missing Twitter card');
  });

  it('loads required CSS', () => {
    indexContent = indexContent || fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
    assert.ok(indexContent.includes('index.css'), 'Missing index.css');
    assert.ok(indexContent.includes('tailwind.css'), 'Missing tailwind.css');
  });

  it('loads Google Fonts', () => {
    indexContent = indexContent || fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
    assert.ok(indexContent.includes('fonts.googleapis.com'), 'Missing Google Fonts');
    assert.ok(indexContent.includes('Special+Elite'), 'Missing Special Elite font');
    assert.ok(indexContent.includes('Roboto+Mono'), 'Missing Roboto Mono font');
  });

  it('preconnects to esm.sh so the first React import skips the TLS handshake (#283)', () => {
    indexContent = indexContent || fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
    assert.match(indexContent, /<link\s+rel="preconnect"\s+href="https:\/\/esm\.sh"/,
      'Missing esm.sh preconnect; every cold visit pays the module-CDN handshake on the critical path');
  });

  it('does not prefetch the multi-MB combined archive-data.json (#283)', () => {
    indexContent = indexContent || fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
    // The production app loads the split files (archive-core/details/entities);
    // a prefetch of the combined fallback downloads ~28MB no cold visit consumes.
    assert.doesNotMatch(indexContent, /rel="prefetch"[^>]*archive-data\.json/,
      'index.html prefetches archive-data.json -- a multi-MB cold-start payload the app never reads');
  });
});

// ============================================
// CSS files
// ============================================

describe('CSS files', () => {
  it('index.css exists', () => {
    assert.ok(fs.existsSync(path.join(frontendDir, 'index.css')));
  });

  it('compiled tailwind.css exists', () => {
    assert.ok(fs.existsSync(path.join(frontendDir, 'dist', 'tailwind.css')));
  });

  it('tailwind.css is not empty', () => {
    const stat = fs.statSync(path.join(frontendDir, 'dist', 'tailwind.css'));
    assert.ok(stat.size > 1000, `tailwind.css is suspiciously small: ${stat.size} bytes`);
  });
});

// ============================================
// Data file existence
// ============================================

describe('data files', () => {
  const requiredDataFiles = [
    'archive-data.json',
    'archive-core.json',
    'archive-details.json',
    'archive-entities.json',
    'archive_records-public.csv',
    'social_posts.csv',
    'extracted_entities.csv',
    'extracted_relationships.csv',
    'export-archive-data.js'
  ];

  for (const file of requiredDataFiles) {
    it(`${file} exists and is not empty`, () => {
      const filePath = path.join(rootDir, 'data', file);
      assert.ok(fs.existsSync(filePath), `Missing: ${file}`);
      const stat = fs.statSync(filePath);
      assert.ok(stat.size > 0, `${file} is empty`);
    });
  }
});

// ============================================
// Key frontend files
// ============================================

describe('key frontend files', () => {
  const requiredFiles = [
    'index.js',
    'App.js',
    'constants.js',
    'html.js',
    'index.css'
  ];

  for (const file of requiredFiles) {
    it(`frontend/${file} exists`, () => {
      assert.ok(fs.existsSync(path.join(frontendDir, file)), `Missing: frontend/${file}`);
    });
  }
});

// ============================================
// JS syntax check
// ============================================

// This used to count { against } and allow a drift of five, which passed every file
// whose braces happened to balance. A missing operand, a stray comma, an unclosed
// paren: all invisible to it, and a genuine unclosed brace slipped through as long as
// the count stayed within tolerance. Node's own parser answers the real question.
//
// Always through stdin with an explicit --input-type=module. `node --check <file>` takes
// its grammar from the nearest package.json to that file, and outside a module package it
// parses as a sloppy script, which accepts `with`, octal literals, and duplicate parameter
// names that are all SyntaxErrors in a module. This package is type: module today, so the
// two forms agree; passing the source in means a stray nested package.json cannot quietly
// loosen the grammar later.
//
// One process per file, about 2s across the frontend. vm.SourceTextModule is 45x faster
// and its SyntaxError carries no line number, which is the whole value of the message
// below. The seconds are bought deliberately.
function parseAsModule(source) {
  return spawnSync(process.execPath, ['--input-type=module', '--check'], {
    input: source,
    encoding: 'utf-8',
  });
}

// Node prints `[stdin]:<line>`, then the offending source line, then the message. Anchor
// the match on the start of a line: a real message begins one, an echoed source line that
// happens to contain "Error:" (a throw, a log string, a comment) does not.
function syntaxError(stderr) {
  const lines = String(stderr).split('\n');
  const message = lines.find((l) => /^[A-Za-z]*Error: /.test(l))?.trim() ?? 'did not parse';
  const where = /^\[stdin\]:(\d+)$/.exec(lines[0] ?? '');
  return where ? `line ${where[1]}: ${message}` : message;
}

describe('JS syntax', () => {
  // A checker that accepts everything reports a green suite and guards nothing, which is
  // how the brace count survived as long as it did. Prove it still says no.
  it('rejects source that does not parse', () => {
    const result = parseAsModule('export const f = () => {\n  const x = 1 +;\n  return x;\n};\n');
    if (result.error) throw result.error;
    assert.notStrictEqual(result.status, 0, 'the syntax check accepted invalid source');
    assert.match(result.stderr, /SyntaxError/);
  });

  // The case above fails under every grammar node has, so it proves the checker says no
  // but nothing about which grammar. `with` is legal in a sloppy script and a SyntaxError
  // in a module, so this is the assertion that fails if parseAsModule is ever simplified
  // back to `node --check <file>` and a nested package.json turns up.
  it('parses as a module, not as a sloppy script', () => {
    const result = parseAsModule('var o = {};\nwith (o) {}\n');
    if (result.error) throw result.error;
    assert.notStrictEqual(result.status, 0, 'the syntax check is not using module grammar');
  });

  it('parses every frontend JS file', () => {
    const jsFiles = [];

    function walkDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== 'dist' && entry.name !== 'node_modules') {
          walkDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
          jsFiles.push(fullPath);
        }
      }
    }

    walkDir(frontendDir);
    assert.ok(jsFiles.length > 0, 'found no frontend JS files to parse');

    const errors = [];
    for (const file of jsFiles) {
      const result = parseAsModule(fs.readFileSync(file, 'utf-8'));
      // A fork that never ran is not a syntax error, and blaming the file for it would
      // send the reader to the wrong place.
      if (result.error) throw result.error;
      if (result.status !== 0) {
        errors.push(`${path.relative(rootDir, file)}: ${syntaxError(result.stderr)}`);
      }
    }

    assert.strictEqual(errors.length, 0, `Syntax errors:\n${errors.join('\n')}`);
  });
});

// ============================================
// Dissertation data
// ============================================

describe('dissertation data', () => {
  it('dissertationData.js exists and has content', () => {
    const dissPath = path.join(frontendDir, 'components', 'dissertationData.js');
    assert.ok(fs.existsSync(dissPath));
    const content = fs.readFileSync(dissPath, 'utf-8');
    assert.ok(content.includes('DISSERTATION_NODES'), 'Missing DISSERTATION_NODES');
  });

  it('constants.js has FEATURED_WORKS', () => {
    const content = fs.readFileSync(path.join(frontendDir, 'constants.js'), 'utf-8');
    assert.ok(content.includes('FEATURED_WORKS'), 'Missing FEATURED_WORKS');
    assert.ok(content.includes('DATA_CONFIG'), 'Missing DATA_CONFIG');
    assert.ok(content.includes('ERAS'), 'Missing ERAS');
  });
});
