import { normalizeForSearch } from '../utils/searchNormalize.js?v=3.8.27';

const WIKI_DATA_URL = './data/wiki-seed.json';

export const WIKI_PAGE_KINDS = Object.freeze(['concept', 'entity', 'topic']);
export const WIKI_MODERATION_STATES = Object.freeze(['seed', 'draft', 'pending', 'approved', 'locked']);
export const WIKI_ROUTE_PREFIX = 'wiki';
export const WIKI_SLUG_PATTERN = /^(concept|entity|topic)\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SAFE_REFERENCE_PROTOCOLS = new Set(['http:', 'https:']);

let wikiDataPromise = null;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function pageSearchText(page) {
  return normalizeForSearch([
    page.title,
    page.summary,
    page.kind,
    ...page.aliases,
    ...page.body.map(block => `${block.heading} ${block.text}`)
  ].join(' '));
}

export function isValidWikiSlug(slug) {
  return WIKI_SLUG_PATTERN.test(asString(slug));
}

export function wikiPageHref(slug) {
  if (!isValidWikiSlug(slug)) return '#wiki';
  return `#${WIKI_ROUTE_PREFIX}/${slug}`;
}

export function parseWikiHash(hash) {
  const cleanHash = asString(hash).replace(/^#/, '').split('?')[0];
  if (cleanHash === WIKI_ROUTE_PREFIX) return { route: WIKI_ROUTE_PREFIX, slug: null, notFound: false };
  if (!cleanHash.startsWith(`${WIKI_ROUTE_PREFIX}/`)) return { route: null, slug: null, notFound: false };

  // A slug under #wiki/ that fails validation is a malformed deep link, not the
  // index. Flag it so the page renders a not-found state rather than silently
  // falling back to the index (spec phase 1: a malformed slug renders not-found).
  const slug = cleanHash.slice(WIKI_ROUTE_PREFIX.length + 1);
  if (isValidWikiSlug(slug)) return { route: WIKI_ROUTE_PREFIX, slug, notFound: false };
  return { route: WIKI_ROUTE_PREFIX, slug: null, notFound: true };
}

export function isSafeReferenceUrl(url) {
  try {
    return SAFE_REFERENCE_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

export async function fetchWikiData() {
  if (!wikiDataPromise) {
    const pending = fetch(WIKI_DATA_URL).then(response => {
      if (!response.ok) {
        throw new Error(`Failed to load wiki seed data: ${response.status}`);
      }
      return response.json();
    });
    // Drop a failed load so a later visit retries instead of reusing the
    // rejected promise for the rest of the session. The identity guard avoids
    // clearing a newer promise a concurrent caller may have set.
    pending.catch(() => {
      if (wikiDataPromise === pending) wikiDataPromise = null;
    });
    wikiDataPromise = pending;
  }
  return wikiDataPromise;
}

export function normalizeWikiPage(page) {
  const aliases = asArray(page?.aliases).map(asString).filter(Boolean);
  const body = asArray(page?.body)
    .map(block => ({
      heading: asString(block?.heading),
      text: asString(block?.text)
    }))
    .filter(block => block.heading && block.text);
  const references = asArray(page?.references)
    .map(ref => ({
      label: asString(ref?.label),
      url: asString(ref?.url)
    }))
    .filter(ref => ref.label && isSafeReferenceUrl(ref.url));

  const normalized = {
    id: asString(page?.id),
    slug: asString(page?.slug),
    kind: asString(page?.kind),
    title: asString(page?.title),
    summary: asString(page?.summary),
    aliases,
    body,
    relatedConcepts: asArray(page?.relatedConcepts).map(asString).filter(Boolean),
    relatedEntities: asArray(page?.relatedEntities).map(asString).filter(Boolean),
    relatedRecords: asArray(page?.relatedRecords).map(asString).filter(Boolean),
    references,
    contributors: asArray(page?.contributors).map(asString).filter(Boolean),
    lastUpdated: asString(page?.lastUpdated),
    revisionCount: Number.isInteger(page?.revisionCount) ? page.revisionCount : 0,
    moderationState: asString(page?.moderationState) || 'draft'
  };

  return {
    ...normalized,
    searchText: pageSearchText(normalized)
  };
}

export function normalizeWikiPages(data) {
  return asArray(data?.pages).map(normalizeWikiPage);
}

export function buildWikiPageIndex(pages) {
  return new Map(pages.map(page => [page.slug, page]));
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
  return buildWikiPageIndex(pages).get(slug) || null;
}

export function getRelatedWikiSlugs(page) {
  return [...page.relatedConcepts, ...page.relatedEntities];
}

export function validateWikiData(data) {
  const pages = normalizeWikiPages(data);
  const errors = [];
  const slugs = new Set();

  if (data?.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!pages.length) errors.push('pages must contain at least one wiki page');

  for (const page of pages) {
    if (!page.id.startsWith('wiki-')) errors.push(`${page.slug || page.id}: id must start with wiki-`);
    if (!isValidWikiSlug(page.slug)) errors.push(`${page.id}: slug must match ${WIKI_SLUG_PATTERN}`);
    if (slugs.has(page.slug)) errors.push(`${page.slug}: duplicate slug`);
    slugs.add(page.slug);
    if (!WIKI_PAGE_KINDS.includes(page.kind)) errors.push(`${page.slug}: unknown kind ${page.kind}`);
    if (!page.title) errors.push(`${page.slug}: title is required`);
    if (page.summary.length < 20) errors.push(`${page.slug}: summary must describe the page`);
    if (!page.body.length) errors.push(`${page.slug}: at least one body block is required`);
    if (!page.contributors.length) errors.push(`${page.slug}: at least one contributor is required`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(page.lastUpdated)) errors.push(`${page.slug}: lastUpdated must be YYYY-MM-DD`);
    if (page.revisionCount < 1) errors.push(`${page.slug}: revisionCount must be at least 1`);
    if (!WIKI_MODERATION_STATES.includes(page.moderationState)) errors.push(`${page.slug}: unknown moderationState ${page.moderationState}`);
  }

  for (const page of pages) {
    for (const slug of getRelatedWikiSlugs(page)) {
      if (!slugs.has(slug)) errors.push(`${page.slug}: related page ${slug} does not exist`);
    }
  }

  return { valid: errors.length === 0, errors, pages };
}
