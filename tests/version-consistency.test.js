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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');
const faqDir = path.join(rootDir, 'faq');

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

// The versioned .js surface is frontend/ plus the standalone faq/ page: the
// same set bump-version.mjs stamps, kept in lockstep so the guardrail and the
// bumper cannot disagree about which imports must carry ?v=.
function collectVersionedJsFiles() {
  return [...collectFrontendJsFiles(frontendDir), ...collectFrontendJsFiles(faqDir)];
}

// ============================================
// Import version consistency
// ============================================

describe('import version consistency', () => {
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

  it('faq/index.html import versions match the canonical version', () => {
    // The standalone FAQ page (moved to /faq/ in #567) loads ./script.js and
    // ../features/shared/text-selection.js with their own ?v= markers, stamped
    // by bump-version.mjs. Guard that they stay present and on the canonical
    // version, so a returning reader can't be served stale FAQ code after a bump.
    const faqHtml = fs.readFileSync(path.join(faqDir, 'index.html'), 'utf-8');
    const versionJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'version.json'), 'utf-8'));
    const faqVersions = new Set([...faqHtml.matchAll(/\?v=(\d+\.\d+\.\d+)/g)].map((m) => m[1]));

    assert.strictEqual(faqVersions.size, 1,
      `faq/index.html has ${faqVersions.size} distinct ?v= versions: ${[...faqVersions].join(', ')}`);
    assert.strictEqual([...faqVersions][0], versionJson.version,
      `faq/index.html ?v= (${[...faqVersions][0]}) must match version.json version (${versionJson.version}).`);
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
