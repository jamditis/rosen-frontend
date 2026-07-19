export const DESKTOP_LAYOUT_SCHEMA = 2;
export const DESKTOP_LAYOUT_STORAGE_KEY = 'jrda-desktop-layout';

const MAX_PERSISTED_WINDOWS = 12;
const LEGACY_DESKTOP_LAYOUT_SCHEMA = 1;
const MAX_POSITION_OFFSET = 4096;
const CASCADE_STEP = 32;
const CASCADE_COLUMNS = 4;

// Some destinations are alternate presentations of one underlying surface.
// Keeping each pair in one family prevents duplicate control/heading IDs and
// mirrors the standard archive's existing layout and guided-path switches.
export const desktopWindowFamily = (id) => {
  if (id === 'archive' || id === 'folders') return 'archive';
  if (id === 'start' || id === 'findings') return 'start';
  return id;
};

export const emptyDesktopLayout = () => ({
  schema: DESKTOP_LAYOUT_SCHEMA,
  windows: [],
  zOrder: [],
});

const allowedIdSet = (allowedIds) => new Set(
  Array.isArray(allowedIds) ? allowedIds.filter((id) => typeof id === 'string') : [],
);

const cascadePosition = (index) => {
  const safeIndex = Math.max(0, index);
  return {
    x: (safeIndex % CASCADE_COLUMNS) * CASCADE_STEP,
    y: safeIndex * CASCADE_STEP,
  };
};

const nextCascadePosition = (windows) => {
  const occupied = new Set(
    windows.map(({ position }) => `${position.x},${position.y}`),
  );
  for (let index = 0; index <= MAX_PERSISTED_WINDOWS; index += 1) {
    const candidate = cascadePosition(index);
    if (!occupied.has(`${candidate.x},${candidate.y}`)) return candidate;
  }
  return cascadePosition(windows.length);
};

const normalizedPosition = (position) => {
  if (
    !position
    || typeof position.x !== 'number'
    || typeof position.y !== 'number'
    || !Number.isFinite(position.x)
    || !Number.isFinite(position.y)
    || Math.abs(position.x) > MAX_POSITION_OFFSET
    || Math.abs(position.y) > MAX_POSITION_OFFSET
  ) {
    return null;
  }
  return { x: Math.round(position.x), y: Math.round(position.y) };
};

export function normalizeDesktopLayout(candidate, allowedIds) {
  const allowed = allowedIdSet(allowedIds);
  const supportedSchema = candidate?.schema === LEGACY_DESKTOP_LAYOUT_SCHEMA
    || candidate?.schema === DESKTOP_LAYOUT_SCHEMA;
  if (!supportedSchema || !Array.isArray(candidate.windows)) {
    return emptyDesktopLayout();
  }

  const windowsByFamily = new Map();
  for (const entry of candidate.windows.slice(0, MAX_PERSISTED_WINDOWS)) {
    if (!entry || !allowed.has(entry.id)) continue;
    windowsByFamily.set(desktopWindowFamily(entry.id), {
      id: entry.id,
      minimized: entry.minimized === true,
      candidatePosition: candidate.schema === DESKTOP_LAYOUT_SCHEMA
        ? normalizedPosition(entry.position)
        : null,
    });
  }
  const candidateWindows = [...windowsByFamily.values()];
  const openIds = new Set(candidateWindows.map((entry) => entry.id));
  const zOrder = [];
  const seen = new Set();

  if (Array.isArray(candidate.zOrder)) {
    for (const id of candidate.zOrder) {
      if (!openIds.has(id) || seen.has(id)) continue;
      seen.add(id);
      zOrder.push(id);
    }
  }
  for (const { id } of candidateWindows) {
    if (seen.has(id)) continue;
    seen.add(id);
    zOrder.push(id);
  }

  const cascadeIndexById = new Map(zOrder.map((id, index) => [id, index]));
  const windows = candidateWindows.map(({ id, minimized, candidatePosition }) => ({
    id,
    minimized,
    position: candidatePosition || cascadePosition(cascadeIndexById.get(id) || 0),
  }));

  return { schema: DESKTOP_LAYOUT_SCHEMA, windows, zOrder };
}

export function parseDesktopLayout(rawValue, allowedIds) {
  if (typeof rawValue !== 'string' || rawValue === '') return emptyDesktopLayout();
  try {
    return normalizeDesktopLayout(JSON.parse(rawValue), allowedIds);
  } catch {
    return emptyDesktopLayout();
  }
}

export const serializeDesktopLayout = (layout, allowedIds) => (
  JSON.stringify(normalizeDesktopLayout(layout, allowedIds))
);

