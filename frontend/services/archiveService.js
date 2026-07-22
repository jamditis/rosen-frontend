
import { DATA_CONFIG } from '../constants.js?v=3.7.11';
import {
  initDatabase,
  loadArchiveData as loadSqliteData,
  isReady as isSqliteReady,
  queryAsObjects,
  getRecordCountByYear,
  getRecordCountByCategory,
  getRecordCountByEra,
  getMostMentionedEntities,
  getMostCommonConcepts,
  getCategoryCoOccurrence,
  searchRecords as sqlSearchRecords,
  getStats as getSqliteStats
} from './sqliteService.js?v=3.7.11';
import { IS_LOCAL, BASE_PATH } from '../utils/pathResolver.js?v=3.7.11';
import { searchIndexOptions } from '../utils/searchConfig.js?v=3.7.11';
import { escapeCsvCell } from '../utils/csvSafety.js?v=3.7.11';
import { idbGet, idbSet, idbClear } from './idbCache.js?v=3.7.11';
import { CACHE_VERSION, CACHE_TTL_MS, MAX_LOCALSTORAGE_SIZE, cacheKeyFor } from './cacheConfig.js?v=3.7.11';
import { raceTimeout } from '../utils/raceTimeout.js?v=3.7.11';

// Routine cache-hit / fetch-start logs are silent in production. Set
// `localStorage.jrda_debug = '1'` in DevTools and reload to opt in (#170).
// Wrapped in try/catch because localStorage access can throw SecurityError
// in privacy modes or when storage is blocked by browser policy; a throw
// here would prevent this module (and therefore the whole app) from loading.
const DEBUG = (() => {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('jrda_debug') === '1';
  } catch {
    return false;
  }
})();
const debug = DEBUG ? console.log.bind(console) : () => {};

// Simple hash function for UI color selection (djb1 variant)
// Used by App.js to deterministically assign colors to categories
export const hashString = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i);
  return Math.abs(hash);
};

// ============================================
// LAZY LOADING STATE
// ============================================

// Cache for loaded details (populated on demand)
let detailsCache = null;
let detailsLoading = false;
let detailsLoadPromise = null;

// Cache for loaded entities (populated on demand)
let entitiesCache = null;
let entitiesLoading = false;
let entitiesLoadPromise = null;

// Entity lookup maps - populated when data is loaded
let entityById = new Map();        // entity_id -> entity object
let entityToRecords = new Map();   // entity_id -> Set of record ids
let recordToEntities = new Map();  // record_id -> Set of entity ids

/**
 * Build entity lookup maps from loaded archive data
 * Called after archive data is fetched
 */
export const buildEntityMaps = (data) => {
  entityById.clear();
  entityToRecords.clear();
  recordToEntities.clear();

  // Build entity ID -> entity object map
  if (data.entities && Array.isArray(data.entities)) {
    data.entities.forEach(entity => {
      entityById.set(entity.id, entity);
    });
  }

  // Build bidirectional record <-> entity maps
  if (data.records && Array.isArray(data.records)) {
    data.records.forEach(record => {
      const entityIds = record.relatedIds || [];
      recordToEntities.set(record.id, new Set(entityIds));

      entityIds.forEach(entityId => {
        if (!entityToRecords.has(entityId)) {
          entityToRecords.set(entityId, new Set());
        }
        entityToRecords.get(entityId).add(record.id);
      });
    });
  }

  console.log(`Built entity maps: ${entityById.size} entities, ${recordToEntities.size} records`);
};

/**
 * Get entity by ID
 */
export const getEntityById = (entityId) => entityById.get(entityId);

/**
 * Get all records that mention a specific entity
 */
export const getRecordsByEntity = (entityId) => {
  const recordIds = entityToRecords.get(entityId);
  return recordIds ? Array.from(recordIds) : [];
};

/**
 * Get all entities mentioned in a record
 */
