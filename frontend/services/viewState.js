// Pure URL <-> view-state serialisation for the archive SPA.
//
// "View state" is the user's actual mental model of "where am I": the route,
// route-specific context such as a selected entity, the active filters, and
// the selected record. Today that state is split across router.js (hash route
// plus query context) and App.js (filter/selection state), so this helper keeps
// reloads and shared URLs from losing meaningful context.
//
// This module is the single serialisation helper called for in issue #133.
// It is deliberately pure: no React, no reads or writes of window.location.
// Every function takes plain values or URL strings and returns the same, so
// the whole round-trip is unit-testable under `node --test` with no DOM.
//
// Phase 1 of #133: this helper only. The React `useViewState` provider that
// consumes it is intentionally deferred until the entity-index hook
// conventions land (#130 / PR #180), so both hooks share one shape.

import { parseWikiHash, wikiPageHref } from './wikiService.js?v=3.7.8';

/** Hash route names. The default route renders with no hash at all. */
export const ROUTES = {
  archive: 'archive',
  start: 'start',
  folders: 'folders',
  entities: 'entities',
  dissertation: 'dissertation',
  about: 'about',
  analytics: 'analytics',
  wiki: 'wiki',
  desktop: 'desktop',
};

export const DEFAULT_ROUTE = ROUTES.archive;

// Query-param keys. Kept short so shared URLs stay readable. Array filters use
// repeated keys (?cat=a&cat=b) rather than a comma-joined value: a category or
// publication name containing a comma would silently corrupt a joined string,
// and URLSearchParams handles repeated keys and percent-encoding for free.
const PARAM = {
  search: 'q',
  era: 'era',
  year: 'year',
  type: 'type',
  includeReplies: 'replies',
  categories: 'cat',
  publication: 'pub',
  record: 'record',
  entity: 'entity',
};

/**
 * Return a fresh default filters object. A factory, not a shared constant, so
 * callers can never mutate one default into another's state (the nested
 * arrays make a shared frozen constant awkward to spread safely).
 */
export function defaultFilters() {
  return {
    search: '',
    categories: [],
    era: null,
    year: null,
    publication: [],
    type: null,
    includeReplies: false,
  };
}

/** True for values that should be treated as "filter not set" when emitting. */
function isUnset(value) {
  return value === null || value === undefined || value === '';
}

/**
 * Parse a full URL string into { route, filters, selectedRecord }.
 * Unknown or empty hashes fall back to the default route. Missing filter
 * params fall back to defaults, so any URL parses to a complete view state.
 */
