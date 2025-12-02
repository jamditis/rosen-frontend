/**
 * Jay Rosen Digital Archive - Service Worker
 *
 * Caching strategy:
 * - Data files (JSON): Stale-while-revalidate (show cached, update in background)
 * - Static assets (JS, CSS): Cache-first (fast loads)
 * - External resources: Network-first with cache fallback
 */

const CACHE_NAME = 'jrda-cache-v1';
const DATA_CACHE_NAME = 'jrda-data-v1';

// Static assets to pre-cache on install
const STATIC_ASSETS = [
  '/wp-content/rosen-archive/',
  '/wp-content/rosen-archive/index.html',
  '/wp-content/rosen-archive/frontend/index.js',
  '/wp-content/rosen-archive/frontend/App.js',
  '/wp-content/rosen-archive/frontend/html.js',
  '/wp-content/rosen-archive/frontend/constants.js',
  '/wp-content/rosen-archive/frontend/index.css',
  '/wp-content/rosen-archive/frontend/dist/tailwind.css',
  '/wp-content/rosen-archive/frontend/services/archiveService.js',
  '/wp-content/rosen-archive/frontend/components/Sidebar.js',
  '/wp-content/rosen-archive/frontend/components/RecordModal.js',
  '/wp-content/rosen-archive/frontend/components/FeaturedSection.js',
  '/wp-content/rosen-archive/frontend/components/Explorer.js',
  '/wp-content/rosen-archive/frontend/components/WelcomeModal.js',
  '/wp-content/rosen-archive/frontend/components/DissertationPage.js',
  '/wp-content/rosen-archive/frontend/components/MindMap.js',
  '/wp-content/rosen-archive/frontend/components/DetailPanel.js',
  '/wp-content/rosen-archive/frontend/components/dissertationData.js',
  '/wp-content/rosen-archive/frontend/components/ToolsModal.js',
  '/wp-content/rosen-archive/frontend/components/LoadingQuotes.js',
  '/wp-content/rosen-archive/frontend/components/WorkInProgressBanner.js',
  '/wp-content/rosen-archive/frontend/components/AnalyticsDashboard.js',
  '/wp-content/rosen-archive/frontend/services/sqliteService.js'
];

// Data files to cache with stale-while-revalidate
const DATA_URLS = [
  '/wp-content/rosen-archive/data/archive-core.json',
  '/wp-content/rosen-archive/data/archive-details.json',
  '/wp-content/rosen-archive/data/archive-entities.json'
];

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
  return pathname.endsWith('.json') &&
         pathname.includes('/data/') &&
         pathname.includes('rosen-archive');
}

// Check if URL is a static asset
function isStaticAsset(pathname) {
  return pathname.includes('rosen-archive') && (
    pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.html') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.svg')
  );
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
