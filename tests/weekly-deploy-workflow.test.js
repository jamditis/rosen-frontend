import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LIVE_SITE_ROOT,
  publishedReleaseArtifactPaths,
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
    assert.match(
      workflow,
      /PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:\s*'1'/,
      'npm ci must skip unused Playwright browsers before a production deploy',
    );
    assert.match(workflow, /fetch-depth:\s*0\s*\n\s+lfs:\s*false/);
    assert.doesNotMatch(
      workflow,
      /fetch-depth:\s*0\s*\n\s+lfs:\s*true/,
      'a full-history checkout must not also download every historical LFS blob',
    );
    assert.match(
      workflow,
      /Refresh main after queue wait[\s\S]*?git lfs pull/,
      'the detached tested commit still needs the current dissertation PDF',
    );
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
  it('covers all public release payloads and newly tracked feeds without private inputs', (t) => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'rosen-release-paths-'));
    t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
    execFileSync('git', ['init', '-q', fixture]);
    for (const file of [
      'data/feeds/categories/new-feed.xml',
      'data/archive-social-embeddings-build.json',
      'features/making-of/index.html',
    ]) {
      fs.mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true });
      fs.writeFileSync(path.join(fixture, file), 'fixture');
      execFileSync('git', ['add', '--', file], { cwd: fixture });
    }
    fs.writeFileSync(path.join(fixture, 'data/feeds/private-scratch.xml'), 'untracked');
    const paths = publishedReleaseArtifactPaths(fixture);
    for (const required of [
      'version.json', 'index.html', 'frontend/sw.js', 'frontend/services/cacheConfig.js',
      'data/archive-data.json', 'data/archive-core.json', 'data/archive-details.json',
      'data/archive-entities.json', 'data/archive-analytics.json', 'data/search-index.json',
      'data/social-search-index.json', 'data/archive-social-embeddings.json',
      'data/archive-social-embeddings.bin', 'data/relationship-adjacency-manifest.json',
      'data/feeds/categories/new-feed.xml',
    ]) assert.ok(paths.includes(required), `${required} must be verified`);
    for (const nibble of '0123456789abcdef') {
      assert.ok(paths.includes(`data/relationship-adjacency-${nibble}.json`));
    }
    assert.ok(!paths.includes('data/archive-social-embeddings-build.json'));
    assert.ok(!paths.includes('features/making-of/index.html'));
    assert.ok(!paths.includes('data/feeds/private-scratch.xml'));
  });

  it('rejects stale details, search, vectors and feeds when the entry point and core match', async () => {
    const paths = publishedReleaseArtifactPaths();
    const feed = paths.find(file => file.startsWith('data/feeds/') && file.endsWith('.xml'));
    assert.ok(feed, 'the committed release must contain an RSS feed');
    for (const stalePath of [
      'data/archive-details.json', 'data/social-search-index.json',
      'data/archive-social-embeddings.bin', feed,
    ]) {
      await assert.rejects(verifyLiveArtifacts({
        readLocal: async relativePath => Buffer.from(`current:${relativePath}`),
        fetchImpl: async url => {
          const relativePath = new URL(url).pathname.replace('/j/rosen-archive/', '');
          return new Response(relativePath === stalePath
            ? 'stale payload'
            : `current:${relativePath}`);
        },
        attempts: 1,
        sleep: async () => {},
      }), error => error.message.startsWith(`${stalePath} did not match`));
    }
  });

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
