import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DESKTOP_APPS,
  DESKTOP_TOOL_LINKS,
  getDesktopApp,
  getReadyDesktopApps,
  validateDesktopRegistry,
  validateDesktopToolLinks,
} from '../frontend/desktop/desktopRegistry.js';
import { ROUTES } from '../frontend/services/viewState.js';

const deployedFileFor = (destination) => (
  destination.endsWith('/') ? `${destination}index.html` : destination
);

const assertArchiveReturn = (id, relativeFile) => {
  const directoryDepth = relativeFile.split('/').length - 1;
  const rootHref = '../'.repeat(directoryDepth);
  const escapedRootHref = rootHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const html = readFileSync(join(process.cwd(), relativeFile), 'utf8');
  assert.match(
    html,
    new RegExp(`<a\\b[^>]*href=["']${escapedRootHref}["']`, 'i'),
    `${id} offers a preview-safe link back to the archive root (${rootHref})`,
  );
};

describe('desktop app registry', () => {
  it('validates the production registry and keeps ids unique', () => {
    assert.equal(validateDesktopRegistry(DESKTOP_APPS), true);
    const ids = DESKTOP_APPS.map((app) => app.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('rejects malformed and duplicate app metadata', () => {
    const valid = DESKTOP_APPS.find((app) => app.availability === 'ready');
    assert.ok(valid);
    assert.throws(
      () => validateDesktopRegistry([valid, { ...valid }]),
      /duplicate desktop app id/i,
    );
    assert.throws(
      () => validateDesktopRegistry([{ ...valid, id: 'Bad id' }]),
      /invalid desktop app id/i,
    );
    assert.throws(
      () => validateDesktopRegistry([{ ...valid, launch: { kind: 'route', destination: 'missing' } }]),
      /unknown route destination/i,
    );
    assert.throws(
      () => validateDesktopRegistry([{ ...valid, launch: { kind: 'path', destination: '../missing/' } }]),
      /unknown standalone destination/i,
    );
  });

  it('derives a concise shortcut set and a complete Start menu from ready apps', () => {
    const ready = getReadyDesktopApps();
    const shortcuts = ready.filter((app) => app.surfaces.includes('desktop')).map((app) => app.id).sort();
    const menuItems = ready.filter((app) => app.surfaces.includes('start')).map((app) => app.id);
    assert.ok(shortcuts.every((id) => menuItems.includes(id)), 'Start includes every wallpaper shortcut');
    assert.deepEqual(menuItems, [
      'archive', 'folders', 'start', 'findings',
      'entities', 'dissertation', 'analytics', 'tools', 'method',
      'about', 'report', 'readme', 'participate',
    ], 'Start keeps explore, research, and help destinations together');
    assert.ok(!shortcuts.includes('method'), 'the experimental method demo does not crowd the wallpaper');
    assert.ok(shortcuts.length >= 8, 'the launcher should expose the useful initial map');
  });

  it('points every route app at the canonical route vocabulary', () => {
    const routes = new Set(Object.values(ROUTES));
    for (const app of getReadyDesktopApps()) {
      if (app.launch.kind === 'route') {
        assert.ok(routes.has(app.launch.destination), `${app.id} has a live canonical route`);
        assert.notEqual(app.launch.destination, ROUTES.desktop, `${app.id} does not loop into the shell`);
      }
      assert.equal(typeof app.icon, 'string');
      assert.ok(app.icon.length > 0);
      assert.match(app.label, /^[A-Z0-9]/);
    }
  });

  it('points every standalone app at a deployed local file', () => {
    for (const app of getReadyDesktopApps().filter(({ launch }) => launch.kind === 'path')) {
      const relativeFile = deployedFileFor(app.launch.destination);
      assert.ok(existsSync(join(process.cwd(), relativeFile)), `${app.id} target exists: ${relativeFile}`);
      assertArchiveReturn(app.id, relativeFile);
    }
  });

  it('opens the canonical explore and research surfaces through real in-shell adapters', () => {
    for (const id of ['archive', 'folders', 'start', 'findings', 'entities', 'dissertation', 'analytics']) {
      const app = getDesktopApp(id);
      assert.equal(app.availability, 'ready');
      assert.deepEqual(app.launch, { kind: 'shell', destination: id });
    }
  });

  it('opens the shipped method demonstration at its canonical standalone path', () => {
    const app = getDesktopApp('method');
    assert.equal(app.availability, 'ready');
    assert.deepEqual(app.launch, { kind: 'path', destination: 'features/winer-method/' });
    assert.ok(DESKTOP_TOOL_LINKS.some((tool) => tool.href === app.launch.destination));
  });

  it('opens the shipped participation page at its canonical standalone path', () => {
    const app = getDesktopApp('participate');
    assert.equal(app.availability, 'ready');
    assert.deepEqual(app.launch, { kind: 'path', destination: 'features/participate/' });
    assert.ok(existsSync(join(process.cwd(), 'features/participate/index.html')));
  });

  it('keeps future integrations unavailable and non-actionable', () => {
    for (const id of ['making-of']) {
      const app = getDesktopApp(id);
      assert.ok(app, `${id} stays represented in availability metadata`);
      assert.notEqual(app.availability, 'ready');
      assert.deepEqual(app.surfaces, []);
      assert.equal(app.launch, null);
      assert.match(app.availabilityNote, /interview[\s\S]*publication approval/i);
    }
    assert.equal(getDesktopApp('does-not-exist'), null);
  });
});

describe('desktop tool links', () => {
  it('validates unique, safe, display-complete tool metadata', () => {
    assert.equal(validateDesktopToolLinks(DESKTOP_TOOL_LINKS), true);
    const valid = DESKTOP_TOOL_LINKS[0];
    assert.throws(() => validateDesktopToolLinks([valid, { ...valid }]), /duplicate desktop tool id/i);
    assert.throws(
      () => validateDesktopToolLinks([{ ...valid, id: 'unsafe-path', href: '../index.html' }]),
      /unsafe standalone destination/i,
    );
    assert.throws(
      () => validateDesktopToolLinks([{ ...valid, id: 'unknown-status', status: 'preview' }]),
      /unknown status/i,
    );
  });

  it('points every surfaced tool at a deployed local file', () => {
    for (const tool of DESKTOP_TOOL_LINKS) {
      const relativeFile = deployedFileFor(tool.href);
      assert.ok(existsSync(join(process.cwd(), relativeFile)), `${tool.id} target exists: ${relativeFile}`);
    }
  });

  it('keeps every surfaced standalone tool connected to the archive root', () => {
    for (const tool of DESKTOP_TOOL_LINKS) {
      assertArchiveReturn(tool.id, deployedFileFor(tool.href));
    }
  });

  it('does not revive the retired dot-grid explorer', () => {
    const targets = DESKTOP_TOOL_LINKS.map((tool) => tool.href).join('\n');
    assert.doesNotMatch(targets, /dataexplorer|data_explorer_grid/i);
  });
});
