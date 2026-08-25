import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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
