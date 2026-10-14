import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

import { unescapeRow } from '../data/lib/csv-unescape.js';
import { generateAllFeeds } from '../data/lib/rss-generator.js';
import { isPublishableRecord, processRecord } from '../data/export-archive-data.js';

function assertIdSet(actual, expected, artifact) {
  assert.equal(new Set(actual).size, actual.length, `${artifact}: duplicate record IDs`);
  assert.deepEqual(
    [...actual].sort(),
    [...expected].sort(),
    `${artifact}: stale record IDs; run npm run export-data`,
  );
}

function isPublishedCurated(row) {
  return isPublishableRecord(processRecord(row, 0, 'article', {}));
}

test('derived IDs use the actual exporter publication and normalization rules', () => {
  const row = { id: 'R1', title: 'A valid title', publication_date: '2026-01-01' };
  for (const verified of ['TRUE', 'true', 'Yes', true]) {
    assert.equal(isPublishedCurated({ ...row, verified }), true);
  }
  for (const verified of ['True', 'YES', 'yes', ' TRUE', 'FALSE', false]) {
    assert.equal(isPublishedCurated({ ...row, verified }), false);
  }
  assert.equal(isPublishedCurated({ ...row, verified: 'TRUE', publication_date: 'not-a-date' }), false);
  assert.equal(isPublishedCurated({ ...row, verified: 'TRUE', publication_date: 'not-a-date', url: 'https://example.org/story' }), true);
  assert.equal(isPublishedCurated({ ...row, verified: 'TRUE', title: '', Title: 'Alternate title' }), true);
  assert.equal(isPublishedCurated({ ...row, verified: 'TRUE', title: '', Content: 'Alternate content title' }), true);
});

function assertGeneratedThread(record, socialIds) {
  assert.ok(record, 'Reviewed generated thread is missing from archive-data.json');
  assert.match(record.id, /^THREAD-\d{5}$/, `${record.id}: noncanonical generated thread ID`);
  const posts = record.thread_data?.posts;
  assert.ok(Array.isArray(posts) && posts.length >= 3, `${record.id}: generated thread has fewer than three posts`);
  assert.equal(record.thread_data.thread_id, posts[0].id, `${record.id}: thread root differs from first post`);
  for (const post of posts) {
    assert.ok(socialIds.has(post.id), `${record.id}: source post ${post.id} is missing from social_posts.csv`);
  }
}

function assertDerivedIds({ curated, social, full, core, details, index, reviewedGeneratedIds }) {
  const curatedIds = new Set(curated.map(row => row.id));
  const socialIds = new Set(social.map(row => row.id));
  const expectedCuratedIds = curated.filter(isPublishedCurated).map(row => row.id);
  const fullIds = full.map(record => record.id);
  const fullIdSet = new Set(fullIds);
  const reviewedIds = new Set(reviewedGeneratedIds);

  assertIdSet(core.map(record => record.id), fullIds, 'archive-core.json');
  assertIdSet(Object.keys(details), fullIds, 'archive-details.json');
  assertIdSet(
    fullIds.filter(id => curatedIds.has(id)),
    expectedCuratedIds,
    'archive-data.json curated records',
  );
  assertIdSet(Object.values(index.documentIds), expectedCuratedIds, 'search-index.json');
  assert.equal(index.documentCount, expectedCuratedIds.length, 'search-index.json document count');

  for (const id of fullIds) {
    assert.ok(
      curatedIds.has(id) || socialIds.has(id) || reviewedIds.has(id),
      `archive-data.json: ${id} is not source-backed or in generatedPublishedRecordIds`,
    );
  }
  for (const id of reviewedIds) {
    assert.ok(fullIdSet.has(id), `archive-data.json: reviewed generated record ${id} is missing`);
  }
  for (const id of reviewedIds) {
    if (id.startsWith('THREAD-')) {
      assertGeneratedThread(full.find(record => record.id === id), socialIds);
    }
  }

  const curatedThreadIds = curated.filter(isPublishedCurated)
    .filter(row => row.id.startsWith('THREAD-')).map(row => row.id);
  const generatedThreadIds = reviewedGeneratedIds.filter(id => id.startsWith('THREAD-'));
  const publishedThreadIds = fullIds.filter(id => id.startsWith('THREAD-'));
  assertIdSet(publishedThreadIds, [...curatedThreadIds, ...generatedThreadIds], 'published THREAD registry');
}

function assertFeedCurrent(actual, expected, artifact) {
  const normalize = xml => {
    const buildDates = [...xml.matchAll(/<lastBuildDate>[^<]*<\/lastBuildDate>/g)];
    assert.equal(buildDates.length, 1, `${artifact}: expected one feed build date`);
    return xml.replace(/<lastBuildDate>[^<]*<\/lastBuildDate>/, '<lastBuildDate>informational</lastBuildDate>');
  };
  assert.equal(normalize(actual), normalize(expected), `${artifact}: stale feed content`);
}

