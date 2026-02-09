
import { DATA_CONFIG, ERAS } from '../constants.js';
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
} from './sqliteService.js';

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
 * Called after fetchArchiveData completes
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

/**
 * Get all entity types present in the data
 */
export const getEntityTypes = () => {
  const types = new Set();
  entityById.forEach(entity => {
    if (entity.type) types.add(entity.type);
  });
  return Array.from(types).sort();
};

const DISSERTATION_RECORD = {
  id: 'dissertation-1986',
  title: 'The Impossible Press: American Journalism and the Decline of Public Life',
  author: 'Jay Rosen',
  date: '1986-01-01',
  year: '1986',
  era: 'Public Journalism (90s)',
  pub: 'New York University (Ph.D. Dissertation)',
  url: '/j/rosen-archive/dissertation/reader/',
  summary: 'Rosen\'s doctoral dissertation traces the history of the idea that the function of the press is to inform the public. It argues that the rise of the mass circulation newspaper, while creating a technical ability to reach everyone, actually undermined the conditions necessary for a "universal town meeting." Drawing heavily on Walter Lippmann and John Dewey, it suggests that the professionalization of journalism ("objectivity") was a retreat from the problem of creating a genuine public life in a complex society. It contrasts news as "symptom" vs. news as "symbol" and explores how the press creates a "pseudo-environment" of public opinion.',
  quote: 'An impossible press was born, one which sought to solve the whole problem of public life simply by controlling the conduct of journalists.',
  categories: ['Journalism History', 'Democratic Theory', 'Press Criticism', 'Public Life'],
  concepts: ['Public Sphere', 'Omnicompetent Citizen', 'Objectivity', 'Mass Society', 'Professionalism', 'Communication vs Community', 'Democracy and Distance'],
  tags: ['Walter Lippmann', 'John Dewey', 'James Gordon Bennett', 'Joseph Pulitzer', 'Penny Press', 'Yellow Journalism', 'Robert Park', 'Tocqueville'],
  verified: true,
  type: 'Dissertation'
};

// Cache configuration
const CACHE_VERSION = 'v7'; // Increment to invalidate all caches
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 min for entity data (small)

// Size threshold: don't use localStorage for data over 5MB
const MAX_LOCALSTORAGE_SIZE = 5 * 1024 * 1024;

const getCacheKey = (url) => {
  let hash = 5381;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) + hash) + url.charCodeAt(i);
  }
  return `archive_json_${Math.abs(hash >>> 0)}`;
};

/**
 * Check version.json on the server. If the version has changed,
 * clear all caches so users get fresh data after deploys.
 */
let versionChecked = false;
const checkVersion = async () => {
  if (versionChecked) return;
  versionChecked = true;
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
};

