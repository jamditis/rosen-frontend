// Privacy disclosure routing lives outside viewState.js for one release
// boundary. A returning visitor can still have the pre-disclosure view-state
// module in an old service-worker cache, so new entry points must not require
// named exports that module did not provide.

import { resolveSitePath } from '../utils/pathResolver.js?v=3.8.23';

export const ABOUT_PRIVACY_HASH = 'about/privacy';
export const ABOUT_PRIVACY_SECTION = 'privacy-and-browser-storage';

export const isPrivacyDetailsHash = (hash = '') =>
  hash.replace(/^#/, '').split('?')[0] === ABOUT_PRIVACY_HASH;

// Start from the deployed site root so a privacy entry point never inherits
// stale record or filter parameters from the current archive URL.
export const getPrivacyDetailsHref = (host) =>
  `${resolveSitePath('', host)}#${ABOUT_PRIVACY_HASH}`;

// The previous view-state parser treats #about/privacy as unknown and returns
// the archive route. Keep the destination usable while that module ages out.
export const resolvePrivacyRoute = (route, hash) =>
  isPrivacyDetailsHash(hash) ? 'about' : route;
