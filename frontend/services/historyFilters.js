// Which filters a Back or Forward step restores. This lives outside
// viewState.js for one release boundary, like privacyRoute.js: a returning
// visitor can still have the previous view-state module in an old
// service-worker cache, so App.js must not require a named export that module
// did not provide. ROUTES and parseViewState exist in both releases.

import { ROUTES, parseViewState } from './viewState.js?v=3.8.77';

/**
 * The filters a Back or Forward step to `href` should restore, or null when
 * the live in-memory filters should stay.
 *
 * Only desktop record windows write their filters into the URL (App.js
 * replaces the history entry as they change), so only their entries carry a
 * filter state to restore. The standard archive, the other hash routes, and
 * desktop windows without records never write filters, so their entries carry
 * none; reading them back would clear the reader's search on every Back.
 *
 * @param {string} href - the URL the history step landed on.
 * @param {Set<string>} recordAppIds - desktop app ids that write filters.
 * @returns {object|null}
 */
export function filtersForHistoryEntry(href, recordAppIds) {
  const state = parseViewState(href);
  if (state.route !== ROUTES.desktop) return null;
  if (!recordAppIds?.has(state.routeParams.desktopAppId)) return null;
  return state.filters;
}
