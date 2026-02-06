/**
 * Jay Rosen Internet Archive - Service Worker
 *
 * Caching strategy:
 * - Data files (JSON): Stale-while-revalidate (show cached, update in background)
 * - Static assets (JS, CSS): Cache-first (fast loads)
 * - External resources: Network-first with cache fallback
 */

const CACHE_NAME = 'jrda-cache-v3';
const DATA_CACHE_NAME = 'jrda-data-v3';

// Detect if we're running on localhost
const IS_LOCAL = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';

// Base path depends on environment
const BASE_PATH = IS_LOCAL ? '/frontend' : '/j/rosen-archive';
const DATA_PATH = IS_LOCAL ? '/data' : '/j/rosen-archive/data';

// Static assets to pre-cache on install
const STATIC_ASSETS = IS_LOCAL ? [
  // Local development paths
  '/frontend/',
  '/frontend/index.html',
  '/frontend/index.js',
  '/frontend/App.js',
  '/frontend/html.js',
  '/frontend/constants.js',
  '/frontend/index.css',
  '/frontend/dist/tailwind.css',
  '/frontend/services/archiveService.js',
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
  '/frontend/services/sqliteService.js'
] : [
  // Production WordPress paths
  '/j/rosen-archive/',
  '/j/rosen-archive/index.html',
  '/j/rosen-archive/frontend/index.js',
  '/j/rosen-archive/frontend/App.js',
  '/j/rosen-archive/frontend/html.js',
  '/j/rosen-archive/frontend/constants.js',
  '/j/rosen-archive/frontend/index.css',
  '/j/rosen-archive/frontend/dist/tailwind.css',
  '/j/rosen-archive/frontend/services/archiveService.js',
  '/j/rosen-archive/frontend/components/Sidebar.js',
  '/j/rosen-archive/frontend/components/RecordModal.js',
  '/j/rosen-archive/frontend/components/FeaturedSection.js',
  '/j/rosen-archive/frontend/components/Explorer.js',
  '/j/rosen-archive/frontend/components/WelcomeModal.js',
  '/j/rosen-archive/frontend/components/DissertationPage.js',
  '/j/rosen-archive/frontend/components/MindMap.js',
  '/j/rosen-archive/frontend/components/DetailPanel.js',
  '/j/rosen-archive/frontend/components/dissertationData.js',
  '/j/rosen-archive/frontend/components/ToolsModal.js',
  '/j/rosen-archive/frontend/components/LoadingQuotes.js',
  '/j/rosen-archive/frontend/components/WorkInProgressBanner.js',
  '/j/rosen-archive/frontend/components/AnalyticsDashboard.js',
  '/j/rosen-archive/frontend/components/QueryBuilder.js',
  '/j/rosen-archive/frontend/services/sqliteService.js'
];

// Data files to cache with stale-while-revalidate
const DATA_URLS = IS_LOCAL ? [
  '/data/archive-core.json',
  '/data/archive-details.json',
  '/data/archive-entities.json'
] : [
  '/j/rosen-archive/data/archive-core.json',
  '/j/rosen-archive/data/archive-details.json',
  '/j/rosen-archive/data/archive-entities.json'
];

console.log('[SW] Environment:', IS_LOCAL ? 'local development' : 'production');

// Install event - pre-cache static assets
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Pre-caching static assets');
        // Don't fail install if some assets fail to cache
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

// Activate event - clean up old caches
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
  // Match both local and production paths
  return IS_LOCAL || pathname.includes('rosen-archive');
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

  // Match both local and production paths
  if (IS_LOCAL) {
    return pathname.startsWith('/frontend/') || pathname.startsWith('/data/');
  }
  return pathname.includes('rosen-archive');
}

/**
 * Stale-while-revalidate strategy
 * Returns cached response immediately, then updates cache in background
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);

  // Try to get from cache
  const cachedResponse = await cache.match(request);

  // Fetch from network in background
  const fetchPromise = fetch(request)
    .then(response => {
      if (response.ok) {
        // Clone and cache the response
        cache.put(request, response.clone());
        console.log('[SW] Updated cache for:', request.url);
      }
      return response;
    })
    .catch(err => {
      console.warn('[SW] Network fetch failed:', request.url, err);
      return null;
    });

  // Return cached response immediately, or wait for network
  if (cachedResponse) {
    console.log('[SW] Serving from cache (stale-while-revalidate):', request.url);
    return cachedResponse;
  }

  console.log('[SW] Cache miss, waiting for network:', request.url);
  const networkResponse = await fetchPromise;
  if (networkResponse) {
    return networkResponse;
  }

  // If both cache and network fail, return error
  return new Response('Offline and no cached data available', {
    status: 503,
    statusText: 'Service Unavailable'
  });
}

/**
 * Cache-first strategy
 * Returns cached response if available, otherwise fetches from network
 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  // Try cache first
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    console.log('[SW] Serving from cache (cache-first):', request.url);
    return cachedResponse;
  }

  // Fallback to network
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
 * Tries network first, falls back to cache if offline
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
    // Network failed, try cache
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      console.log('[SW] Network failed, serving from cache:', request.url);
      return cachedResponse;
    }

    // Both failed
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
