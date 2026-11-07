import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parse } from 'csv-parse/sync';
const root = path.dirname(fileURLToPath(import.meta.url));
const captures = path.resolve(process.argv[2] || path.join(root, 'captures'));
const report = JSON.parse(await readFile(path.join(captures, 'capture-report.json')));
const normalize = s => s.normalize('NFKC').replace(/\s+/g, ' ').trim();
const chars = s => normalize(s).replace(/\s/g, '');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args:['--no-sandbox'] });
let failed = false;
const sources = JSON.parse(await readFile(path.join(root, 'sources.json')));
const rows = parse(await readFile(path.join(root, '../../data/archive_records-public.csv'), 'utf8'), { columns: true, skip_empty_lines: true, relax_column_count: true });
const required = rows.filter(r => { try { return /^(www\.)?salon\.com$/.test(new URL(r.url).hostname); } catch { return false; } });
for (const row of required) {
 if (!report.results.some(r => r.url === row.url && r.recordIds.includes(row.id))) throw new Error(`Uncovered archive record: ${row.id}`);
}
if (sources.length !== report.results.length || sources.some(s => !report.results.some(r => r.url === s.url))) throw new Error('Capture report does not cover source inventory');
if (new Set(report.results.map(r => r.url)).size !== report.results.length) throw new Error('Duplicate capture URL');
const discovery = JSON.parse(await readFile(path.join(root, 'discovery-evidence.json')));
for (const evidence of discovery.evidence) {
 const bytes = await readFile(path.join(root, evidence.path));
 if (bytes.length !== evidence.bytes || createHash('sha256').update(bytes).digest('hex') !== evidence.sha256) throw new Error(`Discovery evidence checksum mismatch: ${evidence.path}`);
 for (const url of evidence.listedArticleUrls || []) {
  if (!report.results.some(r => r.url === url && r.author === 'Jay Rosen')) throw new Error(`Uncovered publisher author listing: ${url}`);
 }
}
console.log(`Coverage: ${required.length} curated Salon records; ${sources.length} total sources; all publisher author-listing entries`);
try {
 for (const result of report.results) {
  const errors = [];
  if (result.status !== 'verified') errors.push(`Capture status: ${result.status}`);
  for (const f of result.files) {
   const bytes = await readFile(path.join(captures, f.path));
   if (bytes.length !== f.bytes || createHash('sha256').update(bytes).digest('hex') !== f.sha256) errors.push(`Checksum mismatch: ${f.path}`);
  }
  const htmlFile = result.files.find(f => f.path.endsWith('.html') && !f.path.endsWith('.source.html'));
  const textFile = result.files.find(f => f.path.endsWith('.txt'));
  const pdfFile = result.files.find(f => f.path.endsWith('.pdf'));
  if (!htmlFile || !textFile || !pdfFile) errors.push('Missing required format');
  if (htmlFile && textFile) {
   const context = await browser.newContext({offline:true}); const page = await context.newPage();
   const requests = []; page.on('request',r => {if (/^https?:/.test(r.url())) requests.push(r.url());});
   await page.setContent(await readFile(path.join(captures,htmlFile.path),'utf8'),{waitUntil:'load'});
   const text = await readFile(path.join(captures,textFile.path),'utf8');
   const body = await page.locator('article .article__content').first().innerText();
   if (createHash('sha256').update(normalize(body)).digest('hex') !== result.articleTextSha256) errors.push('Offline HTML body differs from captured source text');
   const missing = text.split('\n').filter(l=>l.trim()&&!normalize(body).includes(normalize(l)));
   if(missing.length) errors.push(`HTML missing lines: ${JSON.stringify(missing)}`);
   if(requests.length) errors.push(`HTML external requests: ${requests.length}`);
   if(pdfFile){
    const pdf = execFileSync('pdftotext',['-layout',path.join(captures,pdfFile.path),'-'],{encoding:'utf8'});
    const absent=text.split('\n').filter(l=>l.trim()&&!chars(pdf).includes(chars(l)));
    if(absent.length) errors.push(`PDF missing lines: ${JSON.stringify(absent)}`);
   }
   await context.close();
  }
  console.log(result.url, errors.length ? 'FAILED' : 'OK');
  for(const error of errors) console.log(error);
  if(errors.length) failed=true;
 }
}finally{await browser.close();}
if(failed)process.exitCode=1;
