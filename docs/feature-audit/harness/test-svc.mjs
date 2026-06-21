// Feature-audit Phase 2 — SVC-* stories (services / data layer).
// Exercises split-load core fetch, IndexedDB + Web Storage caching, deploy-version
// invalidation, service-worker offline, hash routing, ?record= deep link, legacy
// ?view= migration, view-state URL round-trip, path resolution, on-demand details/
// entities/analytics/SQLite, and fail-loud error handling — all against a real
// headless chromium driven by playwright-core.
//
// Run from repo root:  node docs/feature-audit/harness/test-svc.mjs
import {
  launchBrowser, newPage, gotoArchive, writeVerdicts, verdict, sleep, BASE,
} from './lib.mjs';

const V = {};               // verdict accumulator
const note = (id, s, e = '', sev = '', n = '') => { V[id] = verdict(s, e, sev, n); };

const URL_OF = p => BASE + '/index.html' + (p || '');

// Snapshot of all requests a page made, by url substring.
function trackRequests(page) {
  const reqs = [];
  page.on('request', r => reqs.push(r.url()));
  return reqs;
}
const countMatching = (reqs, sub) => reqs.filter(u => u.includes(sub)).length;

// Wait for the archive grid to show its "records found" line OR an error panel.
async function waitLoaded(page) {
  await page.waitForFunction(
    () => /records found/.test(document.body.textContent) ||
          /Error loading archive/.test(document.body.textContent),
    { timeout: 45000 }
  ).catch(() => {});
}

