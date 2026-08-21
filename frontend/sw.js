/**
 * Jay Rosen's Internet Archive - Service Worker
 *
 * Caching strategy:
 * - HTML / navigations: Network-first, cache as offline fallback. The page must
 *   be fetched fresh after a deploy so its ?v= import strings update (#274).
 * - Data files (JSON): Stale-while-revalidate (show cached, update in background)
 * - Static assets (JS, CSS, icons, images): Cache-first (fast loads). Versioned
 *   request URLs are exact cache keys so module releases cannot be mixed.
 * - Everything else same-origin: Network-first with cache fallback.
 */

// Cache version is tied to the app version in version.json. Bumping it on every
// deploy (alongside index.html and the ?v= import strings) makes the activate
// handler below drop stale cache namespaces after the release takes control.
const CACHE_VERSION = '3.8.27';
const CACHE_NAME = `jrda-cache-${CACHE_VERSION}`;
const DATA_CACHE_NAME = `jrda-data-${CACHE_VERSION}`;

// Detect deploy surface. Keep in sync with frontend/utils/pathResolver.js —
// this classic worker is loaded through the root sw.js bridge, so it cannot
// `import` from the shared resolver and duplicates this logic inline.
const HOST = self.location.hostname;
// Browsers serialize IPv6 URL hostnames with brackets; tests and other
// runtimes may expose the bare literal. Keep this in sync with pathResolver.
const IS_LOCAL = HOST === 'localhost'
  || HOST === '127.0.0.1'
  || HOST === '::1'
  || HOST === '[::1]';
const IS_GITHUB_PAGES = HOST.endsWith('.github.io');

const SITE_ROOT = IS_LOCAL ? ''
  : IS_GITHUB_PAGES ? '/rosen-frontend'
  : '/j/rosen-archive';
const FRONTEND_PATH = `${SITE_ROOT}/frontend`;
const DATA_PATH = `${SITE_ROOT}/data`;

// The standard application shell is explicit so its first installed visit can
// reopen offline even though registration happens after the initial page load.
// Desktop modules are deliberately absent: they are warmed only after someone
// opens the optional desktop, preserving its lazy/default-route contract.
const APP_SHELL_FRONTEND_FILES = [
  'index.js',
  'App.js',
  'html.js',
  'constants.js',
  'index.css',
  'design-system/legacy-token-bridge.css',
  'design-system/tokens.css',
  'design-system/recipes.css',
  'dist/tailwind.css',
  'components/AboutPage.js',
  'components/AnalyticsDashboard.js',
  'components/ArchiveResults.js',
  'components/ArchiveRouteHeader.js',
  'components/BugReportModal.js',
  'components/DetailPanel.js',
  'components/DissertationPage.js',
  'components/EntityBrowser.js',
  'components/FeaturedSection.js',
  'components/LoadingQuotes.js',
  'components/MindMap.js',
  'components/QueryBuilder.js',
  'components/RecordModal.js',
  'components/RecordView.js',
  'components/Sidebar.js',
  'components/StartHerePage.js',
  'components/ThreadModal.js',
  'components/Timeline.js',
  'components/ToolsModal.js',
  'components/WelcomeModal.js',
  'components/WikiPage.js',
  'components/WorkInProgressBanner.js',
  'components/dissertationData.js',
  'services/archiveService.js',
  'services/bodyScrollLock.js',
  'services/cacheConfig.js',
  'services/idbCache.js',
  'services/queryComposition.js',
  'services/releaseMetadata.js',
  'services/privacyRoute.js',
  'services/router.js',
  'services/searchIndexLoader.js',
  'services/semanticRecall.js',
  'services/sqliteService.js',
  'services/tourState.js',
  'services/viewState.js',
  'services/wikiService.js',
  'utils/bugReport.js',
  'utils/csvSafety.js',
  'utils/linkify.js',
  'utils/modalNav.js',
  'utils/needsReview.js',
  'utils/pathResolver.js',
  'utils/perfMark.js',
  'utils/raceTimeout.js',
  'utils/recordDeepLink.js',
  'utils/recordSort.js',
  'utils/reportDeepLink.js',
  'utils/reportSubmit.js',
  'utils/sanitizeHref.js',
  'utils/searchConfig.js',
  'utils/searchNormalize.js',
  'utils/submitGate.js',
  'utils/timelineData.js',
  'utils/viewTransition.js'
];

