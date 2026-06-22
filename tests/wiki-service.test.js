import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildWikiPageIndex,
  filterWikiPages,
  findWikiPageBySlug,
  isSafeReferenceUrl,
  isValidWikiSlug,
  normalizeWikiPage,
  normalizeWikiPages,
  parseWikiHash,
  validateWikiData,
  wikiPageHref,
  WIKI_MODERATION_STATES,
  WIKI_PAGE_KINDS
} from '../frontend/services/wikiService.js?v=3.4.5';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const seedPath = path.join(rootDir, 'data', 'wiki-seed.json');
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

describe('wiki seed data contract', () => {
  it('passes the service-level wiki data validator', () => {
    const result = validateWikiData(seed);
    assert.deepEqual(result.errors, []);
    assert.equal(result.valid, true);
  });

  it('uses unique, namespaced, lowercase slugs so wiki URLs are stable', () => {
    const slugs = seed.pages.map(page => page.slug);
    assert.equal(new Set(slugs).size, slugs.length);
    for (const slug of slugs) {
      assert.equal(isValidWikiSlug(slug), true, `${slug} must be a valid wiki slug`);
    }
  });

  it('uses only explicit page kinds and moderation states', () => {
    for (const page of seed.pages) {
      assert.ok(WIKI_PAGE_KINDS.includes(page.kind));
      assert.ok(WIKI_MODERATION_STATES.includes(page.moderationState));
    }
  });

  it('does not ship dangling related page links', () => {
    const slugs = new Set(seed.pages.map(page => page.slug));
    for (const page of seed.pages) {
      for (const relatedSlug of [...page.relatedConcepts, ...page.relatedEntities]) {
        assert.ok(slugs.has(relatedSlug), `${page.slug} links to missing ${relatedSlug}`);
      }
    }
  });

  it('keeps public references on http or https URLs only', () => {
    for (const page of seed.pages) {
      for (const ref of page.references) {
        assert.equal(isSafeReferenceUrl(ref.url), true, `${page.slug} has unsafe reference ${ref.url}`);
      }
    }
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
    assert.deepEqual(results.map(page => page.slug), [
      'concept/public-journalism',
      'concept/press-public-relationship',
      'concept/audience-relationship'
    ]);
  });

  it('finds pages by stable slug and can build an index once for UI lookups', () => {
    const page = findWikiPageBySlug(pages, 'entity/jay-rosen');
    const index = buildWikiPageIndex(pages);
    assert.equal(page.title, 'Jay Rosen');
    assert.equal(index.get('entity/jay-rosen').title, 'Jay Rosen');
  });

  it('normalizes malformed optional arrays and strips unsafe references', () => {
    const page = normalizeWikiPage({
      id: 'wiki-topic-test',
      slug: 'topic/test',
      kind: 'topic',
      title: 'Test',
      summary: 'A test page with malformed optional fields.',
      aliases: 'bad',
      body: [{ heading: 'Valid', text: 'Valid body text.' }, { heading: '', text: 'Drop me' }],
      references: [{ label: 'Bad', url: 'javascript:alert(1)' }, { label: 'Good', url: 'https://example.com' }],
      contributors: ['archive maintainers'],
      lastUpdated: '2026-06-22',
      revisionCount: 1,
      moderationState: 'seed'
    });

    assert.deepEqual(page.aliases, []);
    assert.deepEqual(page.body, [{ heading: 'Valid', text: 'Valid body text.' }]);
    assert.deepEqual(page.references, [{ label: 'Good', url: 'https://example.com' }]);
  });

  it('reports invalid schema details instead of silently accepting bad wiki data', () => {
    const result = validateWikiData({
      schemaVersion: 1,
      pages: [{
        id: 'bad',
        slug: 'concept/MixedCase',
        kind: 'person',
        title: '',
        summary: 'short',
        body: [],
        contributors: [],
        lastUpdated: '06/22/2026',
        revisionCount: 0,
        moderationState: 'unknown'
      }]
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors.length >= 8);
  });
});

describe('wiki route helpers', () => {
  it('parses index and nested wiki hashes', () => {
    assert.deepEqual(parseWikiHash('#wiki'), { route: 'wiki', slug: null });
    assert.deepEqual(parseWikiHash('#wiki/concept/public-journalism'), { route: 'wiki', slug: 'concept/public-journalism' });
  });

  it('rejects unknown prefixes and malformed slugs', () => {
    assert.deepEqual(parseWikiHash('#archive'), { route: null, slug: null });
    assert.deepEqual(parseWikiHash('#wiki/concept/Bad'), { route: 'wiki', slug: null });
  });

  it('builds only safe wiki page hrefs', () => {
    assert.equal(wikiPageHref('concept/public-journalism'), '#wiki/concept/public-journalism');
    assert.equal(wikiPageHref('javascript:alert-1'), '#wiki');
  });
});
