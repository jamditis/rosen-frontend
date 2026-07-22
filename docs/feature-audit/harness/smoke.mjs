// Smoke test: can playwright-core drive system chromium against the live site?
import { chromium } from 'playwright-core';

const BASE = process.env.BASE || 'http://localhost:8000';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
// wait for records to load
await page.waitForFunction(() => /\d[\d,]*\s+records?/.test(
  document.querySelector('.archive-results-count')?.textContent || ''
), { timeout: 30000 }).catch(()=>{});
const count = await page.evaluate(() => {
  return document.querySelector('.archive-results-count')?.textContent || 'NONE';
});
console.log('record line:', count);
console.log('console errors:', errors.length, errors.slice(0,5));
await browser.close();
console.log('SMOKE OK');
