/**
 * Social-body search coverage for issue #669.
 *
 * The article index is intentionally kept separate: the measured unified index
 * is materially larger, while both indexes can remain lazy browser resources.
 * These checks pin the social artifact to the exact source rows that survive
 * the public export so filtered or unverified posts cannot leak through search.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import MiniSearch from 'minisearch';
import { parse } from 'csv-parse/sync';
import { socialSearchIndexOptions } from '../frontend/utils/searchConfig.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relativePath) => JSON.parse(
  fs.readFileSync(path.join(rootDir, relativePath), 'utf8'),
);

const archive = readJson('data/archive-data.json');
const socialRows = parse(
  fs.readFileSync(path.join(rootDir, 'data/social_posts.csv'), 'utf8'),
  { columns: true, skip_empty_lines: true },
);
const servedIds = new Set(archive.records.map((record) => record.id));
const expectedSocialIds = new Set(
  socialRows.filter((row) => servedIds.has(row.id)).map((row) => row.id),
);
const expectedThreadIds = new Set(
  archive.records
    .filter((record) => record.id.startsWith('THREAD-') && record.thread_data?.posts?.length)
    .map((record) => record.id),
);
const expectedIndexedIds = new Set([...expectedSocialIds, ...expectedThreadIds]);

const socialIndexJson = readJson('data/social-search-index.json');
const indexedIds = new Set(Object.values(socialIndexJson.documentIds));
const socialIndex = MiniSearch.loadJSON(
  JSON.stringify(socialIndexJson),
  socialSearchIndexOptions(),
);
const readSource = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

describe('social full-text search artifact (#669)', () => {
  it('finds a phrase that only appears past the shipped Bluesky preview', () => {
    const id = 'BSKY-00043';
    const phrase = 'vow to continue the work amid a mood of despair';
    const source = socialRows.find((row) => row.id === id);
    const served = archive.records.find((record) => record.id === id);

    assert.ok(source?.raw_text.includes(phrase), 'fixture phrase must exist in the canonical Bluesky body');
    assert.ok(served, 'fixture Bluesky post must be part of the shipped archive');
    assert.ok(
      ![served.title, served.summary, served.quote, ...(served.categories || []), ...(served.tags || [])]
        .join(' ')
        .includes(phrase),
      'fixture phrase must remain outside the card-only substring fields',
    );

    const hits = socialIndex.search(phrase, { prefix: true, combineWith: 'AND' });
    assert.ok(hits.some((hit) => hit.id === id), 'the Bluesky body-only phrase should be findable');
  });

  it('finds later-post text under the served thread container id', () => {
    const id = 'THREAD-00017';
    const phrase = 'sights are set on human communication itself';
    const served = archive.records.find((record) => record.id === id);

    assert.ok(served, 'generated thread container must be served');
    assert.ok(
      served.thread_data.posts.some((post) => post.content.includes(phrase)),
      'fixture phrase must exist in a later thread post',
    );
    assert.ok(!served.quote.includes(phrase), 'fixture phrase must remain outside the card preview');

    const hits = socialIndex.search(phrase, { prefix: true, combineWith: 'AND' });
    assert.ok(hits.some((hit) => hit.id === id), 'later thread text should find the served container');
  });

  it('indexes exactly the served social source rows and thread containers', () => {
    assert.equal(socialIndexJson.documentCount, expectedIndexedIds.size);
    assert.deepEqual(indexedIds, expectedIndexedIds);
    assert.deepEqual(Object.keys(socialIndexJson.fieldIds), ['body']);
  });

  it('keeps the exporter and parity contract aligned on non-empty threads', () => {
    assert.match(
      readSource('data/export-archive-data.js'),
      /Array\.isArray\(record\.thread_data\?\.posts\)\s*&& record\.thread_data\.posts\.length > 0/,
    );
  });

  it('keeps filtered and unverified social rows out', () => {
    const excludedRows = socialRows.filter((row) => !servedIds.has(row.id));
    assert.ok(excludedRows.some((row) => row.verified === 'FALSE'), 'fixture must include unverified rows');
    assert.ok(excludedRows.some((row) => row.verified === 'TRUE'), 'fixture must include otherwise-filtered rows');
    assert.ok(excludedRows.every((row) => !indexedIds.has(row.id)));
  });

  it('ships through every data deploy path without entering install precache', () => {
    assert.match(readSource('frontend/sw.js'), /social-search-index\.json/);
    assert.doesNotMatch(
      readSource('frontend/sw.js'),
      /INSTALL_PRECACHE_DATA[\s\S]*endsWith\(['"]\/social-search-index\.json['"]\)/,
    );
    assert.match(readSource('backend/submission_runtime/artifacts.py'), /social-search-index\.json/);
    assert.match(readSource('backend/scripts/deploy_full_site.py'), /social-search-index\.json/);
    assert.match(readSource('backend/tests/test_publish_list_parity.py'), /social-search-index\.json/);
  });
});
