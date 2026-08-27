// Read-only WebMCP tools for the public archive.
//
// This module keeps the browser integration at the edge. The tool handlers use
// the same archive loaders and search helpers as the visible application. A
// browser without document.modelContext sees no change in behavior.

import {
  fetchCoreData,
  fetchEntitiesData,
  fetchRecordDetails,
  loadSearchIndex,
} from './archiveService.js?v=3.8.36';
import { sortRecords, RECORD_SORTS } from '../utils/recordSort.js?v=3.8.36';
import {
  buildSearchText,
  matchesParsedSearchText,
  normalizeForSearch,
  parseSearchQuery,
  searchLoadedIndexes,
} from '../utils/searchNormalize.js?v=3.8.36';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const MAX_QUERY_LENGTH = 200;
const MAX_FILTER_LENGTH = 200;
const MAX_RECORD_ID_LENGTH = 80;
const MAX_DETAIL_LENGTH = 6000;
const MAX_QUOTE_LENGTH = 3000;
const MAX_DETAIL_ITEMS = 50;
const CONTENT_TYPES = ['article', 'twitter', 'bluesky'];
const TWITTER_PUBLICATIONS = new Set(['twitter', 'twitter/x']);
const ENTITY_TYPES = ['Person', 'Organization', 'Concept', 'Work', 'Event', 'Location'];

function asInputObject(input) {
  if (input === undefined || input === null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Tool input must be an object');
  }
  return input;
}

function optionalString(value, name, maxLength = MAX_FILTER_LENGTH) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new TypeError(`${name} must be a string`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new RangeError(`${name} must be ${maxLength} characters or fewer`);
  }
  return trimmed;
}

function requiredRecordId(value) {
  const recordId = optionalString(value, 'record_id', MAX_RECORD_ID_LENGTH);
  if (!recordId) throw new TypeError('record_id is required');
  if (!/^[A-Za-z0-9_.:-]+$/.test(recordId)) {
    throw new TypeError('record_id contains unsupported characters');
  }
  return recordId;
}

function boundedLimit(value) {
  if (value === undefined || value === null) return DEFAULT_LIMIT;
  if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT) {
    throw new RangeError(`limit must be an integer from 1 through ${MAX_LIMIT}`);
  }
  return value;
}

function stringArray(value, name, maxItems = 6) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  if (value.length > maxItems) {
    throw new RangeError(`${name} can contain at most ${maxItems} values`);
  }
  const values = value.map((item, index) => {
    const parsed = optionalString(item, `${name}[${index}]`, 120);
    if (!parsed) throw new TypeError(`${name}[${index}] must not be empty`);
    return parsed;
  });
  if (new Set(values).size !== values.length) {
    throw new TypeError(`${name} must not contain duplicate values`);
  }
  return values;
}

function oneOf(value, name, allowed, fallback = null) {
  const parsed = optionalString(value, name);
  if (parsed === null) return fallback;
  if (!allowed.includes(parsed)) {
    throw new TypeError(`${name} must be one of: ${allowed.join(', ')}`);
  }
  return parsed;
}

function parseSearchInput(input) {
  const source = asInputObject(input);
  const query = optionalString(source.query, 'query', MAX_QUERY_LENGTH) || '';
  const year = optionalString(source.year, 'year', 4);
  const era = optionalString(source.era, 'era');
  if (year !== null && !/^\d{4}$/.test(year)) {
    throw new TypeError('year must contain four digits');
  }
  if (year && era) {
    throw new TypeError('year and era cannot be used together');
  }
  return {
    query,
    categories: stringArray(source.categories, 'categories'),
    era,
    year,
    publication: optionalString(source.publication, 'publication'),
    content_type: oneOf(source.content_type, 'content_type', CONTENT_TYPES),
    sort: oneOf(source.sort, 'sort', RECORD_SORTS, 'date-desc'),
    limit: boundedLimit(source.limit),
  };
}

function valuesMatch(left, right) {
  return normalizeForSearch(left) === normalizeForSearch(right);
}

