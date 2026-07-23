import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';

const read = (path) => fs.readFileSync(path, 'utf8');

function pythonTuple(source, name) {
  const match = source.match(new RegExp(`${name}:[^=]*= \\(([\\s\\S]*?)\\n\\)`));
  assert.ok(match, `${name} tuple must remain parseable`);
  return match[1];
}

describe('retired status report (#633)', () => {
  it('cannot be restored by a full-site deploy', () => {
    const deployScript = read('backend/scripts/deploy_full_site.py');
    const deploymentGuide = read('DEPLOYMENT.md');
    const uploadManifest = deploymentGuide.split('```')[1];

    assert.ok(!fs.existsSync('features/status-report'),
      'the retired status-report source directory must not remain deployable');
    assert.doesNotMatch(
      pythonTuple(deployScript, '_DEPLOY_DIRS'),
      /['"]features\/status-report['"]/,
      'the upload manifest must not resurrect the retired report',
    );
    assert.match(
      pythonTuple(deployScript, '_REMOTE_PRUNE_DIRS'),
      /['"]features\/status-report['"]/,
      'a successful full deploy must remove any stale remote copy',
    );
    assert.doesNotMatch(uploadManifest, /status-report\//,
      'the manual upload manifest must not list the retired report');
    assert.match(deploymentGuide, /Retired routes removed by a full deploy[\s\S]*features\/status-report\//,
      'the deployment guide must document the remote cleanup');
  });

  it('is absent from shipped-content scans and preview routes', () => {
    const menuLinksTest = read('tests/menu-links.test.js');
    const shippedRoots = menuLinksTest.match(/const SHIPPED_CONTENT_ROOTS = \[([\s\S]*?)\n\];/)?.[1];
    const previewAudit = read('scripts/preview-audit.js');
    const routes = previewAudit.match(/const ROUTES = \[([\s\S]*?)\n\];/)?.[1];

    assert.ok(shippedRoots, 'SHIPPED_CONTENT_ROOTS must remain parseable');
    assert.ok(routes, 'preview ROUTES must remain parseable');
    assert.doesNotMatch(shippedRoots, /features\/status-report/);
    assert.doesNotMatch(routes, /features\/status-report|slug: 'status-report'/);
  });

  it('is absent from current architecture documentation', () => {
    assert.doesNotMatch(read('CLAUDE.md'), /status-report|status report/i);
    assert.doesNotMatch(read('docs/narrative/architecture.md'), /status-report|status report/i);
  });
});
