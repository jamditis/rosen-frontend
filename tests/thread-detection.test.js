/**
 * Thread detection and filtering tests
 *
 * Validates that the thread detection pipeline correctly:
 * - Generates THREAD records with valid thread_data
 * - Filters out thread member posts from main records
 * - Filters out short/generic reply posts
 * - Produces no orphaned or leaked thread members
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'data');

let fullData, detailsData, socialPosts;

before(() => {
  fullData = JSON.parse(fs.readFileSync(path.join(dataDir, 'archive-data.json'), 'utf-8'));
  detailsData = JSON.parse(fs.readFileSync(path.join(dataDir, 'archive-details.json'), 'utf-8'));
  socialPosts = parse(
    fs.readFileSync(path.join(dataDir, 'social_posts.csv'), 'utf-8'),
    { columns: true, skip_empty_lines: true }
  );
});

// ============================================
// THREAD record integrity
// ============================================

describe('THREAD records', () => {
  it('exist in the output', () => {
    const threads = fullData.records.filter(r => r.id.startsWith('THREAD-'));
    assert.ok(threads.length > 0, 'No THREAD records found');
  });

  it('have valid thread_data with posts array', () => {
    const threads = fullData.records.filter(r => r.id.startsWith('THREAD-'));
    for (const thread of threads) {
      assert.ok(thread.thread_data, `${thread.id} missing thread_data`);
      assert.ok(Array.isArray(thread.thread_data.posts), `${thread.id} thread_data.posts is not an array`);
      assert.ok(thread.thread_data.posts.length >= 3,
        `${thread.id} has only ${thread.thread_data.posts.length} posts (minimum 3)`);
    }
  });

  it('have total_posts matching actual posts length', () => {
    const threads = fullData.records.filter(r => r.id.startsWith('THREAD-'));
    for (const thread of threads) {
      if (thread.thread_data.total_posts !== undefined) {
        assert.strictEqual(thread.thread_data.total_posts, thread.thread_data.posts.length,
          `${thread.id} total_posts mismatch: claims ${thread.thread_data.total_posts} but has ${thread.thread_data.posts.length}`);
      }
    }
  });

  it('have sequential post numbering', () => {
    const threads = fullData.records.filter(r => r.id.startsWith('THREAD-'));
    for (const thread of threads) {
      for (let i = 0; i < thread.thread_data.posts.length; i++) {
        assert.strictEqual(thread.thread_data.posts[i].number, i + 1,
          `${thread.id} post at index ${i} has wrong number: ${thread.thread_data.posts[i].number}`);
      }
    }
  });

  it('have non-negative depth values', () => {
    const threads = fullData.records.filter(r => r.id.startsWith('THREAD-'));
    for (const thread of threads) {
      for (const post of thread.thread_data.posts) {
        assert.ok(post.depth >= 0, `${thread.id} post ${post.number} has negative depth: ${post.depth}`);
      }
    }
  });

  it('have first post at depth 0', () => {
    const threads = fullData.records.filter(r => r.id.startsWith('THREAD-'));
    for (const thread of threads) {
      assert.strictEqual(thread.thread_data.posts[0].depth, 0,
        `${thread.id} first post is not at depth 0`);
    }
  });

  it('have non-generic titles', () => {
    const threads = fullData.records.filter(r => r.id.startsWith('THREAD-'));
    for (const thread of threads) {
      assert.ok(!thread.title.startsWith('[Bluesky Thread]'),
        `${thread.id} still has generic [Bluesky Thread] title`);
      assert.ok(thread.title.length >= 5, `${thread.id} title too short: "${thread.title}"`);
    }
  });

  it('are of type social or article', () => {
    // Original THREAD records from archive_records CSV get type='article',
    // auto-generated THREADs from the pipeline get type='social'.
    const validTypes = new Set(['social', 'article']);
    const threads = fullData.records.filter(r => r.id.startsWith('THREAD-'));
    for (const thread of threads) {
      assert.ok(validTypes.has(thread.type), `${thread.id} has unexpected type: ${thread.type}`);
    }
  });

  it('have valid dates', () => {
    const threads = fullData.records.filter(r => r.id.startsWith('THREAD-'));
    for (const thread of threads) {
      assert.ok(thread.date, `${thread.id} has no date`);
      assert.ok(!isNaN(new Date(thread.date).getTime()), `${thread.id} has invalid date: ${thread.date}`);
    }
  });
});

// ============================================
// Thread member filtering
// ============================================

describe('thread member filtering', () => {
  it('no individual thread member posts appear in the main record set', () => {
    // Collect all post IDs from all THREAD records
    const threadPostIds = new Set();
    const threads = fullData.records.filter(r => r.id.startsWith('THREAD-'));
    for (const thread of threads) {
      for (const post of thread.thread_data.posts) {
        threadPostIds.add(post.id);
      }
    }

    // Check that none of those IDs appear as standalone records
    const leakedIds = fullData.records
      .filter(r => !r.id.startsWith('THREAD-') && threadPostIds.has(r.id));

    assert.strictEqual(leakedIds.length, 0,
      `${leakedIds.length} thread member posts leaked into main records: ${leakedIds.slice(0, 5).map(r => r.id).join(', ')}`);
  });

  it('thread post IDs reference posts that exist in social_posts.csv', () => {
    const socialIds = new Set(socialPosts.map(r => r.id || r.ID));
    const threads = fullData.records.filter(r => r.id.startsWith('THREAD-'));
    const missingIds = [];

    for (const thread of threads) {
      for (const post of thread.thread_data.posts) {
        if (!socialIds.has(post.id)) {
          missingIds.push({ threadId: thread.id, postId: post.id });
        }
      }
    }

    assert.strictEqual(missingIds.length, 0,
      `${missingIds.length} thread post IDs not found in social_posts.csv: ${JSON.stringify(missingIds.slice(0, 3))}`);
  });
});

// ============================================
// Short reply filtering
// ============================================

describe('short reply filtering', () => {
  const GENERIC_TITLE_PATTERN = /^(Reply|Tweet|Post|Quote) by/i;

  it('no generic-titled records with very short content remain', () => {
    const genericShort = fullData.records.filter(r => {
      if (!GENERIC_TITLE_PATTERN.test(r.title)) return false;
      const text = (r.quote || '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/^(\s*@\S+\s*)+/, '')
        .replace(/@\S+/g, '')
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
      return text.length < 10;
    });

    assert.strictEqual(genericShort.length, 0,
      `${genericShort.length} generic short replies remain: ${genericShort.slice(0, 3).map(r => r.id).join(', ')}`);
  });

  it('records with generic titles that remain have substantial content', () => {
    const genericRemaining = fullData.records.filter(r => GENERIC_TITLE_PATTERN.test(r.title));

    for (const record of genericRemaining) {
      const text = (record.quote || '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/^(\s*@\S+\s*)+/, '')
        .replace(/@\S+/g, '')
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
      assert.ok(text.length >= 10,
        `Record ${record.id} has generic title but short content (${text.length} chars): "${text.substring(0, 30)}"`);
    }
  });
});

// ============================================
// Thread coverage
// ============================================

describe('thread coverage', () => {
  it('THREAD records in details match those in full data', () => {
    const fullThreadIds = fullData.records.filter(r => r.id.startsWith('THREAD-')).map(r => r.id).sort();
    const detailThreadIds = Object.keys(detailsData.details).filter(id => id.startsWith('THREAD-')).sort();
    assert.deepStrictEqual(fullThreadIds, detailThreadIds);
  });

  it('no thread has duplicate post IDs', () => {
    const threads = fullData.records.filter(r => r.id.startsWith('THREAD-'));
    for (const thread of threads) {
      const postIds = thread.thread_data.posts.map(p => p.id);
      const uniqueIds = new Set(postIds);
      assert.strictEqual(postIds.length, uniqueIds.size,
        `${thread.id} has ${postIds.length - uniqueIds.size} duplicate post IDs`);
    }
  });

  it('no post ID appears in multiple THREAD records', () => {
    const threads = fullData.records.filter(r => r.id.startsWith('THREAD-'));
    const postIdToThread = new Map();
    const duplicates = [];

    for (const thread of threads) {
      for (const post of thread.thread_data.posts) {
        if (postIdToThread.has(post.id)) {
          duplicates.push({ postId: post.id, thread1: postIdToThread.get(post.id), thread2: thread.id });
        } else {
          postIdToThread.set(post.id, thread.id);
        }
      }
    }

    assert.strictEqual(duplicates.length, 0,
      `${duplicates.length} posts appear in multiple threads: ${JSON.stringify(duplicates.slice(0, 3))}`);
  });
});
