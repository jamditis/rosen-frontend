import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildIngestionReceipt,
  changedPaths,
  finalizePublication,
  postFailedReceipt,
  runPreparation,
  stageCensusCommit,
  stageReleaseCommit,
  validateRecoveryRelease,
} from '../.github/scripts/bluesky-stewardship-publisher.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const START = '1'.repeat(40);
const PUBLISHED = '2'.repeat(40);
const NOW = '2026-10-14T18:47:00.000Z';

function report(rows = 1) {
  return {
    schema_version: 1,
    captured_at: NOW,
    newest_source_time: '2026-10-14T17:30:00.000Z',
    counts: { captured: rows, admitted: rows, context_only: 0 },
    canonical: { rows_appended: rows },
    decisions: Array.from({ length: rows }, (_, index) => ({
      uri: `at://did:plc:3t37x6vfigdzzp2gjcfnzlz4/app.bsky.feed.post/${index}`,
      decision: 'admit',
      record_id: `BSKY-${String(index + 1).padStart(5, '0')}`,
    })),
  };
}

function state() {
  return {
    version: 1,
    phase: 'initialized',
    startCommit: START,
    canonicalCommit: START,
    releaseVersion: '3.8.37',
    report: report(0),
    errorClass: null,
    liveVerified: false,
  };
}

function preparation(overrides = {}) {
  const calls = [];
  const outputs = new Map();
  const api = {
    calls,
    outputs,
    dryRun: false,
    state: state(),
    capture: () => report(),
    verifyLive: () => calls.push('verify'),
    publishChangedRelease: () => {
      calls.push('publish');
      return { canonicalCommit: PUBLISHED, releaseVersion: '3.8.38' };
    },
    validateRecoveryRelease: () => calls.push('recover'),
    persist: (nextState) => calls.push(`persist:${nextState.phase}`),
    emit: (name, value) => outputs.set(name, value),
    ...overrides,
  };
  return api;
}

function gitCommand(directory, args, { trim = true } = {}) {
  const output = execFileSync('git', args, { cwd: directory, encoding: 'utf8' });
  return trim ? output.trim() : output;
}

