import { useEffect, useMemo, useRef, useState } from 'react';
import { html } from '../html.js?v=3.8.17';
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BarChart3,
  BookOpen,
  Compass,
  ExternalLink,
  FileQuestion,
  FileText,
  FolderOpen,
  Info,
  Minus,
  Move,
  Network,
  RotateCcw,
  Search,
  Sparkles,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { resolveSitePath } from '../utils/pathResolver.js?v=3.8.17';
import DesktopArchivePanel from './DesktopArchivePanel.js?v=3.8.17';
import DesktopAnalyticsPanel from './DesktopAnalyticsPanel.js?v=3.8.17';
import DesktopDissertationPanel from './DesktopDissertationPanel.js?v=3.8.17';
import DesktopEntityPanel from './DesktopEntityPanel.js?v=3.8.17';
import DesktopStartPanel from './DesktopStartPanel.js?v=3.8.17';
import {
  DESKTOP_TOOL_LINKS,
  getDesktopApp,
  getReadyDesktopApps,
} from './desktopRegistry.js?v=3.8.17';
import {
  DESKTOP_LAYOUT_STORAGE_KEY,
  activateDesktopWindow,
  clampDesktopWindowPosition,
  closeDesktopWindow,
  emptyDesktopLayout,
  minimizeDesktopWindow,
  moveDesktopWindow,
  nextVisibleDesktopWindow,
  parseDesktopLayout,
  serializeDesktopLayout,
} from './desktopWindowState.js?v=3.8.17';

const ICONS = {
  archive: Archive,
  folders: FolderOpen,
  start: Compass,
  entities: Network,
  dissertation: BookOpen,
  analytics: BarChart3,
  tools: Wrench,
  about: Info,
  report: AlertTriangle,
  readme: FileText,
  findings: Sparkles,
  method: Search,
  participate: Users,
};

const iconFor = (key, className = 'desktop-icon-svg') => {
  const Icon = ICONS[key] || FileQuestion;
  return html`
    <span className=${`desktop-icon-layer ${className}`} aria-hidden="true">
      <${Icon} className="desktop-icon-glyph" aria-hidden="true" />
    </span>
  `;
};

const launchModeLabel = (app) => {
  if (app.launch.kind === 'shell') return 'Desktop window';
  if (app.launch.kind === 'action') return 'Opens dialog';
  if (app.launch.kind === 'path') return 'Standalone page';
  return 'Standard view';
};

const COMPACT_DESKTOP_QUERY = '(max-width: 700px), (max-width: 900px) and (max-height: 520px)';
const DRAG_THRESHOLD = 5;
const MOVE_STEP = 32;
const MOVE_FINE_STEP = 8;
const WINDOW_EDGE_MARGIN = 8;
const MINIMUM_VISIBLE_WINDOW_HEIGHT = 340;

