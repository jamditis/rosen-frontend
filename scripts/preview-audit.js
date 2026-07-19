#!/usr/bin/env node
// WCAG 2.1 AA accessibility audit + visual screenshots for the rosen-archive
// static bundle. Spawns the preview server, walks key routes at mobile and
// desktop viewports, runs axe-core, writes per-route screenshots + a single
// HTML report. Run via `npm run preview:audit`.
//
// Routes: top-level SPA hash routes + standalone subpages + record deep links
// that exercise canonical modal and background-view combinations. Update
// ROUTES below to add more.

import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';

const PORT = Number(process.env.PREVIEW_PORT || 8765);
// Pick a connect target for Playwright that's always routable, regardless
// of what PREVIEW_HOST the server is bound to. Wildcard binds (0.0.0.0 in
// IPv4, :: and ::0 in IPv6) are accept-any-interface addresses, NOT connect
// destinations — translate each to its same-family loopback. Other PREVIEW_HOST
// values pass through unchanged. IPv6 literals get bracketed for URL syntax
// (`http://[::1]:8765`, not `http://::1:8765`). Hard-coding 'localhost' would
// silently fail on IPv6-first systems where it resolves to ::1 while the
// server only listens on IPv4.
const SERVER_HOST = process.env.PREVIEW_HOST || '127.0.0.1';
const WILDCARD_TO_LOOPBACK = { '0.0.0.0': '127.0.0.1', '::': '::1', '::0': '::1' };
const CLIENT_HOST = WILDCARD_TO_LOOPBACK[SERVER_HOST] || SERVER_HOST;
const URL_HOST = CLIENT_HOST.includes(':') && !CLIENT_HOST.startsWith('[')
  ? `[${CLIENT_HOST}]`
  : CLIENT_HOST;
const BASE = `http://${URL_HOST}:${PORT}`;
const REQUESTED_VIEWPORT = (process.env.PREVIEW_AUDIT_VIEWPORT || '').trim();
const OUT_DIR_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', 'preview-audit-results');
const OUT_DIR = REQUESTED_VIEWPORT
  ? resolve(OUT_DIR_ROOT, 'shards', REQUESTED_VIEWPORT)
  : OUT_DIR_ROOT;

