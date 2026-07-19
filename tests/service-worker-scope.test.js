import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

const read = (path) => readFileSync(path, 'utf8');
const index = read('index.html');
const bridge = read('sw.js');
const worker = read('frontend/sw.js');
const shell = read('frontend/desktop/DesktopShell.js');

describe('root service-worker scope', () => {
  it('registers a root bridge and checks its imported implementation fresh', () => {
    assert.match(index, /serviceWorker\.register\('\.\/sw\.js',\s*\{\s*updateViaCache:\s*'none'\s*\}\)/);
    assert.doesNotMatch(index, /serviceWorker\.register\('\.\/frontend\/sw\.js'/);
    assert.match(bridge, /importScripts\('\.\/frontend\/sw\.js'\)/);
  });

  it('pre-caches the actual local document root, not a nonexistent frontend index', () => {
    assert.match(worker, /const SITE_ROOT = IS_LOCAL \? ''/);
    assert.match(worker, /`\$\{SITE_ROOT\}\/index\.html`/);
    assert.doesNotMatch(worker, /frontend\/index\.html/);
  });
});

describe('service-worker shell manifests', () => {
  it('covers every eager local module in the standard app shell', () => {
    const seen = new Set();
    const visit = (path) => {
      path = path.replace(/\?.*$/, '');
      if (seen.has(path) || !existsSync(path)) return;
      seen.add(path);
      const source = read(path);
      for (const match of source.matchAll(/^import(?:[\s\S]*?\sfrom\s+)?['"](\.[^'"]+)['"];?/gm)) {
        visit(normalize(join(dirname(path), match[1].replace(/\?.*$/, ''))));
      }
    };
    visit('frontend/index.js');

    const manifest = worker.slice(
      worker.indexOf('const APP_SHELL_FRONTEND_FILES'),
      worker.indexOf('const STATIC_ASSETS'),
    );
    for (const path of seen) {
      const rel = relative('frontend', path).replaceAll('\\', '/');
      assert.match(manifest, new RegExp(`['"]${rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`), `${rel} missing from app-shell precache`);
    }
  });

  it('keeps desktop assets out of install and warms them only after first use', () => {
    const installManifest = worker.slice(
      worker.indexOf('const APP_SHELL_FRONTEND_FILES'),
      worker.indexOf('const DATA_URLS'),
    );
    assert.doesNotMatch(installManifest, /desktop\/|DesktopShell|desktopRegistry|desktop\.css/);
    assert.match(worker, /const DESKTOP_ASSETS[\s\S]*DesktopShell\.js[\s\S]*DesktopStartPanel\.js[\s\S]*desktopWindowState\.js[\s\S]*desktop\.css/);
    assert.match(worker, /DESKTOP_ASSETS[\s\S]*\?v=\$\{CACHE_VERSION\}/);
    assert.match(worker, /event\.data\?\.action === 'cacheDesktop'/);
    assert.match(shell, /postMessage\(\{ action: 'cacheDesktop' \}\)/);
  });
});