function matchesContentType(record, contentType) {
  if (!contentType) return true;
  if (contentType === 'article') return record.type !== 'social';
  if (record.type !== 'social') return false;
  const publication = normalizeForSearch(record.pub);
  if (contentType === 'twitter') {
    return TWITTER_PUBLICATIONS.has(publication);
  }
  return contentType === 'bluesky' && publication.includes('bluesky');
}

function projectRecord(record, baseHref) {
  return {
    id: record.id,
    title: record.title || '',
    date: record.date || '',
    year: record.year || '',
    era: record.era || '',
    publication: record.pub || '',
    type: record.type || 'article',
    categories: Array.isArray(record.categories) ? record.categories : [],
    verified: record.verified === true,
    needsReview: record.needsReview === true,
    summaryPreview: record.summaryPreview || record.summary || '',
    archiveUrl: buildRecordLink(record.id, baseHref),
  };
}

/**
 * Build a stable archive link for one record without carrying unrelated state.
 */
export function buildRecordLink(recordId, baseHref) {
  const id = requiredRecordId(recordId);
  const url = new URL(baseHref);
  url.search = '';
  url.hash = '';
  url.searchParams.set('record', id);
  return url.toString();
}

/**
 * Search core archive records with the visible archive's search semantics.
 */
export function searchArchiveRecords(records, input = {}, options = {}) {
  const parsedInput = parseSearchInput(input);
  const sourceRecords = Array.isArray(records) ? records : [];
  const parsedQuery = parseSearchQuery(parsedInput.query);
  const normalizedQuery = normalizeForSearch(parsedInput.query);
  const searchIndexes = Array.isArray(options.searchIndexes) ? options.searchIndexes : [];
  const indexMatches = parsedInput.query && searchIndexes.length > 0
    ? new Set(searchLoadedIndexes(searchIndexes, parsedInput.query).map(hit => hit.id))
    : null;

  const matches = sourceRecords.filter((record) => {
    if (!record || typeof record !== 'object') return false;

    if (normalizedQuery) {
      const searchText = buildSearchText(record);
      const coreMatch = parsedQuery.phraseKeys.length > 0
        ? matchesParsedSearchText(searchText, parsedQuery)
        : searchText.includes(normalizedQuery);
      if (!coreMatch && !indexMatches?.has(record.id)) return false;
    }

    if (parsedInput.categories.length > 0) {
      const recordCategories = Array.isArray(record.categories) ? record.categories : [];
      if (!parsedInput.categories.every(category => recordCategories.includes(category))) return false;
    }
    if (parsedInput.year && String(record.year || '') !== parsedInput.year) return false;
    if (parsedInput.era && !valuesMatch(record.era, parsedInput.era)) return false;
    if (parsedInput.publication && !valuesMatch(record.pub, parsedInput.publication)) return false;
    if (!matchesContentType(record, parsedInput.content_type)) return false;
    return true;
  });

  const sorted = sortRecords(matches, parsedInput.sort);
  const limited = sorted.slice(0, parsedInput.limit);
  const baseHref = options.baseHref || 'https://pressthink.org/j/rosen-archive/';

  return {
    filters: parsedInput,
    totalMatches: sorted.length,
    returned: limited.length,
    records: limited.map(record => projectRecord(record, baseHref)),
  };
}

/**
 * Return the entities linked to one record from the archive entity payload.
 */
export function findRelatedEntities(payload, recordId, input = {}) {
  const id = requiredRecordId(recordId);
  const source = asInputObject(input);
  const entityType = oneOf(source.entity_type, 'entity_type', ENTITY_TYPES);
  const limit = boundedLimit(source.limit);
  const entities = Array.isArray(payload?.entities) ? payload.entities : [];
  const relatedIds = Array.isArray(payload?.recordEntityMap?.[id])
    ? payload.recordEntityMap[id]
    : [];
  const relatedSet = new Set(relatedIds.map(String));

  const matches = entities
    .filter(entity => relatedSet.has(String(entity?.id)))
    .filter(entity => !entityType || entity.type === entityType)
    .sort((left, right) => (
      (Number(right.prominence) || 0) - (Number(left.prominence) || 0)
      || String(left.name || '').localeCompare(String(right.name || ''))
    ));

  return {
    recordId: id,
    entityType,
    totalMatches: matches.length,
    returned: Math.min(matches.length, limit),
    entities: matches.slice(0, limit).map(entity => ({
      id: entity.id,
      name: entity.name || '',
      type: entity.type || '',
      role: entity.role || '',
      affiliation: entity.affiliation || '',
      prominence: Number(entity.prominence) || 0,
      totalMentions: Number(entity.totalMentions) || 0,
    })),
  };
}

