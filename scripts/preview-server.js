#!/usr/bin/env node
// Local preview server for the rosen-frontend static bundle.
//
// Serves the repo root at http://localhost:<port>/ — same path layout the
// production deploy at pressthink.org/j/rosen-archive/ uses, except that
// App.js auto-detects window.location.hostname and swaps to relative paths
// for localhost. Hitting this preview is genuine fidelity to what users
// will see in production, modulo that one prefix swap.
//
// Pure node:http + node:fs — no npm deps. Run via `npm run preview`.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, normalize, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PREVIEW_PORT || 8000);
const HOST = process.env.PREVIEW_HOST || '127.0.0.1';
const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');

// Whitelist for Location header values on directory redirects. A safe value
// is either bare root (`/`) or `/some/path/` — leading slash, filename-safe
// characters, trailing slash. Rejects schemes (`:`), backslashes, protocol-
// relative `//`, control chars, etc. See the dir-redirect block below.
const SAFE_LOCATION = /^\/([A-Za-z0-9._\-/]+\/)?$/;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.xml':  'application/xml; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
  '.pdf':  'application/pdf',
  '.md':   'text/markdown; charset=utf-8',
  '.wasm': 'application/wasm',
};

function safeResolve(urlPath) {
  // Strip query/fragment, decode, normalize, then verify the resolved
  // path stays inside ROOT to defeat ../ traversal. The relative()/isAbsolute()
  // pattern is the canonical sanitizer CodeQL recognizes for js/path-injection.
  // decodeURIComponent throws on malformed percent-encoding (e.g. bare '%'),
  // which would otherwise crash the request handler — treat as Forbidden.
  let clean;
  try {
    clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  const joined = resolve(ROOT, '.' + normalize(clean));
  const rel = relative(ROOT, joined);
  if (rel.startsWith('..') || isAbsolute(rel)) return null;
  return joined;
}

const server = createServer(async (req, res) => {
  const rawUrl = req.url || '/';
  const requested = safeResolve(rawUrl);
  if (!requested) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  let filePath = requested;
  try {
    const s = await stat(filePath);
    if (s.isDirectory()) {
      // Redirect bare-directory requests to the slashed form so relative URLs
      // in standalone pages (e.g. /features/status-report → ./assets/foo)
      // resolve against the right base. Location is built from the validated
      // absolute path — `requested` is already proven to be inside ROOT by
      // safeResolve() above. Belt-and-braces: re-prove same-origin to CodeQL
      // by checking the final Location matches a strict whitelist before
      // writing it. Repo directory names only contain [A-Za-z0-9._-], so this
      // rejects nothing valid. CodeQL recognizes the regex test as a sanitizer
      // and stops flagging this as js/server-side-unvalidated-url-redirection.
      const relFromRoot = relative(ROOT, requested).split(sep).join('/');
      // Root case (relFromRoot === '', from e.g. a `/.` request that
      // normalizes to ROOT): canonical Location is bare `/`, not `//` —
      // building `'/' + '' + '/'` would otherwise 403 a legitimate root
      // redirect via the protocol-relative-URL guard below.
      const location = relFromRoot === '' ? '/' : '/' + relFromRoot + '/';
      if (!rawUrl.split(/[?#]/)[0].endsWith('/')) {
        if (!SAFE_LOCATION.test(location) || location.includes('//')) {
          res.writeHead(403, { 'Content-Type': 'text/plain' });
          res.end('Forbidden');
          return;
        }
        res.writeHead(301, { Location: location });
        res.end();
        return;
      }
      filePath = resolve(filePath, 'index.html');
    }
    const body = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

// Bind to 127.0.0.1 by default so the preview is not exposed on the LAN.
// Override with PREVIEW_HOST=0.0.0.0 if intentional LAN access is needed.
server.listen(PORT, HOST, () => {
  // IPv6 literals need brackets in URLs: `http://[::1]:8000/` not `http://::1:8000/`.
  const urlHost = HOST.includes(':') && !HOST.startsWith('[') ? `[${HOST}]` : HOST;
  console.log(`Preview server: http://${urlHost}:${PORT}/`);
  console.log(`Serving:        ${ROOT}`);
  console.log(`Stop:           Ctrl-C`);
});
