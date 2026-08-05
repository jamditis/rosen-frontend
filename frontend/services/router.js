// Hash-based router for the archive SPA: the window-touching navigation layer.
//
// The route vocabulary (ROUTES / DEFAULT_ROUTE) is owned by viewState.js, the
// single source of truth for view state called for in issue #133. This module
// imports it rather than keeping a second copy — two hand-maintained ROUTES
// objects could silently drift — and re-exports ROUTES so existing importers
// (App.js) keep working unchanged. The pure URL serialisation lives in
// viewState.js too; what remains here is the imperative, window-bound
// navigation helpers.

import { ROUTES, DEFAULT_ROUTE, parseViewState } from './viewState.js?v=3.8.15';
import { parseRecordId, setRecordParam } from '../utils/recordDeepLink.js?v=3.8.15';

export { ROUTES };

/**
 * Read the current hash and return the matching route name.
 * Falls back to 'archive' for unknown or empty hashes.
 */
export function getCurrentRoute() {
  return parseViewState(window.location.href).route || DEFAULT_ROUTE;
}

/**
 * Read the optional in-shell desktop app id from the current URL.
 */
export function getDesktopAppIdFromUrl() {
  const state = parseViewState(window.location.href);
  return state.route === ROUTES.desktop ? state.routeParams.desktopAppId || null : null;
}

/**
 * Read the optional selected entity from a canonical entity route.
 */
export function getEntityIdFromUrl() {
  return parseViewState(window.location.href).routeParams.entityId || null;
}

/**
 * Navigate to a route by updating the hash.
 * Optionally sets a ?record=ID query parameter and canonical entity context.
 */
export function navigateTo(route, recordId, entityId) {
  const url = new URL(window.location.href);

  // Clean up legacy query params
  url.searchParams.delete('view');
  if (route === ROUTES.entities && entityId !== undefined) {
    if (/^[A-Za-z0-9_.:-]+$/.test(entityId || '')) url.searchParams.set('entity', entityId);
    else url.searchParams.delete('entity');
  } else if (route !== ROUTES.entities) {
    url.searchParams.delete('entity');
  }

  setRecordParam(url.searchParams, recordId);

  url.hash = route === DEFAULT_ROUTE ? '' : route;
  window.history.pushState({}, '', url);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/**
 * Navigate within the desktop shell while keeping the app id in the hash.
 */
export function navigateToDesktop(appId = null, entityId) {
  if (appId !== null && (
    typeof appId !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(appId)
  )) {
    throw new TypeError('Desktop app id must be a lowercase URL-safe id');
  }

  const url = new URL(window.location.href);
  url.searchParams.delete('view');
  if (appId === 'entities' && entityId !== undefined) {
    if (/^[A-Za-z0-9_.:-]+$/.test(entityId || '')) url.searchParams.set('entity', entityId);
    else url.searchParams.delete('entity');
  } else if (appId !== 'entities') {
    url.searchParams.delete('entity');
  }
  setRecordParam(url.searchParams, null);
  url.hash = appId ? `${ROUTES.desktop}/${appId}` : ROUTES.desktop;
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