export function activateDesktopWindow(layout, id, allowedIds) {
  const allowed = allowedIdSet(allowedIds);
  if (!allowed.has(id)) return normalizeDesktopLayout(layout, allowedIds);

  const current = normalizeDesktopLayout(layout, allowedIds);
  const family = desktopWindowFamily(id);
  const familyIndex = current.windows.findIndex(
    (entry) => desktopWindowFamily(entry.id) === family,
  );
  const windows = familyIndex >= 0
    ? current.windows.map((entry, index) => (
      index === familyIndex ? { ...entry, id, minimized: false } : entry
    ))
    : current.windows.concat({
      id,
      minimized: false,
      position: nextCascadePosition(current.windows),
    });
  const retainedIds = new Set(windows.map((entry) => entry.id));
  const zOrder = current.zOrder
    .filter((entryId) => retainedIds.has(entryId) && desktopWindowFamily(entryId) !== family)
    .concat(id);

  return { schema: DESKTOP_LAYOUT_SCHEMA, windows, zOrder };
}

export function moveDesktopWindow(layout, id, position, allowedIds) {
  const allowed = allowedIdSet(allowedIds);
  const nextPosition = normalizedPosition(position);
  const current = normalizeDesktopLayout(layout, allowedIds);
  if (!allowed.has(id) || !nextPosition || !current.windows.some((entry) => entry.id === id)) {
    return current;
  }
  return {
    ...current,
    windows: current.windows.map((entry) => (
      entry.id === id ? { ...entry, position: nextPosition } : entry
    )),
  };
}

const finiteRect = (rect, fields) => (
  rect && fields.every((field) => typeof rect[field] === 'number' && Number.isFinite(rect[field]))
);

export function clampDesktopWindowPosition(position, geometry = {}) {
  const candidate = normalizedPosition(position);
  const currentPosition = normalizedPosition(geometry.currentPosition);
  const {
    frameRect,
    titlebarRect,
    workArea,
    margin = 8,
    minimumVisibleHeight = 128,
  } = geometry;
  if (
    !candidate
    || !currentPosition
    || !finiteRect(frameRect, ['left', 'right', 'top', 'bottom'])
    || !finiteRect(titlebarRect, ['left', 'right', 'top', 'bottom'])
    || !finiteRect(workArea, ['left', 'right', 'top', 'bottom'])
    || !Number.isFinite(margin)
    || !Number.isFinite(minimumVisibleHeight)
  ) {
    return currentPosition || { x: 0, y: 0 };
  }

  let minX = currentPosition.x + workArea.left + margin - titlebarRect.left;
  let maxX = currentPosition.x + workArea.right - margin - titlebarRect.right;
  if (minX > maxX) {
    const centered = currentPosition.x
      + ((workArea.left + workArea.right) / 2)
      - ((titlebarRect.left + titlebarRect.right) / 2);
    minX = centered;
    maxX = centered;
  }

  const visibleHeight = Math.min(
    Math.max(titlebarRect.bottom - frameRect.top, minimumVisibleHeight),
    frameRect.bottom - frameRect.top,
  );
  const minY = currentPosition.y + workArea.top + margin - titlebarRect.top;
  let maxY = currentPosition.y
    + workArea.bottom
    - margin
    - visibleHeight
    - frameRect.top;
  // When extreme zoom or browser chrome leaves less room than the requested
  // visible body height, the title bar is the non-negotiable recovery handle.
  if (minY > maxY) maxY = minY;

  return {
    x: Math.round(Math.min(maxX, Math.max(minX, candidate.x))),
    y: Math.round(Math.min(maxY, Math.max(minY, candidate.y))),
  };
}

export function minimizeDesktopWindow(layout, id, allowedIds) {
  const current = normalizeDesktopLayout(layout, allowedIds);
  return {
    ...current,
    windows: current.windows.map((entry) => (
      entry.id === id ? { ...entry, minimized: true } : entry
    )),
  };
}

export function closeDesktopWindow(layout, id, allowedIds) {
  const current = normalizeDesktopLayout(layout, allowedIds);
  return {
    schema: DESKTOP_LAYOUT_SCHEMA,
    windows: current.windows.filter((entry) => entry.id !== id),
    zOrder: current.zOrder.filter((entryId) => entryId !== id),
  };
}

export function nextVisibleDesktopWindow(layout, excludedId = null) {
  const minimizedById = new Map(layout.windows.map((entry) => [entry.id, entry.minimized]));
  for (let index = layout.zOrder.length - 1; index >= 0; index -= 1) {
    const id = layout.zOrder[index];
    if (id !== excludedId && minimizedById.get(id) === false) return id;
  }
  return null;
}