const STATIC_ASSETS = [
  `${SITE_ROOT}/`,
  `${SITE_ROOT}/index.html`,
  `${SITE_ROOT}/favicon.ico`,
  `${SITE_ROOT}/favicon.svg`,
  `${DATA_PATH}/eras.js?v=${CACHE_VERSION}`,
  ...APP_SHELL_FRONTEND_FILES.map(file => `${FRONTEND_PATH}/${file}?v=${CACHE_VERSION}`)
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
  `${DATA_PATH}/search-index.json`,
  `${DATA_PATH}/social-search-index.json`,
  `${DATA_PATH}/wiki-seed.json`
];

// On install we warm only the core file the app loads on every visit (~1.1 MB
// brotli). The rest of DATA_URLS stays on-demand, cached lazily by SWR on first
// fetch. Deriving from DATA_URLS keeps the install set in sync with the manifest.
const INSTALL_PRECACHE_DATA = DATA_URLS.filter(url => url.endsWith('/archive-core.json'));

// Optional shell assets are cached only after DesktopShell asks for them. This
// covers a first-ever direct #desktop visit too: registration occurs after the
// page load, then the active worker warms the already-used module graph for the
// next offline visit without making standard visitors download it. These use
// the same versioned request keys as the dynamic imports so a first visit and
// the warm-up message cannot create query/no-query duplicates in the cache.
const DESKTOP_ASSETS = [
  'DesktopShell.js',
  'DesktopArchivePanel.js',
  'DesktopEntityPanel.js',
  'DesktopDissertationPanel.js',
  'DesktopAnalyticsPanel.js',
  'DesktopStartPanel.js',
  'desktopRegistry.js',
  'desktopWindowState.js',
  'desktop.css'
].map(file => `${FRONTEND_PATH}/desktop/${file}?v=${CACHE_VERSION}`);

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
  return pathname.startsWith(`${DATA_PATH}/`);
}

// Check if a request is for HTML: a real navigation, or any .html path. HTML is
// served network-first (see fetch handler) so a deploy is never served stale.
function isHtmlRequest(request, pathname) {
  return request.mode === 'navigate' || pathname.endsWith('.html');
}

// Only the root document is the single-page application. Standalone pages are
// controlled by this root-scoped worker too, but must never receive the cached
// SPA shell at their own URL when their exact response is unavailable offline.
function isSpaNavigation(request) {
  if (request.mode !== 'navigate') return false;
  const pathname = new URL(request.url).pathname;
  return pathname === `${SITE_ROOT}/` || pathname === `${SITE_ROOT}/index.html`;
}

// Check if URL is a static asset. '.html' is deliberately excluded -- HTML is
// handled by isHtmlRequest/networkFirst, not cache-first.
function isStaticAsset(pathname) {
  const isAssetType = pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.wasm') ||
    pathname.endsWith('.bin') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.svg');

  if (!isAssetType) return false;

  return pathname.startsWith(`${FRONTEND_PATH}/`) ||
    pathname.startsWith(`${DATA_PATH}/`) ||
    pathname === `${SITE_ROOT}/favicon.ico` ||
    pathname === `${SITE_ROOT}/favicon.svg`;
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
  const cachedResponse = await cache.match(request);
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
    let cachedResponse = await cache.match(request);
    // Query-string deep links (notably ?record=...) are still the same
    // single-page app document. The install cache holds the clean site root,
    // so use it as the navigation fallback instead of returning a plain 503
    // merely because the cached Request lacks that query string.
    if (!cachedResponse && isSpaNavigation(request)) {
      cachedResponse = await cache.match(`${SITE_ROOT}/`);
    }
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
  if (event.data?.action === 'skipWaiting') {
    self.skipWaiting();
  }

  if (event.data?.action === 'clearCache') {
    const pending = caches.keys().then(names => Promise.all(
      names.map(name => caches.delete(name))
    ));
    event.waitUntil?.(pending);
  }

  if (event.data?.action === 'cacheDesktop') {
    const pending = caches.open(CACHE_NAME).then(cache => Promise.allSettled(
      DESKTOP_ASSETS.map(url =>
        cache.add(url).catch(err => console.warn('[SW] Failed to cache desktop asset:', url, err))
      )
    ));
    event.waitUntil?.(pending);
  }
});
