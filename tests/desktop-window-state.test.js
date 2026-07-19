import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DESKTOP_LAYOUT_SCHEMA,
  activateDesktopWindow,
  closeDesktopWindow,
  emptyDesktopLayout,
  minimizeDesktopWindow,
  nextVisibleDesktopWindow,
  normalizeDesktopLayout,
  parseDesktopLayout,
  serializeDesktopLayout,
} from '../frontend/desktop/desktopWindowState.js';

const ALLOWED = [
  'archive',
  'folders',
  'start',
  'findings',
  'entities',
  'dissertation',
  'analytics',
  'tools',
  'readme',
];

describe('desktop window-state schema', () => {
  it('falls back safely for missing, malformed, and future-schema preferences', () => {
    assert.deepEqual(parseDesktopLayout(null, ALLOWED), emptyDesktopLayout());
    assert.deepEqual(parseDesktopLayout('{broken', ALLOWED), emptyDesktopLayout());
    assert.deepEqual(
      parseDesktopLayout(JSON.stringify({ schema: DESKTOP_LAYOUT_SCHEMA + 1, windows: [] }), ALLOWED),
      emptyDesktopLayout(),
    );
  });

  it('drops unknown and duplicate windows while repairing z-order', () => {
    const normalized = normalizeDesktopLayout({
      schema: DESKTOP_LAYOUT_SCHEMA,
      windows: [
        { id: 'archive', minimized: false },
        { id: 'unknown', minimized: false },
        { id: 'entities', minimized: 1 },
        { id: 'entities', minimized: true },
      ],
      zOrder: ['unknown', 'entities', 'entities'],
    }, ALLOWED);
    assert.deepEqual(normalized, {
      schema: DESKTOP_LAYOUT_SCHEMA,
      windows: [
        { id: 'archive', minimized: false },
        { id: 'entities', minimized: true },
      ],
      zOrder: ['entities', 'archive'],
    });
  });

  it('round-trips only the allowlisted low-risk presentation state', () => {
    const layout = activateDesktopWindow(
      activateDesktopWindow(emptyDesktopLayout(), 'entities', ALLOWED),
      'analytics',
      ALLOWED,
    );
    assert.deepEqual(parseDesktopLayout(serializeDesktopLayout(layout, ALLOWED), ALLOWED), layout);
  });
});

describe('desktop window-state transitions', () => {
  it('opens and raises a window without duplicating it', () => {
    let layout = activateDesktopWindow(emptyDesktopLayout(), 'entities', ALLOWED);
    layout = activateDesktopWindow(layout, 'analytics', ALLOWED);
    layout = activateDesktopWindow(layout, 'entities', ALLOWED);
    assert.deepEqual(layout.windows.map((entry) => entry.id), ['entities', 'analytics']);
    assert.deepEqual(layout.zOrder, ['analytics', 'entities']);
    assert.equal(layout.windows.find((entry) => entry.id === 'entities').minimized, false);
  });

  it('treats Cards and Folders as one archive window family', () => {
    let layout = activateDesktopWindow(emptyDesktopLayout(), 'archive', ALLOWED);
    layout = activateDesktopWindow(layout, 'folders', ALLOWED);
    assert.deepEqual(layout.windows, [{ id: 'folders', minimized: false }]);
    assert.deepEqual(layout.zOrder, ['folders']);
  });

  it('treats Start here and Selected findings as one guided-path window family', () => {
    let layout = activateDesktopWindow(emptyDesktopLayout(), 'start', ALLOWED);
    layout = activateDesktopWindow(layout, 'findings', ALLOWED);
    assert.deepEqual(layout.windows, [{ id: 'findings', minimized: false }]);
    assert.deepEqual(layout.zOrder, ['findings']);
  });

  it('minimizes, restores, selects the next visible window, and closes safely', () => {
    let layout = activateDesktopWindow(emptyDesktopLayout(), 'entities', ALLOWED);
    layout = activateDesktopWindow(layout, 'analytics', ALLOWED);
    layout = minimizeDesktopWindow(layout, 'analytics', ALLOWED);
    assert.equal(nextVisibleDesktopWindow(layout, 'analytics'), 'entities');

    layout = activateDesktopWindow(layout, 'analytics', ALLOWED);
    assert.equal(layout.windows.find((entry) => entry.id === 'analytics').minimized, false);
    assert.equal(nextVisibleDesktopWindow(layout), 'analytics');

    layout = closeDesktopWindow(layout, 'analytics', ALLOWED);
    assert.deepEqual(layout.windows.map((entry) => entry.id), ['entities']);
    assert.deepEqual(layout.zOrder, ['entities']);
  });
});