function fixture() {
  const curated = [
    { id: 'R1', title: 'A valid title', verified: 'TRUE', publication_date: '2026-01-01' },
    { id: 'THREAD-00001', title: 'A curated thread', verified: 'TRUE', publication_date: '2026-01-02' },
  ];
  const social = ['B1', 'B2', 'B3', 'B4'].map(id => ({ id }));
  const generatedThread = {
    id: 'THREAD-00011',
    type: 'social',
    thread_data: {
      thread_id: 'B1',
      posts: [{ id: 'B1' }, { id: 'B2' }, { id: 'B3' }],
    },
  };
  const full = [
    { id: 'R1', type: 'article' },
    { id: 'THREAD-00001', type: 'article' },
    { id: 'B4', type: 'social' },
    generatedThread,
    { id: 'dissertation-1986', type: 'Dissertation' },
  ];
  return {
    curated,
    social,
    full,
    core: full.map(({ id }) => ({ id })),
    details: Object.fromEntries(full.map(({ id }) => [id, {}])),
    index: { documentIds: { 0: 'R1', 1: 'THREAD-00001' }, documentCount: 2 },
    reviewedGeneratedIds: ['THREAD-00011', 'dissertation-1986'],
  };
}

test('derived ID guard retains curated and reviewed generated thread containers', () => {
  assertDerivedIds(fixture());
});

test('derived ID guard excludes curated threads rejected by the exporter', () => {
  const input = fixture();
  input.curated.push(
    { ...input.curated[1], id: 'THREAD-00002', verified: 'FALSE' },
    { ...input.curated[1], id: 'THREAD-00003', publication_date: 'not-a-date' },
  );
  assertDerivedIds(input);
});

test('feed freshness ignores build time and rejects changed reader content at the same URL', () => {
  const record = {
    id: 'R1', type: 'article', url: 'https://example.org/story',
    title: 'Original title', summary: 'Original summary',
    date: '2026-01-01', categories: ['Original category'],
  };
  const feed = row => generateAllFeeds([row], 'https://example.org/archive')['rss.xml'];
  const original = feed(record);
  const olderBuild = original.replace(/<lastBuildDate>[^<]*<\/lastBuildDate>/,
    '<lastBuildDate>Thu, 01 Jan 1970 00:00:00 GMT</lastBuildDate>');
  assertFeedCurrent(olderBuild, original, 'fixture RSS');
  for (const change of [
    { title: 'Corrected title' },
    { summary: 'Corrected summary' },
    { categories: ['Corrected category'] },
    { date: '2026-01-02' },
  ]) {
    assert.throws(() => assertFeedCurrent(original, feed({ ...record, ...change }), 'fixture RSS'),
      /stale feed content/);
  }
});

test('derived ID guard accepts future source-backed threads after registry review', () => {
  const input = fixture();
  const id = 'THREAD-00012';
  const posts = ['B5', 'B6', 'B7'];
  input.social.push(...posts.map(postId => ({ id: postId })));
  input.full.push({
    id,
    type: 'social',
    thread_data: {
      thread_id: posts[0],
      posts: posts.map(postId => ({ id: postId })),
    },
  });
  input.core.push({ id });
  input.details[id] = {};

  assert.throws(() => assertDerivedIds(input), /not source-backed or in generatedPublishedRecordIds/);
  input.reviewedGeneratedIds.push(id);
  assertDerivedIds(input);
});

test('derived ID guard rejects stale source, runtime, registry, and index states', () => {
  const mutations = [
    input => input.curated.push({ ...input.curated[0], id: 'R2' }),
    input => input.curated.splice(0, 1),
    input => input.full.pop(),
    input => input.core.pop(),
    input => delete input.details.R1,
    input => { input.index.documentIds[0] = 'R2'; },
    input => input.full.push({ id: 'UNREVIEWED', type: 'generated' }),
    input => { input.reviewedGeneratedIds = ['dissertation-1986']; },
    input => { input.full.find(record => record.id === 'THREAD-00011').thread_data.posts[0].id = 'MISSING'; },
  ];

  for (const mutate of mutations) {
    const input = fixture();
    mutate(input);
    assert.throws(() => assertDerivedIds(input));
  }
});

test('committed artifacts match source IDs and the reviewed generated registry', () => {
  const readJson = name => JSON.parse(fs.readFileSync(path.join('data', name), 'utf8'));
  const readCsv = name => parse(fs.readFileSync(path.join('data', name)), {
    bom: true,
    columns: true,
    skip_empty_lines: true,
  }).map(unescapeRow);
  const curated = readCsv('archive_records-public.csv');
  const social = readCsv('social_posts.csv');
  const full = readJson('archive-data.json').records;
  const reviewedGeneratedIds = readJson('graph-validation-holds.json').generatedPublishedRecordIds;

  assert.ok(Array.isArray(reviewedGeneratedIds), 'generatedPublishedRecordIds must be an array');
  assertIdSet(reviewedGeneratedIds, [...new Set(reviewedGeneratedIds)], 'generatedPublishedRecordIds');
  assertDerivedIds({
    curated,
    social,
    full,
    core: readJson('archive-core.json').records,
    details: readJson('archive-details.json').details,
    index: readJson('search-index.json'),
    reviewedGeneratedIds,
  });

  for (const [name, expected] of Object.entries(
    generateAllFeeds(full, 'https://pressthink.org/j/rosen-archive'),
  )) {
    const actual = fs.readFileSync(path.join('data', 'feeds', name), 'utf8');
    assertFeedCurrent(actual, expected, `data/feeds/${name}`);
  }
});
