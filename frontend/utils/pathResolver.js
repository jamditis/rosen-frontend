// Three-way environment + path resolution for the archive frontend.
// Hosts map to one of: 'local' (localhost / 127.0.0.1), 'github-pages'
// (any *.github.io), or 'production' (PressThink and anything else).
// Imported by App.js, archiveService.js, and Header.js. sw.js duplicates
// the same logic inline because it's a classic service worker and can't
// ES-import — keep the inline detection in sw.js in sync with this file.

const BASE_PATH_MAP = {
  local: '/frontend',
  'github-pages': '/rosen-frontend',
  production: '/j/rosen-archive',
};

const DATA_PATH_MAP = {
  local: '/data',
  'github-pages': '/rosen-frontend/data',
  production: '/j/rosen-archive/data',
};

// Site root each environment serves from. Standalone surfaces (the dissertation
// tools, the data tools) live under this root, e.g. `${root}/dissertation/faq/`.
// Links to them must go through resolveSitePath() so they resolve in local
// preview and GitHub Pages, not just production.
const ROOT_PATH_MAP = {
  local: '',
  'github-pages': '/rosen-frontend',
  production: '/j/rosen-archive',
};

const detectHost = () => {
  // self.location works in both window and service-worker scopes since
  // window extends self. Falls back to '' under node (test runtime).
  if (typeof self !== 'undefined' && self.location && self.location.hostname) {
    return self.location.hostname;
  }
  return '';
};

export const getEnvironment = (host = detectHost()) => {
  if (host === 'localhost' || host === '127.0.0.1') return 'local';
  if (host.endsWith('.github.io')) return 'github-pages';
  return 'production';
};

export const getBasePath = (host = detectHost()) => BASE_PATH_MAP[getEnvironment(host)];

export const getDataPath = (host = detectHost()) => DATA_PATH_MAP[getEnvironment(host)];

export const getSiteRoot = (host = detectHost()) => ROOT_PATH_MAP[getEnvironment(host)];

// Resolve a site-root-relative path (e.g. 'dissertation/faq/') to an absolute
// path for the current environment. Leading slashes on `rel` are ignored.
export const resolveSitePath = (rel, host = detectHost()) =>
  getSiteRoot(host) + '/' + String(rel).replace(/^\/+/, '');

export const ENVIRONMENT = getEnvironment();
export const BASE_PATH = getBasePath();
export const DATA_PATH = getDataPath();
export const SITE_ROOT = getSiteRoot();
export const IS_LOCAL = ENVIRONMENT === 'local';
export const IS_GITHUB_PAGES = ENVIRONMENT === 'github-pages';
export const IS_PRODUCTION = ENVIRONMENT === 'production';
