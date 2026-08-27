#!/usr/bin/env node
// Mirror the third-party modules and fonts the app loads at runtime into a
// local cache, so the preview audit can measure the React routes on a machine
// whose browser cannot reach the CDN.
//
// The archive is a zero-build site: React, HTM, Lucide, sql.js and the Google
// fonts all arrive from a CDN at page load. A browser that cannot reach those
// hosts never mounts the app, so the audit can only measure the standalone
// pages. That is why the first layout-shift budgets had no measured evidence
// behind them.
//
// This script fetches the exact CDN responses with Node, which honours the
// machine's proxy and CA settings, follows the module graph, and stores every
// response under preview-audit-cache/. `PREVIEW_AUDIT_MODULE_CACHE=1` then
// makes the audit serve those bytes to the browser instead of going out to the
// network. Only the transport changes: the bytes, the import graph, and the
// work the browser does with them are the same.
//
// Usage:
//   node scripts/mirror-audit-modules.js
//
// The audit writes preview-audit-results/missing-modules.json when a run asks
// for a URL the cache does not hold. This script reads that file as extra
// seeds, so a failed run is fixed by rerunning the mirror.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
export const MODULE_CACHE_DIR = resolve(REPO_ROOT, 'preview-audit-cache');
export const MODULE_CACHE_INDEX = resolve(MODULE_CACHE_DIR, 'index.json');
const MISSING_REPORT = resolve(REPO_ROOT, 'preview-audit-results', 'missing-modules.json');

// Hosts the app pulls runtime code, fonts, or styles from. The crawler follows
// the module and stylesheet graph on these hosts, and the audit reports a
// request to one of them that the cache cannot answer.
export const MIRRORED_HOSTS = new Set([
  'esm.sh',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
]);

// Hosts that serve assets but no module graph. URLs found in the seed files
// are mirrored; nothing is followed from them.
export const ASSET_HOSTS = new Set([
  'images.unsplash.com',
]);

export function isMirroredHost(host) {
  return MIRRORED_HOSTS.has(host) || ASSET_HOSTS.has(host);
}

// Single files the audited pages load from a host that is otherwise just a
// link target. They are mirrored by name and never crawled, so pointing at one
// image on a site does not pull the site in. An image that fails to load
// leaves its space empty, which changes the layout the audit measures.
export const EXTRA_ASSET_SEEDS = [
  'https://pressthink.org/wp-content/uploads/2010/09/photo-jay-rosen-bw.jpg',
  'https://pressthink.org/wp-content/uploads/2025/12/1625229316026.jpeg',
  'https://journalism.nyu.edu/wp-content/uploads/2020/02/photo-jay-rosen.jpg',
];

// Google Fonts serves a different stylesheet per browser. Ask as the Chromium
// the audit drives, so the cached CSS names the same woff2 files the audit
// would otherwise fetch live.
const CHROME_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) '
  + 'Chrome/140.0.0.0 Safari/537.36';

// A CI runner reaches every one of these hosts over the public internet. Node's
// fetch has no timeout and no retry of its own, so one dropped connection threw
// `TypeError: fetch failed` -- a message that names neither the URL nor the
// reason -- and took the whole layout-shift gate down before it measured
// anything (#852).
const FETCH_TIMEOUT_MS = 20000;
const FETCH_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

// Statuses worth another attempt. A 404 or a 403 says the same thing every
// time, so retrying one only slows the failure down.
export function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

// `TypeError: fetch failed` keeps the real reason in err.cause. Walk the chain
// so the log names what actually went wrong instead of that one flat string.
export function describeFetchFailure(err) {
  const parts = [];
  for (let current = err; current; current = current.cause) {
    const text = current.code ? `${current.code} ${current.message}` : current.message;
    if (text && !parts.includes(text)) parts.push(text);
  }
  return parts.join(': ') || 'unknown error';
}