const DesktopShell = ({
  activeAppId = null,
  autoFocusWindow = true,
  onSelectApp,
  onNavigate,
  onOpenBugReport,
  onExit,
  onOpenAppsChange,
  archiveView,
  analyticsView,
  dissertationView,
  entityView,
  startView,
}) => {
  const readyApps = useMemo(() => getReadyDesktopApps(), []);
  const shortcutApps = useMemo(
    () => readyApps.filter((app) => app.surfaces.includes('desktop')),
    [readyApps],
  );
  const startApps = useMemo(
    () => readyApps.filter((app) => app.surfaces.includes('start')),
    [readyApps],
  );
  const shellApps = useMemo(
    () => readyApps.filter((app) => app.launch.kind === 'shell'),
    [readyApps],
  );
  const shellAppIds = useMemo(() => shellApps.map((app) => app.id), [shellApps]);
  const activeApp = activeAppId ? getDesktopApp(activeAppId) : null;
  const shellApp = activeApp?.availability === 'ready' && activeApp.launch.kind === 'shell'
    ? activeApp
    : null;
  const hasUnknownApp = Boolean(activeAppId && !shellApp);

  const [shortcutFocusIndex, setShortcutFocusIndex] = useState(0);
  const [startOpen, setStartOpen] = useState(false);
  const [menuFocusIndex, setMenuFocusIndex] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [resetFocusRequest, setResetFocusRequest] = useState(0);
  const [dragFocusRequest, setDragFocusRequest] = useState(0);
  const [moveControlsAppId, setMoveControlsAppId] = useState(null);
  const [layout, setLayout] = useState(() => {
    try {
      return parseDesktopLayout(localStorage.getItem(DESKTOP_LAYOUT_STORAGE_KEY), shellAppIds);
    } catch {
      return emptyDesktopLayout();
    }
  });
  const activeShellWindowVisible = Boolean(
    shellApp
    && layout.windows.some((entry) => entry.id === shellApp.id && !entry.minimized),
  );

  const desktopTitleRef = useRef(null);
  const shortcutPanelRef = useRef(null);
  const windowStackRef = useRef(null);
  const windowTitleRefs = useRef({});
  const windowFrameRefs = useRef({});
  const moveButtonRefs = useRef({});
  const movePanelRefs = useRef({});
  const shortcutRefs = useRef([]);
  const taskButtonRefs = useRef({});
  const startButtonRef = useRef(null);
  const startMenuRef = useRef(null);
  const menuItemRefs = useRef([]);
  const lastShellAppRef = useRef(null);
  const reportedOpenAppsRef = useRef('');
  const pointerWindowControlRef = useRef(null);
  const requestedActiveAppRef = useRef(null);
  const pendingDragFocusRef = useRef(null);
  const dragSessionRef = useRef(null);
  const dragFrameRef = useRef(null);
  const resetFocusPendingRef = useRef(false);
  const previousMinimizedByIdRef = useRef(new Map(
    layout.windows.map((entry) => [entry.id, entry.minimized]),
  ));
  const layoutRef = useRef(layout);
  const activeAppIdRef = useRef(activeAppId);

  layoutRef.current = layout;
  activeAppIdRef.current = activeAppId;

  useEffect(() => {
    const stylesheetId = 'archive-desktop-styles';
    if (document.getElementById(stylesheetId)) return undefined;

    const link = document.createElement('link');
    link.id = stylesheetId;
    link.rel = 'stylesheet';
    link.href = resolveSitePath('frontend/desktop/desktop.css?v=3.8.17');
    link.addEventListener('error', () => {
      setStatusMessage('Desktop styling could not load. All destinations remain available.');
    }, { once: true });
    document.head.appendChild(link);

    return undefined;
  }, []);

  useEffect(() => {
    // Registration happens after the first document load. Asking the active
    // root worker to warm this optional module graph means even a first-ever
    // direct desktop visit is available on the next offline load, while a
    // standard archive visitor never downloads desktop-only assets.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then((registration) => registration.active?.postMessage({ action: 'cacheDesktop' }))
        .catch(() => {});
    }
    return undefined;
  }, []);

  useEffect(() => {
    if (!shellApp) return;
    setLayout((current) => activateDesktopWindow(current, shellApp.id, shellAppIds));
  }, [shellApp, shellAppIds]);

  useEffect(() => {
    if (requestedActiveAppRef.current === activeAppId) {
      requestedActiveAppRef.current = null;
    }
  }, [activeAppId]);

  useEffect(() => {
    try {
      if (layout.windows.length === 0) {
        localStorage.removeItem(DESKTOP_LAYOUT_STORAGE_KEY);
        return;
      }
      localStorage.setItem(
        DESKTOP_LAYOUT_STORAGE_KEY,
        serializeDesktopLayout(layout, shellAppIds),
      );
    } catch {
      // Private browsing and storage policies may reject persistence. Window
      // behavior remains fully usable for the current session.
    }
  }, [layout, shellAppIds]);

  useEffect(() => {
    const visibleAppIds = layout.windows
      .filter((entry) => !entry.minimized)
      .map((entry) => entry.id);
    const signature = visibleAppIds.join('|');
    if (reportedOpenAppsRef.current === signature) return;
    reportedOpenAppsRef.current = signature;
    onOpenAppsChange?.(visibleAppIds);
  }, [layout.windows, onOpenAppsChange]);

  useEffect(() => {
    let focusTarget = null;
    let revealFocusTarget = false;
    const compactDesktop = window.matchMedia?.(COMPACT_DESKTOP_QUERY).matches === true;
    if (dragSessionRef.current) return undefined;
    if (resetFocusPendingRef.current) {
      if (shellApp || layout.windows.length > 0) return undefined;
      resetFocusPendingRef.current = false;
      const resetFrame = requestAnimationFrame(() => {
        startButtonRef.current?.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(resetFrame);
    }
    if (shellApp) {
      lastShellAppRef.current = shellApp.id;
      if (!autoFocusWindow) return undefined;
      const activeWindow = document.querySelector(`[data-window-id="${shellApp.id}"]`);
      if (activeWindow?.contains(document.activeElement)) return undefined;
      focusTarget = windowTitleRefs.current[shellApp.id];
    } else if (activeAppId) {
      setStatusMessage('That desktop item is unavailable. Showing the desktop home.');
      focusTarget = windowTitleRefs.current.home;
      revealFocusTarget = compactDesktop;
    } else if (lastShellAppRef.current && layout.windows.length === 0) {
      const index = shortcutApps.findIndex((app) => app.id === lastShellAppRef.current);
      if (index >= 0) {
        setShortcutFocusIndex(index);
        focusTarget = shortcutRefs.current[index];
      }
      lastShellAppRef.current = null;
    } else {
      focusTarget = compactDesktop
        ? desktopTitleRef.current
        : windowTitleRefs.current.home || desktopTitleRef.current;
    }

    const frame = requestAnimationFrame(() => {
      if (shellApp) {
        const activeWindow = document.querySelector(`[data-window-id="${shellApp.id}"]`);
        // A foreground overlay can restore its exact opener after this effect
        // has scheduled chrome focus. Re-check at paint time so the window
        // title cannot overwrite that more precise focus destination.
        if (activeWindow?.contains(document.activeElement)) return;
      }
      focusTarget?.focus({ preventScroll: true });
      if (revealFocusTarget) {
        focusTarget?.scrollIntoView({ block: 'start', inline: 'nearest' });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [
    activeAppId,
    activeShellWindowVisible,
    autoFocusWindow,
    shellApp,
    shortcutApps,
    layout.windows.length,
    dragFocusRequest,
    resetFocusRequest,
  ]);

  useEffect(() => {
    if (!shellApp) return undefined;
    const frame = requestAnimationFrame(() => {
      taskButtonRefs.current[shellApp.id]?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [shellApp, layout.windows]);

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const compactQuery = window.matchMedia(COMPACT_DESKTOP_QUERY);
    const preserveVisibleFocus = (event) => {
      if (!event.matches) return;
      cancelWindowDrag();
      if (moveControlsAppId) {
        setMoveControlsAppId(null);
        requestAnimationFrame(() => {
          windowTitleRefs.current[shellApp?.id || 'home']?.focus({ preventScroll: true });
        });
      }
      const hiddenMoveFocus = document.activeElement?.closest?.(
        '.desktop-window-move, .desktop-window-move-panel',
      );
      if (
        shellApp
        && (shortcutPanelRef.current?.contains(document.activeElement) || hiddenMoveFocus)
      ) {
        requestAnimationFrame(() => {
          windowTitleRefs.current[shellApp.id]?.focus({ preventScroll: true });
        });
      } else if (!shellApp && document.activeElement === windowTitleRefs.current.home) {
        requestAnimationFrame(() => {
          if (activeAppId) {
            windowTitleRefs.current.home?.scrollIntoView({ block: 'start', inline: 'nearest' });
          } else {
            desktopTitleRef.current?.focus({ preventScroll: true });
          }
        });
      }
    };
    compactQuery.addEventListener('change', preserveVisibleFocus);
    return () => compactQuery.removeEventListener('change', preserveVisibleFocus);
  }, [activeAppId, moveControlsAppId, shellApp]);

  useEffect(() => {
    if (!startOpen) return undefined;
    setMenuFocusIndex(0);
    const frame = requestAnimationFrame(() => menuItemRefs.current[0]?.focus());

    const closeFromOutside = (event) => {
      if (
        !startMenuRef.current?.contains(event.target)
        && !startButtonRef.current?.contains(event.target)
      ) {
        setStartOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeFromOutside);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', closeFromOutside);
    };
  }, [startOpen]);

  useEffect(() => {
    if (!moveControlsAppId) return undefined;
    const frame = requestAnimationFrame(() => {
      movePanelRefs.current[moveControlsAppId]
        ?.querySelector('button')
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [moveControlsAppId]);

  useEffect(() => {
    const appId = pendingDragFocusRef.current;
    if (!appId || activeAppId !== appId || dragSessionRef.current) return undefined;
    const frame = requestAnimationFrame(() => {
      windowTitleRefs.current[appId]?.focus({ preventScroll: true });
      pendingDragFocusRef.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [activeAppId, dragFocusRequest]);

  const isCompactDesktop = () => (
    window.matchMedia?.(COMPACT_DESKTOP_QUERY).matches === true
  );

  const positionForWindow = (appId, sourceLayout = layoutRef.current) => (
    sourceLayout.windows.find((entry) => entry.id === appId)?.position || { x: 0, y: 0 }
  );

  const workAreaBounds = () => {
    const visualViewport = window.visualViewport;
    const left = visualViewport?.offsetLeft || 0;
    const top = visualViewport?.offsetTop || 0;
    const right = left + (visualViewport?.width || window.innerWidth);
    const viewportBottom = top + (visualViewport?.height || window.innerHeight);
    const taskbarTop = document.querySelector('.desktop-taskbar')
      ?.getBoundingClientRect().top;
    return {
      left,
      right,
      top,
      bottom: Number.isFinite(taskbarTop) ? Math.min(viewportBottom, taskbarTop) : viewportBottom,
    };
  };

  const clampWindowPosition = (
    appId,
    position,
    currentPosition = positionForWindow(appId),
    capturedGeometry = null,
  ) => {
    const frame = windowFrameRefs.current[appId];
    const titlebar = frame?.querySelector('.desktop-window-titlebar');
    if (!frame || !titlebar) return currentPosition;
    return clampDesktopWindowPosition(position, {
      currentPosition,
      frameRect: capturedGeometry?.frameRect || frame.getBoundingClientRect(),
      titlebarRect: capturedGeometry?.titlebarRect || titlebar.getBoundingClientRect(),
      workArea: capturedGeometry?.workArea || workAreaBounds(),
      margin: WINDOW_EDGE_MARGIN,
      minimumVisibleHeight: MINIMUM_VISIBLE_WINDOW_HEIGHT,
    });
  };

  const applyWindowPosition = (appId, position) => {
    const frame = windowFrameRefs.current[appId];
    if (!frame) return;
    frame.style.setProperty('--desktop-window-position-x', `${position.x}px`);
    frame.style.setProperty('--desktop-window-position-y', `${position.y}px`);
  };

  const scheduleWindowPositionPreview = (appId, position) => {
    if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null;
      applyWindowPosition(appId, position);
    });
  };

  const releaseDragCapture = (session, event) => {
    try {
      if (session.captureTarget.hasPointerCapture(event.pointerId)) {
        session.captureTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // A canceled or disconnected pointer may already have lost capture.
    }
  };

  const cancelWindowDrag = (restorePosition = true) => {
    const session = dragSessionRef.current;
    if (!session) return;
    dragSessionRef.current = null;
    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    session.frame.classList.remove('is-dragging');
    if (restorePosition) applyWindowPosition(session.app.id, session.startPosition);
    try {
      if (session.captureTarget.hasPointerCapture(session.pointerId)) {
        session.captureTarget.releasePointerCapture(session.pointerId);
      }
    } catch {
      // Reflow and unmount can disconnect the original capture target.
    }
  };

  const activateWindow = (appId, { focusIfActive = true } = {}) => {
    if (
      requestedActiveAppRef.current === appId
      && activeAppIdRef.current !== appId
    ) return;
    setLayout((current) => activateDesktopWindow(current, appId, shellAppIds));
    if (activeAppIdRef.current === appId) {
      if (focusIfActive && !dragSessionRef.current) {
        windowTitleRefs.current[appId]?.focus({ preventScroll: true });
      }
    } else {
      requestedActiveAppRef.current = appId;
      onSelectApp?.(appId);
    }
  };

  const beginWindowDrag = (event, app) => {
    if (
      isCompactDesktop()
      || event.isPrimary === false
      || (event.pointerType === 'mouse' && event.button !== 0)
      || event.target.closest('.desktop-window-controls')
    ) return;

    const frame = windowFrameRefs.current[app.id];
    if (!frame) return;
    const startPosition = positionForWindow(app.id);
    const titlebarRect = event.currentTarget.getBoundingClientRect();
    setStartOpen(false);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      return;
    }
    dragSessionRef.current = {
      app,
      pointerId: event.pointerId,
      captureTarget: event.currentTarget,
      frame,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosition,
      position: startPosition,
      moved: false,
      frameRect: frame.getBoundingClientRect(),
      titlebarRect,
      workArea: workAreaBounds(),
    };
    activateWindow(app.id, { focusIfActive: false });
    event.stopPropagation();
  };

  const moveWindowDrag = (event) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - session.startClientX;
    const deltaY = event.clientY - session.startClientY;
    if (!session.moved && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;
    event.preventDefault();
    if (!session.moved) {
      session.moved = true;
      session.frame.classList.add('is-dragging');
    }
    session.position = clampWindowPosition(
      session.app.id,
      {
        x: session.startPosition.x + deltaX,
        y: session.startPosition.y + deltaY,
      },
      session.startPosition,
      session,
    );
    scheduleWindowPositionPreview(session.app.id, session.position);
  };

  const finishWindowDrag = (event, canceled = false) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    dragSessionRef.current = null;
    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    session.frame.classList.remove('is-dragging');
    releaseDragCapture(session, event);

    if (canceled) {
      applyWindowPosition(session.app.id, session.startPosition);
      setStatusMessage(`Canceled moving ${session.app.label}.`);
    } else if (session.moved) {
      applyWindowPosition(session.app.id, session.position);
      setLayout((current) => moveDesktopWindow(
        current,
        session.app.id,
        session.position,
        shellAppIds,
      ));
      setStatusMessage(`Moved ${session.app.label} window.`);
    } else {
      setStatusMessage(`Activated ${session.app.label}.`);
    }

    pendingDragFocusRef.current = session.app.id;
    setDragFocusRequest((request) => request + 1);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        windowTitleRefs.current[session.app.id]?.focus({ preventScroll: true });
      });
    });
  };

  const closeMoveControls = (appId, returnFocus = true) => {
    setMoveControlsAppId((current) => (current === appId ? null : current));
    if (returnFocus) {
      requestAnimationFrame(() => {
        moveButtonRefs.current[appId]?.focus({ preventScroll: true });
      });
    }
  };

  const openMoveControls = (app) => {
    if (isCompactDesktop()) return;
    activateWindow(app.id, { focusIfActive: false });
    setMoveControlsAppId(app.id);
    setStatusMessage(`Move controls opened for ${app.label}.`);
  };

  const commitWindowPosition = (app, nextPosition, message) => {
    const currentPosition = positionForWindow(app.id);
    const clamped = clampWindowPosition(app.id, nextPosition, currentPosition);
    applyWindowPosition(app.id, clamped);
    setLayout((current) => moveDesktopWindow(current, app.id, clamped, shellAppIds));
    setStatusMessage(message);
  };

  const moveWindowBy = (app, deltaX, deltaY, direction) => {
    const currentPosition = positionForWindow(app.id);
    commitWindowPosition(app, {
      x: currentPosition.x + deltaX,
      y: currentPosition.y + deltaY,
    }, `${app.label} moved ${direction}.`);
  };

  const handleMoveControlsKeyDown = (event, app) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMoveControls(app.id);
      return;
    }
    const step = event.shiftKey ? MOVE_FINE_STEP : MOVE_STEP;
    const direction = {
      ArrowLeft: [-step, 0, 'left'],
      ArrowUp: [0, -step, 'up'],
      ArrowDown: [0, step, 'down'],
      ArrowRight: [step, 0, 'right'],
    }[event.key];
    if (!direction) return;
    event.preventDefault();
    moveWindowBy(app, ...direction);
  };

  const reclampVisibleWindows = () => {
    if (isCompactDesktop()) return;
    setLayout((current) => {
      let next = current;
      for (const entry of current.windows) {
        if (entry.minimized || !windowFrameRefs.current[entry.id]) continue;
        const clamped = clampWindowPosition(entry.id, entry.position, entry.position);
        if (clamped.x === entry.position.x && clamped.y === entry.position.y) continue;
        applyWindowPosition(entry.id, clamped);
        next = moveDesktopWindow(next, entry.id, clamped, shellAppIds);
      }
      return next;
    });
  };

  const minimizedStateSignature = layout.windows
    .map((entry) => `${entry.id}:${entry.minimized ? 1 : 0}`)
    .join('|');
  useEffect(() => {
    const previous = previousMinimizedByIdRef.current;
    const restoredWindow = layout.windows.some((entry) => (
      entry.minimized === false && previous.get(entry.id) === true
    ));
    previousMinimizedByIdRef.current = new Map(
      layout.windows.map((entry) => [entry.id, entry.minimized]),
    );
    if (!restoredWindow || isCompactDesktop()) return undefined;

    let reclampFrame = null;
    const mountedFrame = requestAnimationFrame(() => {
      reclampFrame = requestAnimationFrame(reclampVisibleWindows);
    });
    return () => {
      cancelAnimationFrame(mountedFrame);
      if (reclampFrame !== null) cancelAnimationFrame(reclampFrame);
    };
  }, [minimizedStateSignature]);

  useEffect(() => {
    const cancelFromKeyboard = (event) => {
      if (event.key !== 'Escape' || !dragSessionRef.current) return;
      event.preventDefault();
      const app = dragSessionRef.current.app;
      cancelWindowDrag();
      setStatusMessage(`Canceled moving ${app.label}.`);
      requestAnimationFrame(() => {
        windowTitleRefs.current[app.id]?.focus({ preventScroll: true });
      });
    };
    document.addEventListener('keydown', cancelFromKeyboard);
    return () => document.removeEventListener('keydown', cancelFromKeyboard);
  }, []);

  useEffect(() => {
    let frame = null;
    const handleViewportChange = () => {
      cancelWindowDrag();
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        if (isCompactDesktop()) {
          setMoveControlsAppId(null);
          return;
        }
        reclampVisibleWindows();
      });
    };

    const observer = typeof ResizeObserver === 'function'
      ? new ResizeObserver(handleViewportChange)
      : null;
    if (windowStackRef.current) observer?.observe(windowStackRef.current);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('orientationchange', handleViewportChange);
    window.visualViewport?.addEventListener('resize', handleViewportChange);
    handleViewportChange();
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('orientationchange', handleViewportChange);
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
    };
  }, [layout.windows.map((entry) => entry.id).join('|')]);

  const openApp = (app, source = 'desktop') => {
    const index = shortcutApps.findIndex((candidate) => candidate.id === app.id);
    if (index >= 0) setShortcutFocusIndex(index);
    setStartOpen(false);

    if (app.launch.kind === 'shell') {
      setStatusMessage(`Opening ${app.label}.`);
      activateWindow(app.launch.destination);
      return;
    }
    if (app.launch.kind === 'action') {
      setStatusMessage('Opening the archive problem report.');
      // A Start menu item disappears in the same render that mounts the
      // canonical report dialog. Move focus to the durable Start button first
      // so the shared modal can capture and later restore a connected trigger.
      if (source === 'start-menu') {
        startButtonRef.current?.focus({ preventScroll: true });
      }
      onOpenBugReport?.();
      return;
    }
    if (app.launch.kind === 'path') {
      setStatusMessage(`${app.label} opens as a standalone archive page.`);
      window.location.assign(resolveSitePath(app.launch.destination));
      return;
    }

    setStatusMessage(`${app.label} opens in the standard archive view.`);
    onNavigate?.(app.launch.destination);
  };

  const moveShortcutFocus = (nextIndex) => {
    const clamped = Math.max(0, Math.min(shortcutApps.length - 1, nextIndex));
    setShortcutFocusIndex(clamped);
    shortcutRefs.current[clamped]?.focus();
  };

  const handleShortcutKeyDown = (event, app, index) => {
    const columns = 2;
    const lastIndex = shortcutApps.length - 1;
    const rowStart = Math.floor(index / columns) * columns;
    const rowEnd = Math.min(rowStart + columns - 1, lastIndex);
    let nextIndex = index;

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openApp(app);
      return;
    }
    if (event.key === 'ArrowLeft') nextIndex = Math.max(rowStart, index - 1);
    else if (event.key === 'ArrowRight') nextIndex = Math.min(rowEnd, index + 1);
    else if (event.key === 'ArrowUp') nextIndex = index - columns >= 0 ? index - columns : index;
    else if (event.key === 'ArrowDown') nextIndex = index + columns <= lastIndex ? index + columns : index;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = lastIndex;
    else return;

    event.preventDefault();
    moveShortcutFocus(nextIndex);
  };

  const menuEntryCount = startApps.length + 2;
  const handleMenuKeyDown = (event, index) => {
    let nextIndex = index;
    if (event.key === 'ArrowDown') nextIndex = (index + 1) % menuEntryCount;
    else if (event.key === 'ArrowUp') nextIndex = (index - 1 + menuEntryCount) % menuEntryCount;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = menuEntryCount - 1;
    else if (event.key === 'Escape') {
      event.preventDefault();
      setStartOpen(false);
      startButtonRef.current?.focus();
      return;
    } else if (event.key === 'Tab') {
      setStartOpen(false);
      return;
    } else {
      return;
    }

    event.preventDefault();
    setMenuFocusIndex(nextIndex);
    menuItemRefs.current[nextIndex]?.focus();
  };

  const closeWindow = (app) => {
    if (dragSessionRef.current?.app.id === app.id) cancelWindowDrag();
    if (moveControlsAppId === app.id) closeMoveControls(app.id, false);
    const nextLayout = closeDesktopWindow(layout, app.id, shellAppIds);
    setLayout(nextLayout);
    setStatusMessage(`Closed ${app.label}.`);
    if (activeAppId === app.id) {
      onSelectApp?.(nextVisibleDesktopWindow(nextLayout) || null);
    } else {
      requestAnimationFrame(() => {
        windowTitleRefs.current[shellApp?.id || 'home']?.focus({ preventScroll: true });
      });
    }
  };

  const minimizeWindow = (app) => {
    if (dragSessionRef.current?.app.id === app.id) cancelWindowDrag();
    if (moveControlsAppId === app.id) closeMoveControls(app.id, false);
    const nextLayout = minimizeDesktopWindow(layout, app.id, shellAppIds);
    setLayout(nextLayout);
    setStatusMessage(`Minimized ${app.label}. Use its taskbar button to restore it.`);
    if (activeAppId === app.id) {
      onSelectApp?.(nextVisibleDesktopWindow(nextLayout, app.id) || null);
    } else {
      requestAnimationFrame(() => {
        windowTitleRefs.current[shellApp?.id || 'home']?.focus({ preventScroll: true });
      });
    }
  };

  const resetLayout = () => {
    cancelWindowDrag();
    setMoveControlsAppId(null);
    resetFocusPendingRef.current = true;
    lastShellAppRef.current = null;
    setResetFocusRequest((request) => request + 1);
    setLayout(emptyDesktopLayout());
    setStartOpen(false);
    setStatusMessage('Desktop layout reset. All app windows were closed.');
    try {
      localStorage.removeItem(DESKTOP_LAYOUT_STORAGE_KEY);
    } catch {
      // The in-memory reset still succeeds when storage is unavailable.
    }
    onSelectApp?.(null);
  };

  const renderWelcome = () => html`
    <div className="desktop-document">
      ${hasUnknownApp && html`
        <div className="desktop-notice archive-notice archive-notice--warning" role="note">
          <${AlertTriangle} className="desktop-inline-icon" aria-hidden="true" />
          <span>That desktop item is unavailable. Showing the desktop home.</span>
        </div>
      `}
      <p className="desktop-eyebrow">A second front door</p>
      <h3>Welcome to Rosen 98</h3>
      <p className="desktop-lede">
        This optional view arranges the same Rosen Archive as shortcuts, folders, and windows. It is a map of the collection, not a separate copy of it.
      </p>
      <div className="desktop-principles">
        <article>
          <span className="desktop-principle-number">01</span>
          <h4>Choose a path</h4>
          <p>Open a shortcut once, or use Start for the complete destination list.</p>
        </article>
        <article>
          <span className="desktop-principle-number">02</span>
          <h4>Keep canonical links</h4>
          <p>Archive records and research areas reuse maintained content and preserve canonical links.</p>
        </article>
        <article>
          <span className="desktop-principle-number">03</span>
          <h4>Leave at any time</h4>
          <p>The taskbar always provides a direct route back to the standard archive.</p>
        </article>
      </div>
    </div>
  `;

  const renderReadme = () => html`
    <div className="desktop-document">
      <p className="desktop-eyebrow">Read me</p>
      <h3>A familiar shape for a large archive</h3>
      <p className="desktop-lede">
        Personal-computing and early-web history overlap with many of the archive's questions about publishing, publics, platforms, and control. This shell uses that history to make routes visible and the collection feel containable.
      </p>

      <dl className="desktop-definition-list">
        <div><dt>Shortcut</dt><dd>A maintained way into the collection. One click is enough.</dd></div>
        <div><dt>Desktop window</dt><dd>A live archive surface that can remain open while you compare another path.</dd></div>
        <div><dt>Standard view</dt><dd>The existing canonical archive route, with its full current behavior.</dd></div>
        <div><dt>Start</dt><dd>The complete list of destinations and the dependable way out.</dd></div>
      </dl>

      <section className="desktop-layout-help" aria-labelledby="desktop-layout-help-title">
        <h4 id="desktop-layout-help-title">Window memory</h4>
        <p>
          On wider screens, drag a title bar or choose its Move button. Move offers click, tap, and keyboard arrow controls. Open, minimized, and moved app windows are saved on this device. Active state stays in the URL, so Back and Forward move between the windows you activated; position changes do not add history entries.
        </p>
        <button type="button" className="desktop-standard-link archive-action archive-action--secondary" onClick=${resetLayout}>
          <${RotateCcw} aria-hidden="true" />
          Reset desktop layout
        </button>
      </section>

    </div>
  `;

  const renderTools = () => html`
    <div className="desktop-document">
      <p className="desktop-eyebrow">Maintained tools</p>
      <h3>Reading and research tools</h3>
      <p className="desktop-lede">
        These pages are maintained alongside the archive. Each opens as its own full page and keeps a route back to the collection.
      </p>
      <div className="desktop-tool-grid">
        ${DESKTOP_TOOL_LINKS.map((tool) => html`
          <a
            key=${tool.id}
            className="desktop-tool-link"
            href=${resolveSitePath(tool.href)}
            aria-label=${`${tool.label}. Opens a standalone archive page.`}
          >
            <span className="desktop-tool-icon">${iconFor(tool.icon)}</span>
            <span className="desktop-tool-copy">
              <strong>${tool.label}</strong>
              <small>${tool.description}</small>
              <span className="desktop-tool-mode">
                Open page <${ExternalLink} className="desktop-external-icon" aria-hidden="true" />
                ${tool.status === 'beta' ? html`<em>Beta</em>` : ''}
                ${tool.status === 'experimental' ? html`<em>Experimental</em>` : ''}
              </span>
            </span>
          </a>
        `)}
      </div>
    </div>
  `;

  const renderDataStatus = (view, loadingMessage, errorTitle) => {
    if (view.error) {
      return html`
        <div className="desktop-data-status archive-notice archive-notice--danger is-error" role="alert">
          <${AlertTriangle} aria-hidden="true" />
          <div>
            <strong>${errorTitle}</strong>
            <p>${view.error}</p>
            <button type="button" className="archive-action archive-action--danger" onClick=${() => window.location.reload()}>
              <${RotateCcw} aria-hidden="true" />
              Reload page
            </button>
          </div>
        </div>
      `;
    }

    if (view.loading) {
      return html`<p className="desktop-data-status archive-notice" role="status">${loadingMessage}</p>`;
    }

    return null;
  };

  const renderArchive = (appId) => {
    const windowViewMode = appId === 'folders' ? 'folder' : 'grid';
    return html`
    <${DesktopArchivePanel}
      viewMode=${windowViewMode}
      loading=${archiveView.loading}
      error=${archiveView.error}
      filters=${archiveView.filters}
      setFilters=${archiveView.setFilters}
      facets=${archiveView.facets}
      autocompleteIndex=${archiveView.autocompleteIndex}
      sortBy=${archiveView.sortBy}
      setSortBy=${archiveView.setSortBy}
      filteredRecords=${archiveView.filteredRecords}
      paginatedRecords=${archiveView.paginatedRecords}
      folderGroups=${archiveView.folderGroups}
      currentPage=${archiveView.currentPage}
      totalPages=${archiveView.totalPages}
      activeFilterCount=${archiveView.activeFilterCount}
      onSetViewMode=${archiveView.onSetViewMode}
      onSelectRecord=${archiveView.onSelectRecord}
      onOpenFolder=${archiveView.onOpenFolder}
      onPageChange=${archiveView.onPageChange}
      onClearFilters=${archiveView.onClearFilters}
      onOpenStandard=${() => archiveView.onOpenStandard(windowViewMode)}
    />
  `;
  };

  const renderEntities = () => html`
    <${DesktopEntityPanel}
      records=${entityView.records}
      queryActive=${entityView.queryActive}
      onClearQuery=${entityView.onClearQuery}
      dataStatus=${renderDataStatus(
        entityView,
        'Loading connected archive records…',
        'Connected records are unavailable.',
      )}
      onSelectRecord=${entityView.onSelectRecord}
      selectedEntityId=${entityView.selectedEntityId}
      onSelectEntity=${entityView.onSelectEntity}
      autoFocusSelection=${entityView.autoFocusSelection}
      onOpenStandard=${entityView.onOpenStandard}
    />
  `;

  const renderDissertation = () => html`
    <${DesktopDissertationPanel}
      onOpenStandard=${dissertationView.onOpenStandard}
    />
  `;

  const renderAnalytics = () => html`
    <${DesktopAnalyticsPanel}
      onRecordResults=${analyticsView.onRecordResults}
      onOpenStandard=${analyticsView.onOpenStandard}
    />
  `;

  const renderGuidedPath = (appId) => html`
    <${DesktopStartPanel}
      mode=${appId}
      records=${startView.records}
      dataStatus=${renderDataStatus(
        startView,
        'Loading the guide’s archive records…',
        'Guide records are unavailable.',
      )}
      onNavigate=${startView.onNavigate}
      onSelectRecord=${startView.onSelectRecord}
      onOpenBugReport=${startView.onOpenBugReport}
      onOpenStandard=${startView.onOpenStandard}
    />
  `;

  const renderWindowContent = (app) => {
    if (!app) return renderWelcome();
    if (app.id === 'archive' || app.id === 'folders') return renderArchive(app.id);
    if (app.id === 'entities') return renderEntities();
    if (app.id === 'dissertation') return renderDissertation();
    if (app.id === 'analytics') return renderAnalytics();
    if (app.id === 'start' || app.id === 'findings') return renderGuidedPath(app.id);
    if (app.id === 'readme') return renderReadme();
    if (app.id === 'tools') return renderTools();
    return renderWelcome();
  };

  const windowStatusText = (app, isActive) => {
    const stackStatus = isActive ? 'Active' : 'Background';
    let context = 'One archive, two ways in';

    if (app?.id === 'archive' || app?.id === 'folders') {
      if (archiveView.loading) context = 'Loading canonical archive records';
      else if (archiveView.error) context = 'Canonical archive records unavailable';
      else {
        const filterLabel = archiveView.activeFilterCount === 1 ? 'filter' : 'filters';
        context = `${archiveView.filteredRecords.length} records; ${archiveView.activeFilterCount} active ${filterLabel}; page ${archiveView.currentPage} of ${archiveView.totalPages}`;
      }
    } else if (app?.id === 'entities') {
      context = entityView.selectedEntityId
        ? 'Selected entity context stays open'
        : 'Canonical entity index; connected records open in place';
    } else if (app?.id === 'analytics') {
      context = 'Aggregate index ready; larger queries load on request';
    } else if (app?.id === 'dissertation') {
      context = 'One dissertation, many routes through it';
    } else if (app?.id === 'start' || app?.id === 'findings') {
      context = 'Guide records come from the canonical archive';
    } else if (app?.id === 'tools') {
      context = `${DESKTOP_TOOL_LINKS.length} maintained archive tools`;
    } else if (app?.id === 'readme') {
      context = 'Layout memory: this device only';
    }

    return `${stackStatus}; ${context}`;
  };

  const renderWindowFrame = (app) => {
    const appId = app?.id || 'home';
    const windowTitle = app?.label || 'Welcome to Rosen 98';
    const windowEntry = app
      ? layout.windows.find((entry) => entry.id === app.id)
      : null;
    const isActive = app ? shellApp?.id === app.id : !shellApp;
    const isWideWindow = [
      'archive',
      'folders',
      'entities',
      'dissertation',
      'analytics',
      'start',
      'findings',
    ].includes(app?.id);
    const titleId = `desktop-window-title-${appId}`;
    const movePanelId = `desktop-window-move-panel-${appId}`;
    const moveInstructionsId = `desktop-window-move-instructions-${appId}`;
    const style = app ? {
      '--desktop-window-position-x': `${windowEntry?.position.x || 0}px`,
      '--desktop-window-position-y': `${windowEntry?.position.y || 0}px`,
      zIndex: layout.zOrder.indexOf(app.id) + 3,
    } : {
      // Restored windows remain available in the taskbar on a desktop-home or
      // unknown-app URL, but home is the active surface in both cases. Keep it
      // above the saved stack so its visible content agrees with URL and focus
      // state; an activated app sends home back behind the stack.
      zIndex: shellApp ? 1 : layout.zOrder.length + 3,
    };

    return html`
      <section
        key=${appId}
        ref=${(element) => { windowFrameRefs.current[appId] = element; }}
        className=${`desktop-window ${isWideWindow ? 'desktop-window-wide' : ''} ${isActive ? 'is-active' : 'is-inactive'} ${app ? '' : 'desktop-home-window'}`}
        style=${style}
        role="region"
        aria-labelledby=${titleId}
        data-window-id=${appId}
        onPointerDown=${(event) => {
          if (!app || isActive) return;
          if (event.target.closest('.desktop-window-controls')) {
            pointerWindowControlRef.current = app.id;
            requestAnimationFrame(() => {
              if (pointerWindowControlRef.current === app.id) {
                pointerWindowControlRef.current = null;
              }
            });
            return;
          }
          activateWindow(app.id);
        }}
        onFocusCapture=${(event) => {
          const pointerControlFocus = pointerWindowControlRef.current === app?.id
            && event.target.closest('.desktop-window-controls');
          const dragFocus = dragSessionRef.current?.app.id === app?.id;
          if (app && !isActive && !pointerControlFocus && !dragFocus) activateWindow(app.id);
        }}
      >
        <div
          className=${`desktop-window-titlebar ${app ? 'is-movable' : ''}`}
          onPointerDown=${app ? (event) => beginWindowDrag(event, app) : undefined}
          onPointerMove=${app ? moveWindowDrag : undefined}
          onPointerUp=${app ? (event) => finishWindowDrag(event) : undefined}
          onPointerCancel=${app ? (event) => finishWindowDrag(event, true) : undefined}
          onLostPointerCapture=${app ? (event) => finishWindowDrag(event, true) : undefined}
        >
          <div className="desktop-window-title-copy">
            <span aria-hidden="true">${iconFor(app?.icon || 'archive', 'desktop-titlebar-icon')}</span>
            <h2
              id=${titleId}
              ref=${(element) => { windowTitleRefs.current[appId] = element; }}
              tabIndex="-1"
            >${windowTitle}</h2>
            ${isActive && html`<span className="desktop-active-window-label">Active</span>`}
          </div>
          ${app && html`
            <div className="desktop-window-controls">
              <button
                ref=${(element) => { moveButtonRefs.current[app.id] = element; }}
                type="button"
                className="desktop-window-move"
                aria-label=${`Move ${windowTitle}`}
                aria-expanded=${moveControlsAppId === app.id}
                onClick=${() => {
                  if (moveControlsAppId === app.id) closeMoveControls(app.id);
                  else openMoveControls(app);
                }}
              >
                <${Move} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="desktop-window-minimize"
                onClick=${() => minimizeWindow(app)}
                aria-label=${`Minimize ${windowTitle}`}
              >
                <${Minus} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="desktop-window-close"
                onClick=${() => closeWindow(app)}
                aria-label=${`Close ${windowTitle}`}
              >
                <${X} aria-hidden="true" />
              </button>
            </div>
          `}
        </div>
        ${app && moveControlsAppId === app.id && html`
          <div
            id=${movePanelId}
            ref=${(element) => { movePanelRefs.current[app.id] = element; }}
            className="desktop-window-move-panel"
            role="group"
            aria-label=${`Move ${windowTitle} window`}
            aria-describedby=${moveInstructionsId}
            onKeyDown=${(event) => handleMoveControlsKeyDown(event, app)}
          >
            <p id=${moveInstructionsId}>Use the arrow buttons or arrow keys. Hold Shift for smaller keyboard steps.</p>
            <div className="desktop-window-move-arrows">
              <button
                type="button"
                aria-label=${`Move ${windowTitle} left`}
                onClick=${() => moveWindowBy(app, -MOVE_STEP, 0, 'left')}
              ><${ArrowLeft} aria-hidden="true" /></button>
              <button
                type="button"
                aria-label=${`Move ${windowTitle} up`}
                onClick=${() => moveWindowBy(app, 0, -MOVE_STEP, 'up')}
              ><${ArrowUp} aria-hidden="true" /></button>
              <button
                type="button"
                aria-label=${`Move ${windowTitle} down`}
                onClick=${() => moveWindowBy(app, 0, MOVE_STEP, 'down')}
              ><${ArrowDown} aria-hidden="true" /></button>
              <button
                type="button"
                aria-label=${`Move ${windowTitle} right`}
                onClick=${() => moveWindowBy(app, MOVE_STEP, 0, 'right')}
              ><${ArrowRight} aria-hidden="true" /></button>
            </div>
            <button
              type="button"
              className="desktop-window-center"
              aria-label=${`Center ${windowTitle}`}
              onClick=${() => commitWindowPosition(app, { x: 0, y: 0 }, `${app.label} centered.`)}
            >Center</button>
            <button
              type="button"
              className="desktop-window-move-done"
              aria-label=${`Done moving ${windowTitle}`}
              onClick=${() => closeMoveControls(app.id)}
            >Done</button>
          </div>
        `}
        <div className="desktop-window-body">${renderWindowContent(app)}</div>
        <div className="desktop-window-status">
          ${windowStatusText(app, isActive)}
        </div>
      </section>
    `;
  };

  const openWindows = layout.windows
    .filter((entry) => !entry.minimized)
    .map((entry) => getDesktopApp(entry.id))
    .filter((app) => app?.availability === 'ready' && app.launch.kind === 'shell');
  const taskWindows = layout.windows
    .map((entry) => ({ ...entry, app: getDesktopApp(entry.id) }))
    .filter((entry) => entry.app?.availability === 'ready' && entry.app.launch.kind === 'shell');

  return html`
    <main id="main-content" className=${`archive-desktop archive-density--compact ${shellApp ? 'desktop-app-active' : ''}`}>
      ${shellApp && html`<h1 className="desktop-mobile-page-title">Archive desktop</h1>`}
      <div className="desktop-wallpaper-mark" aria-hidden="true">JR</div>
      <div className="desktop-workspace">
        <section ref=${shortcutPanelRef} className="desktop-shortcut-panel" aria-labelledby="desktop-title">
          <header className="desktop-brand">
            <p>Jay Rosen's Internet Archive</p>
            <h1 id="desktop-title" ref=${desktopTitleRef} tabIndex="-1">Rosen 98</h1>
            <span>Optional exploration view</span>
          </header>

          <div className="desktop-shortcut-grid" role="list" aria-label="Archive desktop shortcuts">
            ${shortcutApps.map((app, index) => html`
              <div role="listitem" key=${app.id}>
                <button
                  ref=${(element) => { shortcutRefs.current[index] = element; }}
                  type="button"
                  className=${`desktop-shortcut ${shellApp?.id === app.id ? 'is-active' : ''}`}
                  tabIndex=${index === shortcutFocusIndex ? 0 : -1}
                  aria-current=${shellApp?.id === app.id ? 'page' : undefined}
                  aria-label=${`${app.label}. ${app.description} ${launchModeLabel(app)}.`}
                  onFocus=${() => setShortcutFocusIndex(index)}
                  onClick=${() => openApp(app)}
                  onKeyDown=${(event) => handleShortcutKeyDown(event, app, index)}
                >
                  <span className="desktop-shortcut-icon">${iconFor(app.icon)}</span>
                  <span className="desktop-shortcut-label">${app.label}</span>
                  <span className="desktop-shortcut-mode">${launchModeLabel(app)}</span>
                </button>
              </div>
            `)}
          </div>
        </section>

        <div ref=${windowStackRef} className="desktop-window-stack">
          ${renderWindowFrame(null)}
          ${openWindows.map((app) => renderWindowFrame(app))}
        </div>
      </div>

      <p className="desktop-live-status" aria-live="polite" aria-atomic="true">${statusMessage}</p>

      ${startOpen && html`
        <div
          id="archive-desktop-start-menu"
          ref=${startMenuRef}
          className="desktop-start-menu"
          role="menu"
          aria-label="Archive desktop Start menu"
        >
          <div className="desktop-start-rail" aria-hidden="true"><span>Rosen 98</span></div>
          <div className="desktop-start-content">
            <div className="desktop-start-heading" role="presentation">
              <strong>Rosen 98</strong>
              <small>Choose a destination</small>
            </div>
            ${startApps.map((app, index) => html`
              <button
                key=${app.id}
                ref=${(element) => { menuItemRefs.current[index] = element; }}
                type="button"
                className="desktop-menu-item"
                role="menuitem"
                tabIndex=${index === menuFocusIndex ? 0 : -1}
                onFocus=${() => setMenuFocusIndex(index)}
                onClick=${() => openApp(app, 'start-menu')}
                onKeyDown=${(event) => handleMenuKeyDown(event, index)}
              >
                <span className="desktop-menu-icon">${iconFor(app.icon)}</span>
                <span><strong>${app.label}</strong><small>${launchModeLabel(app)}</small></span>
              </button>
            `)}
            <div className="desktop-menu-divider" role="separator"></div>
            <button
              ref=${(element) => { menuItemRefs.current[startApps.length] = element; }}
              type="button"
              className="desktop-menu-item"
              role="menuitem"
              tabIndex=${menuFocusIndex === startApps.length ? 0 : -1}
              onFocus=${() => setMenuFocusIndex(startApps.length)}
              onClick=${resetLayout}
              onKeyDown=${(event) => handleMenuKeyDown(event, startApps.length)}
            >
              <span className="desktop-menu-icon"><${RotateCcw} aria-hidden="true" /></span>
              <span><strong>Reset desktop layout</strong><small>Close windows and clear saved state</small></span>
            </button>
            <button
              ref=${(element) => { menuItemRefs.current[startApps.length + 1] = element; }}
              type="button"
              className="desktop-menu-item desktop-menu-exit"
              role="menuitem"
              tabIndex=${menuFocusIndex === startApps.length + 1 ? 0 : -1}
              onFocus=${() => setMenuFocusIndex(startApps.length + 1)}
              onClick=${onExit}
              onKeyDown=${(event) => handleMenuKeyDown(event, startApps.length + 1)}
            >
              <span className="desktop-menu-icon"><${ArrowLeft} aria-hidden="true" /></span>
              <span><strong>Standard archive</strong><small>Leave the desktop view</small></span>
            </button>
          </div>
        </div>
      `}

      <nav className="desktop-taskbar" aria-label="Archive desktop taskbar">
        <button
          ref=${startButtonRef}
          type="button"
          className=${`desktop-start-button ${startOpen ? 'is-pressed' : ''}`}
          aria-haspopup="menu"
          aria-expanded=${startOpen}
          onClick=${() => setStartOpen((open) => !open)}
        >
          <span className="desktop-start-mark" aria-hidden="true">R98</span>
          <strong>Start</strong>
        </button>

        <button type="button" className="desktop-task-button desktop-standard-button" onClick=${onExit}>
          <${ArrowLeft} aria-hidden="true" />
          <span>Standard archive</span>
        </button>

        ${taskWindows.length > 0 && html`
          <div className="desktop-task-window-list" role="list" aria-label="Open desktop windows" tabIndex="0">
            ${taskWindows.map(({ app, minimized }) => html`
              <div role="listitem" key=${app.id}>
                <button
                  ref=${(element) => { taskButtonRefs.current[app.id] = element; }}
                  type="button"
                  className=${`desktop-task-button ${shellApp?.id === app.id ? 'is-active' : ''} ${minimized ? 'is-minimized' : ''}`}
                  aria-current=${shellApp?.id === app.id ? 'page' : undefined}
                  aria-label=${`${minimized ? 'Restore' : 'Activate'} ${app.label}${minimized ? ', minimized' : ''}`}
                  onClick=${() => {
                    setStatusMessage(`${minimized ? 'Restored' : 'Activated'} ${app.label}.`);
                    activateWindow(app.id);
                  }}
                >
                  ${iconFor(app.icon, 'desktop-task-icon')}
                  <span>${app.label}${minimized ? html`<small>Minimized</small>` : ''}</span>
                </button>
              </div>
            `)}
          </div>
        `}

        <div className="desktop-task-status" aria-hidden="true">
          <span>Rosen 98</span>
          <small>desktop</small>
        </div>
      </nav>
    </main>
  `;
};

export default DesktopShell;