export const getEntitiesByRecord = (recordId) => {
  const entityIds = recordToEntities.get(recordId);
  if (!entityIds) return [];
  return Array.from(entityIds).map(id => entityById.get(id)).filter(Boolean);
};

/**
 * Find shared entities between two records
 * @param {string} recordId1 - First record ID
 * @param {string} recordId2 - Second record ID
 * @param {string|null} entityTypeFilter - Optional entity type filter (Person, Organization, Concept, etc.)
 * @returns {Array} Array of shared entity objects with prominence scores
 */
export const findSharedEntities = (recordId1, recordId2, entityTypeFilter = null) => {
  const entities1 = recordToEntities.get(recordId1);
  const entities2 = recordToEntities.get(recordId2);

  if (!entities1 || !entities2) return [];

  const shared = [];
  entities1.forEach(entityId => {
    if (entities2.has(entityId)) {
      const entity = entityById.get(entityId);
      if (entity) {
        // Apply type filter if specified
        if (!entityTypeFilter || entity.type === entityTypeFilter) {
          shared.push(entity);
        }
      }
    }
  });

  // Sort by prominence (higher first)
  return shared.sort((a, b) => (b.prominence || 0) - (a.prominence || 0));
};

/**
 * Calculate connection strength between two records based on shared entities
 * @param {string} recordId1 - First record ID
 * @param {string} recordId2 - Second record ID
 * @param {string|null} entityTypeFilter - Optional entity type filter
 * @returns {Object} { strength: number, sharedEntities: Array }
 */
export const calculateEntityConnectionStrength = (recordId1, recordId2, entityTypeFilter = null) => {
  const sharedEntities = findSharedEntities(recordId1, recordId2, entityTypeFilter);

  if (sharedEntities.length === 0) {
    return { strength: 0, sharedEntities: [], prominenceScore: 0 };
  }

  // Calculate weighted strength based on prominence scores
  const prominenceScore = sharedEntities.reduce((sum, e) => sum + (e.prominence || 1), 0);

  return {
    strength: sharedEntities.length,
    sharedEntities,
    prominenceScore
  };
};

const DISSERTATION_RECORD = {
  id: 'dissertation-1986',
  title: 'The Impossible Press: American Journalism and the Decline of Public Life',
  author: 'Jay Rosen',
  date: '1986-01-01',
  year: '1986',
  era: 'Public Journalism (90s)',
  pub: 'New York University (Ph.D. Dissertation)',
  url: IS_LOCAL ? './dissertation/reader/' : `${BASE_PATH}/dissertation/reader/`,
  summary: 'Rosen\'s doctoral dissertation traces the history of the idea that the function of the press is to inform the public. It argues that the rise of the mass circulation newspaper, while creating a technical ability to reach everyone, actually undermined the conditions necessary for a "universal town meeting." Drawing heavily on Walter Lippmann and John Dewey, it suggests that the professionalization of journalism ("objectivity") was a retreat from the problem of creating a genuine public life in a complex society. It contrasts news as "symptom" vs. news as "symbol" and explores how the press creates a "pseudo-environment" of public opinion.',
  quote: 'An impossible press was born, one which sought to solve the whole problem of public life simply by controlling the conduct of journalists.',
  categories: ['Journalism Theory & Practice', 'Politics & Democracy', 'Press & Media Criticism', 'Audience & Public Engagement'],
  concepts: ['Public Sphere', 'Omnicompetent Citizen', 'Objectivity', 'Mass Society', 'Professionalism', 'Communication vs Community', 'Democracy and Distance'],
  tags: ['Walter Lippmann', 'John Dewey', 'James Gordon Bennett', 'Joseph Pulitzer', 'Penny Press', 'Yellow Journalism', 'Robert Park', 'Tocqueville'],
  verified: true,
  type: 'Dissertation'
};

// Cache configuration (CACHE_VERSION / CACHE_TTL_MS / MAX_LOCALSTORAGE_SIZE
// and the cacheKeyFor hash) is shared with loaders/httpCachedLoader.js via
// cacheConfig.js so the two cache paths cannot drift.

