/**
 * Merge-gate coverage contract for the Node test suite (#540, former #507).
 *
 * New root tests must join the shell glob automatically, and the primary
 * frontend workflow must invoke that complete script rather than relying only
 * on hand-maintained subgroup allowlists.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const workflow = fs.readFileSync(
  path.join(repoRoot, '.github', 'workflows', 'frontend-validation.yml'),
  'utf8',
);

function activeNodeTests() {
  return execFileSync('git', ['ls-files', '--', 'tests', 'workers'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(file => file.endsWith('.test.js'));
}

function isCoveredByCanonicalGlobs(file) {
  if (/^tests\/[^/]+\.test\.js$/.test(file)) {
    return packageJson.scripts.test.includes('tests/*.test.js');
  }
  if (/^workers\/source-discovery\/test\/[^/]+\.test\.js$/.test(file)) {
    return packageJson.scripts.test.includes('workers/source-discovery/test/*.test.js');
  }
  return false;
}

describe('complete Node suite merge gate', () => {
  it('keeps every active Node test under a canonical npm test glob', () => {
    assert.match(packageJson.scripts.test, /^node --test\b/);
    const uncovered = activeNodeTests().filter(file => !isCoveredByCanonicalGlobs(file));
    assert.deepEqual(
      uncovered,
      [],
      `Active Node tests outside the canonical npm test globs:\n  ${uncovered.join('\n  ')}`,
    );
  });

  it('runs npm test in Frontend Validation as a required step', () => {
    assert.match(
      workflow,
      /- name: Run complete Node test suite\n\s+run: npm test(?:\s|$)/,
      'frontend-validation.yml must run the complete npm test suite',
    );
  });

  it('runs Frontend Validation for every pull request to main', () => {
    const pullRequestTrigger = workflow.match(/\n  pull_request:\n([\s\S]*?)\n\njobs:/)?.[1] || '';
    assert.match(pullRequestTrigger, /^    branches: \[ main \]$/m);
    assert.doesNotMatch(
      pullRequestTrigger,
      /^    paths(?:-ignore)?:/m,
      'a path filter can skip tests for source files covered by npm test',
    );
  });
});