const ROUTES = [
  { slug: 'home-archive',       url: '/', archiveDetails: 'require' },
  { slug: 'start-here',         url: '/#start', verifyDesktopEntry: true },
  { slug: 'participate',        url: '/features/participate/' },
  { slug: 'archive-desktop',    url: '/#desktop', archiveDetails: 'forbid', verifyStartPathRoundTrip: true },
  { slug: 'desktop-start-menu', url: '/#desktop', archiveDetails: 'forbid', verifyDesktopStartMenu: true },
  { slug: 'desktop-unknown',    url: '/#desktop/not-real' },
  {
    slug: 'desktop-archive',
    url: '/#desktop/archive',
    archiveDetails: 'require',
    verifyStandardExit: {
      appId: 'archive',
      expectedHash: '',
      focusSelector: '#main-content',
      focusLabel: 'Standard archive main after desktop exit',
    },
  },
  {
    slug: 'desktop-folders',
    url: '/#desktop/folders',
    archiveDetails: 'require',
    verifyStandardExit: {
      appId: 'folders',
      expectedHash: '#folders',
      focusSelector: '#main-content',
      focusLabel: 'Standard folders main after desktop exit',
    },
  },
  {
    slug: 'desktop-start',
    url: '/#desktop/start',
    archiveDetails: 'forbid',
    verifyStandardExit: {
      appId: 'start',
      expectedHash: '#start',
      focusSelector: '[data-route-entry-focus]',
      focusLabel: 'Standard Start heading after desktop exit',
    },
  },
  {
    slug: 'desktop-findings',
    url: '/#desktop/findings',
    archiveDetails: 'forbid',
    verifyStandardExit: {
      appId: 'findings',
      buttonName: 'Open standard Start here',
      expectedHash: '#start',
      focusSelector: '[data-route-entry-focus]',
      focusLabel: 'Standard Start heading after findings exit',
    },
  },
  {
    slug: 'desktop-entities',
    url: '/#desktop/entities',
    archiveDetails: 'forbid',
    verifyStandardExit: {
      appId: 'entities',
      expectedHash: '#entities',
      focusSelector: '#main-content',
      focusLabel: 'Standard entities main after desktop exit',
    },
  },
  { slug: 'desktop-entity-detail', url: '/?entity=P0005#desktop/entities', archiveDetails: 'forbid' },
  {
    slug: 'desktop-entity-record',
    url: '/?record=RECORD-00903&entity=P0005#desktop/entities',
    archiveDetails: 'require',
    verifyEntityRecordFlow: true,
  },
  {
    slug: 'desktop-dissertation',
    url: '/#desktop/dissertation',
    verifyStandardExit: {
      appId: 'dissertation',
      expectedHash: '#dissertation',
      focusSelector: '[data-route-entry-focus]',
      focusLabel: 'Standard dissertation heading after desktop exit',
    },
  },
  {
    slug: 'desktop-analytics',
    url: '/#desktop/analytics',
    verifyStandardExit: {
      appId: 'analytics',
      expectedHash: '#analytics',
      focusSelector: '[data-route-entry-focus]',
      focusLabel: 'Standard analytics heading after desktop exit',
    },
  },
  { slug: 'desktop-readme',     url: '/#desktop/readme' },
  { slug: 'desktop-tools',      url: '/#desktop/tools', verifyToolRoundTrip: true },
  { slug: 'desktop-record-modal', url: '/?record=RECORD-00802#desktop/archive' },
  { slug: 'desktop-report',     url: '/#desktop', openReport: true },
  {
    slug: 'desktop-windowing',
    url: '/#desktop/analytics',
    desktopLayout: {
      schema: 1,
      windows: [
        { id: 'archive', minimized: false },
        { id: 'entities', minimized: false },
        { id: 'analytics', minimized: false },
      ],
      zOrder: ['archive', 'entities', 'analytics'],
    },
  },
  { slug: 'entities',           url: '/#entities' },
  { slug: 'entity-detail',      url: '/?entity=P0005#entities' },
  {
    slug: 'entity-record',
    url: '/?record=RECORD-00903&entity=P0005#entities',
    verifyEntityRecordFlow: true,
  },
  { slug: 'about',              url: '/#about' },
  { slug: 'analytics',          url: '/#analytics' },
  { slug: 'record-modal',       url: '/?record=RECORD-00802' },
  { slug: 'dissertation-map-detail', url: '/#dissertation', openDissertationDetail: true },
  { slug: 'dissertation',       url: '/dissertation/' },
  { slug: 'dissertation-reader',url: '/dissertation/reader/', verifyReaderReturn: true },
  { slug: 'faq',                url: '/faq/' },
  { slug: 'status-report',      url: '/features/status-report/' },
  { slug: 'winer-method',       url: '/features/winer-method/' },
];

const ALL_VIEWPORTS = [
  { name: 'mobile',  width: 375,  height: 812  },
  { name: 'tablet',  width: 768,  height: 1024 },
  { name: 'desktop', width: 1440, height: 900  },
];
const VIEWPORTS = REQUESTED_VIEWPORT
  ? ALL_VIEWPORTS.filter(({ name }) => name === REQUESTED_VIEWPORT)
  : ALL_VIEWPORTS;

if (REQUESTED_VIEWPORT && VIEWPORTS.length === 0) {
  throw new Error(`Unknown PREVIEW_AUDIT_VIEWPORT "${REQUESTED_VIEWPORT}". Expected mobile, tablet, or desktop.`);
}

async function startServer() {
  const proc = spawn('node', ['scripts/preview-server.js'], {
    env: { ...process.env, PREVIEW_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('preview server did not start in 8s')), 8000);
    // spawn() emits 'error' (not 'exit') when the executable is missing or
    // permission-denied — without this listener the audit would hang until
    // the 8s timeout instead of failing fast with a clear message.
    proc.on('error', (err) => { clearTimeout(t); fail(new Error(`preview server spawn failed: ${err.message}`)); });
    proc.stdout.on('data', (chunk) => {
      if (String(chunk).includes('Preview server')) { clearTimeout(t); ok(); }
    });
    proc.on('exit', (code) => { clearTimeout(t); fail(new Error(`preview server exited early: ${code}`)); });
  });
  return proc;
}

