import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DESKTOP_LAYOUT_SCHEMA,
  activateDesktopWindow,
  closeDesktopWindow,
  emptyDesktopLayout,
  minimizeDesktopWindow,
  moveDesktopWindow,
  nextVisibleDesktopWindow,
  normalizeDesktopLayout,
  parseDesktopLayout,
  serializeDesktopLayout,
  clampDesktopWindowPosition,
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

  it('migrates schema 1 layouts into the readable schema-2 cascade', () => {
    assert.deepEqual(normalizeDesktopLayout({
      schema: 1,
      windows: [
        { id: 'archive', minimized: false },
        { id: 'entities', minimized: true },
        { id: 'analytics', minimized: false },
      ],
      zOrder: ['entities', 'analytics', 'archive'],
    }, ALLOWED), {
      schema: DESKTOP_LAYOUT_SCHEMA,
      windows: [
        { id: 'archive', minimized: false, position: { x: 64, y: 64 } },
        { id: 'entities', minimized: true, position: { x: 0, y: 0 } },
        { id: 'analytics', minimized: false, position: { x: 32, y: 32 } },
      ],
      zOrder: ['entities', 'analytics', 'archive'],
    });
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
        { id: 'archive', minimized: false, position: { x: 32, y: 32 } },
        { id: 'entities', minimized: true, position: { x: 0, y: 0 } },
      ],
      zOrder: ['entities', 'archive'],
    });
  });

  it('allowlists bounded finite positions and repairs malformed coordinates', () => {
    const normalized = normalizeDesktopLayout({
      schema: DESKTOP_LAYOUT_SCHEMA,
      windows: [
        { id: 'archive', minimized: false, position: { x: 120.4, y: -44.6 }, secret: 'drop' },
        { id: 'entities', minimized: false, position: { x: '12', y: 8 } },
        { id: 'analytics', minimized: false, position: { x: Number.POSITIVE_INFINITY, y: 8 } },
        { id: 'readme', minimized: false, position: { x: 5000, y: 8 } },
        { id: 'tools', minimized: false, position: { x: 8 } },
      ],
      zOrder: ['archive', 'entities', 'analytics', 'readme', 'tools'],
      record: { id: 'not-presentation-state' },
    }, ALLOWED);

    assert.deepEqual(normalized.windows, [
      { id: 'archive', minimized: false, position: { x: 120, y: -45 } },
      { id: 'entities', minimized: false, position: { x: 32, y: 32 } },
      { id: 'analytics', minimized: false, position: { x: 64, y: 64 } },
      { id: 'readme', minimized: false, position: { x: 96, y: 96 } },
      { id: 'tools', minimized: false, position: { x: 0, y: 128 } },
    ]);
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
    assert.deepEqual(layout.windows.find((entry) => entry.id === 'entities').position, { x: 0, y: 0 });
    assert.deepEqual(layout.windows.find((entry) => entry.id === 'analytics').position, { x: 32, y: 32 });
  });

  it('keeps cascade positions unique after the fourth window and after a close', () => {
    let layout = emptyDesktopLayout();
    for (const id of ['archive', 'entities', 'analytics', 'tools', 'readme']) {
      layout = activateDesktopWindow(layout, id, ALLOWED);
    }
    const initialPositions = layout.windows.map(({ position }) => `${position.x},${position.y}`);
    assert.equal(new Set(initialPositions).size, initialPositions.length);

    layout = closeDesktopWindow(layout, 'entities', ALLOWED);
    layout = activateDesktopWindow(layout, 'dissertation', ALLOWED);
    const reopenedPositions = layout.windows.map(({ position }) => `${position.x},${position.y}`);
    assert.equal(new Set(reopenedPositions).size, reopenedPositions.length);
    assert.deepEqual(
      layout.windows.find(({ id }) => id === 'dissertation').position,
      { x: 32, y: 32 },
      'a newly opened window should reuse the first unoccupied cascade slot',
    );
  });

  it('treats Cards and Folders as one archive window family', () => {
    let layout = activateDesktopWindow(emptyDesktopLayout(), 'archive', ALLOWED);
    layout = moveDesktopWindow(layout, 'archive', { x: 120, y: 64 }, ALLOWED);
    layout = activateDesktopWindow(layout, 'folders', ALLOWED);
    assert.deepEqual(layout.windows, [
      { id: 'folders', minimized: false, position: { x: 120, y: 64 } },
    ]);
    assert.deepEqual(layout.zOrder, ['folders']);
  });

  it('treats Start here and Selected findings as one guided-path window family', () => {
    let layout = activateDesktopWindow(emptyDesktopLayout(), 'start', ALLOWED);
    layout = activateDesktopWindow(layout, 'findings', ALLOWED);
    assert.deepEqual(layout.windows, [
      { id: 'findings', minimized: false, position: { x: 0, y: 0 } },
    ]);
    assert.deepEqual(layout.zOrder, ['findings']);
  });

  it('moves only known windows and preserves positions through minimize and restore', () => {
    let layout = activateDesktopWindow(emptyDesktopLayout(), 'entities', ALLOWED);
    layout = moveDesktopWindow(layout, 'entities', { x: -73.8, y: 96.2 }, ALLOWED);
    layout = moveDesktopWindow(layout, 'unknown', { x: 1, y: 2 }, ALLOWED);
    layout = minimizeDesktopWindow(layout, 'entities', ALLOWED);
    layout = activateDesktopWindow(layout, 'entities', ALLOWED);
    assert.deepEqual(layout.windows, [
      { id: 'entities', minimized: false, position: { x: -74, y: 96 } },
    ]);
  });

  it('clamps logical movement against every recoverable edge', () => {
    const geometry = {
      currentPosition: { x: 24, y: -10 },
      frameRect: { left: 100, right: 700, top: 20, bottom: 520 },
      titlebarRect: { left: 105, right: 695, top: 25, bottom: 75 },
      workArea: { left: 0, right: 800, top: 0, bottom: 600 },
      margin: 8,
      minimumVisibleHeight: 128,
    };

    assert.deepEqual(
      clampDesktopWindowPosition({ x: -999, y: -999 }, geometry),
      { x: -73, y: -27 },
    );
    assert.deepEqual(
      clampDesktopWindowPosition({ x: 999, y: 999 }, geometry),
      { x: 121, y: 434 },
    );
    assert.deepEqual(
      clampDesktopWindowPosition({ x: 10, y: 40 }, geometry),
      { x: 10, y: 40 },
    );
    assert.deepEqual(
      clampDesktopWindowPosition({ x: 10, y: 999 }, {
        ...geometry,
        workArea: { ...geometry.workArea, bottom: 90 },
      }),
      { x: 10, y: -27 },
      'an impossibly short work area must prioritize a recoverable title bar',
    );
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
