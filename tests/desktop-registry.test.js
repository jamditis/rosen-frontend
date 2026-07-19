import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  DESKTOP_APPS,
  DESKTOP_TOOL_LINKS,
  getDesktopApp,
  getReadyDesktopApps,
  validateDesktopRegistry,
} from '../frontend/desktop/desktopRegistry.js';
import { ROUTES } from '../frontend/services/viewState.js';

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
  });

  it('derives matching shortcut and Start menu sets from ready apps', () => {
    const ready = getReadyDesktopApps();
    const shortcuts = ready.filter((app) => app.surfaces.includes('desktop')).map((app) => app.id).sort();
    const menuItems = ready.filter((app) => app.surfaces.includes('start')).map((app) => app.id).sort();
    assert.deepEqual(shortcuts, menuItems);
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

  it('opens the canonical explore and research surfaces through real in-shell adapters', () => {
    for (const id of ['archive', 'folders', 'entities', 'dissertation', 'analytics']) {
      const app = getDesktopApp(id);
      assert.equal(app.availability, 'ready');
      assert.deepEqual(app.launch, { kind: 'shell', destination: id });
    }
  });

  it('keeps future integrations unavailable and non-actionable', () => {
    for (const id of ['findings', 'method', 'participate', 'making-of']) {
      const app = getDesktopApp(id);
      assert.ok(app, `${id} stays represented in availability metadata`);
      assert.notEqual(app.availability, 'ready');
      assert.deepEqual(app.surfaces, []);
    }
    assert.equal(getDesktopApp('does-not-exist'), null);
  });
});

describe('desktop tool links', () => {
  it('points every surfaced tool at a deployed local file', () => {
    for (const tool of DESKTOP_TOOL_LINKS) {
      const relativeFile = tool.href.endsWith('/') ? `${tool.href}index.html` : tool.href;
      assert.ok(existsSync(join(process.cwd(), relativeFile)), `${tool.id} target exists: ${relativeFile}`);
    }
  });

  it('does not revive the retired dot-grid explorer', () => {
    const targets = DESKTOP_TOOL_LINKS.map((tool) => tool.href).join('\n');
    assert.doesNotMatch(targets, /dataexplorer|data_explorer_grid/i);
  });
});