// Which failures are fatal.
//
// MIRRORED_HOSTS carry the app's modules, stylesheets, and web fonts. A page
// that never received them is not the page the budgets describe -- the FAQ
// exception exists because a display-font swap reflows a section -- so a miss
// there has to stop the run, and the audit fails on one too.
//
// The image seeds are the other case. Every one of them is drawn into a box the
// page has already sized: `.about-image` and `.scholar-headshot` fix 150px and
// 72px in dissertation/index.html, the participate portrait carries width and
// height attributes, and the featured-work images fill a grid cell at width and
// height 100%. Whether those bytes arrive changes what the page looks like, not
// how it is laid out, so one slow image host must not delete a whole run's
// measurements.
export function isRequiredMirror(url) {
  return MIRRORED_HOSTS.has(new URL(url).host);
}

const sleep = (ms) => new Promise((done) => { setTimeout(done, ms); });

// One URL, with a per-attempt timeout and backoff between attempts. Throws with
// the URL and the underlying reason once the attempts are spent.
async function fetchMirrored(url) {
  let failure = 'unknown error';
  let attempts = 0;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
    attempts = attempt;
    let response;
    try {
      response = await fetch(url, {
        headers: { 'user-agent': CHROME_UA },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (err) {
      // DNS, TLS, a reset connection, or the per-attempt timeout. Every one of
      // those is worth another try.
      failure = describeFetchFailure(err);
      if (attempt === FETCH_ATTEMPTS) break;
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      continue;
    }
    if (response.ok) return response;
    failure = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
    await response.body?.cancel().catch(() => {});
    if (!isRetryableStatus(response.status) || attempt === FETCH_ATTEMPTS) break;
    await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
  }
  throw new Error(`${url}: ${failure} (${attempts} attempt${attempts === 1 ? '' : 's'})`);
}

// Static seeds: every runtime URL the audited pages name in their markup.
// Discovered imports extend this list while the crawl runs.
const SEED_FILES = [
  'index.html',
  'features/participate/index.html',
  'features/winer-method/index.html',
  'frontend/design-system/demo.html',
  'dissertation/index.html',
  'dissertation/reader/index.html',
  'faq/index.html',
  'frontend/services/sqliteService.js',
  'frontend/constants.js',
  'tools/active/dataviz/dataviz.html',
  'tools/active/dataexplorer/data_explorer_grid.html',
];

const URL_PATTERN = /https:\/\/[a-zA-Z0-9.-]+\/[^"'`)\s<>\\]*/g;

// Cache keys have to match what the browser asks for, character for character.
export function normalizeUrl(url) {
  return new URL(url).toString();
}

// The browser and the URL parser do not agree on every character. A specifier
// like scheduler@^0.23.0 stays literal in Node and reaches the network as
// scheduler@%5E0.23.0, so a cache keyed on one form misses the other. Look up
// both, which is enough for the escapes Chromium adds on its own.
export function cacheLookupKeys(url) {
  const keys = [url];
  try {
    const decoded = decodeURI(url);
    if (decoded !== url) keys.push(decoded);
  } catch {
    // A malformed escape sequence leaves the exact key as the only option.
  }
  return keys;
}

async function collectSeeds() {
  const seeds = new Set();
  for (const relative of SEED_FILES) {
    const path = resolve(REPO_ROOT, relative);
    if (!existsSync(path)) continue;
    const text = await readFile(path, 'utf8');
    for (const match of text.matchAll(URL_PATTERN)) {
      const url = match[0].replace(/&amp;/g, '&');
      try {
        if (isMirroredHost(new URL(url).host)) seeds.add(normalizeUrl(url));
      } catch {
        // Not a usable URL; skip it.
      }
    }
  }
  for (const url of EXTRA_ASSET_SEEDS) seeds.add(normalizeUrl(url));
  if (existsSync(MISSING_REPORT)) {
    const missing = JSON.parse(await readFile(MISSING_REPORT, 'utf8'));
    for (const url of Array.isArray(missing) ? missing : []) {
      try {
        seeds.add(normalizeUrl(url));
      } catch {
        // Ignore an unparsable entry rather than failing the mirror.
      }
    }
  }
  return [...seeds];
}

// Import specifiers an ES module can name, plus the url() references a
// stylesheet can name. Both resolve against the URL they were found in.
const SPECIFIER_PATTERNS = [
  /(?:^|[\s;])(?:import|export)\s*(?:[\w*{},\s]*?\s*from\s*)?["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\bnew\s+URL\s*\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g,
  /url\(\s*["']?([^"')]+)["']?\s*\)/g,
];

export function findReferences(body, baseUrl) {
  const found = new Set();
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of body.matchAll(pattern)) {
      const specifier = match[1];
      if (!specifier || specifier.startsWith('data:')) continue;
      let resolved;
      try {
        resolved = new URL(specifier, baseUrl);
      } catch {
        continue;
      }
      if (resolved.protocol !== 'https:') continue;
      if (!MIRRORED_HOSTS.has(resolved.host)) continue;
      found.add(normalizeUrl(resolved));
    }
  }
  return [...found];
}

function cacheFileName(url, contentType) {
  const digest = createHash('sha256').update(url).digest('hex').slice(0, 32);
  const fromPath = extname(new URL(url).pathname);
  const known = [
    '.js', '.mjs', '.css', '.woff2', '.woff', '.ttf', '.wasm', '.map', '.json',
    '.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif',
  ];
  const suffix = known.includes(fromPath)
    ? fromPath
    : (String(contentType).includes('css') ? '.css' : '.js');
  return `${digest}${suffix}`;
}

function isTextual(contentType) {
  return /javascript|json|css|text|xml/i.test(String(contentType));
}

async function mirror() {
  // Node's built-in fetch only reads the proxy environment when asked to.
  process.env.NODE_USE_ENV_PROXY = process.env.NODE_USE_ENV_PROXY || '1';
  await mkdir(MODULE_CACHE_DIR, { recursive: true });

  const queue = await collectSeeds();
  if (queue.length === 0) {
    throw new Error('No CDN URLs found to mirror. Check the seed file list.');
  }
  const index = {};
  const unmirrored = [];
  const seen = new Set();
  let bytes = 0;

  while (queue.length > 0) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    let response;
    try {
      response = await fetchMirrored(url);
    } catch (err) {
      if (isRequiredMirror(url)) throw new Error(`Mirror fetch failed: ${err.message}`);
      // An image host the mirror could not reach. Record it rather than
      // aborting: the audit reads this list and fails the browser's request for
      // the same URL immediately, so the run neither waits on a host that just
      // proved slow nor pretends it mirrored something it did not.
      unmirrored.push({ url, reason: err.message.slice(url.length + 2) });
      console.warn(`  unmirrored  ${url}`);
      continue;
    }
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const buffer = Buffer.from(await response.arrayBuffer());
    const file = cacheFileName(url, contentType);
    await writeFile(resolve(MODULE_CACHE_DIR, file), buffer);
    index[url] = { file, contentType, bytes: buffer.length };
    bytes += buffer.length;
    // Follow the graph only on the hosts that serve the app's own modules and
    // stylesheets. A one-off asset is mirrored exactly as listed.
    if (isTextual(contentType) && MIRRORED_HOSTS.has(new URL(url).host)) {
      for (const reference of findReferences(buffer.toString('utf8'), url)) {
        if (!seen.has(reference)) queue.push(reference);
      }
    }
    console.log(`  ${String(buffer.length).padStart(9)}  ${url}`);
  }

  await writeFile(
    MODULE_CACHE_INDEX,
    `${JSON.stringify({
      mirroredAt: new Date().toISOString(),
      entries: index,
      unmirrored,
    }, null, 2)}\n`,
  );
  console.log(`\nMirrored ${Object.keys(index).length} responses, ${(bytes / 1024).toFixed(0)} KB`);
  console.log(`Cache: ${MODULE_CACHE_DIR}`);
  if (unmirrored.length > 0) {
    console.warn(
      `\n${unmirrored.length} image URL(s) could not be mirrored. The audit will fail their `
      + 'requests fast, which is what the page already renders when the host is down:',
    );
    for (const { url, reason } of unmirrored) console.warn(`  ${url}\n    ${reason}`);
  }
  console.log('Run the audit with PREVIEW_AUDIT_MODULE_CACHE=1 to use it.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await mirror().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