export function parseViewState(href) {
  const url = new URL(href);

  // Hash carries the route. Strip a stray "?suffix" defensively even though
  // navigateTo() never produces one (search params sit before the hash).
  const hash = url.hash.replace(/^#/, '').split('?')[0];
  const wikiHash = parseWikiHash(hash);
  const desktopHash = hash.match(/^desktop(?:\/([a-z0-9]+(?:-[a-z0-9]+)*))?$/);
  const route = desktopHash
    ? ROUTES.desktop
    : wikiHash.route === ROUTES.wiki
    ? ROUTES.wiki
    : Object.values(ROUTES).includes(hash) ? hash : DEFAULT_ROUTE;
  const routeParams = desktopHash?.[1]
    ? { desktopAppId: desktopHash[1] }
    : wikiHash.route === ROUTES.wiki && wikiHash.slug
    ? { wikiSlug: wikiHash.slug }
    : {};

  const params = url.searchParams;
  const entityId = params.get(PARAM.entity);
  const isEntityRoute = route === ROUTES.entities
    || (route === ROUTES.desktop && routeParams.desktopAppId === 'entities');
  if (isEntityRoute && /^[A-Za-z0-9_.:-]+$/.test(entityId || '')) {
    routeParams.entityId = entityId;
  }
  const filters = defaultFilters();

  const search = params.get(PARAM.search);
  if (search !== null) filters.search = search;

  const era = params.get(PARAM.era);
  if (era !== null && era !== '') filters.era = era;

  const type = params.get(PARAM.type);
  if (type !== null && type !== '') filters.type = type;

  // year stays a string: archive records store year as a string ("2025"), and
  // App.js compares record.year to filters.year with strict inequality, so a
  // coerced Number would silently match no records after a reload. The
  // Number.isFinite guard only rejects a non-numeric param value.
  const yearRaw = params.get(PARAM.year);
  if (yearRaw !== null && yearRaw !== '' && Number.isFinite(Number(yearRaw))) {
    filters.year = yearRaw;
  }

  filters.includeReplies = params.get(PARAM.includeReplies) === '1';
  filters.categories = params.getAll(PARAM.categories);
  filters.publication = params.getAll(PARAM.publication);

  const selectedRecord = params.get(PARAM.record) || null;

  return { route, routeParams, filters, selectedRecord };
}

/**
 * Serialise a view state back into a URL string, preserving the origin and
 * pathname of baseHref. Only non-default fields are emitted, so a pristine
 * view produces a clean URL with no query string and no hash.
 *
 * @param {{route?: string, routeParams?: object, filters?: object, selectedRecord?: string|null}} viewState
 * @param {string} baseHref - a URL whose origin and pathname are reused.
 */
export function viewStateToUrl(viewState, baseHref) {
  if (typeof baseHref !== 'string' || baseHref === '') {
    throw new TypeError('viewStateToUrl requires a baseHref URL string');
  }

  const url = new URL(baseHref);
  url.search = '';
  url.hash = '';

  const route = viewState.route || DEFAULT_ROUTE;
  const filters = { ...defaultFilters(), ...(viewState.filters || {}) };
  const params = new URLSearchParams();

  if (filters.search !== '') params.set(PARAM.search, filters.search);
  if (!isUnset(filters.era)) params.set(PARAM.era, filters.era);
  if (!isUnset(filters.type)) params.set(PARAM.type, filters.type);
  if (!isUnset(filters.year) && Number.isFinite(Number(filters.year))) {
    params.set(PARAM.year, String(filters.year));
  }
  if (filters.includeReplies === true) params.set(PARAM.includeReplies, '1');

  for (const category of filters.categories || []) {
    params.append(PARAM.categories, category);
  }
  for (const publication of filters.publication || []) {
    params.append(PARAM.publication, publication);
  }
  if (!isUnset(viewState.selectedRecord)) {
    params.set(PARAM.record, viewState.selectedRecord);
  }

  const wikiSlug = viewState.routeParams?.wikiSlug;
  const desktopAppId = viewState.routeParams?.desktopAppId;
  const entityId = viewState.routeParams?.entityId;
  const isEntityRoute = route === ROUTES.entities
    || (route === ROUTES.desktop && desktopAppId === 'entities');
  if (isEntityRoute && /^[A-Za-z0-9_.:-]+$/.test(entityId || '')) {
    params.set(PARAM.entity, entityId);
  }
  url.search = params.toString();
  url.hash = route === DEFAULT_ROUTE ? ''
    : route === ROUTES.wiki && wikiSlug ? wikiPageHref(wikiSlug).slice(1)
    : route === ROUTES.desktop && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(desktopAppId || '')
      ? `${ROUTES.desktop}/${desktopAppId}`
    : route;
  return url.toString();
}

/**
 * Migrate a legacy ?view=dissertation|about URL to the hash-route form.
 * Pure: returns the migrated URL string, or the input unchanged when there is
 * nothing to migrate. A wiring-phase wrapper applies the result to history.
 */
export function migrateLegacyHref(href) {
  const url = new URL(href);
  const view = url.searchParams.get('view');
  if (view !== 'dissertation' && view !== 'about') return href;

  url.searchParams.delete('view');
  url.hash = ROUTES[view];
  return url.toString();
}