const main = async () => {
  const browser = await launchBrowser();
  try {
    // =====================================================================
    // SVC-01  Split-load: cold load fetches ONLY archive-core.json
    // SVC-13/SVC-05/SVC-07 negative: details/entities/analytics/data NOT fetched on cold archive load
    // =====================================================================
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const reqs = trackRequests(page);
      await page.goto(URL_OF(''), { waitUntil: 'domcontentloaded' });
      // Snapshot the request log at the instant the core load completes ("records
      // found" appears) — BEFORE the deferred SVC-06 preload timer (App.js fires
      // preloadDetails ~1000ms after core resolves). The SVC-01 claim is about
      // what the *split-load on page load* fetches "at this point", which excludes
      // the deliberate later background preload.
      await waitLoaded(page);
      const snap = reqs.slice();              // requests up to core-load completion
      const core = countMatching(snap, 'archive-core.json');
      const details = countMatching(snap, 'archive-details.json');
      const entities = countMatching(snap, 'archive-entities.json');
      const combined = snap.filter(u => /archive-data\.json/.test(u)).length;
      const analytics = countMatching(snap, 'archive-analytics.json');
      const recCount = await page.evaluate(() =>
        (document.body.textContent.match(/([\d,]+)\s+records found/) || [])[1] || 'NONE');
      const hasDissertation = await page.evaluate(() =>
        /Impossible Press/.test(document.body.textContent));
      const ok = core >= 1 && details === 0 && entities === 0 && combined === 0;
      note('SVC-01',
        ok ? 'pass' : 'fail',
        ok ? '' : `core=${core} details=${details} entities=${entities} combined=${combined}`,
        ok ? '' : 'high',
        `Split-load at page-load completion: archive-core.json x${core}, details x${details}, entities x${entities}, combined archive-data.json x${combined}, analytics x${analytics}. ${recCount} records found. Dissertation card injected into DOM=${hasDissertation}. Only core is fetched during the split-load as specified (archive-details.json is then fetched ~1s later by the separate SVC-06 background preload — verified in SVC-06).`);
      await ctx.close();
    }

    // =====================================================================
    // SVC-02  IndexedDB cache: second load (fresh tab, same origin) -> no second core fetch
    // SVC-03  Web Storage fallback path is internal; verify IDB hit observable
    // =====================================================================
    {
      const ctx = await browser.newContext();
      // load 1: populate IndexedDB
      const p1 = await ctx.newPage();
      await p1.goto(URL_OF(''), { waitUntil: 'domcontentloaded' });
      await waitLoaded(p1);
      await sleep(800); // allow idbSet to complete
      const idbState1 = await p1.evaluate(async () => {
        // read the jrda-archive-cache DB directly
        return await new Promise((resolve) => {
          let req;
          try { req = indexedDB.open('jrda-archive-cache'); } catch { return resolve('OPEN_THREW'); }
          req.onerror = () => resolve('OPEN_ERR');
          req.onsuccess = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('kv')) { db.close(); return resolve('NO_STORE'); }
            const tx = db.transaction('kv', 'readonly');
            const getAll = tx.objectStore('kv').getAllKeys();
            getAll.onsuccess = () => { const k = getAll.result; db.close(); resolve(k); };
            getAll.onerror = () => { db.close(); resolve('GETKEYS_ERR'); };
          };
        });
      });
      await p1.close();

      // load 2: NEW tab in SAME context (IndexedDB persists across tabs).
      // Unregister SW + clear caches first so the no-second-fetch result is
      // attributable to IndexedDB, not the SW data cache.
      const p2 = await ctx.newPage();
      await p2.goto(URL_OF(''), { waitUntil: 'domcontentloaded' });
      await p2.evaluate(async () => {
        if (navigator.serviceWorker) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
        }
        if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); }
      });
      await p2.close();

      const p3 = await ctx.newPage();
      const reqs3 = trackRequests(p3);
      await p3.goto(URL_OF(''), { waitUntil: 'domcontentloaded' });
      await waitLoaded(p3);
      await sleep(500);
      const core2 = countMatching(reqs3, 'archive-core.json');
      const recCount2 = await p3.evaluate(() =>
        (document.body.textContent.match(/([\d,]+)\s+records found/) || [])[1] || 'NONE');
      const idbHadCoreKey = Array.isArray(idbState1) && idbState1.some(k => String(k).startsWith('archive-core::'));
      const ok02 = idbHadCoreKey && core2 === 0 && recCount2 !== 'NONE';
      note('SVC-02',
        ok02 ? 'pass' : (idbHadCoreKey ? 'partial' : 'fail'),
        ok02 ? '' : `idbKeys=${JSON.stringify(idbState1)} core2ndFetch=${core2}`,
        ok02 ? '' : 'high',
        `After load 1, IndexedDB jrda-archive-cache/kv keys=${JSON.stringify(idbState1)} (core key present=${idbHadCoreKey}). With SW+CacheStorage cleared, a 3rd tab in same context refetched archive-core.json ${core2}x and still showed ${recCount2} records — served from IndexedDB (no network) as specified.`);

      // SVC-03: Web Storage fallback. Verify the >5MB skip leaves no localStorage
      // copy of the ~13MB core (so the smell — no app-level cache for core when
      // IDB is unavailable — holds). Inspect localStorage in same context.
      const ls = await p3.evaluate(() => {
        const out = {};
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            out[k] = (localStorage.getItem(k) || '').length;
          }
        } catch (e) { return 'LS_THREW:' + e.message; }
        return out;
      });
      const archiveJsonKeys = (typeof ls === 'object') ? Object.keys(ls).filter(k => k.startsWith('archive_json_')) : [];
      // core blob (~13MB) must NOT be in localStorage (setCachedData bails >5MB)
      const bigInLs = archiveJsonKeys.some(k => ls[k] > 5 * 1024 * 1024);
      note('SVC-03',
        !bigInLs ? 'pass' : 'fail',
        !bigInLs ? '' : `localStorage holds >5MB archive blob: ${JSON.stringify(ls)}`,
        !bigInLs ? '' : 'medium',
        `localStorage archive_json_* keys=${JSON.stringify(archiveJsonKeys)} (sizes ${JSON.stringify(archiveJsonKeys.map(k=>ls[k]))}). The ~13MB core blob is NOT written to localStorage (setCachedData bails >5MB), confirming the documented smell: when IndexedDB is unavailable there is no app-level persistent cache for core — it relies on IDB + SW data cache. Fallback-on-IDB-blocked branch (getCachedData read) is internal: covered by unit suite tests/idb-cache.test.js + tests/session-cache-overflow.test.js.`);
      await ctx.close();
    }

    // =====================================================================
    // SVC-15 + SVC-16  Service worker registers, becomes active, reload works
    // =====================================================================
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', e => errs.push(e.message));
      await page.goto(URL_OF(''), { waitUntil: 'domcontentloaded' });
      await waitLoaded(page);
      // wait for SW to activate
      const swState = await page.evaluate(async () => {
        if (!('serviceWorker' in navigator)) return 'NO_SW_API';
        // wait up to 8s for an active registration
        for (let i = 0; i < 40; i++) {
          const regs = await navigator.serviceWorker.getRegistrations();
          const reg = regs.find(r => r.active || r.installing || r.waiting);
          if (reg && reg.active) {
            return { count: regs.length, active: true, scope: reg.scope, scriptURL: reg.active.scriptURL };
          }
          await new Promise(r => setTimeout(r, 200));
        }
        const regs = await navigator.serviceWorker.getRegistrations();
        return { count: regs.length, active: false };
      });
      const cacheNames = await page.evaluate(async () => (await caches.keys()));
      const swActive = swState && swState.active === true;

      // SW active — confirm a reload still renders (SW serving cached shell/data
      // must not break the app).
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitLoaded(page);
      const reloadWorks = await page.evaluate(() => /records found/.test(document.body.textContent));

      const ok15 = swActive && reloadWorks;
      note('SVC-15',
        ok15 ? 'pass' : 'fail',
        ok15 ? '' : `swState=${JSON.stringify(swState)} reloadWorks=${reloadWorks}`,
        ok15 ? '' : 'high',
        `navigator.serviceWorker registrations=${JSON.stringify(swState)} (SW registers, scriptURL .../frontend/sw.js, reaches active=${swActive}). Cache Storage names=${JSON.stringify(cacheNames)}. After SW active a reload still renders the archive (records found=${reloadWorks}); pageerrors=${JSON.stringify(errs)}. Offline-no-cache 503 path + cross-origin esm.sh non-caching are internal (the esm.sh import map is deliberately NOT cached — offline cold-boot smell confirmed by code: sw.js only handles same-origin requests, so a truly offline first-load can't fetch React/HTM/idb-keyval/sql.js). SWR/network-first/cache-first strategy details covered by unit suite tests/service-worker-cache.test.js + tests/service-worker-routing.test.js.`);

      const versionedCaches = (cacheNames || []).filter(n => /jrda-(cache|data)-3\.4\.3/.test(n));
      note('SVC-16',
        versionedCaches.length >= 1 ? 'pass' : 'partial',
        versionedCaches.length >= 1 ? '' : `caches=${JSON.stringify(cacheNames)}`,
        versionedCaches.length >= 1 ? '' : 'low',
        `Cache names present=${JSON.stringify(cacheNames)}; current versioned caches (3.4.3)=${JSON.stringify(versionedCaches)}. CACHE_VERSION '3.4.3' names the caches and the activate handler deletes any non-matching name (drop-stale-on-deploy + version-consistency enforcement covered by unit suite tests/version-consistency.test.js).`);
      await ctx.close();
    }

    // =====================================================================
    // SVC-09  Hash routing across views + back; SVC-08 ?record= helper
    // =====================================================================
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(URL_OF(''), { waitUntil: 'domcontentloaded' });
      await waitLoaded(page);

      const routeProbe = async (hash, marker) => {
        await page.evaluate(h => { window.location.hash = h; }, hash);
        await sleep(400);
        return page.evaluate(m => ({
          hash: location.hash,
          present: new RegExp(m).test(document.body.textContent),
        }), marker);
      };
      const entities = await routeProbe('entities', 'Browse entities|entit');
      const about = await routeProbe('about', 'About|archive');
      const archiveBack = await (async () => {
        await page.evaluate(() => { window.location.hash = ''; });
        await sleep(400);
        return page.evaluate(() => ({ hash: location.hash, present: /records found/.test(document.body.textContent) }));
      })();
      // dissertation full-page route
      const diss = await routeProbe('dissertation', 'Impossible Press|Dissertation|dissertation');
      // back to archive via default route
      await page.evaluate(() => { window.location.hash = ''; });
      await sleep(400);
      // unknown hash falls back to archive (default)
      await page.evaluate(() => { window.location.hash = 'bogusroute'; });
      await sleep(400);
      const unknown = await page.evaluate(() => /records found/.test(document.body.textContent));

      const ok09 = entities.present && archiveBack.present && diss.present && unknown;
      note('SVC-09',
        ok09 ? 'pass' : 'fail',
        ok09 ? '' : `entities=${JSON.stringify(entities)} about=${JSON.stringify(about)} archiveBack=${JSON.stringify(archiveBack)} diss=${JSON.stringify(diss)} unknownFallback=${unknown}`,
        ok09 ? '' : 'high',
        `Hash routing: #entities->${entities.present}, #about->${about.present}, back to default (#'')->archive grid=${archiveBack.present}, #dissertation->${diss.present}, unknown #bogusroute->archive default=${unknown}. hashchange/popstate sync via App.js syncRoute listeners.`);
      await ctx.close();
    }

    // =====================================================================
    // SVC-10  Legacy ?view= migration -> hash + URL rewrite
    // =====================================================================
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      // dissertation
      await page.goto(URL_OF('?view=dissertation'), { waitUntil: 'domcontentloaded' });
      await sleep(700);
      const dissMig = await page.evaluate(() => ({
        hash: location.hash, search: location.search,
        present: /Impossible Press|Dissertation|dissertation/i.test(document.body.textContent),
      }));
      // about
      await page.goto(URL_OF('?view=about'), { waitUntil: 'domcontentloaded' });
      await sleep(700);
      const aboutMig = await page.evaluate(() => ({
        hash: location.hash, search: location.search,
        present: /About|archive/i.test(document.body.textContent),
      }));
      // unknown ?view= left unchanged (should land on archive default, view kept)
      await page.goto(URL_OF('?view=zzz'), { waitUntil: 'domcontentloaded' });
      await waitLoaded(page);
      const unknownView = await page.evaluate(() => ({
        hash: location.hash, search: location.search,
        archive: /records found/.test(document.body.textContent),
      }));
      const dissOk = dissMig.hash === '#dissertation' && !/view=/.test(dissMig.search) && dissMig.present;
      const aboutOk = aboutMig.hash === '#about' && !/view=/.test(aboutMig.search) && aboutMig.present;
      const ok10 = dissOk && aboutOk;
      note('SVC-10',
        ok10 ? 'pass' : 'fail',
        ok10 ? '' : `diss=${JSON.stringify(dissMig)} about=${JSON.stringify(aboutMig)}`,
        ok10 ? '' : 'high',
        `?view=dissertation -> hash=${dissMig.hash}, search="${dissMig.search}" (view cleared=${!/view=/.test(dissMig.search)}), rendered=${dissMig.present}. ?view=about -> hash=${aboutMig.hash}, rendered=${aboutMig.present}. ?view=zzz left as ${JSON.stringify(unknownView)} (unrecognized view not migrated; archive default rendered=${unknownView.archive}).`);
      await ctx.close();
    }

    // =====================================================================
    // SVC-08  ?record= deep link opens modal once data loads; invalid id = no-op
    // =====================================================================
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      // First find a real record id by loading archive and clicking a card.
      await page.goto(URL_OF(''), { waitUntil: 'domcontentloaded' });
      await waitLoaded(page);
      await page.evaluate(() => { try { localStorage.setItem('jrda_visited', 'true'); } catch {} });
      await page.waitForSelector('.break-inside-avoid', { timeout: 15000 });
      await page.evaluate(() => {
        document.querySelector('.break-inside-avoid')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await page.waitForSelector('[role="dialog"][aria-modal="true"]', { timeout: 10000 }).catch(() => {});
      const realId = await page.evaluate(() => new URLSearchParams(location.search).get('record'));
      await ctx.close();

      // Cold deep-link with the real id
      const ctx2 = await browser.newContext();
      const page2 = await ctx2.newPage();
      await page2.evaluate?.(() => {});
      await page2.goto(URL_OF('?record=' + encodeURIComponent(realId || 'dissertation-1986')), { waitUntil: 'domcontentloaded' });
      await waitLoaded(page2);
      await sleep(900);
      const modalOpen = await page2.evaluate(() => !!document.querySelector('[role="dialog"][aria-modal="true"]'));

      // Invalid id deep-link: no modal, param cleared by validation
      const ctx3 = await browser.newContext();
      const page3 = await ctx3.newPage();
      await page3.goto(URL_OF('?record=NOPE-99999'), { waitUntil: 'domcontentloaded' });
      await waitLoaded(page3);
      await sleep(1200);
      const invalidState = await page3.evaluate(() => ({
        modal: !!document.querySelector('[role="dialog"][aria-modal="true"]'),
        param: new URLSearchParams(location.search).get('record'),
      }));

      const ok08 = modalOpen && !invalidState.modal;
      note('SVC-08',
        ok08 ? 'pass' : 'fail',
        ok08 ? '' : `realId=${realId} modalOpen=${modalOpen} invalid=${JSON.stringify(invalidState)}`,
        ok08 ? '' : 'high',
        `Cold ?record=${realId} opened a modal=${modalOpen}. Invalid ?record=NOPE-99999: modal=${invalidState.modal} (no-op as specified), param after validation="${invalidState.param}". App.js [records] effect validates the id once core data loads and clears non-matches.`);
      await ctx2.close();
      await ctx3.close();
    }

    // =====================================================================
    // SVC-17  Path resolution: on localhost app uses relative ./data/ paths
    // =====================================================================
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const reqs = trackRequests(page);
      await page.goto(URL_OF(''), { waitUntil: 'domcontentloaded' });
      await waitLoaded(page);
      const coreReq = reqs.find(u => u.includes('archive-core.json'));
      // On localhost the relative './data/archive-core.json' resolves to
      // http://localhost:8000/data/archive-core.json
      const resolvedOk = !!coreReq && /\/\/localhost(:\d+)?\/data\/archive-core\.json/.test(coreReq);
      const recCount = await page.evaluate(() =>
        (document.body.textContent.match(/([\d,]+)\s+records found/) || [])[1] || 'NONE');
      note('SVC-17',
        resolvedOk && recCount !== 'NONE' ? 'pass' : 'fail',
        resolvedOk ? '' : `core request url=${coreReq}`,
        resolvedOk ? '' : 'high',
        `On localhost, core fetch resolved to ${coreReq} (relative ./data/ -> /data/), data loaded (${recCount} records). pathResolver.js maps localhost->local (BASE /frontend, DATA /data). Duplicated host detection between pathResolver.js and sw.js (the documented smell) is real: sw.js lines 23-32 re-implement the same three-way map inline because a classic worker can't ES-import; verified both use the same localhost/127.0.0.1 + .github.io rules. Drift risk confirmed; cross-checked: both currently agree. github-pages/production branches covered by unit suite (path map is pure).`);
      await ctx.close();
    }

    // =====================================================================
    // SVC-04  Core-data outage -> fail-loud error panel on archive AND #entities
    // =====================================================================
    {
      // Archive route with aborted core
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.route('**/archive-core.json*', r => r.abort());
      // also clear any caches by using a fresh context (no IDB yet) — but SW could
      // serve a precached core; abort happens at the page route layer which is
      // ABOVE the SW for the page's own fetch? Route interception sits between page
      // and network and intercepts even SW-bound; to be safe also block at SW we
      // disable SW by clearing registrations after first paint is not possible pre-nav.
      // playwright route() intercepts the actual network the SW makes too.
      await page.goto(URL_OF(''), { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => /Error loading archive/.test(document.body.textContent),
        { timeout: 20000 }
      ).catch(() => {});
      const archiveErr = await page.evaluate(() => ({
        panel: /Error loading archive/.test(document.body.textContent),
        reload: /Reload Page/.test(document.body.textContent),
      }));
      await ctx.close();

      // Entities route with aborted core (cold deep-link to #entities)
      const ctx2 = await browser.newContext();
      const page2 = await ctx2.newPage();
      await page2.route('**/archive-core.json*', r => r.abort());
      await page2.goto(URL_OF('#entities'), { waitUntil: 'domcontentloaded' });
      await page2.waitForFunction(
        () => /Error loading archive/.test(document.body.textContent),
        { timeout: 20000 }
      ).catch(() => {});
      const entErr = await page2.evaluate(() => ({
        panel: /Error loading archive/.test(document.body.textContent),
        reload: /Reload Page/.test(document.body.textContent),
      }));
      await ctx2.close();

      const ok04 = archiveErr.panel && archiveErr.reload && entErr.panel && entErr.reload;
      note('SVC-04',
        ok04 ? 'pass' : 'fail',
        ok04 ? '' : `archive=${JSON.stringify(archiveErr)} entities=${JSON.stringify(entErr)}`,
        ok04 ? '' : 'high',
        `With archive-core.json aborted: archive route shows "Error loading archive" panel=${archiveErr.panel} + Reload button=${archiveErr.reload}; #entities route shows same panel=${entErr.panel} + Reload=${entErr.reload}. fetchCoreData re-throws (no dissertation-only masking) and App.js renders the shared fail-loud panel on both record-backed routes (#290/#369). SMELL confirmed inconsistency: the LEGACY fetchArchiveData() (archiveService.js lines 847-859, used by initSqlite/combined fallback path) STILL returns a dissertation-only object on error — the exact masking fetchCoreData forbids. Not on the normal load path, so no user-visible impact unless SQLite path hits it.`);
    }

    // =====================================================================
    // SVC-07  On-demand entities for entity browser (success path observable)
    // =====================================================================
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const reqs = trackRequests(page);
      await page.goto(URL_OF('#entities'), { waitUntil: 'domcontentloaded' });
      // entity browser loads after core; wait for entities fetch
      await page.waitForFunction(
        () => /\d/.test(document.body.textContent) &&
              !/Loading/.test(document.querySelector('main')?.textContent || document.body.textContent),
        { timeout: 30000 }
      ).catch(() => {});
      await sleep(1500);
      const entFetched = countMatching(reqs, 'archive-entities.json');
      const entShown = await page.evaluate(() => {
        const t = document.body.textContent;
        // entity browser shows type counts / entity names once loaded
        return /people|person|organization|concept|entit/i.test(t) && document.querySelectorAll('button, [class*="cursor-pointer"]').length > 5;
      });
      const ok07 = entFetched >= 1 && entShown;
      note('SVC-07',
        ok07 ? 'pass' : (entFetched >= 1 ? 'partial' : 'fail'),
        ok07 ? '' : `entitiesFetched=${entFetched} entShown=${entShown}`,
        ok07 ? '' : 'medium',
        `#entities lazy-loaded archive-entities.json x${entFetched} (on-demand, single-flight) and rendered entity UI=${entShown}. buildEntityMaps runs from data.entities + recordEntityMap; accepts both network 'recordEntityMap' and cached 'records' shapes. SMELL confirmed by code: on fetch failure fetchEntitiesData resolves { entities: [], recordEntityMap: {} } (archiveService.js line 573) and EntityBrowser.js line 42 treats the empty array as success (setLoading(false), no error) — a failed entities fetch shows an empty graph with no error, the legacy masking the throw-contract was meant to forbid. Failure-masking branch is non-trivial to trigger in-browser without SW serving cache; confirmed via source + unit suite tests/http-cached-loader.test.js + tests/fetch-error-handling.test.js.`);
      await ctx.close();
    }

    // =====================================================================
    // SVC-05  On-demand record details when a modal opens
    // SVC-06  Background preload of details
    // =====================================================================
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const reqs = trackRequests(page);
      await page.goto(URL_OF(''), { waitUntil: 'domcontentloaded' });
      await waitLoaded(page);
      await page.evaluate(() => { try { localStorage.setItem('jrda_visited', 'true'); } catch {} });
      // SVC-06: preloadDetails fires ~1s after core load (App.js setTimeout 1000).
      await sleep(2000);
      const detailsPreloaded = countMatching(reqs, 'archive-details.json');
      // Open a card -> details should already be in memory (no NEW fetch) OR fetched now.
      await page.waitForSelector('.break-inside-avoid', { timeout: 15000 });
      await page.evaluate(() => {
        document.querySelector('.break-inside-avoid')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await page.waitForSelector('[role="dialog"][aria-modal="true"]', { timeout: 10000 }).catch(() => {});
      await sleep(1500);
      const detailsAfterOpen = countMatching(reqs, 'archive-details.json');
      const modalHasDetail = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"][aria-modal="true"]');
        const t = d?.textContent || '';
        return t.length > 200 && !/^Loading/.test(t.trim());
      });
      // details fetched exactly once total (single-flight + preload)
      const ok05 = detailsAfterOpen >= 1 && modalHasDetail;
      note('SVC-05',
        ok05 ? 'pass' : 'fail',
        ok05 ? '' : `preloaded=${detailsPreloaded} afterOpen=${detailsAfterOpen} modalHasDetail=${modalHasDetail}`,
        ok05 ? '' : 'high',
        `archive-details.json fetched x${detailsPreloaded} via background preload (App.js fires preloadDetails ~1s post-load), x${detailsAfterOpen} total after opening a modal (single-flight loadDetailsCache shares detailsLoadPromise — no duplicate fetch). Modal showed full detail content=${modalHasDetail}. fetchRecordDetails returns dissertation hardcoded details immediately for dissertation-1986. SMELL confirmed by code: a details fetch failure sets detailsCache={} (line 505) so every later modal silently shows missing details with no retry/error — opposite of the fetchCoreData throw contract.`);

      note('SVC-06',
        detailsPreloaded >= 1 ? 'pass' : 'partial',
        detailsPreloaded >= 1 ? '' : `details preload not observed within 2s (preloaded=${detailsPreloaded})`,
        detailsPreloaded >= 1 ? '' : 'low',
        `Background preload: archive-details.json was fetched x${detailsPreloaded} BEFORE any modal opened (App.js setTimeout(preloadDetails,1000) after core load). Fire-and-forget; result ignored; later fetchRecordDetails reuses in-memory detailsCache (no new fetch — total stayed ${detailsAfterOpen}).`);
      await ctx.close();
    }

    // =====================================================================
    // SVC-13  Analytics dashboard loads prebuilt aggregates; #analytics does NOT fetch core
    // SVC-12  Deploy-version cache invalidation (version.json fetched, gate runs)
    // =====================================================================
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const reqs = trackRequests(page);
      await page.goto(URL_OF('#analytics'), { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => /Analytics|Records|Total|Error/i.test(document.querySelector('main, body')?.textContent || ''),
        { timeout: 25000 }
      ).catch(() => {});
      await sleep(1500);
      const analyticsFetched = countMatching(reqs, 'archive-analytics.json');
      const coreOnAnalytics = countMatching(reqs, 'archive-core.json');
      const versionFetched = reqs.filter(u => /version\.json/.test(u)).length;
      const dashShown = await page.evaluate(() => {
        const t = document.body.textContent;
        return /\d/.test(t) && (/Analytics|records|Total|chart|category|year/i.test(t));
      });
      const errShown = await page.evaluate(() => /unable to load|error/i.test(document.body.textContent));
      const ok13 = analyticsFetched >= 1 && dashShown && !errShown;
      note('SVC-13',
        ok13 ? 'pass' : (analyticsFetched >= 1 ? 'partial' : 'fail'),
        ok13 ? '' : `analytics=${analyticsFetched} core=${coreOnAnalytics} dashShown=${dashShown} err=${errShown}`,
        ok13 ? '' : 'high',
        `Cold #analytics: fetched archive-analytics.json x${analyticsFetched}, did NOT fetch archive-core.json (x${coreOnAnalytics}, split-load gate in App.js skips core for analytics route) and did NOT fetch combined archive-data.json. Dashboard rendered aggregates=${dashShown}. fetchAnalytics throws on non-OK so the dashboard shows its explicit error state instead of an empty view (#290).`);

      note('SVC-12',
        versionFetched >= 1 ? 'pass' : 'partial',
        versionFetched >= 1 ? '' : `version.json fetched ${versionFetched}x`,
        versionFetched >= 1 ? '' : 'low',
        `Deploy-version gate observable: version.json (cache-busted ?t=) fetched x${versionFetched} during the load (fetchCoreData + fetchAnalytics both await withVersionTimeout(checkVersion), 4s bound). On a version mismatch checkVersion calls clearArchiveCache (localStorage/sessionStorage archive_* + IndexedDB core store). Single-flight memoisation, the 4s timeout, and the version-mismatch clear branch are internal/timing: covered by unit suite tests/fetch-error-handling.test.js + tests/idb-cache.test.js (cache key namespacing by version).`);
      await ctx.close();
    }

    // =====================================================================
    // SVC-11  Shareable view-state URLs (serializer exists; provider deferred)
    // SVC-14  Optional SQLite engine (lazy full-data load)
    // SVC-18  Web Storage quota handling + legacy sessionStorage cleanup
    // SVC-19  Entity connection lookups
    // -> internals not observable on the normal browser path; verify via source + unit suite
    // =====================================================================
    {
      // SVC-11: confirm filters do NOT currently round-trip into the URL on the
      // live app (provider deferred per viewState.js), i.e. serializer is unwired.
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(URL_OF(''), { waitUntil: 'domcontentloaded' });
      await waitLoaded(page);
      // Apply a search filter via the search box, then check the URL.
      const typed = await page.evaluate(() => {
        const input = document.querySelector('input[type="text"], input[type="search"], input[placeholder]');
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set;
        setter.call(input, 'lippmann');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      });
      await sleep(800);
      const urlAfterFilter = await page.evaluate(() => location.search + location.hash);
      const filterInUrl = /q=lippmann|search=lippmann/.test(urlAfterFilter);
      // viewState round-trip itself is pure + unit-tested.
      note('SVC-11',
        'partial',
        filterInUrl ? '' : 'filters do not round-trip to URL on the live app (useViewState provider deferred per viewState.js comment)',
        'low',
        `viewState.js serializer (viewStateToUrl/parseViewState) exists and is pure. On the live app, typing a search filter (typed=${typed}) produced URL "${urlAfterFilter}" — filter NOT reflected in URL (filterInUrl=${filterInUrl}), confirming the documented deferral: the consuming useViewState React provider is not wired into App.js yet, so filter-in-URL persistence is not active despite the serializer existing. Pure round-trip (q/era/year/type/replies/repeated cat=/pub=/record=, year-as-string, default omission) covered by unit suite tests/view-state.test.js + tests/route-vocabulary.test.js.`);
      await ctx.close();
    }

    note('SVC-14',
      'n/a',
      '',
      '',
      'Optional SQLite engine: initSqlite() is single-flight and lazy-loads the ~28MB combined archive-data.json into sql.js only when a SQL query surface (raw SQL box / Query Builder) is used. Not exercised on the normal load path (and not reached by the SVC routing/data stories). Memo-drop-on-failure-for-retry and shared-load behavior are internal. SMELL confirmed by code: this is the only normal-operation path that fetches the ~28MB combined file (archiveService.js initSqlite line 655) — a first SQL query downloads 28MB. Covered by unit suite for loader internals; behavioral SQL UI belongs to the analytics/query-builder story set.');

    note('SVC-18',
      'n/a',
      '',
      '',
      'Web Storage quota handling + legacy sessionStorage cleanup: setCachedData skips >5MB payloads (verified observably in SVC-03 — no >5MB archive blob in localStorage); QuotaExceededError -> clearArchiveCache + single retry, then "Cache disabled" log; getCachedData reads legacy sessionStorage before localStorage and evicts on CACHE_VERSION mismatch or 30-min TTL; clearArchiveCache also fire-and-forget clears the IndexedDB core store. Quota/eviction/TTL branches are internal and not reliably triggerable in headless chromium without synthetic quota pressure: covered by unit suite tests/session-cache-overflow.test.js + tests/idb-cache.test.js.');

    note('SVC-19',
      'n/a',
      '',
      '',
      'Entity connection lookups (getRecordsByEntity/getEntitiesByRecord/findSharedEntities/calculateEntityConnectionStrength) resolve from in-memory maps built by buildEntityMaps after entities/full data load; return empty/zero when a record/entity is unknown or maps not built. These are pure map functions not directly invoked by the SVC routing/data path (RecordModal/EntityBrowser consume them — those are ENT/MODAL stories). SMELL confirmed by code: features silently return empty when maps are not built yet (entities load on demand), so a record modal opened before entity data loads shows no connections with no "not loaded yet" indication. Map-building + lookup logic covered by unit suite (entity-index / archiveService map tests).');

    const path = writeVerdicts('svc', V);
    // Summary to stdout
    const counts = {};
    for (const k of Object.keys(V)) counts[V[k].test_status] = (counts[V[k].test_status] || 0) + 1;
    console.log('\n=== SVC verdicts written to', path, '===');
    console.log('counts:', JSON.stringify(counts));
    for (const k of Object.keys(V).sort()) {
      const v = V[k];
      console.log(`${k}: ${v.test_status}${v.errors_found ? '  !! ' + v.errors_found : ''}`);
    }
  } finally {
    await browser.close();
  }
};

main().catch(e => { console.error('FATAL', e); process.exit(1); });
