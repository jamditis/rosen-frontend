// Shared helpers for the feature-audit Playwright test harness.
// Uses system chromium via playwright-core (no bundled browser download).
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const BASE = process.env.BASE || 'http://localhost:8000';
export const CHROMIUM = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
const here = dirname(fileURLToPath(import.meta.url));
const auditDir = join(here, '..');

export async function launchBrowser() {
  return chromium.launch({ executablePath: CHROMIUM, headless: true, args: ['--no-sandbox'] });
}

// New page with console-error + pageerror capture. Returns { page, errors }.
// errors is a live array; snapshot it after each navigation/interaction.
export async function newPage(browser, viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + (e && e.message || e)));
  page.on('requestfailed', r => {
    const u = r.url();
    // ignore the known-uncached cross-origin esm.sh import map noise only if it actually loaded;
    // record genuine local 404s.
    errors.push('REQFAIL: ' + u + ' (' + (r.failure()?.errorText || '') + ')');
  });
  return { page, errors };
}

// Wait until the active archive route has rendered its own ready signal or
// failed loudly. Do not swallow the timeout: an audit that runs against an
// unready page cannot produce a trustworthy verdict.
export async function waitForArchiveReady(page, timeout = 45000) {
  await page.waitForFunction(
    () => {
      if (window.location.hash === '#entities') {
        return document.querySelector('#entity-search')
          || [...document.querySelectorAll('[role="alert"]')]
            .some(alert => /Unable to load people and ideas/.test(alert.textContent || ''));
      }

      const count = document.querySelector('.archive-results-count')?.textContent || '';
      return /[\d,]+\s+records?/.test(count) || document.querySelector('.archive-error-state');
    },
    { timeout },
  );
}

// Navigate and wait for the selected archive route to finish loading.
export async function gotoArchive(page, hashOrQuery = '') {
  await page.goto(BASE + '/index.html' + hashOrQuery, { waitUntil: 'domcontentloaded' });
  await waitForArchiveReady(page);
}

// Inject the React-controlled-input setter helper into the page context.
export const SET_NATIVE_VALUE = `function setNativeValue(el, value){
  const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
  desc.set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}`;

export const sleep = ms => new Promise(r => setTimeout(r, ms));

// Load the catalog stories for one or more id prefixes (e.g. ['MAIN','MODAL']).
export function loadStories(prefixes) {
  const master = JSON.parse(readFileSync(join(auditDir, 'feature-stories.json'), 'utf8'));
  const set = new Set(prefixes);
  return master.filter(r => set.has(r.id.split('-')[0]));
}

// Write a verdicts file: { "MAIN-01": {test_status, errors_found, severity, notes}, ... }
export function writeVerdicts(name, verdicts) {
  const path = join(auditDir, `verdicts-${name}.json`);
  writeFileSync(path, JSON.stringify(verdicts, null, 2) + '\n');
  return path;
}

// Verdict helper.
export function verdict(test_status, errors_found = '', severity = '', notes = '') {
  return { test_status, errors_found, severity, notes };
}