function validateFacetSelections(input, facets = {}) {
  const checks = [
    ['categories', input.categories, facets.categories || []],
    ['era', input.era ? [input.era] : [], facets.eras || []],
    ['publication', input.publication ? [input.publication] : [], facets.publications || []],
  ];
  for (const [name, selected, allowed] of checks) {
    const unknown = selected.filter(value => !allowed.includes(value));
    if (unknown.length > 0) {
      throw new TypeError(`Unknown ${name} value: ${unknown.join(', ')}`);
    }
  }
}

function collectPublications(data = {}) {
  const records = Array.isArray(data?.records) ? data.records : [];
  const configured = Array.isArray(data?.facets?.publications)
    ? data.facets.publications
    : [];
  return [...new Set([
    ...configured,
    ...records.map(record => record?.pub),
  ].filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))]
    .sort((left, right) => left.localeCompare(right));
}

function clipText(value, maxLength) {
  const text = typeof value === 'string' ? value : '';
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

function memoizeLoader(loader) {
  let pending = null;
  return () => {
    if (!pending) {
      pending = Promise.resolve().then(loader);
      pending.catch(() => { pending = null; });
    }
    return pending;
  };
}

const emptyInputSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};

/**
 * Create tool descriptors. Dependencies are injectable for deterministic tests.
 */
