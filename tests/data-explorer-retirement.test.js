import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const deploy = readFileSync('backend/scripts/deploy_full_site.py', 'utf8');
const deploymentGuide = readFileSync('DEPLOYMENT.md', 'utf8');
const htaccess = readFileSync('.htaccess', 'utf8');
const auditStatus = readFileSync('docs/feature-audit/CURRENT_STATUS.md', 'utf8');
const prototypeReadme = readFileSync('tools/active/dataexplorer/README.md', 'utf8');

function pythonTuple(name) {
  const match = deploy.match(new RegExp(`${name}\\s*:[^=]*=\\s*\\(([\\s\\S]*?)\\)`));
  assert.ok(match, `deploy_full_site.py must define ${name}`);
  return [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map(item => item[1]);
}

test('retains the hardened data explorer source as an internal prototype', () => {
  assert.ok(existsSync('tools/active/dataexplorer/data_explorer_grid.html'));
  assert.match(prototypeReadme, /Status: internal; not deployed/i);
  assert.match(prototypeReadme, /committed local archive artifacts/i);
  assert.match(auditStatus, /Issue #583 supersedes/);
});

test('excludes the prototype from uploads and prunes a stale public copy', () => {
  assert.ok(!pythonTuple('_DEPLOY_DIRS').includes('tools/active/dataexplorer'));
  assert.deepEqual(
    pythonTuple('_REMOTE_INTERNAL_PRUNE_DIRS'),
    ['tools/active/dataexplorer'],
  );
  assert.match(
    deploy,
    /_REMOTE_PRUNE_TARGETS\s*:[^=]*=\s*\(\s*\*_REMOTE_PRUNE_DIRS,\s*\*_REMOTE_INTERNAL_PRUNE_DIRS,\s*\)/,
  );
  assert.match(
    deploy,
    /remote_prune_dirs:\s*Iterable\[str\]\s*=\s*_REMOTE_PRUNE_TARGETS/,
  );
  assert.match(
    deploy,
    /len\(_REMOTE_INTERNAL_PRUNE_DIRS\)[\s\S]*internal[\s\S]*prototype director/,
  );
  assert.match(deploymentGuide, /tools\/active\/dataexplorer\/.*Internal prototype/s);
});

test('does not widen production CSP for the internal Google Sheet prototype', () => {
  const policy = htaccess.match(/Header set Content-Security-Policy "([^"]+)"/)?.[1];
  assert.ok(policy, 'Content-Security-Policy header is missing');
  assert.match(policy, /connect-src 'self' https:\/\/esm\.sh https:\/\/script\.google\.com;/);
  assert.doesNotMatch(policy, /docs\.google\.com/);
  assert.doesNotMatch(policy, /googleusercontent\.com/);
});