/**
 * Check version.json on the server. If the version has changed,
 * clear all caches so users get fresh data after deploys.
 */
// Memoise the in-flight Promise so concurrent callers all await the same
// fetch instead of racing past a sync boolean (#171). Released on settle
// so a hung or failed check doesn't poison every future call in the session.
let versionCheckPromise = null;
const checkVersion = () => {
  if (versionCheckPromise) return versionCheckPromise;
  const pending = (async () => {
    try {
      const resp = await fetch('./version.json?t=' + Date.now());
      if (resp.ok) {
        const { version } = await resp.json();
        const stored = localStorage.getItem('jrda_deploy_version');
        if (stored && stored !== version) {
          console.log('[Cache] Deploy version changed, clearing caches');
          clearArchiveCache();
        }
        localStorage.setItem('jrda_deploy_version', version);
      }
    } catch { /* version.json not available, skip */ }
  })();
  versionCheckPromise = pending;
  pending.finally(() => {
    if (versionCheckPromise === pending) versionCheckPromise = null;
  });
  return pending;
};

// Bound the wait at the call site so a slow or hung version.json can't
// stall a load a good cache could satisfy. The check stays in flight in
// the background and clears the cache if it eventually returns.
const VERSION_CHECK_TIMEOUT_MS = 4000;

const getCachedData = (url) => {
  try {
    const cacheKey = cacheKeyFor(url);
    // localStorage is the only writer now (#337); still read a legacy
    // sessionStorage entry first so caches from older builds expire cleanly.
    let cached = sessionStorage.getItem(cacheKey) || localStorage.getItem(cacheKey);
    if (!cached) return null;

    const entry = JSON.parse(cached);
    const now = Date.now();

    if (entry.version !== CACHE_VERSION || (now - entry.timestamp) > CACHE_TTL_MS) {
      try { sessionStorage.removeItem(cacheKey); } catch {}
      try { localStorage.removeItem(cacheKey); } catch {}
      return null;
    }

    return entry.data;
  } catch (e) {
    console.warn('Cache read error:', e);
    return null;
  }
};

const setCachedData = (url, data) => {
  const cacheKey = cacheKeyFor(url);
  const entry = {
    data,
    timestamp: Date.now(),
    version: CACHE_VERSION
  };

  try {
    const serialized = JSON.stringify(entry);

    // Web Storage gives localStorage and sessionStorage a ~5 MB quota each, so a
    // payload too large for localStorage will not fit sessionStorage either. The
    // old overflow-to-sessionStorage attempt therefore threw QuotaExceededError on
    // every load for the large data dumps (archive-core ~13 MB, archive-details
    // ~13 MB, archive-data ~30 MB) and cached nothing. Skip it: archive-core also
    // has an IndexedDB cache (fetchCoreData, far larger quota), and all of these
    // payloads are served from the service-worker Cache Storage on refetch
    // (sw.js stale-while-revalidate), so Web Storage is redundant for them. (#337)
    // These files are not in Web Storage and only archive-core is in IndexedDB,
    // so when the service worker is unavailable they refetch on every
    // navigation. That residual gap is surfaced once at startup (the
    // SW-registration block in index.html), not cached here (#428).
    if (serialized.length > MAX_LOCALSTORAGE_SIZE) {
      return;
    }

    // Small data goes to localStorage (persists across sessions)
    localStorage.setItem(cacheKey, serialized);
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      console.log('Cache storage full, clearing old archive caches...');
      try {
        clearArchiveCache();
        localStorage.setItem(cacheKey, JSON.stringify(entry));
      } catch {
        console.warn('Cache disabled: browser storage is full.');
      }
    } else {
      console.warn('Cache write error:', e);
    }
  }
};

