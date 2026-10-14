import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  registerSourceSupportedGeneratedThreads,
} from '../scripts/refresh-social-release-artifacts.mjs';

const existingPolicy = {
  schemaVersion: 1,
  generatedPublishedRecordIds: ['THREAD-00019', 'dissertation-1986'],
  relationshipTypeHolds: [
    { relationshipId: 'RECORD-1_REL_1', observedType: 'Held type', reason: 'Keep this.' },
  ],
  duplicateEdgeExceptions: [
    { entityIds: ['P1', 'O1'], types: ['Owns', 'Owned By'], reason: 'Keep this too.' },
  ],
};

function sourceRow(id, rkey, { parentRkey = '', verified = 'TRUE' } = {}) {
  return {
    id,
    author: 'Jay Rosen',
    platform: 'Bluesky',
    url: `https://bsky.app/profile/jayrosen.bsky.social/post/${rkey}`,
    raw_text: `Text for ${id}`,
    responds_to: parentRkey
      ? `at://did:plc:3t37x6vfigdzzp2gjcfnzlz4/app.bsky.feed.post/${parentRkey}`
      : '',
    permissions: 'Public Post',
    date_processed: '2026-10-14 15:19:59',
    verified,
    notes: 'Fetched via app.bsky.feed.getAuthorFeed; source identity and text confirmed.',
  };
}

function generatedThread() {
  return {
    id: 'THREAD-00020',
    type: 'social',
    author: 'Jay Rosen',
    pub: 'Bluesky',
    url: 'https://bsky.app/profile/jayrosen.bsky.social/post/root',
    thread_data: {
      thread_id: 'BSKY-10000',
      posts: [
        {
          id: 'BSKY-10000',
          content: 'Text for BSKY-10000',
          url: 'https://bsky.app/profile/jayrosen.bsky.social/post/root',
          parent_id: null,
        },
        {
          id: 'BSKY-10001',
          content: 'Text for BSKY-10001',
          url: 'https://bsky.app/profile/jayrosen.bsky.social/post/context',
          parent_id: 'BSKY-10000',
        },
        {
          id: 'BSKY-10002',
          content: 'Text for BSKY-10002',
          url: 'https://bsky.app/profile/jayrosen.bsky.social/post/final',
          parent_id: 'BSKY-10001',
        },
      ],
    },
  };
}

test('registers only a source-backed Jay thread and preserves all existing holds', () => {
  const relationshipHolds = structuredClone(existingPolicy.relationshipTypeHolds);
  const duplicateHolds = structuredClone(existingPolicy.duplicateEdgeExceptions);
  const thread = generatedThread();
  const result = registerSourceSupportedGeneratedThreads(existingPolicy, {
    publishedRecords: [thread],
    archiveRows: [],
    socialRows: [
      sourceRow('BSKY-10000', 'root'),
      sourceRow('BSKY-10001', 'context', { parentRkey: 'root', verified: 'FALSE' }),
      sourceRow('BSKY-10002', 'final', { parentRkey: 'context' }),
    ],
  });

  assert.deepEqual(result.added, ['THREAD-00020']);
  assert.deepEqual(
    result.policy.generatedPublishedRecordIds,
    ['THREAD-00019', 'dissertation-1986', 'THREAD-00020'],
  );
  assert.deepEqual(result.policy.relationshipTypeHolds, relationshipHolds);
  assert.deepEqual(result.policy.duplicateEdgeExceptions, duplicateHolds);
  assert.deepEqual(existingPolicy.relationshipTypeHolds, relationshipHolds);
});

test('rejects a generated thread without valid source provenance', () => {
  const thread = generatedThread();
  const rows = [
    sourceRow('BSKY-10000', 'root'),
    sourceRow('BSKY-10001', 'context', { parentRkey: 'root' }),
    sourceRow('BSKY-10002', 'final', { parentRkey: 'context' }),
  ];
  rows[1].author = 'Someone else';

  assert.throws(
    () => registerSourceSupportedGeneratedThreads(existingPolicy, {
      publishedRecords: [thread],
      archiveRows: [],
      socialRows: rows,
    }),
    /BSKY-10001.*Jay Rosen/,
  );
});

test('does not register an arbitrary generated published record', () => {
  assert.throws(
    () => registerSourceSupportedGeneratedThreads(existingPolicy, {
      publishedRecords: [{ id: 'GENERATED-REPORT-1' }],
      archiveRows: [],
      socialRows: [],
    }),
    /only canonical THREAD records/,
  );
});

test('requires named capture provenance for every thread member', () => {
  const thread = generatedThread();
  const rows = [
    sourceRow('BSKY-10000', 'root'),
    sourceRow('BSKY-10001', 'context', { parentRkey: 'root' }),
    sourceRow('BSKY-10002', 'final', { parentRkey: 'context' }),
  ];
  rows[2].notes = '';

  assert.throws(
    () => registerSourceSupportedGeneratedThreads(existingPolicy, {
      publishedRecords: [thread],
      archiveRows: [],
      socialRows: rows,
    }),
    /BSKY-10002.*capture provenance/,
  );
});