export function createArchiveSiteTools(dependencies = {}) {
  const loadCoreData = dependencies.loadCoreData || fetchCoreData;
  const loadRecordDetails = dependencies.loadRecordDetails || fetchRecordDetails;
  const loadEntitiesData = dependencies.loadEntitiesData || fetchEntitiesData;
  const loadFullTextIndexes = dependencies.loadFullTextIndexes || loadSearchIndex;
  const currentHref = dependencies.currentHref || (() => globalThis.location?.href
    || 'https://pressthink.org/j/rosen-archive/');
  const getCoreData = memoizeLoader(loadCoreData);
  const getEntitiesData = memoizeLoader(async () => {
    const entityData = await loadEntitiesData();
    if (entityData?.error) throw new Error(entityData.error);
    return entityData;
  });

  return [
    {
      name: 'get_archive_facets',
      description: 'List the categories, eras, publications, and content types accepted by archive search.',
      inputSchema: emptyInputSchema,
      annotations: { readOnlyHint: true },
      execute: async () => {
        const data = await getCoreData();
        return {
          recordCount: Array.isArray(data?.records) ? data.records.length : 0,
          categories: data?.facets?.categories || [],
          eras: data?.facets?.eras || [],
          publications: collectPublications(data),
          contentTypes: CONTENT_TYPES,
        };
      },
    },
    {
      name: 'search_archive',
      description: 'Search public archive records without changing the current page or archive data.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', maxLength: MAX_QUERY_LENGTH },
          categories: {
            type: 'array',
            maxItems: 6,
            uniqueItems: true,
            items: { type: 'string', minLength: 1, maxLength: 120 },
          },
          era: {
            type: 'string',
            minLength: 1,
            maxLength: MAX_FILTER_LENGTH,
            description: 'An exact value from get_archive_facets. Do not use with year.',
          },
          year: {
            type: 'string',
            pattern: '^\\d{4}$',
            description: 'A four-digit year. Do not use with era.',
          },
          publication: { type: 'string', minLength: 1, maxLength: MAX_FILTER_LENGTH },
          content_type: { type: 'string', enum: CONTENT_TYPES },
          sort: { type: 'string', enum: RECORD_SORTS },
          limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async (input) => {
        const parsedInput = parseSearchInput(input);
        const data = await getCoreData();
        validateFacetSelections(parsedInput, {
          ...(data?.facets || {}),
          publications: collectPublications(data),
        });

        let indexes = [];
        let searchCoverage = parsedInput.query ? 'core fields only' : 'not applicable';
        let searchWarning = null;
        if (parsedInput.query) {
          try {
            const result = await loadFullTextIndexes();
            indexes = result?.indexes || [];
            searchCoverage = result?.complete ? 'complete full text' : 'partial full text';
            if (Array.isArray(result?.failures) && result.failures.length > 0) {
              searchWarning = 'One full-text index was unavailable. Results include every available index and core record fields.';
            }
          } catch {
            searchWarning = 'Full-text indexes were unavailable. Results cover titles, summary previews, and categories.';
          }
        }

        return {
          ...searchArchiveRecords(data?.records, parsedInput, {
            baseHref: currentHref(),
            searchIndexes: indexes,
          }),
          searchCoverage,
          ...(searchWarning ? { warning: searchWarning } : {}),
        };
      },
    },
    {
      name: 'get_archive_record',
      description: 'Read one public archive record by its record identifier without changing the page.',
      inputSchema: {
        type: 'object',
        properties: {
          record_id: {
            type: 'string',
            minLength: 1,
            maxLength: MAX_RECORD_ID_LENGTH,
            pattern: '^[A-Za-z0-9_.:-]+$',
          },
        },
        required: ['record_id'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async (input) => {
        const recordId = requiredRecordId(asInputObject(input).record_id);
        const data = await getCoreData();
        const coreRecord = Array.isArray(data?.records)
          ? data.records.find(record => record.id === recordId)
          : null;
        if (!coreRecord) return { found: false, recordId };

        const details = await loadRecordDetails(recordId) || {};
        const summary = details.summary || coreRecord.summaryPreview || '';
        const quote = details.quote || '';
        const relatedEntityIds = Array.isArray(details.relatedIds) ? details.relatedIds : [];
        const truncatedFields = [];
        if (summary.length > MAX_DETAIL_LENGTH) truncatedFields.push('summary');
        if (quote.length > MAX_QUOTE_LENGTH) truncatedFields.push('quote');
        if (relatedEntityIds.length > MAX_DETAIL_ITEMS) truncatedFields.push('relatedEntityIds');

        return {
          found: true,
          record: {
            ...projectRecord(coreRecord, currentHref()),
            author: details.author || 'Jay Rosen',
            summary: clipText(summary, MAX_DETAIL_LENGTH),
            quote: clipText(quote, MAX_QUOTE_LENGTH),
            concepts: Array.isArray(details.concepts)
              ? details.concepts.slice(0, MAX_DETAIL_ITEMS)
              : [],
            tags: Array.isArray(details.tags) ? details.tags.slice(0, MAX_DETAIL_ITEMS) : [],
            sourceUrl: details.url || '',
            relatedEntityIds: relatedEntityIds.slice(0, MAX_DETAIL_ITEMS),
            truncatedFields,
          },
        };
      },
    },
    {
      name: 'find_related_entities',
      description: 'Read the people, organizations, concepts, works, events, or locations linked to one archive record.',
      inputSchema: {
        type: 'object',
        properties: {
          record_id: {
            type: 'string',
            minLength: 1,
            maxLength: MAX_RECORD_ID_LENGTH,
            pattern: '^[A-Za-z0-9_.:-]+$',
          },
          entity_type: { type: 'string', enum: ENTITY_TYPES },
          limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT },
        },
        required: ['record_id'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async (input) => {
        const source = asInputObject(input);
        const recordId = requiredRecordId(source.record_id);
        const data = await getCoreData();
        const recordExists = Array.isArray(data?.records)
          && data.records.some(record => record.id === recordId);
        if (!recordExists) return { found: false, recordId };

        const entityData = await getEntitiesData();
        return {
          found: true,
          ...findRelatedEntities(entityData, recordId, source),
        };
      },
    },
  ];
}

/**
 * Register tools only when the current browser implements WebMCP.
 */
export async function registerArchiveSiteTools(options = {}) {
  const { documentObject = globalThis.document, ...dependencies } = options;
  const modelContext = documentObject?.modelContext;
  if (typeof modelContext?.registerTool !== 'function') return false;

  for (const tool of createArchiveSiteTools(dependencies)) {
    await modelContext.registerTool(tool);
  }
  return true;
}