// Clear all archive caches from both localStorage and sessionStorage
export const clearArchiveCache = () => {
  try {
    for (const storage of [localStorage, sessionStorage]) {
      const keys = Object.keys(storage);
      const archiveKeys = keys.filter(key => key.startsWith('archive_json_') || key.startsWith('archive_csv_'));
      archiveKeys.forEach(key => storage.removeItem(key));
    }
    console.log('Archive caches cleared');
  } catch (e) {
    console.warn('Error clearing cache:', e);
  }
  // Also drop the IndexedDB core-data store. Fire-and-forget: idbClear never
  // rejects (it resolves false on failure), and the version-namespaced key
  // (coreIdbKey) already prevents a stale read, so callers needn't await this.
  idbClear();
};

// IndexedDB cache key for the core payload. Namespaced by the manual
// CACHE_VERSION knob and the deploy version (version.json, stored by
// checkVersion), so a deploy or a cache-version bump addresses a fresh key —
// a stale blob is never read, by construction, without relying on a racy
// async clear. clearArchiveCache additionally wipes the store to bound growth.
const readDeployVersion = () => {
  try {
    return localStorage.getItem('jrda_deploy_version') || 'novers';
  } catch {
    return 'novers';
  }
};
const coreIdbKey = () => `archive-core::${CACHE_VERSION}::${readDeployVersion()}`;
const makeCoreEntry = (data) => ({ data, timestamp: Date.now(), version: CACHE_VERSION });
const isFreshEntry = (entry) =>
  !!entry &&
  entry.version === CACHE_VERSION &&
  typeof entry.timestamp === 'number' &&
  (Date.now() - entry.timestamp) <= CACHE_TTL_MS;

/**
 * Fetch core archive data (lightweight, for initial page load)
 * This is the new optimized entry point - loads ~8MB instead of ~25MB
 */
