import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LIVE_SITE_ROOT,
  verifyLiveArtifacts,
} from '../.github/scripts/verify-live-deploy.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const workflow = fs.readFileSync(
  path.join(root, '.github/workflows/deploy.yml'),
  'utf8',
);

describe('weekly reviewed-main deployment', () => {
  it('runs Friday at 09:17 UTC and can still run by hand', () => {
    assert.match(workflow, /^\s{2}schedule:\s*$/m);
    assert.match(workflow, /^\s{4}- cron: '17 9 \* \* 5'$/m);
    assert.match(workflow, /^\s{2}workflow_dispatch:\s*$/m);
  });

  it('tests the refreshed main checkout before deployment', () => {
    assert.match(workflow, /uses: actions\/checkout@v6[\s\S]*?ref: main/);
    assert.match(
      workflow,
      /uses: actions\/checkout@v6[\s\S]*?ref: main[\s\S]*?fetch-depth: 0/,
      'the full test suite requires a non-shallow main checkout',
    );
    assert.match(workflow, /- name: Refresh main after queue wait[\s\S]*?git checkout --detach FETCH_HEAD/);
    assert.ok(
      workflow.indexOf('- name: Run repository tests') <
        workflow.indexOf('- name: Deploy'),
      'tests must finish before the deploy step',
    );
    assert.match(workflow, /npm test/);
  });

  it('keeps the lossless release queue and verifies only real deployments', () => {
    assert.doesNotMatch(workflow, /^concurrency:/m);
    assert.match(workflow, /- name: Wait for release turn/);
    assert.match(workflow, /id: verify_live/);
    assert.match(workflow, /if: steps\.deploy\.outcome == 'success' && env\.DRY_RUN != 'true'/);
    assert.match(workflow, /node \.github\/scripts\/verify-live-deploy\.mjs/);
  });

  it('always writes a run summary with the tested commit and step outcomes', () => {
    assert.match(workflow, /- name: Write deployment summary/);
    assert.match(workflow, /if: always\(\)/);
    assert.match(workflow, /git rev-parse HEAD/);
    assert.match(workflow, /steps\.tests\.outcome/);
    assert.match(workflow, /steps\.deploy\.outcome/);
    assert.match(workflow, /steps\.verify_live\.outcome/);
    assert.match(workflow, /GITHUB_STEP_SUMMARY/);
  });
});

describe('live deployment verifier', () => {
  it('uses the fixed archive root and verifies exact bytes with cache-busted URLs', async () => {
    assert.equal(LIVE_SITE_ROOT, 'https://pressthink.org/j/rosen-archive/');
    const files = new Map([
      ['version.json', Buffer.from('{"version":"test"}\n')],
      ['data/archive-core.json', Buffer.from('{"records":[]}\n')],
    ]);
    const seen = [];
    const result = await verifyLiveArtifacts({
      artifactPaths: [...files.keys()],
      readLocal: async (relativePath) => files.get(relativePath),
      fetchImpl: async (url, options) => {
        seen.push({ url: String(url), options });
        const relativePath = new URL(url).pathname.replace(
          '/j/rosen-archive/',
          '',
        );
        return new Response(files.get(relativePath), { status: 200 });
      },
      runId: 'unit-test',
      attempts: 1,
      sleep: async () => {},
    });

    assert.equal(result.length, 2);
    assert.deepEqual(
      result.map((entry) => entry.sha256),
      [...files.values()].map((bytes) =>
        crypto.createHash('sha256').update(bytes).digest('hex')),
    );
    assert.ok(seen.every(({ url }) => url.includes('deploy_verify=unit-test-1')));
    assert.ok(seen.every(({ options }) => options.redirect === 'error'));
    assert.ok(seen.every(({ options }) => options.signal instanceof AbortSignal));
  });

  it('retries byte mismatches and fails when live content never matches', async () => {
    let calls = 0;
    await assert.rejects(
      verifyLiveArtifacts({
        artifactPaths: ['version.json'],
        readLocal: async () => Buffer.from('local'),
        fetchImpl: async () => {
          calls += 1;
          return new Response('stale', { status: 200 });
        },
        runId: 'retry-test',
        attempts: 3,
        sleep: async () => {},
      }),
      /did not match after 3 attempts/,
    );
    assert.equal(calls, 3);
  });
});
