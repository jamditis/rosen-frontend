/**
 * Thread detection algorithm unit tests
 *
 * Tests the thread detection pipeline from export-archive-data.js:
 * - rkey extraction from Bluesky URLs
 * - Parent-child chain building from responds_to
 * - Chain size calculation (recursive)
 * - Post collection with depth
 * - Thread root detection (3+ posts)
 * - Thread title generation (sentence boundaries, truncation, fallback)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assignStableThreadIds,
  selectPublishableThreadCandidates,
} from '../data/lib/thread-id-allocator.js';

// ============================================
// Re-implement thread detection functions
// ============================================

function extractRkey(url) {
  if (!url) return null;
  return url.split('/').pop() || null;
}

function buildThreadMaps(posts) {
  const rkeyToRow = new Map();
  const idToRkey = new Map();
  const childrenOfRkey = new Map();
  const postParentId = new Map();

  // Step 1: Map URLs to rkeys
  for (const row of posts) {
    if (row.platform === 'Bluesky' && row.url) {
      const rkey = extractRkey(row.url);
      if (rkey) {
        rkeyToRow.set(rkey, row);
        idToRkey.set(row.id, rkey);
      }
    }
  }

  // Step 2: Build parent-child relationships
  for (const row of posts) {
    if (row.responds_to && row.responds_to.trim()) {
      const parentRkey = row.responds_to.split('/').pop();
      if (parentRkey && rkeyToRow.has(parentRkey)) {
        if (!childrenOfRkey.has(parentRkey)) childrenOfRkey.set(parentRkey, []);
        childrenOfRkey.get(parentRkey).push(row);
        const parentRow = rkeyToRow.get(parentRkey);
        postParentId.set(row.id, parentRow.id);
      }
    }
  }

  return { rkeyToRow, idToRkey, childrenOfRkey, postParentId };
}

function getChainSize(rkey, childrenOfRkey, idToRkey) {
  let size = 1;
  const kids = childrenOfRkey.get(rkey) || [];
  for (const kid of kids) {
    const kidRkey = idToRkey.get(kid.id);
    if (kidRkey) size += getChainSize(kidRkey, childrenOfRkey, idToRkey);
  }
  return size;
}

function collectChainPosts(rkey, rkeyToRow, childrenOfRkey, idToRkey, depth = 0) {
  const row = rkeyToRow.get(rkey);
  if (!row) return [];
  const result = [{ row, depth }];
  const kids = (childrenOfRkey.get(rkey) || [])
    .sort((a, b) => (a.publication_date || '').localeCompare(b.publication_date || ''));
  for (const kid of kids) {
    const kidRkey = idToRkey.get(kid.id);
    if (kidRkey) result.push(...collectChainPosts(kidRkey, rkeyToRow, childrenOfRkey, idToRkey, depth + 1));
  }
  return result;
}

function findThreadRoots(posts, minSize = 3) {
  const { rkeyToRow, idToRkey, childrenOfRkey } = buildThreadMaps(posts);
  const allRkeys = new Set([...rkeyToRow.keys()]);
  const roots = [];

  for (const [rkey, row] of rkeyToRow) {
    const isRoot = !row.responds_to || !row.responds_to.trim() ||
                   !allRkeys.has(row.responds_to.split('/').pop());
    if (isRoot) {
      const size = getChainSize(rkey, childrenOfRkey, idToRkey);
      if (size >= minSize) roots.push({ rkey, row, size });
    }
  }

  roots.sort((a, b) => b.size - a.size);
  return roots;
}

function generateThreadTitle(rawText) {
  if (!rawText) return null;
  let titleText = rawText.trim();
  titleText = titleText.replace(/https?:\/\/\S+/g, '').replace(/^(@\S+\s*)+/, '').trim();
  const sentEnd = titleText.search(/[.!?]\s/);
  if (sentEnd > 0 && sentEnd < 100) {
    titleText = titleText.substring(0, sentEnd + 1);
  } else if (titleText.length > 80) {
    titleText = titleText.substring(0, 80).trim() + '...';
  }
  if (titleText.length < 10) return null;
  return titleText;
}

// ============================================
// Test data helpers
// ============================================

function makePost(id, url, responds_to = '', date = '2025-01-15', raw_text = '') {
  return {
    id,
    platform: 'Bluesky',
    url: `https://bsky.app/profile/jayrosen.bsky.social/post/${url}`,
    responds_to: responds_to ? `at://did:plc:xyz/app.bsky.feed.post/${responds_to}` : '',
    publication_date: date,
    raw_text: raw_text || `Post content for ${id}`
  };
}

// ============================================
// Tests: rkey extraction
// ============================================

describe('rkey extraction', () => {
  it('extracts rkey from standard Bluesky URL', () => {
    assert.strictEqual(extractRkey('https://bsky.app/profile/jayrosen.bsky.social/post/3abc123'), '3abc123');
  });

  it('extracts rkey from AT protocol URI', () => {
    assert.strictEqual(extractRkey('at://did:plc:xyz/app.bsky.feed.post/3abc123'), '3abc123');
  });

  it('returns null for empty URL', () => {
    assert.strictEqual(extractRkey(''), null);
    assert.strictEqual(extractRkey(null), null);
    assert.strictEqual(extractRkey(undefined), null);
  });

  it('handles URL with trailing slash', () => {
    // split('/').pop() returns '' for trailing slash, '' || null => null
    const result = extractRkey('https://bsky.app/profile/x/post/');
    assert.strictEqual(result, null);
  });
});

// ============================================
// Tests: parent-child chain building
// ============================================

describe('parent-child chain building', () => {
  it('builds correct parent-child relationship', () => {
    const posts = [
      makePost('P1', 'rkey1', '', '2025-01-01'),
      makePost('P2', 'rkey2', 'rkey1', '2025-01-01'),
    ];
    const { childrenOfRkey, postParentId } = buildThreadMaps(posts);
    assert.strictEqual(childrenOfRkey.get('rkey1').length, 1);
    assert.strictEqual(childrenOfRkey.get('rkey1')[0].id, 'P2');
    assert.strictEqual(postParentId.get('P2'), 'P1');
  });

  it('handles multiple children for one parent', () => {
    const posts = [
      makePost('P1', 'rkey1', '', '2025-01-01'),
      makePost('P2', 'rkey2', 'rkey1', '2025-01-01'),
      makePost('P3', 'rkey3', 'rkey1', '2025-01-01'),
    ];
    const { childrenOfRkey } = buildThreadMaps(posts);
    assert.strictEqual(childrenOfRkey.get('rkey1').length, 2);
  });

  it('ignores responds_to referencing unknown posts', () => {
    const posts = [
      makePost('P1', 'rkey1', '', '2025-01-01'),
      makePost('P2', 'rkey2', 'unknown_rkey', '2025-01-01'),
    ];
    const { childrenOfRkey, postParentId } = buildThreadMaps(posts);
    assert.strictEqual(childrenOfRkey.has('unknown_rkey'), false);
    assert.strictEqual(postParentId.has('P2'), false);
  });

  it('ignores non-Bluesky posts', () => {
    const posts = [
      { id: 'T1', platform: 'Twitter/X', url: 'https://twitter.com/jayrosen_nyu/status/123', responds_to: '' }
    ];
    const { rkeyToRow } = buildThreadMaps(posts);
    assert.strictEqual(rkeyToRow.size, 0);
  });

  it('handles empty responds_to', () => {
    const posts = [
      makePost('P1', 'rkey1', '', '2025-01-01'),
    ];
    const { childrenOfRkey } = buildThreadMaps(posts);
    assert.strictEqual(childrenOfRkey.size, 0);
  });
});

// ============================================
// Tests: chain size calculation
// ============================================

describe('chain size calculation', () => {
  it('single post has size 1', () => {
    const posts = [makePost('P1', 'rkey1')];
    const { idToRkey, childrenOfRkey } = buildThreadMaps(posts);
    assert.strictEqual(getChainSize('rkey1', childrenOfRkey, idToRkey), 1);
  });

  it('linear chain of 3 posts has size 3', () => {
    const posts = [
      makePost('P1', 'rkey1', '', '2025-01-01'),
      makePost('P2', 'rkey2', 'rkey1', '2025-01-02'),
      makePost('P3', 'rkey3', 'rkey2', '2025-01-03'),
    ];
    const { idToRkey, childrenOfRkey } = buildThreadMaps(posts);
    assert.strictEqual(getChainSize('rkey1', childrenOfRkey, idToRkey), 3);
  });

  it('branching thread counts all descendants', () => {
    // P1 -> P2, P3
    // P2 -> P4
    const posts = [
      makePost('P1', 'rkey1', '', '2025-01-01'),
      makePost('P2', 'rkey2', 'rkey1', '2025-01-02'),
      makePost('P3', 'rkey3', 'rkey1', '2025-01-02'),
      makePost('P4', 'rkey4', 'rkey2', '2025-01-03'),
    ];
    const { idToRkey, childrenOfRkey } = buildThreadMaps(posts);
    assert.strictEqual(getChainSize('rkey1', childrenOfRkey, idToRkey), 4);
  });

  it('subtree size counts only descendants', () => {
    const posts = [
      makePost('P1', 'rkey1', '', '2025-01-01'),
      makePost('P2', 'rkey2', 'rkey1', '2025-01-02'),
      makePost('P3', 'rkey3', 'rkey2', '2025-01-03'),
    ];
    const { idToRkey, childrenOfRkey } = buildThreadMaps(posts);
    // From P2, chain is P2 -> P3 = size 2
    assert.strictEqual(getChainSize('rkey2', childrenOfRkey, idToRkey), 2);
  });
});

// ============================================
// Tests: post collection with depth
// ============================================

describe('post collection with depth', () => {
  it('root post has depth 0', () => {
    const posts = [makePost('P1', 'rkey1')];
    const maps = buildThreadMaps(posts);
    const collected = collectChainPosts('rkey1', maps.rkeyToRow, maps.childrenOfRkey, maps.idToRkey);
    assert.strictEqual(collected.length, 1);
    assert.strictEqual(collected[0].depth, 0);
  });

  it('assigns increasing depth for linear chain', () => {
    const posts = [
      makePost('P1', 'rkey1', '', '2025-01-01'),
      makePost('P2', 'rkey2', 'rkey1', '2025-01-02'),
      makePost('P3', 'rkey3', 'rkey2', '2025-01-03'),
    ];
    const maps = buildThreadMaps(posts);
    const collected = collectChainPosts('rkey1', maps.rkeyToRow, maps.childrenOfRkey, maps.idToRkey);
    assert.strictEqual(collected.length, 3);
    assert.strictEqual(collected[0].depth, 0); // P1
    assert.strictEqual(collected[1].depth, 1); // P2
    assert.strictEqual(collected[2].depth, 2); // P3
  });

  it('siblings share the same depth', () => {
    const posts = [
      makePost('P1', 'rkey1', '', '2025-01-01'),
      makePost('P2', 'rkey2', 'rkey1', '2025-01-02'),
      makePost('P3', 'rkey3', 'rkey1', '2025-01-03'),
    ];
    const maps = buildThreadMaps(posts);
    const collected = collectChainPosts('rkey1', maps.rkeyToRow, maps.childrenOfRkey, maps.idToRkey);
    assert.strictEqual(collected.length, 3);
    assert.strictEqual(collected[1].depth, 1);
    assert.strictEqual(collected[2].depth, 1);
  });

  it('sorts children by date', () => {
    const posts = [
      makePost('P1', 'rkey1', '', '2025-01-01'),
      makePost('P3', 'rkey3', 'rkey1', '2025-01-03'), // Later
      makePost('P2', 'rkey2', 'rkey1', '2025-01-02'), // Earlier
    ];
    const maps = buildThreadMaps(posts);
    const collected = collectChainPosts('rkey1', maps.rkeyToRow, maps.childrenOfRkey, maps.idToRkey);
    assert.strictEqual(collected[1].row.id, 'P2'); // Earlier first
    assert.strictEqual(collected[2].row.id, 'P3'); // Later second
  });

  it('returns empty for unknown rkey', () => {
    const posts = [makePost('P1', 'rkey1')];
    const maps = buildThreadMaps(posts);
    const collected = collectChainPosts('nonexistent', maps.rkeyToRow, maps.childrenOfRkey, maps.idToRkey);
    assert.strictEqual(collected.length, 0);
  });
});

// ============================================
// Tests: thread root detection
// ============================================

describe('thread root detection', () => {
  it('finds threads with 3+ posts', () => {
    const posts = [
      makePost('P1', 'rkey1', '', '2025-01-01'),
      makePost('P2', 'rkey2', 'rkey1', '2025-01-02'),
      makePost('P3', 'rkey3', 'rkey2', '2025-01-03'),
    ];
    const roots = findThreadRoots(posts);
    assert.strictEqual(roots.length, 1);
    assert.strictEqual(roots[0].size, 3);
  });

  it('does NOT find threads with fewer than 3 posts', () => {
    const posts = [
      makePost('P1', 'rkey1', '', '2025-01-01'),
      makePost('P2', 'rkey2', 'rkey1', '2025-01-02'),
    ];
    const roots = findThreadRoots(posts);
    assert.strictEqual(roots.length, 0);
  });

  it('finds multiple independent threads', () => {
    const posts = [
      // Thread A: 3 posts
      makePost('A1', 'a1', '', '2025-01-01'),
      makePost('A2', 'a2', 'a1', '2025-01-02'),
      makePost('A3', 'a3', 'a2', '2025-01-03'),
      // Thread B: 4 posts
      makePost('B1', 'b1', '', '2025-01-04'),
      makePost('B2', 'b2', 'b1', '2025-01-05'),
      makePost('B3', 'b3', 'b1', '2025-01-05'),
      makePost('B4', 'b4', 'b2', '2025-01-06'),
    ];
    const roots = findThreadRoots(posts);
    assert.strictEqual(roots.length, 2);
    // Sorted by size descending
    assert.strictEqual(roots[0].size, 4); // Thread B
    assert.strictEqual(roots[1].size, 3); // Thread A
  });

  it('ignores standalone posts (no children, no responds_to)', () => {
    const posts = [
      makePost('P1', 'rkey1', '', '2025-01-01'),
      makePost('P2', 'rkey2', '', '2025-01-02'),
      makePost('P3', 'rkey3', '', '2025-01-03'),
    ];
    const roots = findThreadRoots(posts);
    assert.strictEqual(roots.length, 0);
  });

  it('post responding to external (unknown) is treated as root', () => {
    // P1 responds to something not in our data set
    const posts = [
      makePost('P1', 'rkey1', 'external_rkey', '2025-01-01'),
      makePost('P2', 'rkey2', 'rkey1', '2025-01-02'),
      makePost('P3', 'rkey3', 'rkey2', '2025-01-03'),
    ];
    const roots = findThreadRoots(posts);
    assert.strictEqual(roots.length, 1);
    assert.strictEqual(roots[0].row.id, 'P1');
  });

  it('respects custom minimum size', () => {
    const posts = [
      makePost('P1', 'rkey1', '', '2025-01-01'),
      makePost('P2', 'rkey2', 'rkey1', '2025-01-02'),
      makePost('P3', 'rkey3', 'rkey2', '2025-01-03'),
      makePost('P4', 'rkey4', 'rkey3', '2025-01-04'),
      makePost('P5', 'rkey5', 'rkey4', '2025-01-05'),
    ];
    // With minSize 5, should find the chain of 5
    const roots5 = findThreadRoots(posts, 5);
    assert.strictEqual(roots5.length, 1);
    // With minSize 6, should find nothing
    const roots6 = findThreadRoots(posts, 6);
    assert.strictEqual(roots6.length, 0);
  });
});

// ============================================
// Tests: stable thread ID allocation
// ============================================

function makeThreadRecord(id, rootId) {
  return {
    id,
    thread_data: {
      thread_id: rootId,
      posts: [{ id: rootId }],
    },
  };
}

describe('stable thread ID allocation', () => {
  const priorGeneratedRecords = [
    makeThreadRecord('THREAD-00011', 'BSKY-01144'),
    makeThreadRecord('THREAD-00012', 'BSKY-01159'),
    makeThreadRecord('THREAD-00013', 'BSKY-01445'),
    makeThreadRecord('THREAD-00014', 'BSKY-01496'),
    makeThreadRecord('THREAD-00015', 'BSKY-01796'),
    makeThreadRecord('THREAD-00016', 'BSKY-02060'),
    makeThreadRecord('THREAD-00017', 'BSKY-02609'),
  ];

  it('preserves prior IDs when a larger new thread sorts ahead', () => {
    const assignments = assignStableThreadIds({
      priorRuntimeRecords: priorGeneratedRecords,
      sourceThreadRecords: [],
      detectedRootIds: ['BSKY-03278', ...priorGeneratedRecords.map(record => record.thread_data.thread_id)],
    });

    for (const record of priorGeneratedRecords) {
      assert.equal(assignments.get(record.thread_data.thread_id), record.id);
    }
    assert.equal(assignments.get('BSKY-03278'), 'THREAD-00018');
  });

  it('allocates unseen roots deterministically regardless of input order', () => {
    const input = ['BSKY-Z', 'BSKY-A', 'BSKY-M'];
    const forward = assignStableThreadIds({
      priorRuntimeRecords: priorGeneratedRecords,
      sourceThreadRecords: [],
      detectedRootIds: input,
    });
    const reversed = assignStableThreadIds({
      priorRuntimeRecords: priorGeneratedRecords,
      sourceThreadRecords: [],
      detectedRootIds: [...input].reverse(),
    });

    assert.deepEqual([...forward], [...reversed]);
    assert.deepEqual([...forward], [
      ['BSKY-A', 'THREAD-00018'],
      ['BSKY-M', 'THREAD-00019'],
      ['BSKY-Z', 'THREAD-00020'],
    ]);
  });

  it('uses max plus one across gaps and source reservations', () => {
    const assignments = assignStableThreadIds({
      priorRuntimeRecords: [makeThreadRecord('THREAD-00012', 'BSKY-OLD')],
      sourceThreadRecords: [makeThreadRecord('THREAD-00020', 'BSKY-CURATED')],
      detectedRootIds: ['BSKY-NEW'],
    });

    assert.equal(assignments.get('BSKY-NEW'), 'THREAD-00021');
  });

  it('reserves all 19 public thread IDs before assigning a new root', () => {
    const currentPublicThreads = Array.from({ length: 19 }, (_, index) => (
      makeThreadRecord(`THREAD-${String(index + 1).padStart(5, '0')}`, `BSKY-ROOT-${index + 1}`)
    ));
    const assignments = assignStableThreadIds({
      priorRuntimeRecords: currentPublicThreads,
      sourceThreadRecords: [],
      detectedRootIds: ['BSKY-NEW'],
    });
    assert.equal(assignments.get('BSKY-NEW'), 'THREAD-00020');
  });

  it('rejects one root mapped to different IDs', () => {
    assert.throws(() => assignStableThreadIds({
      priorRuntimeRecords: [
        makeThreadRecord('THREAD-00011', 'BSKY-SAME'),
        makeThreadRecord('THREAD-00012', 'BSKY-SAME'),
      ],
      sourceThreadRecords: [],
      detectedRootIds: [],
    }), /root BSKY-SAME maps to both THREAD-00011 and THREAD-00012/);
  });

  it('rejects one ID mapped to different roots', () => {
    assert.throws(() => assignStableThreadIds({
      priorRuntimeRecords: [makeThreadRecord('THREAD-00011', 'BSKY-A')],
      sourceThreadRecords: [makeThreadRecord('THREAD-00011', 'BSKY-B')],
      detectedRootIds: [],
    }), /THREAD-00011 maps to both BSKY-A and BSKY-B/);
  });

  it('rejects malformed records and root candidates', () => {
    assert.throws(() => assignStableThreadIds({
      priorRuntimeRecords: [makeThreadRecord('THREAD-11', 'BSKY-A')],
      sourceThreadRecords: [],
      detectedRootIds: [],
    }), /noncanonical thread ID THREAD-11/);

    assert.throws(() => assignStableThreadIds({
      priorRuntimeRecords: [{ id: 'THREAD-00011', thread_data: {} }],
      sourceThreadRecords: [],
      detectedRootIds: [],
    }), /THREAD-00011 has no thread root ID/);

    assert.throws(() => assignStableThreadIds({
      priorRuntimeRecords: [],
      sourceThreadRecords: [],
      detectedRootIds: [''],
    }), /empty thread root ID/);

    assert.throws(() => assignStableThreadIds({
      priorRuntimeRecords: [{
        id: 'THREAD-00011',
        thread_data: {
          thread_id: 'BSKY-ROOT',
          posts: [{ id: 'BSKY-OTHER' }],
        },
      }],
      sourceThreadRecords: [],
      detectedRootIds: [],
    }), /THREAD-00011 root BSKY-ROOT disagrees with first post BSKY-OTHER/);
  });

  it('rejects duplicate current root candidates', () => {
    assert.throws(() => assignStableThreadIds({
      priorRuntimeRecords: priorGeneratedRecords,
      sourceThreadRecords: [],
      detectedRootIds: ['BSKY-NEW', 'BSKY-NEW'],
    }), /duplicate current thread root BSKY-NEW/);
  });
});

describe('thread publication admission', () => {
  const candidate = (rootId, verified, alreadyCovered = false) => ({
    alreadyCovered,
    posts: verified.map((value, index) => ({
      row: {
        id: index === 0 ? rootId : `${rootId}-${index}`,
        verified: value,
        author: 'Jay Rosen',
        platform: 'Bluesky',
        url: `https://bsky.app/profile/jayrosen.bsky.social/post/${rootId}-${index}`,
        raw_text: `Source post ${index}`,
        permissions: 'Public Post',
        date_processed: '2026-10-14T18:00:00Z',
      },
      depth: index,
    })),
  });

  it('excludes an all-context new chain before ID allocation', () => {
    const allContext = candidate('BSKY-CONTEXT', ['FALSE', 'FALSE', 'FALSE']);
    assert.deepEqual(selectPublishableThreadCandidates([allContext]), []);
  });

  it('retains a mixed chain with one admitted member', () => {
    const mixed = candidate('BSKY-MIXED', ['FALSE', 'TRUE', 'FALSE']);
    assert.deepEqual(selectPublishableThreadCandidates([mixed]), [mixed]);
  });

  it('leaves a new media-only chain ungrouped before ID allocation', () => {
    for (const position of [0, 1, 2]) {
      const media = candidate('BSKY-MEDIA', ['TRUE', 'FALSE', 'TRUE']);
      media.posts[position].row.raw_text = '';
      assert.deepEqual(selectPublishableThreadCandidates([media]), []);
      assert.equal(media.posts[0].row.verified, 'TRUE', 'standalone admission stays intact');
    }
  });

  it('leaves unsupported historical source members out of new Jay thread containers', () => {
    const otherAuthor = candidate('BSKY-OTHER', ['TRUE', 'TRUE', 'TRUE']);
    otherAuthor.posts[1].row.author = 'Another author';
    otherAuthor.posts[1].row.url = 'https://bsky.app/profile/another.bsky.social/post/example';
    assert.deepEqual(selectPublishableThreadCandidates([otherAuthor]), []);
  });

  it('keeps an existing text thread and its ID when a media-only branch is added', () => {
    const extended = candidate('BSKY-OLD', ['TRUE', 'TRUE', 'TRUE', 'FALSE', 'TRUE']);
    extended.posts[3].row.raw_text = '';
    const selected = selectPublishableThreadCandidates([extended]);
    assert.deepEqual(selected[0].posts, extended.posts.slice(0, 3));
    assert.deepEqual(selected[0].postIds, extended.posts.slice(0, 3).map(post => post.row.id));
    const assigned = assignStableThreadIds({
      priorRuntimeRecords: [{
        id: 'THREAD-00019',
        thread_data: { thread_id: 'BSKY-OLD', posts: [{ id: 'BSKY-OLD' }] },
      }],
      sourceThreadRecords: [],
      detectedRootIds: [selected[0].posts[0].row.id],
    });
    assert.equal(assigned.get('BSKY-OLD'), 'THREAD-00019');
    assert.equal(extended.posts[4].row.verified, 'TRUE', 'excluded descendant stays admitted');
  });

  it('preserves an already-covered container even when every current member is context-only', () => {
    const covered = candidate('BSKY-COVERED', ['FALSE', 'FALSE', 'FALSE'], true);
    assert.deepEqual(selectPublishableThreadCandidates([covered]), [covered]);
  });
});

// ============================================
// Tests: thread title generation
// ============================================

describe('thread title generation', () => {
  it('uses first sentence when under 100 chars', () => {
    const title = generateThreadTitle('This is the first sentence. This is the second.');
    assert.strictEqual(title, 'This is the first sentence.');
  });

  it('truncates at 80 chars when no sentence boundary found', () => {
    const longText = 'A'.repeat(120);
    const title = generateThreadTitle(longText);
    assert.strictEqual(title.length, 83); // 80 + '...'
    assert.ok(title.endsWith('...'));
  });

  it('strips URLs before generating title', () => {
    const title = generateThreadTitle('https://example.com/long/url Important point about journalism.');
    assert.strictEqual(title, 'Important point about journalism.');
  });

  it('strips leading @mentions', () => {
    const title = generateThreadTitle('@user1 @user2 The real content starts here. More text.');
    assert.strictEqual(title, 'The real content starts here.');
  });

  it('returns null for text shorter than 10 chars after cleaning', () => {
    assert.strictEqual(generateThreadTitle('Hi'), null);
    assert.strictEqual(generateThreadTitle('@user ok'), null);
    assert.strictEqual(generateThreadTitle('https://example.com'), null);
  });

  it('returns null for empty/null input', () => {
    assert.strictEqual(generateThreadTitle(''), null);
    assert.strictEqual(generateThreadTitle(null), null);
    assert.strictEqual(generateThreadTitle(undefined), null);
  });

  it('handles exclamation marks as sentence boundaries', () => {
    const title = generateThreadTitle('Breaking news! This is a big deal.');
    assert.strictEqual(title, 'Breaking news!');
  });

  it('handles question marks as sentence boundaries', () => {
    const title = generateThreadTitle('Why does this matter? Because democracy.');
    assert.strictEqual(title, 'Why does this matter?');
  });

  it('breaks at first sentence boundary matching [.!?] followed by space', () => {
    // "U.S. " matches the [.!?]\s pattern at "S. " — this is a known limitation
    // of the simple sentence detection regex. The algorithm cuts at the first match.
    const title = generateThreadTitle('The U.S. press has a major problem with accountability and transparency in reporting.');
    // The regex finds ". " after "S" at index 5, which gives "The U." — under 10 chars, so returns null
    assert.strictEqual(title, null);

    // But a longer first segment works fine
    const title2 = generateThreadTitle('Something about the U.S. press in crisis. More thoughts here.');
    // "U." is not followed by space (followed by "S"), so first match is "S. " at index 23
    assert.strictEqual(title2, 'Something about the U.S.');
  });

  it('preserves sentence when exactly at boundary', () => {
    // Exactly 100 chars including sentence end
    const text = 'A'.repeat(50) + '. ' + 'B'.repeat(47);
    const title = generateThreadTitle(text);
    assert.strictEqual(title, 'A'.repeat(50) + '.');
  });
});

// ============================================
// Tests: thread member ID collection
// ============================================

describe('thread member ID collection', () => {
  it('collects all post IDs in a thread', () => {
    const posts = [
      makePost('P1', 'rkey1', '', '2025-01-01'),
      makePost('P2', 'rkey2', 'rkey1', '2025-01-02'),
      makePost('P3', 'rkey3', 'rkey2', '2025-01-03'),
    ];
    const maps = buildThreadMaps(posts);
    const collected = collectChainPosts('rkey1', maps.rkeyToRow, maps.childrenOfRkey, maps.idToRkey);
    const ids = collected.map(p => p.row.id);
    assert.deepStrictEqual(ids, ['P1', 'P2', 'P3']);
  });

  it('collects IDs from branching threads', () => {
    const posts = [
      makePost('P1', 'rkey1', '', '2025-01-01'),
      makePost('P2', 'rkey2', 'rkey1', '2025-01-02'),
      makePost('P3', 'rkey3', 'rkey1', '2025-01-03'),
      makePost('P4', 'rkey4', 'rkey2', '2025-01-04'),
    ];
    const maps = buildThreadMaps(posts);
    const collected = collectChainPosts('rkey1', maps.rkeyToRow, maps.childrenOfRkey, maps.idToRkey);
    const ids = new Set(collected.map(p => p.row.id));
    assert.strictEqual(ids.size, 4);
    assert.ok(ids.has('P1'));
    assert.ok(ids.has('P2'));
    assert.ok(ids.has('P3'));
    assert.ok(ids.has('P4'));
  });
});
