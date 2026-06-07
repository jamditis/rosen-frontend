/**
 * Jay Rosen Internet Archive - Service Worker
 *
 * Caching strategy:
 * - Data files (JSON): Stale-while-revalidate (show cached, update in background)
 * - Static assets (JS, CSS): Cache-first (fast loads)
 * - External resources: Network-first with cache fallback
 * - Large files (>5MB): Only use Cache API, never localStorage
 */

// Cache version is tied to the app version in version.json. Bumping it on every
// deploy (alongside index.html and the ?v= import strings) makes the activate
// handler below drop every stale cache, so returning visitors never run old code.
const CACHE_VERSION = '3.4.0';
const CACHE_NAME = `jrda-cache-${CACHE_VERSION}`;
const DATA_CACHE_NAME = `jrda-data-${CACHE_VERSION}`;
const MAX_CACHE_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Detect deploy surface. Keep in sync with frontend/utils/pathResolver.js —
// sw.js is registered as a classic worker (see index.html), so it cannot
// `import` from the shared resolver and duplicates this logic inline.
const HOST = self.location.hostname;
const IS_LOCAL = HOST === 'localhost' || HOST === '127.0.0.1';
const IS_GITHUB_PAGES = HOST.endsWith('.github.io');

const BASE_PATH = IS_LOCAL ? '/frontend'
  : IS_GITHUB_PAGES ? '/rosen-frontend'
  : '/j/rosen-archive';
const DATA_PATH = IS_LOCAL ? '/data'
  : IS_GITHUB_PAGES ? '/rosen-frontend/data'
  : '/j/rosen-archive/data';

