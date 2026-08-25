import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const archivedFiles = [
  'apply-verdicts.mjs',
  'harness/dedup-summary-ids.mjs',
  'harness/inject-ids.mjs',
  'harness/retest-phase4.mjs',
  'harness/smoke.mjs',
  'harness/serve.py',
  'harness/test-entdis.mjs',
  'harness/test-reader.mjs',
  'harness/test-standalone.mjs',
];

const activeHarnessFiles = [
  'lib.mjs',
  'test-main.mjs',
  'test-svc.mjs',
  'test-modals.mjs',
  'test-distools.mjs',
];

test('completed feature-audit machinery is separate from active coverage', () => {
  for (const path of archivedFiles) {
    assert.equal(existsSync(`docs/feature-audit/${path}`), false, `${path} must leave the active audit tree`);
    assert.equal(existsSync(`docs/feature-audit/archive/${path}`), true, `${path} must remain available as historical evidence`);
  }

  for (const path of activeHarnessFiles) {
    assert.equal(existsSync(`docs/feature-audit/harness/${path}`), true, `${path} remains pinned by current regression coverage`);
  }

  const archiveReadme = readFileSync('docs/feature-audit/archive/README.md', 'utf8');
  assert.match(archiveReadme, /historical evidence/i);
  assert.match(archiveReadme, /Do not run these scripts against current code/i);
});

test('archived feature-audit scripts retain their historical dependencies and data roots', () => {
  const archivedModules = archivedFiles
    .filter(path => path.endsWith('.mjs'))
    .map(path => `docs/feature-audit/archive/${path}`);

  for (const modulePath of archivedModules) {
    const source = readFileSync(modulePath, 'utf8');
    const relativeImports = [...source.matchAll(/from\s+['"](\.\/[^'"]+)['"]/g)];
    for (const [, specifier] of relativeImports) {
      assert.equal(
        existsSync(resolve(dirname(modulePath), specifier)),
        true,
        `${modulePath} must retain ${specifier}`,
      );
    }
  }

  const helper = readFileSync('docs/feature-audit/archive/harness/lib.mjs', 'utf8');
  assert.match(helper, /const auditDir = join\(here, '\.\.', '\.\.'\)/);

  const applyVerdicts = readFileSync('docs/feature-audit/archive/apply-verdicts.mjs', 'utf8');
  assert.match(applyVerdicts, /const auditRoot = join\(here, '\.\.'\)/);
  assert.match(applyVerdicts, /join\(auditRoot, 'feature-stories\.json'\)/);

  const injectIds = readFileSync('docs/feature-audit/archive/harness/inject-ids.mjs', 'utf8');
  assert.match(injectIds, /const root = join\(here, '\.\.', '\.\.'\)/);

  const retest = readFileSync('docs/feature-audit/archive/harness/retest-phase4.mjs', 'utf8');
  assert.match(retest, /join\(dirname\(fileURLToPath\(import\.meta\.url\)\), '\.\.', '\.\.', 'retest-phase4\.json'\)/);
});
