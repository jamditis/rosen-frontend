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

// ============================================
// Import version consistency
// ============================================

describe('import version consistency', () => {
  it('all JS files use the same import version string', () => {
    const jsFiles = [];

    // Collect all JS files in frontend/
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
});

// ============================================
// CACHE_VERSION consistency
// ============================================

describe('CACHE_VERSION', () => {
  it('archiveService.js has a CACHE_VERSION defined', () => {
    const content = fs.readFileSync(path.join(frontendDir, 'services', 'archiveService.js'), 'utf-8');
    const match = content.match(/const CACHE_VERSION\s*=\s*['"](.+?)['"]/);
    assert.ok(match, 'CACHE_VERSION not found in archiveService.js');
    assert.ok(match[1].length > 0, 'CACHE_VERSION is empty');
  });
});

// ============================================
// Import path validity
// ============================================

describe('import path validity', () => {
  it('all local imports in App.js reference existing files', () => {
    const content = fs.readFileSync(path.join(frontendDir, 'App.js'), 'utf-8');

    // Match import patterns like: from './components/Sidebar.js?v=3.1.0'
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
      'Explorer.js',
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
