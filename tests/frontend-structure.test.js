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
import { Script } from 'node:vm';

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
// Shared-constant resolution
// ============================================

// There is no bundler to resolve identifiers at build time, so a shared constant
// that a module uses but never imports is only discovered when a browser reaches
// that line -- and inside a lazily mounted route the ReferenceError is swallowed
// by the route's error boundary, which shows a generic failure instead of naming
// the module. That is exactly how a missing RELEVANCE_SORT import broke desktop
// search only after a query was typed. This walks every shipped frontend module
// and resolves the SCREAMING_SNAKE_CASE names it references -- the naming shape
// the codebase reserves for cross-module constants -- against what the module
// imports or declares itself.

const frontendModulePaths = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    // dist/ is pre-built Tailwind output, not authored modules.
    if (entry.isDirectory()) {
      if (entry.name === 'dist' || entry.name === 'node_modules') continue;
      frontendModulePaths(full, out);
    } else if (entry.name.endsWith('.js') && !entry.name.startsWith('.')) {
      out.push(full);
    }
  }
  return out;
};

// Comments and string/template contents are not code, and a SCREAMING_SNAKE name
// inside them (a SQL placeholder, a prose mention) is not a reference to resolve.
const withoutCommentsAndStrings = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
  .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
  .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');

const SHARED_CONSTANT = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;

describe('shared constant resolution', () => {
  it('every SCREAMING_SNAKE_CASE constant a frontend module uses is imported or declared there', () => {
    const unresolved = [];

    for (const file of frontendModulePaths(frontendDir)) {
      const source = fs.readFileSync(file, 'utf-8');
      const code = withoutCommentsAndStrings(source);
      const available = new Set();

      // Import clauses: default, namespace, and named bindings alike.
      for (const match of source.matchAll(/\bimport\s+([^;]*?)\s+from\s*['"][^'"]+['"]/g)) {
        for (const name of match[1].matchAll(/[A-Za-z_$][\w$]*/g)) available.add(name[0]);
      }
      for (const match of code.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) {
        available.add(match[1]);
      }
      // Destructured module-scope bindings, e.g. `const { A_B } = opts`.
      for (const match of code.matchAll(/\bconst\s*\{([^}]*)\}/g)) {
        for (const name of match[1].matchAll(/[A-Za-z_$][\w$]*/g)) available.add(name[0]);
      }

      for (const match of code.matchAll(SHARED_CONSTANT)) {
        const before = code.slice(Math.max(0, match.index - 2), match.index);
        const after = code.slice(match.index + match[0].length);
        // A property read (`values.SEARCH_TERM`) or an object key (`SEARCH_TERM:`)
        // names a field, not a binding that has to resolve in this module.
        if (/\.\s*$/.test(before)) continue;
        if (/^\s*:/.test(after)) continue;
        if (available.has(match[0])) continue;
        unresolved.push(`${path.relative(rootDir, file)}: ${match[0]}`);
      }
    }

    assert.deepStrictEqual(unresolved, [],
      `Frontend modules reference constants they neither import nor declare, so the browser `
      + `throws ReferenceError when the line runs: ${unresolved.join(', ')}`);
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
// One child process per module file, about 2s across the frontend. The two classic workers
// parse in-process. vm.SourceTextModule is 45x faster for modules and its SyntaxError carries
// no line number, which is the whole value of the message below. The seconds are deliberate.
function parseAsModule(source) {
  return spawnSync(process.execPath, ['--input-type=module', '--check'], {
    input: source,
    encoding: 'utf-8',
  });
}

// Classic workers are scripts, not modules, so module grammar is the wrong check for them:
// it would accept a static `import` that the browser rejects at registration, turning the
// offline cache off with a green suite. CommonJS is wrong too: its function wrapper permits
// a top-level `return` that a browser script rejects. Script uses ECMAScript Script grammar
// without that wrapper and includes the source line in its SyntaxError stack.
function parseAsScript(source) {
  try {
    new Script(source, { filename: '[stdin]' });
    return { status: 0, stderr: '' };
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { status: 1, stderr: error.stack ?? String(error) };
  }
}

// Which files are classic rather than module, listed rather than sniffed. `sw.js` at the
// root is registered without `{ type: 'module' }` (index.html:111) and does nothing but
// `importScripts('./frontend/sw.js')`, and importScripts can only load a classic script --
// so the implementation it pulls in is classic too, whatever the registration says.
// An explicit list means adding a worker forces a decision here instead of silently
// inheriting module grammar.
const CLASSIC_SCRIPTS = new Set(['sw.js', path.join('frontend', 'sw.js')]);

function parserFor(relativePath) {
  return CLASSIC_SCRIPTS.has(relativePath) ? parseAsScript : parseAsModule;
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

  // The point of the split: a static import is valid module syntax and a SyntaxError in a
  // classic worker, so this is what fails if sw.js is ever routed back through module
  // grammar. Without it the two parsers agree on every file currently in the tree and the
  // distinction could be deleted with the suite still green.
  it('checks classic workers with script grammar', () => {
    const staticImport = parseAsScript('import { thing } from "./thing.js";\n');
    if (staticImport.error) throw staticImport.error;
    assert.notStrictEqual(staticImport.status, 0, 'classic workers accepted a static import');
    assert.match(staticImport.stderr, /Cannot use import statement outside a module/);

    const topLevelReturn = parseAsScript('return 1;\n');
    if (topLevelReturn.error) throw topLevelReturn.error;
    assert.notStrictEqual(topLevelReturn.status, 0, 'classic workers accepted a top-level return');

    const commonJsBinding = parseAsScript('let require;\n');
    if (commonJsBinding.error) throw commonJsBinding.error;
    assert.strictEqual(
      commonJsBinding.status,
      0,
      'classic workers were parsed inside a CommonJS wrapper',
    );
  });

  it('routes both service workers to script grammar', () => {
    assert.ok(parserFor('sw.js') === parseAsScript, 'root bridge must parse as a script');
    assert.ok(
      parserFor(path.join('frontend', 'sw.js')) === parseAsScript,
      'frontend/sw.js is loaded by importScripts, so it must parse as a script',
    );
    assert.ok(parserFor(path.join('frontend', 'app.js')) === parseAsModule);
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
    // The root bridge sits outside frontend/ and so was never checked at all. It is three
    // lines today, which is exactly why an unparseable edit to it would be easy to miss:
    // nothing else here would fail, and the archive would just stop caching offline.
    const rootWorker = path.join(rootDir, 'sw.js');
    if (fs.existsSync(rootWorker)) jsFiles.push(rootWorker);
    assert.ok(jsFiles.length > 0, 'found no frontend JS files to parse');

    const errors = [];
    for (const file of jsFiles) {
      const relative = path.relative(rootDir, file);
      const result = parserFor(relative)(fs.readFileSync(file, 'utf-8'));
      // A fork that never ran is not a syntax error, and blaming the file for it would
      // send the reader to the wrong place.
      if (result.error) throw result.error;
      if (result.status !== 0) {
        errors.push(`${relative}: ${syntaxError(result.stderr)}`);
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