async function assertArchiveRootReturn(page, locator, label) {
  await locator.waitFor({ state: 'visible' });
  const box = await locator.boundingBox();
  if (!box || box.width < 44 || box.height < 44) {
    throw new Error(`${label} target was smaller than 44px: ${JSON.stringify(box)}`);
  }

  const returnUrl = new URL(await locator.getAttribute('href'), page.url());
  const archiveRootUrl = new URL(BASE);
  if (
    returnUrl.origin !== archiveRootUrl.origin
    || returnUrl.pathname !== archiveRootUrl.pathname
    || returnUrl.search
    || returnUrl.hash
  ) {
    throw new Error(`${label} resolved outside the archive root: ${returnUrl}`);
  }
}

async function auditOne(page, route, viewport, setApplicationNetworkCapture = () => {}) {
  const assertFocused = async (locator, label) => {
    await locator.waitFor();
    await page.waitForTimeout(100);
    if (!await locator.evaluate((element) => document.activeElement === element)) {
      throw new Error(`${label} did not own focus`);
    }
  };
  const assertVisibleFocusOutline = async (locator, label) => {
    const focusStyle = await locator.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        focusVisible: element.matches(':focus-visible'),
        style: styles.outlineStyle,
        width: Number.parseFloat(styles.outlineWidth),
        color: styles.outlineColor,
      };
    });
    const transparentColor = focusStyle.color === 'transparent'
      || /rgba\([^)]*,\s*0\s*\)$/.test(focusStyle.color);
    if (
      !focusStyle.focusVisible
      || focusStyle.style === 'none'
      || focusStyle.width < 2
      || transparentColor
    ) {
      throw new Error(`${label} did not expose a visible focus outline: ${JSON.stringify(focusStyle)}`);
    }
  };
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  // Spatial memory is intentionally persistent in production. Keep each audit
  // route deterministic, then opt into one explicit concurrent-window case.
  if (page.url().startsWith(BASE)) {
    await page.evaluate((desktopLayout) => {
      if (desktopLayout) {
        localStorage.setItem('jrda-desktop-layout', JSON.stringify(desktopLayout));
      } else {
        localStorage.removeItem('jrda-desktop-layout');
      }
    }, route.desktopLayout || null);
  }
  const targetUrl = new URL(BASE + route.url);
  if (route.slug === 'archive-desktop' || route.slug.startsWith('desktop-')) {
    // A distinct document navigation remounts DesktopShell so the in-memory
    // layout cannot leak from the previous hash-only route.
    targetUrl.searchParams.set('_audit', `${viewport.name}-${route.slug}`);
  }
  const archiveDetailsRequests = [];
  const captureArchiveDetails = (request) => {
    if (new URL(request.url()).pathname.endsWith('/data/archive-details.json')) {
      archiveDetailsRequests.push(request.url());
    }
  };
  if (route.archiveDetails) page.on('request', captureArchiveDetails);
  try {
    await page.goto(targetUrl.toString(), { waitUntil: 'networkidle', timeout: 30000 });
    // Async React render + lazy-loaded sql.js, plus the intentional 1s details
    // warmup on standard/Archive/Folder surfaces: small extra settle.
    await page.waitForTimeout(1500);
  } finally {
    if (route.archiveDetails) page.off('request', captureArchiveDetails);
  }
  if (route.archiveDetails === 'forbid' && archiveDetailsRequests.length > 0) {
    throw new Error(`${route.slug} unexpectedly loaded archive-details.json`);
  }
  if (route.archiveDetails === 'require' && archiveDetailsRequests.length !== 1) {
    throw new Error(
      `${route.slug} loaded archive-details.json ${archiveDetailsRequests.length} times; expected exactly once`,
    );
  }
  if (route.verifyDesktopEntry) {
    const sourceUrl = page.url();
    const desktopEntry = page.getByRole('button', { name: 'Explore the archive desktop', exact: true });
    await desktopEntry.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL((url) => url.hash === '#desktop');
    const desktopHomeTitle = page.locator('#desktop-window-title-home');
    await assertFocused(desktopHomeTitle, 'Desktop home after Start here entry');
    await assertVisibleFocusOutline(desktopHomeTitle, 'Desktop home after Start here entry');

    await page.goBack({ waitUntil: 'networkidle' });
    if (page.url() !== sourceUrl) {
      throw new Error(`Start here entry Back lost its exact source URL: ${page.url()}`);
    }
    const startHeading = page.locator('#start-here-title');
    await assertFocused(startHeading, 'Start here heading after desktop entry Back');
    await assertVisibleFocusOutline(startHeading, 'Start here heading after desktop entry Back');
  }
  if (route.openReport) {
    const reportDialog = page.getByRole('dialog', { name: 'Report a problem or suggest a record' });
    const reportField = page.getByLabel('What happened?');
    const reportShortcut = page.getByRole('button', { name: /^Report a problem\./ }).first();
    await reportShortcut.click();
    await reportDialog.waitFor();
    await assertFocused(reportField, 'Report field after desktop shortcut launch');
    await page.keyboard.press('Escape');
    await reportDialog.waitFor({ state: 'hidden' });
    await assertFocused(reportShortcut, 'Report shortcut after dialog close');

    const startButton = page.getByRole('button', { name: 'Start', exact: true });
    await startButton.click();
    const startMenu = page.getByRole('menu', { name: 'Archive desktop Start menu' });
    await startMenu.getByRole('menuitem', { name: /^Report a problem/ }).click();
    await reportDialog.waitFor();
    await assertFocused(reportField, 'Report field after Start menu launch');
  }
  if (route.openDissertationDetail) {
    await page.locator('svg[aria-label^="Dissertation mind map"] [role="button"]').first().click();
    await page.getByRole('dialog').waitFor();
    await page.waitForTimeout(100);
  }
  if (route.verifyStartPathRoundTrip) {
    const shortcuts = page.locator('.desktop-shortcut');
    await shortcuts.nth(0).focus();
    await page.keyboard.press('ArrowRight');
    await assertFocused(shortcuts.nth(1), 'Right shortcut in the first desktop row');
    await page.keyboard.press('ArrowRight');
    await assertFocused(shortcuts.nth(1), 'Right edge of the first desktop row');
    await page.keyboard.press('ArrowDown');
    await assertFocused(shortcuts.nth(3), 'Shortcut below Folders');
    await page.keyboard.press('ArrowLeft');
    await assertFocused(shortcuts.nth(2), 'Left shortcut in the second desktop row');
    await page.keyboard.press('ArrowLeft');
    await assertFocused(shortcuts.nth(2), 'Left edge of the second desktop row');
    await page.keyboard.press('End');
    await assertFocused(shortcuts.last(), 'Last desktop shortcut');
    await page.keyboard.press('ArrowDown');
    await assertFocused(shortcuts.last(), 'Bottom edge of the desktop shortcut column');
    await page.keyboard.press('Home');
    await assertFocused(shortcuts.first(), 'First desktop shortcut after Home');

    const startButton = page.getByRole('button', { name: 'Start', exact: true });
    const startMenu = page.getByRole('menu', { name: 'Archive desktop Start menu' });
    await startButton.click();
    await startMenu.waitFor();
    await startMenu.getByRole('menuitem', { name: /^The method/ }).click();
    await page.waitForURL((url) => url.pathname.endsWith('/features/winer-method/'));
    await assertArchiveRootReturn(
      page,
      page.getByRole('link', { name: "Return to Jay Rosen's Internet Archive" }),
      'Method return',
    );

    await page.goBack({ waitUntil: 'networkidle' });
    if (new URL(page.url()).hash !== '#desktop') {
      throw new Error(`Method history return lost its desktop route: ${page.url()}`);
    }
    if (await startMenu.isVisible()) {
      throw new Error('Method history return reopened the Start menu');
    }
    await assertFocused(page.locator('#desktop-window-title-home'), 'Desktop home after method browser Back');

    // In-document navigation unmounts the popup and its invoking menu item.
    // The canonical route-entry fallback must move focus into the destination
    // instead of leaving it on <body>, while Back still reconstructs desktop
    // focus and closed-popup state.
    await startButton.click();
    await startMenu.getByRole('menuitem', { name: /^About/ }).focus();
    await page.keyboard.press('Enter');
    await page.waitForURL((url) => url.hash === '#about');
    const aboutHeading = page.getByRole('heading', { name: 'About this archive', level: 1 });
    await assertFocused(aboutHeading, 'About heading after Start navigation');
    await assertVisibleFocusOutline(aboutHeading, 'About heading after keyboard Start navigation');

    await page.goBack({ waitUntil: 'networkidle' });
    if (new URL(page.url()).hash !== '#desktop') {
      throw new Error(`About history return lost its desktop route: ${page.url()}`);
    }
    if (await startMenu.isVisible()) {
      throw new Error('About history return reopened the Start menu');
    }
    await assertFocused(page.locator('#desktop-window-title-home'), 'Desktop home after about browser Back');

    await startButton.click();
    await startMenu.getByRole('menuitem', { name: /^Participate/ }).click();
    await page.waitForURL((url) => url.pathname.endsWith('/features/participate/'));
    await assertArchiveRootReturn(
      page,
      page.locator('.archive-link'),
      'Participate return',
    );

    await page.goBack({ waitUntil: 'networkidle' });
    if (new URL(page.url()).hash !== '#desktop') {
      throw new Error(`Participate history return lost its desktop route: ${page.url()}`);
    }
    if (await startMenu.isVisible()) {
      throw new Error('Participate history return reopened the Start menu');
    }
    await assertFocused(page.locator('#desktop-window-title-home'), 'Desktop home after participate browser Back');
  }
  if (route.verifyStandardExit) {
    const {
      appId,
      buttonName = 'Open standard view',
      expectedHash,
      focusSelector,
      focusLabel,
    } = route.verifyStandardExit;
    const desktopUrl = page.url();
    const activeWindow = page.locator(`[data-window-id="${appId}"]`);

    const standardExit = activeWindow.getByRole('button', { name: buttonName, exact: true });
    await standardExit.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL((url) => url.hash === expectedHash);
    const standardFocusTarget = page.locator(focusSelector);
    await assertFocused(standardFocusTarget, focusLabel);
    await assertVisibleFocusOutline(standardFocusTarget, focusLabel);

    await page.goBack({ waitUntil: 'networkidle' });
    if (page.url() !== desktopUrl) {
      throw new Error(`${appId} standard-view Back lost its exact desktop URL: ${page.url()}`);
    }
    await assertFocused(
      page.locator(`#desktop-window-title-${appId}`),
      `${appId} window after standard-view browser Back`,
    );
  }
  if (route.verifyDesktopStartMenu) {
    const startButton = page.getByRole('button', { name: 'Start', exact: true });
    const startMenu = page.getByRole('menu', { name: 'Archive desktop Start menu' });

    await startButton.click();
    await startMenu.waitFor();
    const menuItems = startMenu.getByRole('menuitem');
    const menuItemCount = await menuItems.count();
    if (menuItemCount !== 15) {
      throw new Error(`Start menu exposed ${menuItemCount} destinations; expected 15`);
    }
    await assertFocused(menuItems.first(), 'First Start menu destination');
    await page.keyboard.press('ArrowDown');
    await assertFocused(startMenu.getByRole('menuitem', { name: /^Folders/ }), 'Next Start menu destination');
    await page.keyboard.press('End');
    await assertFocused(startMenu.getByRole('menuitem', { name: /^Standard archive/ }), 'Last Start menu destination');
    await page.keyboard.press('Home');
    await assertFocused(menuItems.first(), 'First Start menu destination after Home');
    await page.keyboard.press('Escape');
    await startMenu.waitFor({ state: 'hidden' });
    await assertFocused(startButton, 'Start button after Escape');

    await startButton.click();
    await startMenu.getByRole('menuitem', { name: /^Tools/ }).click();
    const toolsRegion = page.getByRole('region', { name: 'Tools' });
    await toolsRegion.waitFor();
    await startButton.click();
    await startMenu.waitFor();
    await assertFocused(menuItems.first(), 'First Start menu destination after an app launch');
    await page.keyboard.press('ArrowUp');
    await assertFocused(startMenu.getByRole('menuitem', { name: /^Standard archive/ }), 'Wrapped last Start menu destination');
    await page.keyboard.press('ArrowDown');
    await assertFocused(menuItems.first(), 'Wrapped first Start menu destination');
    await page.keyboard.press('Tab');
    await startMenu.waitFor({ state: 'hidden' });
    await assertFocused(startButton, 'Start button after forward Tab');

    await startButton.click();
    await startMenu.waitFor();
    await assertFocused(menuItems.first(), 'First Start menu destination before reverse Tab');
    await page.keyboard.press('Shift+Tab');
    await startMenu.waitFor({ state: 'hidden' });
    await assertFocused(
      toolsRegion.getByRole('link', { name: /^Data visualization\./ }),
      'Previous visible tool after reverse Tab',
    );
    await startButton.click();
    await startMenu.waitFor();
    await assertFocused(menuItems.first(), 'First Start menu destination before accessibility scan');
  }
  if (route.verifyToolRoundTrip) {
    const dissertationLink = page.getByRole('link', { name: /^Dissertation release\./ });
    await dissertationLink.click();
    await page.waitForURL((url) => url.pathname.endsWith('/dissertation/'));

    await assertArchiveRootReturn(
      page,
      page.getByRole('link', { name: "Back to Jay Rosen's Internet Archive" }),
      'Dissertation return',
    );

    await page.goBack({ waitUntil: 'networkidle' });
    const toolsRegion = page.getByRole('region', { name: 'Tools' });
    await toolsRegion.waitFor();
    if (new URL(page.url()).hash !== '#desktop/tools') {
      throw new Error(`Tool history return lost its desktop route: ${page.url()}`);
    }
    const toolLinkCount = await toolsRegion.getByRole('link').count();
    if (toolLinkCount !== 7) {
      throw new Error(`Tool history return exposed ${toolLinkCount} links; expected 7`);
    }
    await assertFocused(page.locator('#desktop-window-title-tools'), 'Tools window after browser Back');
  }
  if (route.verifyReaderReturn) {
    const readerReturn = page.getByTitle('Back to archive');
    await assertArchiveRootReturn(page, readerReturn, 'Reader return');
    const pageOverflow = await page.evaluate(() => (
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    ));
    if (pageOverflow > 1) {
      throw new Error(`Reader overflowed the viewport by ${pageOverflow}px`);
    }
  }

  if (route.slug === 'archive-desktop' || route.slug.startsWith('desktop-')) {
    const desktopOverflow = await page.evaluate(() => (
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    ));
    if (desktopOverflow > 1) {
      throw new Error(`${route.slug} overflowed the viewport by ${desktopOverflow}px`);
    }

    const undersizedTargets = await page.locator('.archive-desktop').evaluate((desktop) => {
      const interactiveSelector = [
        'button',
        'a[href]',
        'input',
        'select',
        'textarea',
        'summary',
        '[role="button"]',
        '[tabindex="0"]',
      ].join(',');
      return [...desktop.querySelectorAll(interactiveSelector)]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const styles = getComputedStyle(element);
          const compactNativeControl = ['checkbox', 'radio', 'range'].includes(element.type);
          return !compactNativeControl
            && !element.closest('[aria-hidden="true"]')
            && styles.display !== 'none'
            && styles.visibility !== 'hidden'
            && rect.width > 0
            && rect.height > 0;
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            name: (element.getAttribute('aria-label')
              || element.getAttribute('title')
              || element.textContent
              || element.tagName)
              .trim()
              .replace(/\s+/g, ' ')
              .slice(0, 80),
            width: Number(rect.width.toFixed(1)),
            height: Number(rect.height.toFixed(1)),
          };
        })
        .filter(({ width, height }) => width < 44 || height < 44);
    });
    if (undersizedTargets.length > 0) {
      throw new Error(
        `${route.slug} exposed undersized desktop targets: ${JSON.stringify(undersizedTargets.slice(0, 10))}`,
      );
    }
  }

  const shotDir = resolve(OUT_DIR, 'screenshots', viewport.name);
  await mkdir(shotDir, { recursive: true });
  // Viewport-only screenshots. Full-page on long content (e.g. the dissertation
  // reader, which is the entire 1986 text) can OOM the chromium process.
  // Viewport is sufficient for visual review of the above-the-fold rendering.
  await page.screenshot({ path: resolve(shotDir, `${route.slug}.png`), fullPage: false, timeout: 15000 });

  // Network health belongs to the application-loading and interaction phase.
  // Pause that capture only while axe is injected: axe preloads CSS imports
  // itself and currently resolves nested imports against the document URL,
  // which can create synthetic requests that the browser never makes while
  // rendering. Resume before the remaining interaction checks below.
  setApplicationNetworkCapture(false);
  let result;
  try {
    const axe = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
    result = await axe.analyze();
  } finally {
    setApplicationNetworkCapture(true);
  }
  if (route.verifyEntityRecordFlow) {
    const dialog = page.getByRole('dialog');
    const dialogClose = page.getByLabel('Close record details');
    await assertFocused(dialogClose, 'Direct record dialog');

    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await assertFocused(page.locator('#entity-detail-title'), 'Selected entity after direct record close');

    const recordOpener = page
      .getByRole('region', { name: 'Records mentioning this entity' })
      .getByRole('button')
      .first();
    await recordOpener.waitFor();
    await recordOpener.click();
    await dialog.waitFor();
    await assertFocused(dialogClose, 'Record dialog opened from entity details');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await assertFocused(recordOpener, 'Entity record opener after ordinary close');
  }
  if (route.openReport) {
    const reportDialog = page.getByRole('dialog', { name: 'Report a problem or suggest a record' });
    await page.keyboard.press('Escape');
    await reportDialog.waitFor({ state: 'hidden' });
    const startButton = page.getByRole('button', { name: 'Start', exact: true });
    await assertFocused(startButton, 'Start button after Start menu report close');
    await assertVisibleFocusOutline(startButton, 'Start button after Start menu report close');
  }
  return {
    route: route.slug,
    url: route.url,
    viewport: viewport.name,
    violations: result.violations.map(v => ({
      id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl,
      nodes: v.nodes.length, sample: v.nodes[0]?.target?.[0] || '',
    })),
    passes: result.passes.length,
    incomplete: result.incomplete.length,
  };
}

