/**
 * Jay Rosen Internet Archive - Service Worker
 *
 * Caching strategy:
 * - HTML / navigations: Network-first, cache as offline fallback. The page must
 *   be fetched fresh after a deploy so its ?v= import strings update (#274).
 * - Data files (JSON): Stale-while-revalidate (show cached, update in background)
 * - Static assets (JS, CSS, icons, images): Cache-first (fast loads); freshness
 *   across deploys comes from CACHE_VERSION dropping the cache, not the query.
 * - Everything else same-origin: Network-first with cache fallback.
 */

// Cache version is tied to the app version in version.json. Bumping it on every
// deploy (alongside index.html and the ?v= import strings) makes the activate
// handler below drop every stale cache, so returning visitors never run old code.
const CACHE_VERSION = '3.4.7';
const CACHE_NAME = `jrda-cache-${CACHE_VERSION}`;
const DATA_CACHE_NAME = `jrda-data-${CACHE_VERSION}`;

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
  '/frontend/components/WikiPage.js',
  '/frontend/services/wikiService.js',
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
  `${BASE_PATH}/frontend/components/WikiPage.js`,
  `${BASE_PATH}/frontend/services/wikiService.js`,
  `${BASE_PATH}/frontend/services/sqliteService.js`
];

// Archive data files the worker serves with stale-while-revalidate. The
// combined ~28 MB archive-data.json fallback is intentionally absent (it is
// only fetched if the split files fail and must not be pre-warmed). The
// analytics entry is also part of the #338 lazy-load contract.
const DATA_URLS = [
  `${DATA_PATH}/archive-core.json`,
  `${DATA_PATH}/archive-details.json`,
  `${DATA_PATH}/archive-entities.json`,
  `${DATA_PATH}/archive-analytics.json`,
  `${DATA_PATH}/wiki-seed.json`
];

// On install we warm only the core file the app loads on every visit (~1.1 MB
// brotli). The rest of DATA_URLS stays on-demand, cached lazily by SWR on first
// fetch. Deriving from DATA_URLS keeps the install set in sync with the manifest.
const INSTALL_PRECACHE_DATA = DATA_URLS.filter(url => url.endsWith('/archive-core.json'));

console.log('[SW] Environment:',
  IS_LOCAL ? 'local development'
  : IS_GITHUB_PAGES ? 'github pages'
  : 'production');

// Install event - pre-cache static assets
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker...');

  event.waitUntil((async () => {
    const staticCache = await caches.open(CACHE_NAME);
    console.log('[SW] Pre-caching app shell');
    await Promise.allSettled(
      STATIC_ASSETS.map(url =>
        staticCache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err))
      )
    );

    // Warm the core data file so a return visit renders without a network
    // round-trip. Tolerant by design: a data fetch failure (offline, quota)
    // must never block the worker from installing.
    const dataCache = await caches.open(DATA_CACHE_NAME);
    await Promise.allSettled(
      INSTALL_PRECACHE_DATA.map(url =>
        dataCache.add(url).catch(err => console.warn('[SW] Failed to pre-cache data:', url, err))
      )
    );

    console.log('[SW] Install complete');
    await self.skipWaiting();
  })());
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

  // Serve HTML and navigations network-first so a deploy's new index.html (and
  // its updated ?v= imports) reaches returning visitors immediately, with the
  // cached page only as an offline fallback (#274).
  if (isHtmlRequest(event.request, url.pathname)) {
    event.respondWith(networkFirst(event.request, CACHE_NAME));
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

// Check if a request is for HTML: a real navigation, or any .html path. HTML is
// served network-first (see fetch handler) so a deploy is never served stale.
function isHtmlRequest(request, pathname) {
  return request.mode === 'navigate' || pathname.endsWith('.html');
}

// Check if URL is a static asset. '.html' is deliberately excluded -- HTML is
// handled by isHtmlRequest/networkFirst, not cache-first.
function isStaticAsset(pathname) {
  const isAssetType = pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
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
 * Wrap cache.put so a failed write (most often a quota error on the large data
 * cache) is logged and swallowed rather than thrown into an unhandled rejection.
 * Returns whether the write succeeded (#274).
 */
async function safePut(cache, request, response) {
  try {
    await cache.put(request, response);
    return true;
  } catch (err) {
    console.warn('[SW] cache.put failed:', request.url, err);
    return false;
  }
}

/**
 * Stale-while-revalidate strategy.
 * Returns the cached response immediately when present, and refreshes the cache
 * from the network in the background. Failed puts are swallowed by safePut.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request)
    .then(response => {
      if (response.ok) {
        // Fire-and-forget: safePut self-catches, so the background refresh
        // never blocks the returned response nor throws an unhandled rejection.
        safePut(cache, request, response.clone());
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
      // Fire-and-forget so the cache write stays off the response path; safePut
      // self-catches, so it cannot block the response or reject unhandled.
      safePut(cache, request, networkResponse.clone());
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
      // Fire-and-forget so the cache write stays off the response path; safePut
      // self-catches, so it cannot block the response or reject unhandled.
      safePut(cache, request, networkResponse.clone());
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
