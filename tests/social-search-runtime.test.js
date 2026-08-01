import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createResilientSearchIndexLoader,
  loadAvailableSearchIndexes,
} from '../frontend/services/searchIndexLoader.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

const constantsSource = read('frontend/constants.js');
const archiveServiceSource = read('frontend/services/archiveService.js');
const appSource = read('frontend/App.js');

describe('lazy social full-text search runtime (#669)', () => {
  it('declares the social index as a distinct lazy data resource', () => {
    assert.match(
      constantsSource,
      /social_search_index:\s*['"]\.\/data\/social-search-index\.json['"]/,
    );
  });

  it('loads both prebuilt indexes through the memoized resilient loader', () => {
    assert.match(
      archiveServiceSource,
      /createResilientSearchIndexLoader\([\s\S]*DATA_CONFIG\.search_index[\s\S]*DATA_CONFIG\.social_search_index/,
    );
    assert.match(archiveServiceSource, /loadJSON:\s*MiniSearch\.loadJSON\.bind\(MiniSearch\)/);
    assert.match(
      archiveServiceSource,
      /searchIndexLoaderPromise\.catch\(\(\) => \{ searchIndexLoaderPromise = null; \}\)/,
    );
  });

  it('keeps a healthy index when its sibling artifact fails to load', async () => {
    const specs = [
      { url: 'article-index.json', options: { kind: 'article' } },
      { url: 'social-index.json', options: { kind: 'social' } },
    ];
    const fetchImpl = async url => {
      if (url === 'social-index.json') return { ok: false, status: 404 };
      return { ok: true, text: async () => '{"article":true}' };
    };
    const loadJSON = (text, options) => ({ text, kind: options.kind });

    const result = await loadAvailableSearchIndexes(specs, { fetchImpl, loadJSON });

    assert.deepEqual(result.indexes, [{ text: '{"article":true}', kind: 'article' }]);
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].url, 'social-index.json');
    assert.match(result.failures[0].error.message, /HTTP 404/);
  });

  it('rejects only when every full-text index is unavailable', async () => {
    const specs = [
      { url: 'article-index.json', options: {} },
      { url: 'social-index.json', options: {} },
    ];
    const fetchImpl = async () => ({ ok: false, status: 503 });

    await assert.rejects(
      loadAvailableSearchIndexes(specs, { fetchImpl, loadJSON: () => null }),
      error => error instanceof AggregateError && error.errors.length === 2,
    );
  });

  it('retries a transiently missing sibling without refetching the healthy index', async () => {
    const attempts = new Map();
    const fetchImpl = async url => {
      attempts.set(url, (attempts.get(url) || 0) + 1);
      if (url === 'social-index.json' && attempts.get(url) === 1) {
        return { ok: false, status: 503 };
      }
      return { ok: true, text: async () => url };
    };
    const loader = createResilientSearchIndexLoader([
      { url: 'article-index.json', options: { kind: 'article' } },
      { url: 'social-index.json', options: { kind: 'social' } },
    ], {
      fetchImpl,
      loadJSON: (text, options) => ({ text, kind: options.kind }),
    });

    const partial = await loader.load();
    assert.equal(partial.complete, false);
    assert.deepEqual(partial.indexes.map(index => index.kind), ['article']);

    const recovered = await loader.load();
    assert.equal(recovered.complete, true);
    assert.deepEqual(recovered.indexes.map(index => index.kind), ['article', 'social']);
    assert.equal(attempts.get('article-index.json'), 1);
    assert.equal(attempts.get('social-index.json'), 2);
  });

  it('returns the cached healthy index when a sibling retry still fails', async () => {
    const attempts = new Map();
    const fetchImpl = async url => {
      attempts.set(url, (attempts.get(url) || 0) + 1);
      if (url === 'social-index.json') return { ok: false, status: 503 };
      return { ok: true, text: async () => url };
    };
    const loader = createResilientSearchIndexLoader([
      { url: 'article-index.json', options: { kind: 'article' } },
      { url: 'social-index.json', options: { kind: 'social' } },
    ], {
      fetchImpl,
      loadJSON: (text, options) => ({ text, kind: options.kind }),
    });

    const partial = await loader.load();
    assert.equal(partial.complete, false);
    assert.deepEqual(partial.indexes.map(index => index.kind), ['article']);

    const stillPartial = await loader.load();
    assert.equal(stillPartial.complete, false);
    assert.deepEqual(stillPartial.indexes.map(index => index.kind), ['article']);
    assert.equal(stillPartial.failures.length, 1);
    assert.equal(stillPartial.failures[0].url, 'social-index.json');
    assert.match(stillPartial.failures[0].error.message, /HTTP 503/);
    assert.equal(attempts.get('article-index.json'), 1);
    assert.equal(attempts.get('social-index.json'), 2);
  });

  it('unions hits from every loaded index with the substring search', () => {
    assert.match(appSource, /miniRefs\.current\s*=\s*result\.indexes/);
    assert.match(appSource, /miniRefs\.current\.flatMap\(\(mini\)\s*=>/);
    assert.match(appSource, /searchIndex\[i\]\.includes\(term\)\s*\|\|\s*\(miniIds && miniIds\.has\(r\.id\)\)/);
    assert.match(appSource, /setMiniRetryTick\(tick => tick \+ 1\)/);
    assert.match(appSource, /if \(result\.complete\)[\s\S]*else \{[\s\S]*scheduleRetry\(\)/);
    assert.match(appSource, /const MAX_MINI_INDEX_RETRIES = 3/);
    assert.match(
      appSource,
      /if \(miniRetryAttempts\.current >= MAX_MINI_INDEX_RETRIES\) \{[\s\S]*miniRetryExhausted\.current = true/,
    );
    assert.match(appSource, /miniRetryAttempts\.current \+= 1/);
    assert.match(appSource, /\|\| miniRetryExhausted\.current/);
  });
});
