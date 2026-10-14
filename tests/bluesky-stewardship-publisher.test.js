import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildIngestionReceipt,
  runPublicationLifecycle,
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

function input() {
  return {
    runId: '123_1',
    checkedAt: NOW,
    startCommit: START,
    canonicalCommit: START,
    releaseVersion: '3.8.37',
    dryRun: false,
    emptyReport: report(0),
  };
}

function operations(overrides = {}) {
  const calls = [];
  const api = {
    calls,
    capture: async () => report(),
    verifyLive: async () => calls.push('verify'),
    prepare: async () => ({ canonicalCommit: PUBLISHED, releaseVersion: '3.8.38' }),
    runChecks: async () => calls.push('checks'),
    getRemoteHead: async () => START,
    push: async () => calls.push('push'),
    deploy: async () => calls.push('deploy'),
    sendReceipt: async (receipt) => calls.push(`receipt:${receipt.status}`),
    ...overrides,
  };
  return api;
}

describe('Bluesky stewardship publication lifecycle', () => {
  it('verifies live state and emits no_change without pushing when no rows are missing', async () => {
    const ops = operations({ capture: async () => report(0) });
    const receipt = await runPublicationLifecycle(input(), ops);
    assert.equal(receipt.status, 'no_change');
    assert.deepEqual(ops.calls, ['verify', 'receipt:no_change']);
  });

  it('does not push when repository checks fail', async () => {
    const ops = operations({
      runChecks: async () => { throw new Error('tests failed'); },
    });
    await assert.rejects(runPublicationLifecycle(input(), ops), /tests failed/);
    assert.equal(ops.calls.includes('push'), false);
    assert.equal(ops.calls.at(-1), 'receipt:failed');
  });

  it('does not push when origin/main moved after the tested checkout', async () => {
    const ops = operations({ getRemoteHead: async () => '3'.repeat(40) });
    await assert.rejects(runPublicationLifecycle(input(), ops), /origin\/main moved/);
    assert.equal(ops.calls.includes('push'), false);
    assert.equal(ops.calls.at(-1), 'receipt:failed');
  });

  it('emits a failed receipt when push succeeds but deployment fails', async () => {
    const ops = operations({
      deploy: async () => { throw new Error('transfer failed'); },
    });
    let error;
    try {
      await runPublicationLifecycle(input(), ops);
    } catch (caught) {
      error = caught;
    }
    assert.ok(error);
    assert.equal(ops.calls.includes('push'), true);
    assert.equal(error.receipt.status, 'failed');
    assert.equal(error.receipt.errorClass, 'deploy_failed');
    assert.equal(error.receipt.canonicalCommit, PUBLISHED);
    assert.equal(ops.calls.at(-1), 'receipt:failed');
  });
});

describe('Bluesky stewardship receipt and workflow boundary', () => {
  it('builds a bounded valid receipt without copying credentials or source payloads', () => {
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
    assert.equal(receipt.records.length, 500);
    assert.equal(receipt.records[0].decision, 'accepted');
    assert.equal(receipt.records[1].decision, 'rejected');
    assert.deepEqual(Object.keys(receipt.records[0]), ['uri', 'decision', 'recordId']);
    assert.doesNotMatch(JSON.stringify(receipt), /token|password|raw_text|snapshot/i);
  });

  it('removes record decisions from failed receipts', () => {
    const receipt = buildIngestionReceipt({
      runId: '123_5', status: 'failed', checkedAt: NOW,
      canonicalCommit: START, releaseVersion: '3.8.37', report: report(2),
      errorClass: 'deploy_failed',
    });
    assert.deepEqual(receipt.records, []);
  });

  it('keeps the workflow on protected main and secrets at their final consumers', () => {
    const workflow = fs.readFileSync(path.join(root, '.github/workflows/bluesky-stewardship.yml'), 'utf8');
    const publisher = fs.readFileSync(path.join(root, '.github/scripts/bluesky-stewardship-publisher.mjs'), 'utf8');
    assert.match(workflow, /cron: '47 18 \* \* \*'/);
    assert.match(workflow, /type: boolean\n\s+default: true/);
    assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/);
    assert.match(workflow, /npm ci --ignore-scripts/);
    assert.match(publisher, /bluesky_batch_update\.py/);
    assert.match(workflow, /deploy_full_site\.py/);
    assert.match(workflow, /verify-live-deploy\.mjs/);
    assert.equal((workflow.match(/ROSEN_SFTP_PASSWORD:/g) || []).length, 1);
    assert.equal((workflow.match(/ROSEN_INGESTION_RECEIPT_TOKEN:/g) || []).length, 1);
    assert.doesNotMatch(workflow, /git (?:push|pull).*--force|git rebase/);
    assert.doesNotMatch(workflow, /git add -A/);
  });

  it('posts receipts only to the fixed endpoint and does not print the token', () => {
    const sender = fs.readFileSync(path.join(root, 'backend/scripts/post_ingestion_receipt.py'), 'utf8');
    assert.match(sender, /https:\/\/rosen-source-discovery\.jamditis\.workers\.dev\/ingestion-receipt/);
    assert.match(sender, /headers=\{"Authorization": f"Bearer \{token\}"\}/);
    assert.match(sender, /MAX_RECORDS_PER_REQUEST = 40/);
    assert.match(sender, /allow_redirects=False/);
    assert.doesNotMatch(sender, /print\([^\n]*token/);
  });
});

