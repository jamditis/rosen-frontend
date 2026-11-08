/**
 * THREAD id tombstones (state machine map follow-up 5).
 *
 * The prior runtime artifact only remembers threads that are still published.
 * When the highest THREAD id drops out, the next export must not hand that
 * number to a different root, so dropped ids are kept in a small committed
 * tombstone file that the exporter reads and appends to.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as allocator from '../data/lib/thread-id-allocator.js';

const { assignStableThreadIds } = allocator;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tombstonePath = path.join(rootDir, 'data', 'thread-id-tombstones.json');

function threadRecord(number, rootId) {
  return {
    id: `THREAD-${String(number).padStart(5, '0')}`,
    thread_data: { thread_id: rootId, posts: [{ id: rootId }] },
  };
}

const firstExport = Array.from({ length: 9 }, (_, index) => threadRecord(index + 1, `BSKY-ROOT-${index + 1}`));

describe('THREAD id tombstones', () => {
  it('never reissues a dropped highest id to a new root', () => {
    assert.equal(typeof allocator.retireDroppedThreadIds, 'function', 'allocator exports retireDroppedThreadIds');
    // Export 2: THREAD-00009 loses its verified member and drops out.
    const published = firstExport.slice(0, 8);
    const tombstones = allocator.retireDroppedThreadIds({
      priorRuntimeRecords: firstExport,
      publishedThreadRecords: published,
      tombstones: [],
    });
    assert.deepEqual(tombstones, [{ id: 'THREAD-00009', root: 'BSKY-ROOT-9' }]);

    // Export 3: the prior artifact no longer has THREAD-00009.
    const assignments = assignStableThreadIds({
      priorRuntimeRecords: published,
      sourceThreadRecords: [],
      retiredThreadIds: tombstones,
      detectedRootIds: ['BSKY-NEW'],
    });
    assert.equal(assignments.get('BSKY-NEW'), 'THREAD-00010');
  });

  it('gives a returning root its retired id back', () => {
    const assignments = assignStableThreadIds({
      priorRuntimeRecords: firstExport.slice(0, 8),
      sourceThreadRecords: [],
      retiredThreadIds: [{ id: 'THREAD-00009', root: 'BSKY-ROOT-9' }],
      detectedRootIds: ['BSKY-ROOT-9', 'BSKY-NEW'],
    });
    assert.equal(assignments.get('BSKY-ROOT-9'), 'THREAD-00009');
    assert.equal(assignments.get('BSKY-NEW'), 'THREAD-00010');
  });

  it('only appends, keeps entries sorted, and does not repeat an entry', () => {
    const existing = [{ id: 'THREAD-00003', root: 'BSKY-ROOT-3' }];
    const prior = firstExport.filter(record => record.id !== 'THREAD-00003');
    const published = prior.filter(record => record.id !== 'THREAD-00007');
    const next = allocator.retireDroppedThreadIds({
      priorRuntimeRecords: prior,
      publishedThreadRecords: published,
      tombstones: existing,
    });
    assert.deepEqual(next, [
      { id: 'THREAD-00003', root: 'BSKY-ROOT-3' },
      { id: 'THREAD-00007', root: 'BSKY-ROOT-7' },
    ]);
    assert.deepEqual(allocator.retireDroppedThreadIds({
      priorRuntimeRecords: published,
      publishedThreadRecords: published,
      tombstones: next,
    }), next);
  });

  it('rejects a tombstone that conflicts with a live mapping', () => {
    assert.throws(() => assignStableThreadIds({
      priorRuntimeRecords: firstExport,
      sourceThreadRecords: [],
      retiredThreadIds: [{ id: 'THREAD-00009', root: 'BSKY-OTHER' }],
      detectedRootIds: [],
    }), /THREAD-00009 maps to both/);
  });

  it('commits a valid tombstone file that the exporter reads before it writes the artifact', () => {
    const state = JSON.parse(fs.readFileSync(tombstonePath, 'utf-8'));
    assert.deepEqual(Object.keys(state).sort(), ['retired', 'version']);
    assert.equal(state.version, 1);
    assert.ok(Array.isArray(state.retired));
    assert.deepEqual(allocator.parseThreadTombstones(state), state.retired);

    const exporter = fs.readFileSync(path.join(rootDir, 'data', 'export-archive-data.js'), 'utf-8');
    assert.match(exporter, /thread-id-tombstones\.json/);
    assert.match(exporter, /assignStableThreadIds\(\{[^}]*retiredThreadIds/);
    const tombstoneWrite = exporter.indexOf('fs.writeFileSync(tombstonePath');
    const artifactWrite = exporter.indexOf('fs.writeFileSync(outputPath');
    assert.ok(tombstoneWrite > 0, 'exporter writes the tombstone file');
    assert.ok(tombstoneWrite < artifactWrite, 'tombstones are durable before the prior artifact is replaced');
  });
});
