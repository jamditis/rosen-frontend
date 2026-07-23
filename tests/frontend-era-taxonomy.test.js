/**
 * Frontend era taxonomy drift guards (#385)
 *
 * The archive data taxonomy lives in data/eras.js. Frontend consumers must
 * derive their options and SQL ordering from that module instead of carrying
 * independent lists that can drift.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ERAS as CANONICAL_ERAS } from '../data/eras.js';
import { ERAS as FRONTEND_ERAS } from '../frontend/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const readSrc = (...parts) => fs.readFileSync(path.join(rootDir, ...parts), 'utf-8');

describe('frontend era taxonomy (#385)', () => {
  it('exports the canonical taxonomy through frontend constants', () => {
    assert.deepEqual(
      FRONTEND_ERAS,
      CANONICAL_ERAS,
      'frontend/constants.js must export the canonical data/eras.js taxonomy'
    );
  });

  it('derives frontend options and SQL ordering from the shared export', () => {
    const constants = readSrc('frontend', 'constants.js');
    const queryBuilder = readSrc('frontend', 'components', 'QueryBuilder.js');
    const sqliteService = readSrc('frontend', 'services', 'sqliteService.js');

    assert.match(
      constants,
      /export\s*\{\s*ERAS\s*\}\s*from\s*['"]\.\.\/data\/eras\.js\?v=\d+\.\d+\.\d+['"]/,
      'frontend/constants.js must re-export ERAS from a versioned data/eras.js import'
    );

    for (const [name, source] of [
      ['QueryBuilder.js', queryBuilder],
      ['sqliteService.js', sqliteService]
    ]) {
      assert.match(
        source,
        /import\s*\{\s*ERAS\s*\}\s*from\s*['"]\.\.\/constants\.js\?v=\d+\.\d+\.\d+['"]/,
        `${name} must import ERAS from versioned frontend/constants.js`
      );
      assert.match(
        source,
        /const\s+eraOrderCase\s*=\s*ERAS\s*\.map\(/,
        `${name} must build its SQL ordering from ERAS`
      );
      assert.match(
        source,
        /\$\{eraOrderCase\}/,
        `${name} must use the generated era ordering in SQL`
      );
      assert.match(
        source,
        /ELSE\s+\$\{ERAS\.length \+ 1\}/,
        `${name} must derive its SQL fallback position from ERAS`
      );
      assert.doesNotMatch(
        source,
        /Web & Blogging \(00s\)/,
        `${name} still contains the stale four-era taxonomy`
      );
    }

    assert.match(
      queryBuilder,
      /options:\s*ERAS\.map\(/,
      'QueryBuilder era options must be generated from ERAS'
    );
    assert.match(
      queryBuilder,
      /default:\s*ERAS\[ERAS\.length - 1\]/,
      'QueryBuilder must default to the final canonical era'
    );
    assert.match(
      queryBuilder,
      /WHERE\s+era\s*=\s*'\$\{values\.ERA\}'/,
      'QueryBuilder must apply the selected canonical era to its record filter'
    );
  });

  it('ships the canonical module with every deployed frontend', () => {
    const deploymentGuide = readSrc('DEPLOYMENT.md');
    const deployScript = readSrc('backend', 'scripts', 'deploy_full_site.py');
    const serviceWorker = readSrc('frontend', 'sw.js');

    assert.match(deploymentGuide, /^\s+eras\.js\s+#/m, 'DEPLOYMENT.md must list data/eras.js');
    assert.match(deployScript, /['"]data\/eras\.js['"]/, 'the full-site deploy must upload data/eras.js');
    assert.match(
      serviceWorker,
      /`\$\{DATA_PATH\}\/eras\.js`/,
      'every app-shell environment must cache data/eras.js'
    );
  });
});
