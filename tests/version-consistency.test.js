/**
 * Version consistency tests
 *
 * Verifies that all JS import version strings match across the codebase,
 * and that cache versions are consistent.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectVersionedFiles } from '../scripts/bump-version.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');
const faqDir = path.join(rootDir, 'faq');
const deployScriptPath = path.join(rootDir, 'backend', 'scripts', 'deploy_full_site.py');

// Recursively collect every .js file under a directory, skipping build output
// (dist/) and dependencies (node_modules/).
function collectFrontendJsFiles(dir = frontendDir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'dist' && entry.name !== 'node_modules') {
      collectFrontendJsFiles(fullPath, acc);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      acc.push(fullPath);
    }
  }
  return acc;
}

// Local-import completeness is enforced for the app and FAQ JavaScript here;
// the canonical-marker test above this helper covers the broader browser-file
// surface returned by bump-version.mjs, including standalone features.
function collectVersionedJsFiles() {
  return [...collectFrontendJsFiles(frontendDir), ...collectFrontendJsFiles(faqDir)];
}

function deployedFeatureDirs() {
  const deployScript = fs.readFileSync(deployScriptPath, 'utf-8');
  const block = deployScript.match(/_DEPLOY_DIRS\s*:[^=]*=\s*\(([\s\S]*?)\)/);
  assert.ok(block, 'deploy_full_site.py must declare _DEPLOY_DIRS');
  return [...block[1].matchAll(/['"](features\/[^'"]+)['"]/g)]
    .map((match) => path.join(rootDir, match[1]));
}

// ============================================
// Import version consistency
// ============================================

describe('import version consistency', () => {
  it('every deployed feature cacheable local reference is versioned and canonical', () => {
    const canonical = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'version.json'), 'utf-8'),
    ).version;
    const invalid = [];
    const scan = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(file);
          continue;
        }
        if (!entry.isFile() || !/\.(?:html|js)$/.test(entry.name)) continue;
        const content = fs.readFileSync(file, 'utf-8');
        const patterns = entry.name.endsWith('.html')
          ? [/(?:src|href)=['"]((?:\.\.?\/)+[^'"?#]+\.(?:js|css))(\?v=(\d+\.\d+\.\d+))?['"]/g]
          : [/(?:\bfrom\s+|\bimport\s*)['"]((?:\.\.?\/)+[^'"?#]+\.js)(\?v=(\d+\.\d+\.\d+))?['"]/g];
        for (const pattern of patterns) {
          for (const match of content.matchAll(pattern)) {
            if (match[3] !== canonical) {
              invalid.push(`${path.relative(rootDir, file)} -> ${match[1]}${match[2] || ''}`);
            }
          }
        }
      }
    };

    for (const dir of deployedFeatureDirs()) scan(dir);
    assert.deepStrictEqual(invalid, [],
      `Deployed feature refs missing ?v=${canonical} or using another version: ${invalid.join(', ')}`);
  });

  it('keeps the participation stylesheet on the cache-busted release surface', () => {
    const canonical = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'version.json'), 'utf-8'),
    ).version;
    const participateHtml = fs.readFileSync(
      path.join(rootDir, 'features', 'participate', 'index.html'),
      'utf-8',
    );

    assert.match(
      participateHtml,
      new RegExp(`href=["']\\./styles\\.css\\?v=${canonical}["']`),
      'features/participate/index.html must cache-bust its local stylesheet',
    );
  });

  it('every cache-busting marker on the complete bump surface is canonical', () => {
    const canonical = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'version.json'), 'utf-8'),
    ).version;
    const drift = [];

    for (const file of collectVersionedFiles(rootDir)) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf-8');
      for (const match of content.matchAll(/\?v=(\d+\.\d+\.\d+)/g)) {
        if (match[1] !== canonical) {
          drift.push(`${path.relative(rootDir, file)}: ${match[1]}`);
        }
      }
    }

    assert.deepStrictEqual(drift, [],
      `Version markers outside the canonical ${canonical} release: ${drift.join(', ')}`);
  });

  it('all JS files use the same import version string', () => {
    const jsFiles = collectVersionedJsFiles();

    // Extract all version strings from import statements
    const versionPattern = /\?v=(\d+\.\d+\.\d+)/g;
    const versionsByFile = {};
    const allVersions = new Set();

    for (const file of jsFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const versions = [];
      let match;
      while ((match = versionPattern.exec(content)) !== null) {
        versions.push(match[1]);
        allVersions.add(match[1]);
      }
      if (versions.length > 0) {
        versionsByFile[path.relative(rootDir, file)] = [...new Set(versions)];
      }
    }

    // All versions should be the same
    assert.strictEqual(allVersions.size, 1,
      `Found ${allVersions.size} different versions: ${[...allVersions].join(', ')}. Files: ${JSON.stringify(versionsByFile, null, 2)}`);
  });

  it('index.html version strings match frontend JS versions', () => {
    const indexContent = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
    const appContent = fs.readFileSync(path.join(frontendDir, 'App.js'), 'utf-8');

    const indexVersions = new Set();
    const appVersions = new Set();

    const pattern = /\?v=(\d+\.\d+\.\d+)/g;

    let match;
    while ((match = pattern.exec(indexContent)) !== null) {
      indexVersions.add(match[1]);
    }

    pattern.lastIndex = 0;
    while ((match = pattern.exec(appContent)) !== null) {
      appVersions.add(match[1]);
    }

    // index.html should only have one version
    assert.strictEqual(indexVersions.size, 1,
      `index.html has ${indexVersions.size} different versions: ${[...indexVersions].join(', ')}`);

    // App.js should only have one version
    assert.strictEqual(appVersions.size, 1,
      `App.js has ${appVersions.size} different versions: ${[...appVersions].join(', ')}`);

    // They should match
    const indexVersion = [...indexVersions][0];
    const appVersion = [...appVersions][0];
    assert.strictEqual(indexVersion, appVersion,
      `index.html uses v${indexVersion} but App.js uses v${appVersion}`);
  });

  it('all local JS imports include a ?v= version query string', () => {
    // CLAUDE.md rule 5: every local .js import must carry the cache-busting
    // ?v= query, or a browser can serve a stale cached copy after a deploy.
    // The version-equality test above only compares versioned imports to each
    // other — an import with no version at all slips past it, so this check
    // exists to catch that case.
    const jsFiles = collectVersionedJsFiles();

    // Matches `from './foo.js'` / `from '../foo.js'` including the
    // `export ... from` re-export form. Group 2 captures the version query,
    // if present; a missing group 2 means the import is unversioned.
    const localImportPattern = /\bfrom\s+['"](\.\.?\/[^'"]+\.js)(\?v=[^'"]+)?['"]/g;
    const unversioned = [];

    for (const file of jsFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const match of content.matchAll(localImportPattern)) {
        if (!match[2]) {
          unversioned.push(`${path.relative(rootDir, file)} -> ${match[1]}`);
        }
      }
    }

    assert.strictEqual(unversioned.length, 0,
      `Found ${unversioned.length} unversioned local import(s):\n  ${unversioned.join('\n  ')}`);
  });

  it('every faq/index.html module import is versioned and canonical', () => {
    // The standalone FAQ page (moved to /faq/ in #567) loads local .js outside
    // the app bundle, stamped by bump-version.mjs. Every such reference — via a
    // <script src> or an `import ... from` — must carry ?v=, or a returning
    // reader is served stale FAQ code under the .htaccess one-week JS cache.
    // Asserting "the versions present are canonical" is not enough: an import
    // that drops ?v= entirely would slip past that, and the .js-only unversioned
    // check above never scans HTML. So require a version on every local .js ref.
    const faqHtml = fs.readFileSync(path.join(faqDir, 'index.html'), 'utf-8');
    const versionJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'version.json'), 'utf-8'));

    // Group 1: the local .js path. Group 2 (optional): its ?v= query.
    const localJsRef = /(?:src=|from\s+)['"](\.\.?\/[^'"]+\.js)(\?v=\d+\.\d+\.\d+)?['"]/g;
    const refs = [...faqHtml.matchAll(localJsRef)];

    assert.ok(refs.length >= 2,
      `expected at least the script.js and text-selection.js imports in faq/index.html, found ${refs.length}`);

    const unversioned = refs.filter((m) => !m[2]).map((m) => m[1]);
    assert.strictEqual(unversioned.length, 0,
      `faq/index.html has unversioned local .js import(s): ${unversioned.join(', ')}`);

    const versions = new Set(refs.map((m) => m[2].slice('?v='.length)));
    assert.strictEqual(versions.size, 1,
      `faq/index.html has ${versions.size} distinct import versions: ${[...versions].join(', ')}`);
    assert.strictEqual([...versions][0], versionJson.version,
      `faq/index.html import version (${[...versions][0]}) must match version.json (${versionJson.version}).`);
  });
});

// ============================================
// CACHE_VERSION consistency
// ============================================

describe('CACHE_VERSION', () => {
  it('cacheConfig.js has a CACHE_VERSION defined', () => {
    // The data-cache version lives in services/cacheConfig.js (#487), shared by
    // archiveService.js and loaders/httpCachedLoader.js so the two cache paths
    // cannot drift. (Separate from sw.js's CACHE_VERSION, checked below.)
    const content = fs.readFileSync(path.join(frontendDir, 'services', 'cacheConfig.js'), 'utf-8');
    const match = content.match(/const CACHE_VERSION\s*=\s*['"](.+?)['"]/);
    assert.ok(match, 'CACHE_VERSION not found in cacheConfig.js');
    assert.ok(match[1].length > 0, 'CACHE_VERSION is empty');
  });

  // #430: the service worker serves static JS cache-first and matches with
  // `ignoreSearch: true`, so a `?v=` bump does NOT invalidate it — only its
  // CACHE_VERSION (the cache name) does. The sw.js comment says CACHE_VERSION is
  // "tied to the app version in version.json", but nothing enforced it, so a
  // deploy that bumped `?v=` / version.json but forgot sw.js shipped stale JS to
  // returning visitors. These tests make that lockstep a CI-enforced invariant.
  // (This is the app-version cache name in sw.js, a separate concept from
  // archiveService.js's data-cache version, which tracks version.json.cache_version.)
  const readSwCacheVersion = () => {
    const sw = fs.readFileSync(path.join(frontendDir, 'sw.js'), 'utf-8');
    const swMatch = sw.match(/const CACHE_VERSION\s*=\s*['"](.+?)['"]/);
    assert.ok(swMatch, 'CACHE_VERSION not found in frontend/sw.js');
    return swMatch[1];
  };

  it('frontend/sw.js CACHE_VERSION matches version.json version', () => {
    const swVersion = readSwCacheVersion();
    const versionJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'version.json'), 'utf-8'));
    assert.strictEqual(swVersion, versionJson.version,
      `sw.js CACHE_VERSION (${swVersion}) must match version.json version (${versionJson.version}). ` +
      'Bump sw.js CACHE_VERSION in lockstep on deploy, or returning visitors keep stale JS.');
  });

  it('frontend/sw.js CACHE_VERSION matches the index.html import version', () => {
    const swVersion = readSwCacheVersion();
    const indexContent = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
    const indexVersions = new Set(
      [...indexContent.matchAll(/\?v=(\d+\.\d+\.\d+)/g)].map((m) => m[1]),
    );
    assert.strictEqual(indexVersions.size, 1,
      `index.html has ${indexVersions.size} different ?v= versions: ${[...indexVersions].join(', ')}`);
    assert.strictEqual(swVersion, [...indexVersions][0],
      `sw.js CACHE_VERSION (${swVersion}) must match index.html ?v= version (${[...indexVersions][0]}).`);
  });
});

// ============================================
// Import path validity
// ============================================

describe('import path validity', () => {
  it('all local imports in App.js reference existing files', () => {
    const content = fs.readFileSync(path.join(frontendDir, 'App.js'), 'utf-8');

    // Match import patterns like: from './components/Sidebar.js?v=3.2.0'
    const importPattern = /from\s+['"](\.\/.+?)(?:\?v=[^'"]+)?['"]/g;
    const missingFiles = [];

    let match;
    while ((match = importPattern.exec(content)) !== null) {
      const importPath = match[1];
      // Skip CDN imports
      if (importPath.startsWith('http')) continue;

      const resolvedPath = path.resolve(frontendDir, importPath);
      if (!fs.existsSync(resolvedPath)) {
        missingFiles.push(importPath);
      }
    }

    assert.strictEqual(missingFiles.length, 0,
      `App.js imports ${missingFiles.length} missing files: ${missingFiles.join(', ')}`);
  });

  it('all component files exist', () => {
    const expectedComponents = [
      'Sidebar.js',
      'FeaturedSection.js',
      'Timeline.js',
      'RecordModal.js',
      'RecordView.js',
      'WelcomeModal.js',
      'DissertationPage.js',
      'MindMap.js',
      'DetailPanel.js',
      'ThreadModal.js',
      'LoadingQuotes.js',
      'AboutPage.js',
      'ToolsModal.js',
      'WorkInProgressBanner.js',
      'EntityBrowser.js',
      'AnalyticsDashboard.js',
      'QueryBuilder.js'
    ];

    const componentsDir = path.join(frontendDir, 'components');
    const missingComponents = [];

    for (const component of expectedComponents) {
      if (!fs.existsSync(path.join(componentsDir, component))) {
        missingComponents.push(component);
      }
    }

    assert.strictEqual(missingComponents.length, 0,
      `Missing components: ${missingComponents.join(', ')}`);
  });

  it('all service files exist', () => {
    const expectedServices = ['archiveService.js', 'sqliteService.js'];
    const servicesDir = path.join(frontendDir, 'services');

    for (const service of expectedServices) {
      assert.ok(fs.existsSync(path.join(servicesDir, service)),
        `Missing service: ${service}`);
    }
  });
});
