/**
 * The deployed Content Security Policy must allow the semantic search encoder
 * to load (#279).
 *
 * This is the failure the feature is most likely to ship with: local
 * development serves no policy header, so a blocked download is invisible until
 * the site is live, where it fails for every reader on every query. The worker
 * declares the hosts it reaches in ENCODER_CONNECT_HOSTS; this checks each one
 * against the connect-src in .htaccess.
 *
 * connect-src is the right directive for all of them. The model files and the
 * WebAssembly binary are fetched, not loaded as scripts, and a fetch redirect
 * is re-checked against connect-src, so a redirect target that is missing
 * blocks the download just as a missing origin would. The worker script is
 * served the same header as the page, so it inherits this policy.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ENCODER_CONNECT_HOSTS } from '../frontend/services/semantic-search-worker.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const htaccess = fs.readFileSync(path.join(repoRoot, '.htaccess'), 'utf8');

function connectSources() {
  const policy = htaccess.match(/Header set Content-Security-Policy "([^"]+)"/)?.[1];
  assert.ok(policy, 'Content-Security-Policy header is missing');
  const directive = policy
    .split(';')
    .map(part => part.trim().split(/\s+/).filter(Boolean))
    .find(tokens => tokens[0] === 'connect-src');
  assert.ok(directive, 'connect-src directive is missing');
  return directive.slice(1);
}

/** CSP host matching: an exact origin, or a *.suffix that covers subdomains. */
function allows(sources, origin) {
  const host = new URL(origin).host;
  return sources.some((source) => {
    if (source === origin) return true;
    if (!source.startsWith('https://*.')) return false;
    return host.endsWith(source.slice('https://*'.length));
  });
}

test('connect-src allows every host the encoder downloads from', () => {
  const sources = connectSources();
  for (const origin of ENCODER_CONNECT_HOSTS) {
    assert.ok(
      allows(sources, origin),
      `connect-src blocks ${origin}, so semantic search cannot load on the live site`,
    );
  }
});

test('the encoder module host is the one the worker imports', () => {
  // A pin moved to another CDN without updating the policy would fail on deploy
  // only, so the declared host list must follow the import.
  const worker = fs.readFileSync(
    path.join(repoRoot, 'frontend', 'services', 'semantic-search-worker.js'),
    'utf8',
  );
  const moduleUrl = worker.match(/TRANSFORMERS_MODULE_URL\s*=\s*\n?\s*'([^']+)'/)?.[1];
  assert.ok(moduleUrl, 'TRANSFORMERS_MODULE_URL is missing');
  assert.ok(
    ENCODER_CONNECT_HOSTS.includes(new URL(moduleUrl).origin),
    'the module CDN must be declared in ENCODER_CONNECT_HOSTS',
  );
});

test('the wasm runtime host is allowed for fetches, not only for scripts', () => {
  // cdn.jsdelivr.net sits in script-src for the dataviz charts. The encoder
  // fetches a .wasm binary from it, which script-src does not cover.
  assert.ok(allows(connectSources(), 'https://cdn.jsdelivr.net'));
});
