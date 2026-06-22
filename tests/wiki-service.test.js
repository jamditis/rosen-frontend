import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { filterWikiPages, findWikiPageBySlug, normalizeWikiPages } from '../frontend/services/wikiService.js?v=3.4.5';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const seedPath = path.join(rootDir, 'data', 'wiki-seed.json');
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

describe('wiki seed data', () => {
  it('has the minimum launch fields for each page', () => {
    assert.equal(seed.schemaVersion, 1);
    assert.ok(seed.pages.length >= 3);

    for (const page of seed.pages) {
      assert.match(page.id, /^wiki-/);
      assert.match(page.slug, /^(concept|entity|topic)\//);
      assert.ok(['concept', 'entity', 'topic'].includes(page.kind));
      assert.ok(page.title.length > 3);
      assert.ok(page.summary.length > 20);
      assert.ok(Array.isArray(page.aliases));
      assert.ok(Array.isArray(page.body));
      assert.ok(Array.isArray(page.relatedConcepts));
      assert.ok(Array.isArray(page.relatedEntities));
      assert.ok(Array.isArray(page.relatedRecords));
      assert.ok(Array.isArray(page.references));
      assert.ok(Array.isArray(page.contributors));
      assert.match(page.lastUpdated, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(Number.isInteger(page.revisionCount));
    }
  });

  it('uses unique slugs so wiki URLs are stable', () => {
    const slugs = seed.pages.map(page => page.slug);
    assert.equal(new Set(slugs).size, slugs.length);
  });
});

describe('wiki service helpers', () => {
  const pages = normalizeWikiPages(seed);

  it('adds normalized search text without mutating core page fields', () => {
    const page = pages[0];
    assert.ok(page.searchText.includes('public journalism'));
    assert.equal(page.title, seed.pages[0].title);
  });

  it('filters by page kind and query', () => {
    const results = filterWikiPages(pages, { kind: 'concept', query: 'public' });
    assert.deepEqual(results.map(page => page.slug), ['concept/public-journalism', 'concept/press-public-relationship']);
  });

  it('finds pages by stable slug', () => {
    const page = findWikiPageBySlug(pages, 'entity/jay-rosen');
    assert.equal(page.title, 'Jay Rosen');
  });
});
