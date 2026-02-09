// Hash-based router for the archive SPA
// Maps view names to URL hash values

export const ROUTES = {
  archive: 'archive',
  folders: 'folders',
  explorer: 'explorer',
  entities: 'entities',
  dissertation: 'dissertation',
  about: 'about',
  analytics: 'analytics'
};

const DEFAULT_ROUTE = ROUTES.archive;

/**
 * Read the current hash and return the matching route name.
 * Falls back to 'archive' for unknown or empty hashes.
 */
export function getCurrentRoute() {
  const hash = window.location.hash.replace('#', '').split('?')[0];
  if (!hash) return DEFAULT_ROUTE;
  const match = Object.values(ROUTES).find(r => r === hash);
  return match || DEFAULT_ROUTE;
}

/**
 * Navigate to a route by updating the hash.
 * Optionally sets a ?record=ID query parameter.
 */
export function navigateTo(route, recordId) {
  const url = new URL(window.location.href);

  // Clean up legacy query params
  url.searchParams.delete('view');

  if (recordId) {
    url.searchParams.set('record', recordId);
  } else {
    url.searchParams.delete('record');
  }

  url.hash = route === DEFAULT_ROUTE ? '' : route;
  window.history.pushState({}, '', url);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/**
 * Read ?record= from the current URL.
 */
export function getRecordIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('record') || null;
}

/**
 * Migrate legacy ?view= URLs to hash routes.
 * Call once on app init.
 */
export function migrateLegacyUrl() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  if (view === 'dissertation' || view === 'about') {
    navigateTo(ROUTES[view]);
  }
}