function gitFixture(t, files) {
  const directory = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'rosen-publisher-git-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  gitCommand(directory, ['init', '-q']);
  gitCommand(directory, ['config', 'user.name', 'Joe Amditis']);
  gitCommand(directory, ['config', 'user.email', '6799804+jamditis@users.noreply.github.com']);
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(directory, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  gitCommand(directory, ['add', '--all']);
  gitCommand(directory, ['commit', '-q', '-m', 'fixture baseline']);
  return directory;
}

describe('Bluesky stewardship preparation used by the CLI', () => {
  it('verifies live state and emits no_change without publishing when no rows are missing', () => {
    const ops = preparation({ capture: () => report(0) });
    const result = runPreparation(ops);
    assert.equal(result.phase, 'no_change');
    assert.equal(ops.outputs.get('needs_deploy'), 'false');
    assert.deepEqual(ops.calls, ['verify', 'persist:no_change']);
  });

  it('records a successful dry run without producing an ingestion receipt', () => {
    const ops = preparation({ dryRun: true });
    const prepared = runPreparation(ops);
    const finalized = finalizePublication(prepared, {
      deployOutcome: 'skipped', verifyOutcome: 'skipped',
      runId: '123_1', checkedAt: NOW,
    });
    assert.equal(prepared.phase, 'dry_run');
    assert.equal(ops.outputs.get('needs_deploy'), 'false');
    assert.equal(finalized.status, 'dry_run');
    assert.equal(finalized.receipt, null);
    assert.deepEqual(ops.calls, ['verify', 'persist:dry_run']);
  });

  it('does not request deployment when changed-release checks fail', () => {
    const ops = preparation({
      publishChangedRelease: () => { throw new Error('tests failed'); },
    });
    assert.throws(() => runPreparation(ops), /tests failed/);
    assert.equal(ops.outputs.get('needs_deploy'), 'false');
    assert.equal(ops.state.phase, 'failed');
  });

  it('retries an already-pushed main without appending or publishing canonical rows again', (t) => {
    const directory = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'rosen-recovery-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const canonical = path.join(directory, 'social_posts.csv');
    const before = 'id,url\nBSKY-00001,https://example.test/one\n';
    fs.writeFileSync(canonical, before);
    const ops = preparation({
      capture: () => report(0),
      verifyLive: () => { throw new Error('live bytes differ'); },
      validateRecoveryRelease: () => {
        validateRecoveryRelease(directory, ops.state, {
          execute: (_root, command, args) => {
            assert.deepEqual([command, ...args], ['npm', 'test']);
            ops.calls.push('tests');
          },
          gitCommand: (_root, args) => {
            if (args[0] === 'status') return '';
            if (args[0] === 'fetch') {
              ops.calls.push('fetch-main');
              return '';
            }
            if (args[0] === 'rev-parse') return START;
            throw new Error(`unexpected git command: ${args.join(' ')}`);
          },
        });
      },
    });
    const prepared = runPreparation(ops);
    assert.equal(prepared.phase, 'recovery_ready');
    assert.equal(ops.outputs.get('needs_deploy'), 'true');
    assert.equal(ops.calls.includes('publish'), false);
    assert.equal(fs.readFileSync(canonical, 'utf8'), before);

    const finalized = finalizePublication(prepared, {
      deployOutcome: 'success', verifyOutcome: 'success',
      runId: '123_2', checkedAt: NOW,
    });
    assert.equal(finalized.status, 'published');
    assert.equal(finalized.receipt.canonicalCommit, START);
    assert.deepEqual(finalized.receipt.records, []);
  });

  it('fails recovery without deployment when main moved after validation', () => {
    const ops = preparation({
      capture: () => report(0),
      verifyLive: () => { throw new Error('live bytes differ'); },
      validateRecoveryRelease: () => validateRecoveryRelease('/tmp', ops.state, {
        execute: () => {},
        gitCommand: (_root, args) => {
          if (args[0] === 'status' || args[0] === 'fetch') return '';
          if (args[0] === 'rev-parse') return '3'.repeat(40);
          throw new Error(`unexpected git command: ${args.join(' ')}`);
        },
      }),
    });
    assert.throws(() => runPreparation(ops), /origin\/main moved/);
    assert.equal(ops.state.errorClass, 'stale_remote_head');
    assert.equal(ops.outputs.get('needs_deploy'), 'false');
  });

  it('emits a failed receipt when a pushed commit fails deployment', () => {
    const pushed = { ...state(), phase: 'pushed', canonicalCommit: PUBLISHED, releaseVersion: '3.8.38' };
    const result = finalizePublication(pushed, {
      deployOutcome: 'failure', verifyOutcome: 'skipped',
      runId: '123_3', checkedAt: NOW,
    });
    assert.equal(result.status, 'failed');
    assert.equal(result.errorClass, 'deploy_failed');
    assert.equal(result.receipt.canonicalCommit, PUBLISHED);
    assert.deepEqual(result.receipt.records, []);
  });
});

describe('Bluesky release staging uses raw Git porcelain records', () => {
  it('keeps the first unstaged release path intact and commits it', (t) => {
    const directory = gitFixture(t, { 'data/social_posts.csv': 'before\n' });
    fs.writeFileSync(path.join(directory, 'data/social_posts.csv'), 'after\n');

    assert.deepEqual(changedPaths(directory), ['data/social_posts.csv']);
    stageReleaseCommit(directory, []);

    assert.equal(gitCommand(directory, ['status', '--porcelain']), '');
    assert.equal(
      gitCommand(directory, ['show', '--pretty=', '--name-only', 'HEAD']),
      'data/social_posts.csv',
    );
  });

  it('explicitly stages newly generated social embedding build metadata', (t) => {
    const directory = gitFixture(t, { 'data/social_posts.csv': 'before\n' });
    const metadataPath = path.join(directory, 'data/archive-social-embeddings-build.json');
    fs.writeFileSync(metadataPath, '{"version":1}\n');

    stageReleaseCommit(directory, []);

    assert.equal(gitCommand(directory, ['status', '--porcelain']), '');
    assert.equal(
      gitCommand(directory, ['show', '--pretty=', '--name-only', 'HEAD']),
      'data/archive-social-embeddings-build.json',
    );
  });

  it('keeps the first unstaged census path intact and commits only census output', (t) => {
    const directory = gitFixture(t, {
      'data/stewardship-census.json': '{"count":1}\n',
      'data/stewardship-census.md': 'Count: 1\n',
    });
    fs.writeFileSync(path.join(directory, 'data/stewardship-census.json'), '{"count":2}\n');

    assert.deepEqual(changedPaths(directory), ['data/stewardship-census.json']);
    stageCensusCommit(directory);

    assert.equal(gitCommand(directory, ['status', '--porcelain']), '');
    assert.equal(
      gitCommand(directory, ['show', '--pretty=', '--name-only', 'HEAD']),
      'data/stewardship-census.json',
    );
  });

  it('refuses an unapproved unstaged path before staging a release commit', (t) => {
    const directory = gitFixture(t, { 'README.md': 'before\n' });
    const initialHead = gitCommand(directory, ['rev-parse', 'HEAD']);
    fs.writeFileSync(path.join(directory, 'README.md'), 'after\n');

    assert.throws(() => stageReleaseCommit(directory, []), /unapproved path: README\.md/);
    assert.equal(gitCommand(directory, ['rev-parse', 'HEAD']), initialHead);
    assert.equal(gitCommand(directory, ['diff', '--cached', '--name-only']), '');
  });

  it('rejects a NUL-delimited rename record', (t) => {
    const directory = gitFixture(t, { 'data/social_posts.csv': 'before\n' });
    gitCommand(directory, ['mv', 'data/social_posts.csv', 'data/archive-data.json']);
    assert.throws(() => changedPaths(directory), /does not allow renamed or copied paths/);
  });
});

describe('Bluesky stewardship receipt and workflow boundary', () => {
  it('retains every validated decision without copying credentials or source payloads', () => {
    const largeReport = report(503);
    largeReport.decisions[1].decision = 'context_only';
    const receipt = buildIngestionReceipt({
      runId: '123_4',
      status: 'published',
      checkedAt: NOW,
      canonicalCommit: PUBLISHED,
      releaseVersion: '3.8.38',
      report: largeReport,
    });
    assert.equal(receipt.version, 1);
    assert.equal(receipt.records.length, 503);
    assert.equal(receipt.records[0].decision, 'accepted');
    assert.equal(receipt.records[1].decision, 'rejected');
    assert.deepEqual(Object.keys(receipt.records[0]), ['uri', 'decision', 'recordId']);
    assert.doesNotMatch(JSON.stringify(receipt), /token|password|raw_text|snapshot/i);
  });

  it('rejects an oversized report instead of silently truncating its decisions', () => {
    assert.throws(() => buildIngestionReceipt({
      runId: '123_oversized', status: 'published', checkedAt: NOW,
      canonicalCommit: PUBLISHED, releaseVersion: '3.8.38', report: report(1001),
    }), /1000-record safety bound/);
  });

  it('rejects duplicate receipt URIs and record IDs', () => {
    const duplicateUri = report(2);
    duplicateUri.decisions[1].uri = duplicateUri.decisions[0].uri;
    assert.throws(() => buildIngestionReceipt({
      runId: '123_duplicate_uri', status: 'published', checkedAt: NOW,
      canonicalCommit: PUBLISHED, releaseVersion: '3.8.38', report: duplicateUri,
    }), /unique URIs and record IDs/);

    const duplicateId = report(2);
    duplicateId.decisions[1].record_id = duplicateId.decisions[0].record_id;
    assert.throws(() => buildIngestionReceipt({
      runId: '123_duplicate_id', status: 'published', checkedAt: NOW,
      canonicalCommit: PUBLISHED, releaseVersion: '3.8.38', report: duplicateId,
    }), /unique URIs and record IDs/);
  });

  it('removes record decisions from failed receipts', () => {
    const receipt = buildIngestionReceipt({
      runId: '123_5', status: 'failed', checkedAt: NOW,
      canonicalCommit: START, releaseVersion: '3.8.37', report: report(2),
      errorClass: 'deploy_failed',
    });
    assert.deepEqual(receipt.records, []);
  });

  it('delivers an early failed receipt without Python, Poetry or installed packages', (t) => {
    const isolated = fs.mkdtempSync('/tmp/rosen-failure-receipt-');
    t.after(() => fs.rmSync(isolated, { recursive: true, force: true }));
    for (const file of ['.github/scripts/bluesky-stewardship-publisher.mjs', 'scripts/bump-version.mjs']) {
      fs.mkdirSync(path.dirname(path.join(isolated, file)), { recursive: true });
      fs.copyFileSync(path.join(root, file), path.join(isolated, file));
    }
    fs.mkdirSync(path.join(isolated, 'backend'));
    const payload = buildIngestionReceipt({
      runId: '123_early_failure', status: 'failed', checkedAt: NOW,
      canonicalCommit: START, releaseVersion: '3.8.37', report: report(0),
      errorClass: 'workflow_failed',
    });
    const receiptPath = path.join(isolated, 'receipt.json');
    const capturedPath = path.join(isolated, 'captured.json');
    const networkFixture = path.join(isolated, 'network-fixture.mjs');
    fs.writeFileSync(receiptPath, JSON.stringify(payload));
    fs.writeFileSync(networkFixture, `
      import fs from 'node:fs';
      globalThis.fetch = async (url, options) => {
        fs.writeFileSync(${JSON.stringify(capturedPath)}, JSON.stringify({
          url, method: options.method, headers: options.headers,
          redirect: options.redirect, payload: JSON.parse(options.body),
        }));
        return new Response(null, { status: 204 });
      };
    `);
    const output = execFileSync(process.execPath, [
      '--import', networkFixture,
      path.join(isolated, '.github/scripts/bluesky-stewardship-publisher.mjs'),
      'send-failed-receipt', receiptPath,
    ], {
      cwd: path.join(isolated, 'backend'), encoding: 'utf8',
      env: { PATH: '/nonexistent', ROSEN_INGESTION_RECEIPT_TOKEN: 'fixture-token' },
    });
    const captured = JSON.parse(fs.readFileSync(capturedPath, 'utf8'));
    assert.equal(captured.url, 'https://rosen-source-discovery.jamditis.workers.dev/ingestion-receipt');
    assert.equal(captured.method, 'POST');
    assert.equal(captured.redirect, 'manual');
    assert.deepEqual(captured.headers, {
      Authorization: 'Bearer fixture-token', 'Content-Type': 'application/json',
    });
    assert.deepEqual(captured.payload, payload);
    assert.match(output, /Failed ingestion receipt accepted/);
    assert.doesNotMatch(output, /fixture-token/);
  });

  it('bounds transient failed-receipt retries and honors the retry-delay cap', async () => {
    const delays = [];
    let calls = 0;
    const payload = { status: 'failed', records: [] };
    await postFailedReceipt(payload, 'fixture-token', {
      fetchFn: async () => {
        calls += 1;
        return new Response(null, calls === 1
          ? { status: 503, headers: { 'Retry-After': '120' } }
          : { status: 204 });
      },
      sleepFn: async (delay) => delays.push(delay),
    });
    assert.equal(calls, 2);
    assert.deepEqual(delays, [30_000]);
    calls = 0;
    delays.length = 0;
    await assert.rejects(postFailedReceipt(payload, 'fixture-token', {
      fetchFn: async () => { calls += 1; throw new Error('offline'); },
      sleepFn: async (delay) => delays.push(delay),
    }), /exhausted network retries/);
    assert.equal(calls, 3);
    assert.deepEqual(delays, [1_000, 2_000]);
  });

  it('does not retry failed-receipt authentication errors or redirects', async () => {
    for (const status of [401, 403, 302]) {
      let calls = 0;
      await assert.rejects(postFailedReceipt({ status: 'failed', records: [] }, 'fixture-token', {
        fetchFn: async () => { calls += 1; return new Response(null, { status }); },
        sleepFn: async () => assert.fail('permanent failures must not retry'),
      }), new RegExp(`refused HTTP ${status}`));
      assert.equal(calls, 1);
    }
    await assert.rejects(postFailedReceipt({ status: 'failed', records: [{}] }, 'fixture-token'), /no record decisions/);
  });

  it('keeps the workflow on protected main and secrets at their final consumers', () => {
    const workflow = fs.readFileSync(path.join(root, '.github/workflows/bluesky-stewardship.yml'), 'utf8');
    const publisher = fs.readFileSync(path.join(root, '.github/scripts/bluesky-stewardship-publisher.mjs'), 'utf8');
    assert.match(workflow, /cron: '47 18 \* \* \*'/);
    assert.match(workflow, /type: boolean\n\s+default: true/);
    assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/);
    assert.match(workflow, /npm ci --ignore-scripts/);
    assert.match(workflow, /path: backend\/\.venv/);
    assert.match(workflow, /hashFiles\('backend\/poetry\.lock'\)/);
    assert.match(workflow, /poetry install --without dev --no-interaction/);
    assert.match(
      workflow,
      /working-directory: backend\n\s+run: poetry run node \.\.\/\.github\/scripts\/bluesky-stewardship-publisher\.mjs prepare/,
    );
    assert.match(workflow, /poetry run python scripts\/deploy_full_site\.py/);
    assert.match(workflow, /poetry run python scripts\/post_ingestion_receipt\.py/);
    assert.doesNotMatch(workflow, /python -m pip install/);
    assert.doesNotMatch(workflow, /^\s*run: python\b/m);
    assert.ok(
      workflow.indexOf('- name: Checkout tested main with write token')
        < workflow.indexOf('- name: Cache Poetry dependencies'),
      'the token checkout must finish before the in-project Poetry environment is restored',
    );
    assert.match(publisher, /bluesky_batch_update\.py/);
    assert.match(publisher, /'--report', paths\.reportPath/);
    assert.match(workflow, /deploy_full_site\.py/);
    assert.match(workflow, /verify-live-deploy\.mjs/);
    assert.equal((workflow.match(/git lfs pull/g) || []).length, 2);
    assert.match(workflow, /steps\.prepare\.outputs\.needs_deploy == 'true'/);
    assert.equal((workflow.match(/ROSEN_SFTP_PASSWORD:/g) || []).length, 1);
    assert.equal((workflow.match(/ROSEN_INGESTION_RECEIPT_TOKEN:/g) || []).length, 1);
    assert.doesNotMatch(workflow, /git (?:push|pull).*--force|git rebase/);
    assert.doesNotMatch(workflow, /git add -A/);

    const receiptBlock = workflow.slice(
      workflow.indexOf('- name: Build final receipt'),
      workflow.indexOf('- name: Send final receipt'),
    );
    const sendBlock = workflow.slice(
      workflow.indexOf('- name: Send final receipt'),
      workflow.indexOf('- name: Create or update failure issue'),
    );
    const issueBlock = workflow.slice(
      workflow.indexOf('- name: Create or update failure issue'),
      workflow.indexOf('- name: Write run summary'),
    );
    const summaryBlock = workflow.slice(
      workflow.indexOf('- name: Write run summary'),
      workflow.indexOf('- name: Fail unsuccessful publication'),
    );
    assert.doesNotMatch(receiptBlock, /RECEIPT_DELIVERY_OUTCOME/);
    assert.match(sendBlock, /env\.DRY_RUN != 'true'/);
    assert.match(sendBlock, /if \[ "\$RECEIPT_STATUS" = 'failed' \]; then\n\s+node [^\n]+ send-failed-receipt/);
    assert.match(issueBlock, /env\.DRY_RUN != 'true'/);
    assert.match(issueBlock, /github-token: \$\{\{ github\.token \}\}/);
    assert.doesNotMatch(issueBlock, /app-token\.outputs\.token/);
    assert.match(summaryBlock, /RECEIPT_DELIVERY_OUTCOME: \$\{\{ steps\.send_receipt\.outcome \}\}/);
    assert.match(workflow, /steps\.receipt\.outputs\.status != 'dry_run'/);
  });

  it('posts receipts only to the fixed endpoint and does not print the token', () => {
    const sender = fs.readFileSync(path.join(root, 'backend/scripts/post_ingestion_receipt.py'), 'utf8');
    assert.match(sender, /https:\/\/rosen-source-discovery\.jamditis\.workers\.dev\/ingestion-receipt/);
    assert.match(sender, /https:\/\/rosen-source-discovery\.jamditis\.workers\.dev\/ingestion-candidates/);
    assert.match(sender, /headers=\{"Authorization": f"Bearer \{token\}"\}/);
    assert.match(sender, /MAX_RECORDS_PER_REQUEST = 40/);
    assert.match(sender, /allow_redirects=False/);
    assert.doesNotMatch(sender, /print\([^\n]*token/);
  });
});

