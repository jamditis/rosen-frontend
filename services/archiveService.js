
import { DATA_CONFIG, ERAS } from '../constants.js';

// Simple hash function for UI color selection (djb1 variant)
// Used by App.js to deterministically assign colors to categories
export const hashString = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i);
  return Math.abs(hash);
};

const DISSERTATION_RECORD = {
  id: 'dissertation-1986',
  title: 'The Impossible Press: American Journalism and the Decline of Public Life',
  author: 'Jay Rosen',
  date: '1986-01-01',
  year: '1986',
  era: 'Public Journalism (90s)',
  pub: 'New York University (Ph.D. Dissertation)',
  url: '/wp-content/rosen-archive/tools/dissertation-reader/dist/',
  summary: 'Rosen\'s doctoral dissertation traces the history of the idea that the function of the press is to inform the public. It argues that the rise of the mass circulation newspaper, while creating a technical ability to reach everyone, actually undermined the conditions necessary for a "universal town meeting." Drawing heavily on Walter Lippmann and John Dewey, it suggests that the professionalization of journalism ("objectivity") was a retreat from the problem of creating a genuine public life in a complex society. It contrasts news as "symptom" vs. news as "symbol" and explores how the press creates a "pseudo-environment" of public opinion.',
  quote: 'An impossible press was born, one which sought to solve the whole problem of public life simply by controlling the conduct of journalists.',
  categories: ['Journalism History', 'Democratic Theory', 'Press Criticism', 'Public Life'],
  concepts: ['Public Sphere', 'Omnicompetent Citizen', 'Objectivity', 'Mass Society', 'Professionalism', 'Communication vs Community', 'Democracy and Distance'],
  tags: ['Walter Lippmann', 'John Dewey', 'James Gordon Bennett', 'Joseph Pulitzer', 'Penny Press', 'Yellow Journalism', 'Robert Park', 'Tocqueville'],
  verified: true,
  type: 'Dissertation'
};

// Cache configuration
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour cache
const CACHE_VERSION = 'v4'; // Increment to invalidate all caches

const getCacheKey = (url) => {
  // Use djb2 hash algorithm for cache keys to avoid encoding issues with non-ASCII URLs
  // and reduce collision probability. Different from hashString() which is used for UI colors.
  let hash = 5381;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) + hash) + url.charCodeAt(i); // hash * 33 + c
  }
  return `archive_json_${Math.abs(hash >>> 0)}`; // Convert to unsigned 32-bit integer
};

const getCachedData = (url) => {
  try {
    const cacheKey = getCacheKey(url);
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;

    const entry = JSON.parse(cached);
    const now = Date.now();

    // Check if cache is still valid
    if (entry.version !== CACHE_VERSION || (now - entry.timestamp) > CACHE_TTL_MS) {
      localStorage.removeItem(cacheKey);
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

  const trySetItem = () => {
    localStorage.setItem(cacheKey, JSON.stringify(entry));
  };

  try {
    trySetItem();
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      // Storage is full - clear old archive caches and retry
      console.log('Cache storage full, clearing old archive caches...');
      try {
        const keys = Object.keys(localStorage);
        const archiveCacheKeys = keys.filter(key => key.startsWith('archive_json_') || key.startsWith('archive_csv_'));
        archiveCacheKeys.forEach(key => localStorage.removeItem(key));
        trySetItem(); // Retry after clearing
        console.log('Cache cleared and data stored successfully');
      } catch (retryError) {
        // Still failing - storage may be consumed by other data
        console.warn('Cache disabled: browser storage is full. The archive will work but without caching.');
      }
    } else {
      console.warn('Cache write error:', e);
    }
  }
};

// Export function to manually clear all archive caches
export const clearArchiveCache = () => {
  try {
    const keys = Object.keys(localStorage);
    const archiveCacheKeys = keys.filter(key => key.startsWith('archive_json_') || key.startsWith('archive_csv_'));
    archiveCacheKeys.forEach(key => localStorage.removeItem(key));
    console.log(`Cleared ${archiveCacheKeys.length} cache entries`);
  } catch (e) {
    console.warn('Error clearing cache:', e);
  }
};

export const fetchArchiveData = async () => {
  const dataUrl = DATA_CONFIG.archive_json;

  // Check cache first
  const cached = getCachedData(dataUrl);
  if (cached) {
    console.log('Using cached archive data');
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