const getCachedData = (url) => {
  try {
    const cacheKey = getCacheKey(url);
    // Try sessionStorage first (for large data), then localStorage
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
  const cacheKey = getCacheKey(url);
  const entry = {
    data,
    timestamp: Date.now(),
    version: CACHE_VERSION
  };

  try {
    const serialized = JSON.stringify(entry);

    // Large data goes to sessionStorage (cleared on tab close, avoids quota pressure)
    if (serialized.length > MAX_LOCALSTORAGE_SIZE) {
      try {
        sessionStorage.setItem(cacheKey, serialized);
        return;
      } catch {
        // sessionStorage also full — just skip caching
        console.warn('Session cache full, skipping cache for', url);
        return;
      }
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
};

/**
 * Fetch core archive data (lightweight, for initial page load)
 * This is the new optimized entry point - loads ~8MB instead of ~25MB
 */
export const fetchCoreData = async () => {
  const dataUrl = DATA_CONFIG.archive_core;

  // Check deploy version (clears caches if version changed)
  checkVersion();

  // Check cache first
  const cached = getCachedData(dataUrl);
  if (cached) {
    console.log('Using cached core data');
    return cached;
  }

  console.log('Fetching core data from:', dataUrl);

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

    // Cache the result
    setCachedData(dataUrl, data);

    return data;
  } catch (error) {
    console.error('Error fetching core data:', error);
    // Return empty structure on error
    return {
      records: [{
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
      }],
      facets: {
        categories: DISSERTATION_RECORD.categories.sort(),
        eras: ERAS,
        publications: [DISSERTATION_RECORD.pub]
      },
      autocompleteIndex: [...DISSERTATION_RECORD.categories, ...DISSERTATION_RECORD.concepts, ...DISSERTATION_RECORD.tags, DISSERTATION_RECORD.title].sort()
    };
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
      console.log('Using cached details data');
      detailsCache = cached.details;
      return;
    }

    console.log('Fetching details data from:', dataUrl);

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
 * Fetch entities data (on-demand, when Explorer opens)
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
      console.log('Using cached entities data');
      entitiesCache = cached;
      buildEntityMaps({
        entities: cached.entities,
        records: cached.records || Object.entries(cached.recordEntityMap || {}).map(([id, relatedIds]) => ({
          id,
          relatedIds
        }))
      });
      return cached;
    }

    console.log('Fetching entities data from:', dataUrl);

    try {
      const response = await fetch(dataUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      entitiesCache = data;

      // Build entity maps for Explorer
      buildEntityMaps({
        entities: data.entities,
        records: Object.entries(data.recordEntityMap).map(([id, relatedIds]) => ({
          id,
          relatedIds
        }))
      });

      // Cache the result
      setCachedData(dataUrl, data);

      return data;
    } catch (error) {
      console.error('Error fetching entities data:', error);
      return { entities: [], recordEntityMap: {} };
    } finally {
      entitiesLoading = false;
    }
  })();

  return entitiesLoadPromise;
};

/**
 * Check if details are loaded
 */
export const areDetailsLoaded = () => detailsCache !== null;

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
 * Initialize SQLite database with full archive data (optional)
 * Call this to enable SQL queries for advanced analytics
 */
export const initSqlite = async () => {
  try {
    // Initialize the database
    await initDatabase();

    // Load full data if we have it cached, otherwise fetch it
    const fullDataUrl = DATA_CONFIG.archive_json;
    let fullData = getCachedData(fullDataUrl);

    if (!fullData) {
      console.log('[SQLite] Fetching full archive data for SQL database...');
      const response = await fetch(fullDataUrl);
      if (response.ok) {
        fullData = await response.json();
        setCachedData(fullDataUrl, fullData);
      }
    }

    if (fullData) {
      await loadSqliteData(fullData);
      console.log('[SQLite] Database ready for queries');
      return true;
    }

    return false;
  } catch (error) {
    console.error('[SQLite] Failed to initialize:', error);
    return false;
  }
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
// LEGACY: Full data fetch (backward compatible)
// ============================================

export const fetchArchiveData = async () => {
  const dataUrl = DATA_CONFIG.archive_json;

  // Check cache first
  const cached = getCachedData(dataUrl);
  if (cached) {
    console.log('Using cached archive data');
    // Build entity maps from cached data
    buildEntityMaps(cached);
    return cached;
  }

  console.log('Fetching archive data from:', dataUrl);

  try {
    const response = await fetch(dataUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Inject dissertation record if not present
    if (!data.records.find(r => r.id === 'dissertation-1986')) {
      data.records.push({ ...DISSERTATION_RECORD, relatedIds: [] });

      // Also add dissertation facets if missing
      DISSERTATION_RECORD.categories.forEach(c => {
        if (!data.facets.categories.includes(c)) {
          data.facets.categories.push(c);
        }
      });
      data.facets.categories.sort();
    }

    // Build entity lookup maps for Explorer connections
    buildEntityMaps(data);

    // Cache the result
    setCachedData(dataUrl, data);

    return data;
  } catch (error) {
    console.error('Error fetching archive data:', error);
    // Return empty structure on error
    return {
      records: [{ ...DISSERTATION_RECORD, relatedIds: [] }],
      facets: {
        categories: DISSERTATION_RECORD.categories.sort(),
        eras: ERAS,
        publications: [DISSERTATION_RECORD.pub]
      },
      autocompleteIndex: [...DISSERTATION_RECORD.categories, ...DISSERTATION_RECORD.concepts, ...DISSERTATION_RECORD.tags, DISSERTATION_RECORD.title].sort()
    };
  }
};
