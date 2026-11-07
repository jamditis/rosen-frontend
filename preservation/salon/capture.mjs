import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Install SingleFile separately; do not alter the application's dependencies.
const singleFileRoot = process.env.SINGLE_FILE_ROOT;
if (!singleFileRoot) throw new Error('Set SINGLE_FILE_ROOT to single-file-cli@2.25.0 package directory');
const version = JSON.parse(await readFile(path.join(singleFileRoot, 'package.json'))).version;
if (version !== '2.25.0') throw new Error('Expected single-file-cli@2.25.0');
const { script } = await import(pathToFileURL(path.join(singleFileRoot, 'lib/single-file-bundle.js')));
const { getDefaultOptions } = await import(pathToFileURL(path.join(singleFileRoot, 'options.js')));
const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(process.argv[2] || path.join(root, 'captures'));
await mkdir(output, { recursive: true });
if ((await readdir(output)).length) throw new Error('Capture output must be empty; choose a new directory to preserve existing copies');
const sources = JSON.parse(await readFile(process.argv[3] || path.join(root, 'sources.json')));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
  args: ['--no-sandbox'] });
const results = [];
const normalize = s => s.normalize('NFKC').replace(/\s+/g, ' ').trim();
const sha256 = s => createHash('sha256').update(s).digest('hex');
const escape = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
try {
  for (const source of sources) {
    const slug = new URL(source.url).pathname.split('/').filter(Boolean).join('-');
    const result = { ...source, capturedAt: new Date().toISOString(), files: [] };
    const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
    // Keep publisher scripts from replacing quoted tweet text with live embeds.
    // Styles and images still load; the untouched source response is retained.
    await context.route('**/*', route => route.request().resourceType() === 'script' ? route.abort() : route.continue());
    const page = await context.newPage();
    try {
      console.log('Capturing', source.url);
      const response = await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      result.httpStatus = response.status(); result.finalUrl = page.url();
      if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
      const raw = await response.body();
      await page.locator('article .article__content').first().waitFor();
      await page.waitForTimeout(2500);
      const article = await page.evaluate(() => {
        const article = document.querySelector('article');
        const body = article.querySelector('.article__content');
        return { title: article.querySelector('h1').innerText,
          author: document.querySelector('meta[property="article:author"]')?.content || '',
          publishedAt: document.querySelector('meta[property="article:published_time"]')?.content || '',
          text: body.innerText, paragraphs: [...body.querySelectorAll('p')].map(p => p.innerText).filter(s => s.trim()) };
      });
      if (article.text.length < 1000 || !article.paragraphs.length) throw new Error('Missing or short article body');
      Object.assign(result, { title: article.title, author: article.author, publishedAt: article.publishedAt,
        articleTextSha256: sha256(normalize(article.text)), articleCharacters: article.text.length,
        paragraphCount: article.paragraphs.length });
      await page.addScriptTag({ content: script });
      const saved = await page.evaluate(async opts => (await singlefile.getPageData(opts)).content,
        { ...getDefaultOptions(), url: source.url, removeScripts: true, blockVideos: true, blockAudios: true,
          loadDeferredImages: true, loadDeferredImagesMaxIdleTime: 1500, maxResourceSizeEnabled: true, maxResourceSize: 10,
          insertSingleFileComment: true });
      async function save(suffix, data, mediaType) {
        const filename = `${slug}.${suffix}`; await writeFile(path.join(output, filename), data);
        result.files.push({ path: filename, mediaType, bytes: Buffer.byteLength(data), sha256: sha256(data) });
      }
      await save('source.html', raw, 'text/html');
      await save('html', saved, 'text/html');
      await save('txt', article.text, 'text/plain');
      // Load the retained HTML with network disconnected and compare every paragraph.
      const offline = await browser.newContext({ offline: true });
      const view = await offline.newPage();
      const requests = []; view.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
      await view.setContent(await readFile(path.join(output, `${slug}.html`), 'utf8'), { waitUntil: 'load' });
      const retained = normalize(await view.locator('article .article__content').first().innerText());
      const missing = article.paragraphs.filter(p => !retained.includes(normalize(p)));
      if (missing.length) throw new Error(`Offline HTML missing ${missing.length} paragraphs`);
      result.offlineHtml = { verified: true, paragraphsMatched: article.paragraphs.length, externalRequests: requests };
      await offline.close();
      // A labeled text-preservation derivative gives reliable readable PDF pagination.
      const printable = await context.newPage();
      await printable.setContent(`<!doctype html><meta charset="utf-8"><title>${escape(article.title)}</title>
        <style>body{font:12pt Georgia,serif;line-height:1.5;color:#111}h1{font-size:24pt}p{orphans:3;widows:3}.provenance{font:9pt sans-serif;overflow-wrap:anywhere;border-bottom:1px solid #888;padding-bottom:12pt}</style>
        <h1>${escape(article.title)}</h1><p>${escape(article.author)} · ${escape(article.publishedAt)}</p>
        <p class="provenance">Salon article text preservation copy. Source: ${escape(source.url)}<br>Retrieved: ${result.capturedAt}. Original page appearance is retained separately in the SingleFile HTML. Embedded audio/video is not included.</p>
        ${article.text.split(/\n\s*\n/).map(p => `<p>${escape(p).replaceAll('\n','<br>')}</p>`).join('\n')}`);
      const pdf = await printable.pdf({ format: 'A4', printBackground: true, margin: { top:'18mm',bottom:'18mm',left:'18mm',right:'18mm' } });
      await save('pdf', pdf, 'application/pdf');
      const pdfText = normalize(execFileSync('pdftotext', ['-layout', path.join(output, `${slug}.pdf`), '-'], { encoding:'utf8' }));
      // Ignore whitespace only: PDF layout can wrap immediately after a hyphen.
      const pdfCharacters = pdfText.replace(/\s/g, '');
      const pdfMissing = article.text.split(/\n/).filter(p => p.trim() && !pdfCharacters.includes(normalize(p).replace(/\s/g, '')));
      if (pdfMissing.length) throw new Error(`PDF text missing ${pdfMissing.length} paragraphs`);
      result.pdf = { verified: true, allSourceLinesMatched: true, kind: 'article-text-derivative' };
      result.status = 'verified';
      console.log('Verified', article.author, article.paragraphs.length, 'paragraphs');
    } catch (error) { result.status = 'failed'; result.error = error.message; console.error(result.error); }
    finally { await context.close(); }
    results.push(result);
    await writeFile(path.join(output, 'capture-report.json'), JSON.stringify({ tool: `SingleFile CLI ${version} core with Playwright`, sourceCommit: execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), results }, null, 2) + '\n');
  }
} finally { await browser.close(); }
if (results.some(r => r.status !== 'verified')) process.exitCode = 1;
