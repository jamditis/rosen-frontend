import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

test('River of News is archived outside the deployed frontend', () => {
  assert.equal(existsSync('frontend/components/RiverOfNews.js'), false);
  assert.equal(existsSync('archived/frontend-prototypes/RiverOfNews.js'), true);
  assert.match(read('archived/frontend-prototypes/README.md'), /Issue #584/);
});

test('globally loaded discovery assets no longer carry River code or CSS', () => {
  assert.doesNotMatch(read('frontend/index.css'), /\.archive-river/);
  assert.doesNotMatch(read('tests/discovery-design-refresh.test.js'), /RiverOfNews|archive-river/);
  assert.doesNotMatch(read('frontend/utils/recordSort.js'), /RiverOfNews/);
});

test('deployment and current-status contracts retire stale public bytes', () => {
  const deploy = read('backend/scripts/deploy_full_site.py');
  assert.match(deploy, /_REMOTE_PRUNE_FILES:[\s\S]*frontend\/components\/RiverOfNews\.js/);
  assert.match(deploy, /for relpath in remote_prune_files:[\s\S]*_remove_remote_file/);
  assert.match(read('docs/feature-audit/CURRENT_STATUS.md'), /## River of News[\s\S]*Issue #584/);
});
