export const DESKTOP_LAYOUT_SCHEMA = 1;
export const DESKTOP_LAYOUT_STORAGE_KEY = 'jrda-desktop-layout';

const MAX_PERSISTED_WINDOWS = 12;

// Cards and Folders are two presentations of the same archive application.
// Keeping them in one family prevents duplicate filter/search control IDs and
// mirrors the standard archive's existing layout switch.
export const desktopWindowFamily = (id) => (
  id === 'archive' || id === 'folders' ? 'archive' : id
);

export const emptyDesktopLayout = () => ({
  schema: DESKTOP_LAYOUT_SCHEMA,
  windows: [],
  zOrder: [],
});

const allowedIdSet = (allowedIds) => new Set(
  Array.isArray(allowedIds) ? allowedIds.filter((id) => typeof id === 'string') : [],
);

export function normalizeDesktopLayout(candidate, allowedIds) {
  const allowed = allowedIdSet(allowedIds);
  if (!candidate || candidate.schema !== DESKTOP_LAYOUT_SCHEMA || !Array.isArray(candidate.windows)) {
    return emptyDesktopLayout();
  }

  const windowsByFamily = new Map();
  for (const entry of candidate.windows.slice(0, MAX_PERSISTED_WINDOWS)) {
    if (!entry || !allowed.has(entry.id)) continue;
    windowsByFamily.set(desktopWindowFamily(entry.id), {
      id: entry.id,
      minimized: entry.minimized === true,
    });
  }
  const windows = [...windowsByFamily.values()];
  const openIds = new Set(windows.map((entry) => entry.id));
  const zOrder = [];
  const seen = new Set();

  if (Array.isArray(candidate.zOrder)) {
    for (const id of candidate.zOrder) {
      if (!openIds.has(id) || seen.has(id)) continue;
      seen.add(id);
      zOrder.push(id);
    }
  }
  for (const { id } of windows) {
    if (seen.has(id)) continue;
    seen.add(id);
    zOrder.push(id);
  }

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
      index === familyIndex ? { id, minimized: false } : entry
    ))
    : current.windows.concat({ id, minimized: false });
  const retainedIds = new Set(windows.map((entry) => entry.id));
  const zOrder = current.zOrder
    .filter((entryId) => retainedIds.has(entryId) && desktopWindowFamily(entryId) !== family)
    .concat(id);

  return { schema: DESKTOP_LAYOUT_SCHEMA, windows, zOrder };
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
