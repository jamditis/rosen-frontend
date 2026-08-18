/**
 * Dissertation PDF deployment guard (issue #609).
 *
 * The reader linked to a PDF that existed only as an archived Git LFS object.
 * A clean full-site checkout therefore shipped the reader without its download,
 * leaving both "Download PDF" links as production 404s. Keep the reader links,
 * materialized asset, LFS tracking, and deploy checkout aligned.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const PDF_REL = 'dissertation/reader/THE_IMPOSSIBLE_PRESS_NYU_ROSEN-JAY-1986.pdf';
const PDF_SHA256 = '512b58019e388ef544662c9c8062b08b4bcbb7fe3f9a2c2f3318cdbb9838c2bd';
const PDF_SIZE = 18500765;
const SITE_ROOT = new URL('https://pressthink.org/j/rosen-archive/');
const READER_URL = new URL('dissertation/reader/', SITE_ROOT);

function downloadHrefs(html) {
  return [...html.matchAll(/<a\b[^>]*>/gi)]
    .map(([tag]) => tag)
    .filter((tag) => /\sdownload(?:\s|=|>)/i.test(tag))
    .map((tag) => tag.match(/\shref\s*=\s*(["'])(.*?)\1/i)?.[2])
    .filter((href) => href?.toLowerCase().endsWith('.pdf'));
}

function repoPathForSiteUrl(href) {
  const url = new URL(href, READER_URL);
  assert.equal(url.origin, SITE_ROOT.origin, `PDF download must stay on ${SITE_ROOT.origin}`);
  assert.ok(
    url.pathname.startsWith(SITE_ROOT.pathname),
    `PDF download must stay below ${SITE_ROOT.pathname}`,
  );
  return decodeURIComponent(url.pathname.slice(SITE_ROOT.pathname.length));
}

describe('dissertation reader PDF deployment (issue #609)', () => {
  it('ships the exact dissertation PDF referenced by every download link', () => {
    const reader = fs.readFileSync(path.join(rootDir, 'dissertation/reader/index.html'), 'utf8');
    const hrefs = downloadHrefs(reader);
    assert.ok(hrefs.length > 0, 'reader must retain at least one PDF download link');

    const targets = [...new Set(hrefs.map(repoPathForSiteUrl))];
    assert.deepStrictEqual(targets, [PDF_REL]);

    const pdf = path.join(rootDir, PDF_REL);
    assert.ok(fs.existsSync(pdf), `${PDF_REL} must exist in a clean checkout`);
    const bytes = fs.readFileSync(pdf);
    if (bytes.subarray(0, 5).toString('ascii') === '%PDF-') {
      assert.equal(bytes.length, PDF_SIZE);
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), PDF_SHA256,
        `${PDF_REL} must match the curated dissertation source PDF`);
    } else {
      assert.equal(
        bytes.toString('utf8'),
        'version https://git-lfs.github.com/spec/v1\n' +
          `oid sha256:${PDF_SHA256}\n` +
          `size ${PDF_SIZE}\n`,
        `${PDF_REL} must be either the curated PDF or its exact Git LFS pointer`,
      );
    }
  });

  it('tracks the reader PDF through Git LFS', () => {
    const attr = execFileSync(
      'git', ['check-attr', 'filter', '--', PDF_REL],
      { cwd: rootDir, encoding: 'utf8' },
    );
    assert.match(attr, /:\s*filter:\s*lfs\s*$/,
      `${PDF_REL} must use the lfs filter so the 18.5 MB binary does not enter Git history`);
  });

  it('materializes LFS assets in the full-site deploy checkout', () => {
    const workflow = fs.readFileSync(
      path.join(rootDir, '.github/workflows/deploy.yml'), 'utf8');
    const checkout = workflow.match(
      /- name: Checkout main[\s\S]*?(?=\n\s+- name:|$)/,
    )?.[0];
    assert.ok(checkout, 'deploy workflow must have a named main checkout step');
    const deployIndex = workflow.indexOf('- name: Deploy');
    const lfsPullIndex = workflow.search(/^\s+git lfs pull\s*$/m);
    assert.ok(lfsPullIndex !== -1, 'deploy must materialize current-tree LFS objects');
    assert.ok(
      deployIndex !== -1 && lfsPullIndex < deployIndex,
      'current-tree LFS objects must exist before collect_local_files runs',
    );
  });

  it('includes the reader PDF in the full-site upload inventory', () => {
    const checkInventory = [
      'import importlib.util, pathlib, sys',
      'root = pathlib.Path(sys.argv[1])',
      "spec = importlib.util.spec_from_file_location('deploy_full_site', root / 'backend/scripts/deploy_full_site.py')",
      'module = importlib.util.module_from_spec(spec)',
      'spec.loader.exec_module(module)',
      'files = {path.relative_to(root).as_posix() for path in module.collect_local_files(root)}',
      'raise SystemExit(0 if sys.argv[2] in files else 1)',
    ].join('\n');
    assert.doesNotThrow(() => execFileSync(
      'python3', ['-c', checkInventory, rootDir, PDF_REL],
      { cwd: rootDir, stdio: 'pipe' },
    ), `${PDF_REL} must be collected by the production deploy manifest`);
  });
});
