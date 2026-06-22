import { normalizeForSearch } from '../utils/searchNormalize.js?v=3.4.5';

const WIKI_DATA_URL = './data/wiki-seed.json';

let wikiDataPromise = null;

function pageSearchText(page) {
  return normalizeForSearch([
    page.title,
    page.summary,
    page.kind,
    ...(page.aliases || []),
    ...(page.body || []).map(block => `${block.heading || ''} ${block.text || ''}`)
  ].join(' '));
}

export async function fetchWikiData() {
  if (!wikiDataPromise) {
    wikiDataPromise = fetch(WIKI_DATA_URL).then(response => {
      if (!response.ok) {
        throw new Error(`Failed to load wiki seed data: ${response.status}`);
      }
      return response.json();
    });
  }
  return wikiDataPromise;
}

export function normalizeWikiPages(data) {
  const pages = Array.isArray(data?.pages) ? data.pages : [];
  return pages.map(page => ({
    ...page,
    aliases: Array.isArray(page.aliases) ? page.aliases : [],
    body: Array.isArray(page.body) ? page.body : [],
    relatedConcepts: Array.isArray(page.relatedConcepts) ? page.relatedConcepts : [],
    relatedEntities: Array.isArray(page.relatedEntities) ? page.relatedEntities : [],
    relatedRecords: Array.isArray(page.relatedRecords) ? page.relatedRecords : [],
    references: Array.isArray(page.references) ? page.references : [],
    contributors: Array.isArray(page.contributors) ? page.contributors : [],
    searchText: pageSearchText(page)
  }));
}

export function filterWikiPages(pages, { query = '', kind = 'all' } = {}) {
  const term = normalizeForSearch(query);
  return pages.filter(page => {
    if (kind !== 'all' && page.kind !== kind) return false;
    if (!term) return true;
    return page.searchText.includes(term);
  });
}

export function findWikiPageBySlug(pages, slug) {
  return pages.find(page => page.slug === slug) || null;
}
