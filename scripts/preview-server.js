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
import { extname, resolve, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PREVIEW_PORT || 8000);
const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');

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
};

function safeResolve(urlPath) {
  // Strip query/fragment, decode, normalize, then verify the resolved
  // path stays inside ROOT to defeat ../ traversal.
  const clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const joined = resolve(ROOT, '.' + normalize(clean));
  if (joined !== ROOT && !joined.startsWith(ROOT + sep)) return null;
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
      // Match python3 -m http.server / Apache behavior: redirect a directory
      // request without trailing slash to the slashed form before serving
      // index.html. Otherwise relative URLs in standalone pages (e.g.
      // /features/status-report → ./assets/foo) resolve against the wrong base.
      const [pathOnly, ...rest] = rawUrl.split(/(?=[?#])/);
      if (!pathOnly.endsWith('/')) {
        res.writeHead(301, { Location: pathOnly + '/' + rest.join('') });
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

server.listen(PORT, () => {
  console.log(`Preview server: http://localhost:${PORT}/`);
  console.log(`Serving:        ${ROOT}`);
  console.log(`Stop:           Ctrl-C`);
});