export const fetchCoreData = async () => {
  const dataUrl = DATA_CONFIG.archive_core;

  // Check deploy version (clears caches if version changed), bounded so a
  // slow version.json doesn't stall a load a good cache could satisfy.
  await raceTimeout(checkVersion(), VERSION_CHECK_TIMEOUT_MS);

  const idbKey = coreIdbKey();

  // 1. IndexedDB cache — structured-clones the object on read, skipping the
  // JSON.parse of the ~13 MB blob, and persists across tab close (the blob
  // exceeds localStorage's ~5 MB cap, so the Web Storage fallback below lands
  // in sessionStorage, which a fresh tab never sees). See idbCache.js (#275).
  const idbEntry = await idbGet(idbKey);
  if (isFreshEntry(idbEntry)) {
    debug('Using IndexedDB-cached core data');
    return idbEntry.data;
  }

  // 2. Web Storage cache — covers browsers where IndexedDB is blocked (Safari
  // Private, Firefox strict tracking protection). Promote a hit into
  // IndexedDB, best-effort and unawaited, so the next read skips the parse.
  const cached = getCachedData(dataUrl);
  if (cached) {
    debug('Using Web Storage-cached core data');
    idbSet(idbKey, makeCoreEntry(cached));
    return cached;
  }

  debug('Fetching core data from:', dataUrl);

  try {
    const response = await fetch(dataUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Inject dissertation record if not present
    if (!data.records.find(r => r.id === 'dissertation-1986')) {
      data.records.push({
        id: DISSERTATION_RECORD.id,
        title: DISSERTATION_RECORD.title,
        date: DISSERTATION_RECORD.date,
        year: DISSERTATION_RECORD.year,
        era: DISSERTATION_RECORD.era,
        pub: DISSERTATION_RECORD.pub,
        categories: DISSERTATION_RECORD.categories,
        type: DISSERTATION_RECORD.type,
        verified: DISSERTATION_RECORD.verified,
        summaryPreview: DISSERTATION_RECORD.summary.substring(0, 180) + '...'
      });

      // Also add dissertation facets if missing
      DISSERTATION_RECORD.categories.forEach(c => {
        if (!data.facets.categories.includes(c)) {
          data.facets.categories.push(c);
        }
      });
      data.facets.categories.sort();
    }

    // Cache the result. IndexedDB first; fall back to Web Storage only when
    // IndexedDB is unavailable, so capable browsers skip the redundant ~13 MB
    // sessionStorage write (and its JSON.stringify) entirely.
    const storedInIdb = await idbSet(idbKey, makeCoreEntry(data));
    if (!storedInIdb) {
      setCachedData(dataUrl, data);
    }

    return data;
  } catch (error) {
    // Propagate the failure. Returning a DISSERTATION_RECORD-only fallback
    // here would mask a real outage (archive-core.json 404/503/parse error,
    // partial deploy) as a successful load of a 1-record archive — visitors
    // and monitors could not tell it apart from the real one. App.js's
    // .catch renders the explicit "Unable to load archive" error state
    // instead. Mirrors httpCachedLoader.js, which forbids the same masking.
    console.error('Error fetching core data:', error);
    throw error;
  }
};

/**
 * Fetch record details (on-demand, when modal opens)
 * Returns full summary, quote, concepts, tags, url, author, relatedIds
 */
export const fetchRecordDetails = async (recordId) => {
  // Return dissertation details from constant
  if (recordId === 'dissertation-1986') {
    return {
      summary: DISSERTATION_RECORD.summary,
      quote: DISSERTATION_RECORD.quote,
      concepts: DISSERTATION_RECORD.concepts,
      tags: DISSERTATION_RECORD.tags,
      url: DISSERTATION_RECORD.url,
      author: DISSERTATION_RECORD.author,
      relatedIds: []
    };
  }

  // Load details cache if not already loaded
  if (!detailsCache) {
    await loadDetailsCache();
  }

  return detailsCache?.[recordId] || null;
};

/**
 * Load the full details cache (called once when first modal opens)
 */
const loadDetailsCache = async () => {
  // Prevent multiple simultaneous loads
  if (detailsLoading) {
    return detailsLoadPromise;
  }

  detailsLoading = true;
  detailsLoadPromise = (async () => {
    const dataUrl = DATA_CONFIG.archive_details;

    // Check cache first
    const cached = getCachedData(dataUrl);
    if (cached) {
      debug('Using cached details data');
      detailsCache = cached.details;
      return;
    }

    debug('Fetching details data from:', dataUrl);

    try {
      const response = await fetch(dataUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      detailsCache = data.details;

      // Cache the result
      setCachedData(dataUrl, data);
    } catch (error) {
      console.error('Error fetching details data:', error);
      detailsCache = {};
    } finally {
      detailsLoading = false;
    }
  })();

  return detailsLoadPromise;
};

/**
 * Project an entity payload into the records list buildEntityMaps expects.
 * Prefer an explicit `records` array; otherwise derive it from
 * `recordEntityMap`. The `|| {}` guard keeps a payload missing
 * recordEntityMap from throwing. Used by both the cache-hit and network
 * branches of fetchEntitiesData so they shape the input identically.
 * @param {{ records?: Array, recordEntityMap?: Object }} payload
 */
export const toRecords = (payload) =>
  payload.records || Object.entries(payload.recordEntityMap || {}).map(([id, relatedIds]) => ({
    id,
    relatedIds
  }));

/**
 * Fetch entities data (on-demand, when the entity browser opens)
 */
export const fetchEntitiesData = async () => {
  // Return from cache if already loaded
  if (entitiesCache) {
    return entitiesCache;
  }

  // Prevent multiple simultaneous loads
  if (entitiesLoading) {
    return entitiesLoadPromise;
  }

  entitiesLoading = true;
  entitiesLoadPromise = (async () => {
    const dataUrl = DATA_CONFIG.archive_entities;

    // Check cache first
    const cached = getCachedData(dataUrl);
    if (cached) {
      debug('Using cached entities data');
      entitiesCache = cached;
      buildEntityMaps({
        entities: cached.entities,
        records: toRecords(cached)
      });
      return cached;
    }

    debug('Fetching entities data from:', dataUrl);

    try {
      const response = await fetch(dataUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      entitiesCache = data;

      // Build entity maps for the entity browser
      buildEntityMaps({
        entities: data.entities,
        records: toRecords(data)
      });

      // Cache the result
      setCachedData(dataUrl, data);

      return data;
    } catch (error) {
      console.error('Error fetching entities data:', error);
      // Record details can still fall back to category-based relationships,
      // so keep returning a shaped payload for that consumer. Carry the
      // failure explicitly so EntityBrowser can distinguish an outage from a
      // legitimate empty scope instead of presenting a silent zero-result UI.
      return {
        entities: [],
        recordEntityMap: {},
        error: 'The entity index could not load. Archive records remain available.',
      };
    } finally {
      entitiesLoading = false;
    }
  })();

  return entitiesLoadPromise;
};

/**
 * Check if entities are loaded
 */
export const areEntitiesLoaded = () => entitiesCache !== null;

/**
 * Preload details in background (optional optimization)
 */
export const preloadDetails = () => {
  if (!detailsCache && !detailsLoading) {
    loadDetailsCache();
  }
};

/**
 * Fetch prebuilt analytics aggregates (~1KB).
 *
 * Powers the default Analytics dashboard view without loading the ~28MB source
 * into in-browser SQLite. Throws on a failed fetch so the dashboard can render
 * its explicit error state rather than a misleading empty view (mirrors the
 * fetchCoreData throw contract, issue #290).
 */
export const fetchAnalytics = async () => {
  const dataUrl = DATA_CONFIG.archive_analytics;

  // Run the same deploy-version gate as core data. A cold #analytics deep-link
  // skips fetchCoreData, so without this a stale cache could survive a deploy.
  await raceTimeout(checkVersion(), VERSION_CHECK_TIMEOUT_MS);

  const cached = getCachedData(dataUrl);
  if (cached) {
    debug('Using cached analytics data');
    return cached;
  }

  debug('Fetching analytics data from:', dataUrl);

  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  setCachedData(dataUrl, data);
  return data;
};

/**
 * Lazily load and construct the MiniSearch full-text index (#276).
 *
 * Kept here with the other data fetchers, but MiniSearch and the ~1MB index
 * artifact are both loaded on demand -- the dynamic import means a browse-only
 * visit never downloads either. The promise is memoized so repeat or concurrent
 * first-search calls share one load; on failure the memo is cleared so a later
 * search can retry rather than being stuck on the rejected promise. Throws on a
 * failed fetch so the caller can fall back to substring search (the index is an
 * additive recall boost, never the only search path).
 */
let searchIndexPromise = null;
export const loadSearchIndex = () => {
  if (!searchIndexPromise) {
    searchIndexPromise = (async () => {
      const { default: MiniSearch } = await import('minisearch');
      const response = await fetch(DATA_CONFIG.search_index);
      if (!response.ok) {
        throw new Error(`search index fetch failed: HTTP ${response.status}`);
      }
      const text = await response.text();
      return MiniSearch.loadJSON(text, searchIndexOptions());
    })();
    searchIndexPromise.catch(() => { searchIndexPromise = null; });
  }
  return searchIndexPromise;
};

/**
 * Initialize SQLite database with full archive data (optional)
 * Call this to enable SQL queries for advanced analytics
 */
// Memoise the in-flight init so the two query surfaces (the raw-SQL box and the
// Query Builder) that may both trigger a first load don't each fetch and parse
// the ~28MB source. Released on a failed/false result so a later retry can run.
let sqliteInitPromise = null;
export const initSqlite = async () => {
  if (sqliteInitPromise) return sqliteInitPromise;

  const pending = (async () => {
    try {
      // Initialize the database
      await initDatabase();

      // Load full data if we have it cached, otherwise fetch it
      const fullDataUrl = DATA_CONFIG.archive_json;
      let fullData = getCachedData(fullDataUrl);

      if (!fullData) {
        debug('[SQLite] Fetching full archive data for SQL database...');
        const response = await fetch(fullDataUrl);
        if (response.ok) {
          fullData = await response.json();
          setCachedData(fullDataUrl, fullData);
        }
      }

      if (fullData) {
        await loadSqliteData(fullData);
        debug('[SQLite] Database ready for queries');
        return true;
      }

      return false;
    } catch (error) {
      console.error('[SQLite] Failed to initialize:', error);
      return false;
    }
  })();

  sqliteInitPromise = pending;
  // Keep the memo only for a successful load; drop it on false/throw so the
  // next query attempt re-tries instead of resolving the cached failure.
  pending.then(
    (ok) => { if (!ok && sqliteInitPromise === pending) sqliteInitPromise = null; },
    () => { if (sqliteInitPromise === pending) sqliteInitPromise = null; }
  );
  return pending;
};

/**
 * Check if SQLite is ready for queries
 */
export { isSqliteReady };

// Re-export SQL query functions for easy access
export {
  queryAsObjects,
  getRecordCountByYear,
  getRecordCountByCategory,
  getRecordCountByEra,
  getMostMentionedEntities,
  getMostCommonConcepts,
  getCategoryCoOccurrence,
  sqlSearchRecords,
  getSqliteStats
};

// ============================================
// DATA EXPORT FUNCTIONS (Dave Winer Open Data)
// ============================================

/**
 * Trigger browser download of data
 */
const downloadFile = (content, filename, mimeType) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Export records as JSON file
 * @param {Array} records - Records to export (filtered or all)
 * @param {string} filename - Output filename
 */
export const exportAsJSON = (records, filename = 'jay-rosen-archive.json') => {
  const exportData = {
    exported: new Date().toISOString(),
    source: "Jay Rosen's Internet Archive",
    url: 'https://pressthink.org/j/rosen-archive/',
    license: 'CC BY 4.0',
    recordCount: records.length,
    records: records.map(r => ({
      id: r.id,
      title: r.title,
      author: r.author || 'Jay Rosen',
      date: r.date,
      year: r.year,
      era: r.era,
      pub: r.pub,
      url: r.url,
      summary: r.summary || r.summaryPreview,
      categories: r.categories,
      type: r.type
    }))
  };

  downloadFile(JSON.stringify(exportData, null, 2), filename, 'application/json');
};

/**
 * Export records as CSV file
 * @param {Array} records - Records to export
 * @param {string} filename - Output filename
 */
export const exportAsCSV = (records, filename = 'jay-rosen-archive.csv') => {
  const headers = ['id', 'title', 'author', 'date', 'year', 'era', 'pub', 'url', 'categories', 'type'];

  const rows = records.map(r => [
    r.id,
    r.title,
    r.author || 'Jay Rosen',
    r.date,
    r.year,
    r.era,
    r.pub,
    r.url,
    (r.categories || []).join('; '),
    r.type || 'article'
  ].map(escapeCsvCell).join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  downloadFile(csv, filename, 'text/csv;charset=utf-8');
};

/**
 * Get URLs for open data resources
 */
export const getOpenDataURLs = () => {
  // Derive from the shared resolver so open-data links use the same canonical
  // URL scheme as the rest of the app (#300). The old production branch
  // hardcoded the WordPress upload root (/wp-content/rosen-archive), which only
  // resolved via a brittle WP rewrite from the canonical /j/rosen-archive.
  // BASE_PATH already encodes the github-pages prefix, so the non-local cases
  // collapse to it; local keeps the relative '.' the static preview servers use.
  const basePath = IS_LOCAL ? '.' : BASE_PATH;

  return {
    json: `${basePath}/data/archive-data.json`,
    csv: `${basePath}/data/archive_records-public.csv`,
    rss: `${basePath}/data/feeds/rss.xml`,
    articlesRss: `${basePath}/data/feeds/articles.xml`,
    opml: `${basePath}/data/feeds/archive.opml`,
    subscriptions: `${basePath}/data/feeds/subscriptions.opml`,
    schema: `${basePath}/data/schema.json`,
    schemaDoc: `${basePath}/data/SCHEMA.md`
  };
};
