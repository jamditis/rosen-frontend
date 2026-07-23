import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const workflowSource = (filename) =>
  fs.readFileSync(path.join(root, '.github', 'workflows', filename), 'utf8');

describe('deployment workflow queue', () => {
  it('uses the lossless release queue in every workflow that writes main or production', () => {
    for (const filename of [
      'deploy.yml',
      'submit-record.yml',
      'submit-prototype.yml',
    ]) {
      const source = workflowSource(filename);

      assert.doesNotMatch(source, /^concurrency:/m);
      assert.match(source, /^\s+- name: Wait for release turn$/m);
      assert.match(source, /node \.github\/scripts\/wait-release-turn\.mjs/);
      assert.match(source, /^\s+actions: read$/m);
      assert.match(source, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
      assert.match(source, /RELEASE_QUEUE_TIMEOUT_SECONDS: 18000/);
      assert.match(source, /^\s+timeout-minutes: 360$/m);
    }

    for (const filename of ['submit-record.yml', 'submit-prototype.yml']) {
      const source = workflowSource(filename);
      assert.ok(
        source.indexOf('- name: Wait for release turn') <
          source.indexOf('- name: Mint GitHub App installation token'),
        `${filename} must mint its write token after the queue wait`,
      );
    }
  });
});