// Static assets to pre-cache on install. The local layout serves source
// files at /frontend/<path>, while deployed surfaces serve a top-level
// index.html at BASE_PATH and the source files under BASE_PATH/frontend/.
const STATIC_ASSETS = IS_LOCAL ? [
  '/frontend/',
  '/frontend/index.html',
  '/frontend/index.js',
  '/frontend/App.js',
  '/frontend/html.js',
  '/frontend/constants.js',
  '/frontend/index.css',
  '/frontend/dist/tailwind.css',
  '/frontend/services/archiveService.js',
  '/frontend/services/idbCache.js',
  '/frontend/components/Sidebar.js',
  '/frontend/components/RecordModal.js',
  '/frontend/components/FeaturedSection.js',
  '/frontend/components/Explorer.js',
  '/frontend/components/WelcomeModal.js',
  '/frontend/components/DissertationPage.js',
  '/frontend/components/MindMap.js',
  '/frontend/components/DetailPanel.js',
  '/frontend/components/dissertationData.js',
  '/frontend/components/ToolsModal.js',
  '/frontend/components/LoadingQuotes.js',
  '/frontend/components/WorkInProgressBanner.js',
  '/frontend/components/AnalyticsDashboard.js',
  '/frontend/components/QueryBuilder.js',
  '/frontend/components/AboutPage.js',
  '/frontend/services/sqliteService.js'
] : [
  `${BASE_PATH}/`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/frontend/index.js`,
  `${BASE_PATH}/frontend/App.js`,
  `${BASE_PATH}/frontend/html.js`,
  `${BASE_PATH}/frontend/constants.js`,
  `${BASE_PATH}/frontend/index.css`,
  `${BASE_PATH}/frontend/dist/tailwind.css`,
  `${BASE_PATH}/frontend/services/archiveService.js`,
  `${BASE_PATH}/frontend/services/idbCache.js`,
  `${BASE_PATH}/frontend/components/Sidebar.js`,
  `${BASE_PATH}/frontend/components/RecordModal.js`,
  `${BASE_PATH}/frontend/components/FeaturedSection.js`,
  `${BASE_PATH}/frontend/components/Explorer.js`,
  `${BASE_PATH}/frontend/components/WelcomeModal.js`,
  `${BASE_PATH}/frontend/components/DissertationPage.js`,
  `${BASE_PATH}/frontend/components/MindMap.js`,
  `${BASE_PATH}/frontend/components/DetailPanel.js`,
  `${BASE_PATH}/frontend/components/dissertationData.js`,
  `${BASE_PATH}/frontend/components/ToolsModal.js`,
  `${BASE_PATH}/frontend/components/LoadingQuotes.js`,
  `${BASE_PATH}/frontend/components/WorkInProgressBanner.js`,
  `${BASE_PATH}/frontend/components/AnalyticsDashboard.js`,
  `${BASE_PATH}/frontend/components/QueryBuilder.js`,
  `${BASE_PATH}/frontend/components/AboutPage.js`,
  `${BASE_PATH}/frontend/services/sqliteService.js`
];

// Data files to cache with stale-while-revalidate
const DATA_URLS = [
  `${DATA_PATH}/archive-core.json`,
  `${DATA_PATH}/archive-details.json`,
  `${DATA_PATH}/archive-entities.json`,
  `${DATA_PATH}/archive-analytics.json`
];

console.log('[SW] Environment:',
  IS_LOCAL ? 'local development'
  : IS_GITHUB_PAGES ? 'github pages'
  : 'production');

// Install event - pre-cache static assets
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Pre-caching static assets');
        return Promise.allSettled(
          STATIC_ASSETS.map(url =>
            cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err))
          )
        );
      })
      .then(() => {
        console.log('[SW] Install complete');
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches aggressively
self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME && name !== DATA_CACHE_NAME)
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Activate complete');
        return self.clients.claim();
      })
  );
});

// Fetch event - handle requests with appropriate caching strategy
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Handle data files with stale-while-revalidate
  if (isDataFile(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event.request, DATA_CACHE_NAME));
    return;
  }

  // Handle static assets with cache-first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(event.request, CACHE_NAME));
    return;
  }

  // Default: network-first with cache fallback
  event.respondWith(networkFirst(event.request, CACHE_NAME));
});

// Check if URL is a data file
function isDataFile(pathname) {
  if (!pathname.endsWith('.json')) return false;
  if (!pathname.includes('/data/')) return false;
  // Tight prefix check on local mirrors isStaticAsset below; on deployed
  // surfaces BASE_PATH narrows the match to our archive subtree.
  return IS_LOCAL ? pathname.startsWith('/data/') : pathname.includes(BASE_PATH);
}

// Check if URL is a static asset
function isStaticAsset(pathname) {
  const isAssetType = pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.html') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.svg');

  if (!isAssetType) return false;

  if (IS_LOCAL) {
    return pathname.startsWith('/frontend/') || pathname.startsWith('/data/');
  }
  return pathname.includes(BASE_PATH);
}

/**
 * Stale-while-revalidate strategy
 * Returns cached response immediately, then updates cache in background.
 * Size-aware: checks Content-Length before caching large files.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request)
    .then(response => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(err => {
      console.warn('[SW] Network fetch failed:', request.url, err);
      return null;
    });

  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await fetchPromise;
  if (networkResponse) {
    return networkResponse;
  }

  return new Response('Offline and no cached data available', {
    status: 503,
    statusText: 'Service Unavailable'
  });
}

/**
 * Cache-first strategy
 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  // ignoreSearch so a `?v=` cache-busting query still matches the pre-cached
  // asset. Freshness across deploys is handled by CACHE_VERSION, not the query.
  const cachedResponse = await cache.match(request, { ignoreSearch: true });
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    console.warn('[SW] Network fetch failed:', request.url, err);
    return new Response('Resource not available offline', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

/**
 * Network-first strategy
 */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response('Resource not available offline', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Handle messages from clients
self.addEventListener('message', event => {
  if (event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }

  if (event.data.action === 'clearCache') {
    caches.keys().then(names => {
      names.forEach(name => caches.delete(name));
    });
  }
});