async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch (err) {
    const message = [
      'Playwright browser is not installed or cannot be launched.',
      'Run `npx playwright install chromium` and then retry `npm run preview:audit`.',
      `Original error: ${err.message}`,
    ].join('\n');
    throw new Error(message);
  }
}

// HTML-escape every interpolated value in the report. Without this, an axe
// rule id, help URL, sample selector, or surfaced error message containing
// '<', '&', or quotes can break rendering or inject markup. err.message in
// particular originates from runtime exceptions (Playwright timeouts include
// the user-controlled URL) and is the most likely culprit.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

function renderReport(rows) {
  const totalViolations = rows.reduce((s, r) => s + r.violations.length, 0);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Rosen archive — accessibility audit</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ctext y='13' font-size='14'%3E%E2%9C%93%3C/text%3E%3C/svg%3E">
  <style>
    body { font: 14px/1.5 -apple-system, sans-serif; max-width: 1100px; margin: 2rem auto; padding: 0 1rem; color: #1c1917; }
    h1, h2, h3 { font-weight: 600; }
    .summary { background: #f5f5f4; padding: 1rem; border-radius: 6px; margin-bottom: 2rem; }
    .summary .ok { color: #16a34a; } .summary .bad { color: #dc2626; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #e7e5e4; vertical-align: top; font-size: 13px; }
    th { background: #fafaf9; font-weight: 600; }
    .v-critical { color: #dc2626; font-weight: 600; }
    .v-serious  { color: #ea580c; font-weight: 600; }
    .v-moderate { color: #ca8a04; }
    .v-minor    { color: #57534e; }
    .badge { display: inline-block; padding: 1px 6px; border-radius: 10px; font-size: 11px; background: #e7e5e4; }
    .shot-link { font-size: 12px; }
    details { margin: 0.25rem 0; }
    code { background: #f5f5f4; padding: 0 4px; border-radius: 3px; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Rosen archive — accessibility audit</h1>
  <div class="summary">
    <div>Generated: ${new Date().toISOString()}</div>
    <div>Standard: WCAG 2.1 AA (axe-core)</div>
    <div>Routes audited: ${ROUTES.length} &times; ${VIEWPORTS.length} viewports = ${ROUTES.length * VIEWPORTS.length} runs</div>
    <div>Total violations: <span class="${totalViolations === 0 ? 'ok' : 'bad'}">${totalViolations}</span></div>
  </div>

  <table>
    <thead><tr><th>Route</th><th>Viewport</th><th>Violations</th><th>Passes</th><th>Screenshot</th></tr></thead>
    <tbody>
      ${rows.map(r => `<tr>
        <td><code>${esc(r.url)}</code><br><span class="badge">${esc(r.route)}</span></td>
        <td>${esc(r.viewport)}</td>
        <td>${r.violations.length === 0 ? '<span class="v-minor">0</span>' : r.violations.map(v => `
          <details><summary class="v-${esc(v.impact || 'minor')}">${esc(v.impact || 'minor')}: ${esc(v.help)} (${esc(v.nodes)} nodes)</summary>
            <div>Rule: <code>${esc(v.id)}</code> &middot; <a href="${esc(v.helpUrl)}">help</a></div>
            <div>Sample selector: <code>${esc(v.sample)}</code></div>
          </details>`).join('')}</td>
        <td>${esc(r.passes)}</td>
        <td><a class="shot-link" href="screenshots/${encodeURIComponent(r.viewport)}/${encodeURIComponent(r.route)}.png">view</a></td>
      </tr>`).join('')}
    </tbody>
  </table>
</body>
</html>`;
  return html;
}

async function main() {
  const server = await startServer();
  try {
    await rm(OUT_DIR, { recursive: true, force: true });
    await mkdir(OUT_DIR, { recursive: true });

    const browser = await launchBrowser();
    try {
      const context = await browser.newContext();
      const page = await context.newPage();

      const rows = [];
      for (const viewport of VIEWPORTS) {
        for (const route of ROUTES) {
          console.log(`  ${viewport.name.padEnd(8)} ${route.url}`);
          const pageErrors = [];
          const networkErrors = [];
          let captureApplicationNetwork = true;
          const capturePageError = (error) => pageErrors.push(error.message || String(error));
          const captureBadResponse = (response) => {
            if (!captureApplicationNetwork) return;
            const url = new URL(response.url());
            if (url.origin === BASE && response.status() >= 400) {
              networkErrors.push(`${response.status()} ${url.pathname}`);
            }
          };
          const captureFailedRequest = (request) => {
            if (!captureApplicationNetwork) return;
            const url = new URL(request.url());
            if (url.origin === BASE) {
              networkErrors.push(`${request.failure()?.errorText || 'request failed'} ${url.pathname}`);
            }
          };
          page.on('pageerror', capturePageError);
          page.on('response', captureBadResponse);
          page.on('requestfailed', captureFailedRequest);
          try {
            const row = await auditOne(
              page,
              route,
              viewport,
              (enabled) => { captureApplicationNetwork = enabled; },
            );
            if (pageErrors.length > 0) {
              throw new Error(`Unhandled page errors: ${JSON.stringify(pageErrors)}`);
            }
            if (networkErrors.length > 0) {
              throw new Error(`Same-origin network errors: ${JSON.stringify(networkErrors)}`);
            }
            rows.push(row);
          } catch (err) {
            console.error(`  FAILED ${viewport.name} ${route.url}: ${err.message}`);
            rows.push({ route: route.slug, url: route.url, viewport: viewport.name, violations: [{ id: 'audit-error', impact: 'critical', help: err.message, helpUrl: '', nodes: 0, sample: '' }], passes: 0, incomplete: 0 });
          } finally {
            page.off('pageerror', capturePageError);
            page.off('response', captureBadResponse);
            page.off('requestfailed', captureFailedRequest);
          }
        }
      }

      await writeFile(resolve(OUT_DIR, 'axe-report.html'), renderReport(rows));
      await writeFile(resolve(OUT_DIR, 'axe-report.json'), JSON.stringify(rows, null, 2));

      const totalViolations = rows.reduce((s, r) => s + r.violations.length, 0);
      console.log(`\nReport: ${resolve(OUT_DIR, 'axe-report.html')}`);
      console.log(`Total violations: ${totalViolations}`);
      if (totalViolations > 0) process.exitCode = 1;
    } finally {
      await browser.close();
    }
  } finally {
    server.kill();
  }
}

await main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
