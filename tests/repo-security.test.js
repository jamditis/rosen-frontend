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

test('.htaccess content security policy allows exactly the required origins', () => {
  const cspMatch = htaccess.match(/Header set Content-Security-Policy "([^"]+)"/);

  assert.ok(cspMatch, 'Content-Security-Policy header is missing');

  // Parse the policy into directive -> source tokens. Splitting on ';' anchors each
  // lookup to a real directive boundary, so a misspelled or prefixed directive (e.g.
  // `x-script-src`, which browsers ignore and fall back to default-src for) becomes its
  // own key and cannot satisfy a check meant for `script-src`. Every origin was
  // validated in-browser under this exact header (main app + dataviz + the real cdnjs
  // sql.js loader + a youtube frame), so an incomplete OR over-broad CSP is a #276
  // regression -- a deploy that blocks the app, or a policy wider than the deployed
  // surfaces need. Asserting the EXACT token set per directive catches a missing
  // origin, an out-of-scope addition (e.g. https://unpkg.com), and a look-alike hijack
  // (https://esm.sh.evil.example) instead of passing a substring match.
  const directives = new Map();
  for (const part of cspMatch[1].split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    const name = tokens[0];
    // A directive must appear once. Browsers honor the FIRST occurrence of a duplicate
    // and ignore the rest, so a second `script-src` (or a map that silently overwrote
    // the first) could make the test read a policy the browser never enforces.
    assert.ok(
      !directives.has(name),
      `${name} appears more than once; browsers enforce only the first, so the policy is ambiguous`,
    );
    directives.set(name, tokens.slice(1).sort());
  }

  // Pin the exact directive set. Per-directive checks below only inspect names they
  // expect, so an unexpected directive -- e.g. `script-src-elem https://unpkg.com`, which
  // overrides script-src for element scripts -- would widen the effective policy while
  // slipping past every assertSources call. Requiring the name set to match exactly makes
  // any added or removed directive fail here.
  const EXPECTED_DIRECTIVES = [
    'default-src',
    'script-src',
    'style-src',
    'font-src',
    'connect-src',
    'frame-src',
    'img-src',
    'object-src',
    'base-uri',
    'form-action',
  ];
  assert.deepEqual(
    [...directives.keys()].sort(),
    [...EXPECTED_DIRECTIVES].sort(),
    'CSP directive set must be exactly the validated directives (no missing or extra directive)',
  );

  const assertSources = (name, expected) => {
    assert.ok(directives.has(name), `${name} directive is missing`);
    assert.deepEqual(
      directives.get(name),
      [...expected].sort(),
      `${name} sources must be exactly: ${[...expected].sort().join(' ')}`,
    );
  };

  assertSources('default-src', ["'self'"]);
  // script-src: esm.sh module CDN; cdnjs (SRI-pinned sql.js loader +
  // noUiSlider); jsdelivr (chart.js/treemap in dataviz); 'unsafe-inline' for the
  // inline importmap/config blocks that run site-wide; 'wasm-unsafe-eval' for sql.js.
  assertSources('script-src', [
    "'self'",
    'https://esm.sh',
    'https://cdnjs.cloudflare.com',
    'https://cdn.jsdelivr.net',
    "'unsafe-inline'",
    "'wasm-unsafe-eval'",
  ]);
  // style-src: webfonts (fonts.googleapis.com) + noUiSlider stylesheet (cdnjs).
  assertSources('style-src', [
    "'self'",
    "'unsafe-inline'",
    'https://fonts.googleapis.com',
    'https://cdnjs.cloudflare.com',
  ]);
  assertSources('font-src', ["'self'", 'https://fonts.gstatic.com']);
  // connect-src: esm.sh module fetches, the branded report/submission endpoint,
  // the exact Apps Script ContentService redirect host, and the four sources the
  // opt-in semantic search encoder downloads from (#279): huggingface.co for the
  // model, the two Hugging Face storage suffixes its weight downloads redirect
  // to, and jsdelivr for the onnxruntime WebAssembly binary. The two suffixes are
  // wildcards because Hugging Face moves those hosts; every other source stays
  // exact. The exact-source assertion still proves the internal data explorer
  // does not widen production CSP for published Google Sheets or wildcard
  // Googleusercontent hosts.
  assertSources('connect-src', [
    "'self'",
    'https://esm.sh',
    'https://script.google.com',
    'https://script.googleusercontent.com',
    'https://huggingface.co',
    'https://*.hf.co',
    'https://*.huggingface.co',
    'https://cdn.jsdelivr.net',
  ]);
  // frame-src: privacy-enhanced embeds plus the legacy origin during the
  // service-worker cache rollover from the previous deployment.
  assertSources('frame-src', [
    'https://www.youtube-nocookie.com',
    'https://www.youtube.com',
  ]);
  // img-src: featured-work photos (images.unsplash.com), the dissertation bio photo
  // (journalism.nyu.edu), pressthink.org images referenced by absolute URL (equals
  // 'self' in production but listed so they do not depend on the serving origin), and
  // inline paper-texture SVGs (data:). Narrow to those hosts, not scheme-wide https:,
  // since no deployed page loads an image from a data-controlled URL (archive records
  // carry no external image hosts).
  assertSources('img-src', [
    "'self'",
    'data:',
    'https://images.unsplash.com',
    'https://journalism.nyu.edu',
    'https://pressthink.org',
  ]);
  assertSources('object-src', ["'none'"]);
  assertSources('base-uri', ["'self'"]);
  assertSources('form-action', ["'self'"]);
});

test('.env.local is ignored by local-file gitignore rule', () => {
  assert.match(gitignore, /^\*\.local$/m);
});
