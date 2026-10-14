/**
 * The deployed Content Security Policy keeps the self-hosted semantic encoder
 * from retaining its former remote model/runtime allowances (#860).
 *
 * The unrelated application CDNs remain in their existing directives. The
 * model, runtime module, and WebAssembly no longer need a remote connect source.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

test('semantic model and runtime hosts are absent from connect-src', () => {
  const sources = connectSources();
  for (const origin of [
    'https://huggingface.co',
    'https://cdn-lfs-us-1.hf.co',
    'https://cdn.jsdelivr.net',
  ]) {
    assert.equal(allows(sources, origin), false, `${origin} is no longer needed by the encoder`);
  }
});

test('the encoder module and model paths stay archive-local', () => {
  const worker = fs.readFileSync(
    path.join(repoRoot, 'frontend', 'services', 'semantic-search-worker.js'),
    'utf8',
  );
  assert.match(worker, /new URL\('\.\.\/vendor\/semantic\/v1\//);
  assert.doesNotMatch(worker, /https:\/\/(?:huggingface\.co|[^'"\s]*\.hf\.co|cdn\.jsdelivr\.net)/);
});
