import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const htaccess = readFileSync('.htaccess', 'utf8');
const gitignore = readFileSync('.gitignore', 'utf8');

test('.htaccess sets browser security headers', () => {
  assert.match(htaccess, /Header set X-Content-Type-Options "nosniff"/);
  assert.match(htaccess, /Header set X-Frame-Options "SAMEORIGIN"/);
  assert.match(htaccess, /Header set Referrer-Policy "strict-origin-when-cross-origin"/);
  assert.match(
    htaccess,
    /Header set Permissions-Policy "camera=\(\), microphone=\(\), geolocation=\(\), payment=\(\), usb=\(\)"/,
  );
});

test('.htaccess content security policy allows only required external origins', () => {
  const cspMatch = htaccess.match(/Header set Content-Security-Policy "([^"]+)"/);

  assert.ok(cspMatch, 'Content-Security-Policy header is missing');

  const csp = cspMatch[1];
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self' https:\/\/esm\.sh/);
  assert.match(csp, /style-src 'self' 'unsafe-inline' https:\/\/fonts\.googleapis\.com/);
  assert.match(csp, /font-src 'self' https:\/\/fonts\.gstatic\.com/);
  assert.match(csp, /connect-src 'self' https:\/\/esm\.sh/);
  assert.match(csp, /frame-src https:\/\/embed\.bsky\.app/);
  assert.match(csp, /img-src 'self' data: https:/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.match(csp, /form-action 'self'/);
});

test('.env.local is ignored by local-file gitignore rule', () => {
  assert.match(gitignore, /^\*\.local$/m);
});
