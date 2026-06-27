// Hash-based router for the archive SPA: the window-touching navigation layer.
//
// The route vocabulary (ROUTES / DEFAULT_ROUTE) is owned by viewState.js, the
// single source of truth for view state called for in issue #133. This module
// imports it rather than keeping a second copy — two hand-maintained ROUTES
// objects could silently drift — and re-exports ROUTES so existing importers
// (App.js) keep working unchanged. The pure URL serialisation lives in
// viewState.js too; what remains here is the imperative, window-bound
// navigation helpers.

import { ROUTES, DEFAULT_ROUTE } from './viewState.js?v=3.4.8';
import { parseRecordId, setRecordParam } from '../utils/recordDeepLink.js?v=3.4.8';
import { parseWikiHash } from './wikiService.js?v=3.4.8';

export { ROUTES };

/**
 * Read the current hash and return the matching route name.
 * Falls back to 'archive' for unknown or empty hashes.
 */
export function getCurrentRoute() {
  const hash = window.location.hash.replace('#', '').split('?')[0];
  if (!hash) return DEFAULT_ROUTE;
  if (parseWikiHash(hash).route === ROUTES.wiki) return ROUTES.wiki;
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

  setRecordParam(url.searchParams, recordId);

  url.hash = route === DEFAULT_ROUTE ? '' : route;
  window.history.pushState({}, '', url);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/**
 * Read ?record= from the current URL.
 */
export function getRecordIdFromUrl() {
  return parseRecordId(window.location.search);
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
