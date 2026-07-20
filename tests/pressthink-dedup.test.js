/**
 * Two-structure PressThink dedup verification (#462)
 *
 * PressThink moved Movable Type -> WordPress, so one post can appear under both an
 * archive.pressthink.org "_p.html" permalink and a pressthink.org ".html" URL.
 * These tests pin the normalizer + collision detector that catch such pairs, and
 * a data guard that fails if a NEW two-structure collision (one not yet reviewed
 * by a curator) appears in the published archive.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isPressthinkUrl,
  isWordpressPressthinkUrl,
  normalizePressthinkPath,
  findPressthinkDuplicates,
  clusterSignature,
  loadPublishedRecords,
  CURATOR_PENDING_DUPLICATES,
} from '../data/lib/pressthink-dedup.js';

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

describe('isPressthinkUrl — identifies the domain and its archive subdomain', () => {
  it('matches the bare domain and the archive subdomain, rejects lookalikes', () => {
    assert.equal(isPressthinkUrl('https://pressthink.org/2006/06/27/ppl_frmr.html'), true);
    assert.equal(isPressthinkUrl('http://archive.pressthink.org/2006/06/27/ppl_frmr_p.html'), true);
    assert.equal(isPressthinkUrl('https://www.pressthink.org/x'), true);
    assert.equal(isPressthinkUrl('https://pressthink.org.evil.com/x'), false);
    assert.equal(isPressthinkUrl('https://huffingtonpost.com/x'), false);
    assert.equal(isPressthinkUrl(undefined), false);
  });
});

describe('normalizePressthinkPath — collapses the two URL structures to one key', () => {
  it('maps the Movable Type _p.html form and the WordPress .html form to the same key', () => {
    const mt = normalizePressthinkPath('http://archive.pressthink.org/2006/06/27/ppl_frmr_p.html');
    const wp = normalizePressthinkPath('https://pressthink.org/2006/06/27/ppl_frmr.html');
    assert.equal(mt, '2006/06/27/ppl_frmr');
    assert.equal(wp, '2006/06/27/ppl_frmr');
    assert.equal(mt, wp);
  });

  it('is host-, scheme-, www-, query-, fragment-, and trailing-slash-insensitive', () => {
    const base = normalizePressthinkPath('https://pressthink.org/2005/01/15/abc.html');
    assert.equal(normalizePressthinkPath('http://www.pressthink.org/2005/01/15/abc.html/'), base);
    assert.equal(normalizePressthinkPath('https://pressthink.org/2005/01/15/abc.html?utm=x#frag'), base);
    assert.equal(normalizePressthinkPath('https://archive.pressthink.org/2005/01/15/abc_p.html'), base);
  });

  it('strips a trailing ")" capture artifact', () => {
    assert.equal(
      normalizePressthinkPath('https://archive.pressthink.org/2004/06/20/what_i_plan_to_p.html)'),
      '2004/06/20/what_i_plan_to',
    );
  });

  it('returns null for non-PressThink hosts and lookalike domains', () => {
    assert.equal(normalizePressthinkPath('https://huffingtonpost.com/2008/03/18/obama.html'), null);
    assert.equal(normalizePressthinkPath('https://npr.org/x'), null);
    assert.equal(normalizePressthinkPath('https://pressthink.org.evil.com/2006/06/27/ppl_frmr.html'), null);
    assert.equal(normalizePressthinkPath(''), null);
    assert.equal(normalizePressthinkPath(undefined), null);
  });

  it('does not collapse two genuinely different slugs', () => {
    assert.notEqual(
      normalizePressthinkPath('https://pressthink.org/2006/06/27/ppl_frmr.html'),
      normalizePressthinkPath('https://pressthink.org/2006/06/27/other_post.html'),
    );
  });
});

describe('findPressthinkDuplicates — flags cross-structure collisions, ignores singletons', () => {
  it('clusters two distinct ids that share a normalized path', () => {
    const clusters = findPressthinkDuplicates([
      { id: 'RECORD-1', title: 'A', date: '2006-06-27', url: 'http://archive.pressthink.org/2006/06/27/ppl_frmr_p.html' },
      { id: 'RECORD-2', title: 'B', date: '2006-06-27', url: 'https://pressthink.org/2006/06/27/ppl_frmr.html' },
      { id: 'RECORD-3', title: 'C', date: '2007-01-01', url: 'https://pressthink.org/2007/01/01/unrelated.html' },
    ]);
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].key, '2006/06/27/ppl_frmr');
    assert.deepEqual(clusters[0].records.map((r) => r.id), ['RECORD-1', 'RECORD-2']);
  });

  it('catches a duplicate even when the titles diverge (garbled-metadata case)', () => {
    // The real RECORD-00607 carries a confabulated title; a title+date detector
    // would miss it, so the URL-path detector must not depend on titles matching.
    const clusters = findPressthinkDuplicates([
      { id: 'RECORD-1', title: 'The People Formerly Known As The Audience', date: '2006-06-27', url: 'http://archive.pressthink.org/2006/06/27/ppl_frmr_p.html' },
      { id: 'RECORD-2', title: 'People Former & Latter', date: '2006-06-27', url: 'https://pressthink.org/2006/06/27/ppl_frmr.html' },
    ]);
    assert.equal(clusters.length, 1);
  });

  it('does not cluster a single record or non-PressThink URLs', () => {
    assert.equal(findPressthinkDuplicates([
      { id: 'RECORD-1', url: 'https://pressthink.org/2006/06/27/ppl_frmr.html' },
    ]).length, 0);
    assert.equal(findPressthinkDuplicates([
      { id: 'RECORD-1', url: 'https://npr.org/a' },
      { id: 'RECORD-2', url: 'https://npr.org/a' },
    ]).length, 0);
  });

  it('does not report a same-structure repeat — only the cross-structure pair #462 targets', () => {
    // Two pressthink.org (WordPress) records on one path, or two archive
    // (Movable Type) records on one path, are a different dedup concern (#345),
    // not the two-structure collision; the cluster must span both structures.
    assert.equal(findPressthinkDuplicates([
      { id: 'RECORD-1', url: 'https://pressthink.org/2006/06/27/ppl_frmr.html' },
      { id: 'RECORD-2', url: 'https://pressthink.org/2006/06/27/ppl_frmr.html' },
    ]).length, 0);
    assert.equal(findPressthinkDuplicates([
      { id: 'RECORD-1', url: 'http://archive.pressthink.org/2006/06/27/ppl_frmr_p.html' },
      { id: 'RECORD-2', url: 'http://archive.pressthink.org/2006/06/27/ppl_frmr.html' },
    ]).length, 0);
    // ...but the genuine archive + WordPress pair is still reported.
    assert.equal(findPressthinkDuplicates([
      { id: 'RECORD-1', url: 'http://archive.pressthink.org/2006/06/27/ppl_frmr_p.html' },
      { id: 'RECORD-2', url: 'https://pressthink.org/2006/06/27/ppl_frmr.html' },
    ]).length, 1);
  });

  it('archive paired with an unrelated *.pressthink.org subdomain is not a two-structure finding', () => {
    // The WordPress side is bare pressthink.org specifically; some other
    // subdomain is not the WordPress structure, so the pair is not reported.
    assert.equal(findPressthinkDuplicates([
      { id: 'RECORD-1', url: 'http://archive.pressthink.org/2006/06/27/ppl_frmr_p.html' },
      { id: 'RECORD-2', url: 'https://cdn.pressthink.org/2006/06/27/ppl_frmr.html' },
    ]).length, 0);
  });
});

describe('isWordpressPressthinkUrl — the bare-domain (WordPress) structure', () => {
  it('matches bare pressthink.org only, not the archive or other subdomains', () => {
    assert.equal(isWordpressPressthinkUrl('https://pressthink.org/x'), true);
    assert.equal(isWordpressPressthinkUrl('https://www.pressthink.org/x'), true);
    assert.equal(isWordpressPressthinkUrl('http://archive.pressthink.org/x'), false);
    assert.equal(isWordpressPressthinkUrl('https://cdn.pressthink.org/x'), false);
    assert.equal(isWordpressPressthinkUrl('https://huffingtonpost.com/x'), false);
  });
});

describe('published archive — no NEW (unreviewed) two-structure collisions', () => {
  // The guard: any collision must be a known, curator-reviewed pair (allowlisted
  // in CURATOR_PENDING_DUPLICATES). A new one means a future scrape re-introduced
  // the two-structure dedup bug, and this fails loudly so it gets caught.
  const records = loadPublishedRecords(dataDir);
  const clusters = findPressthinkDuplicates(records);

  it('every detected collision is in the curator-reviewed allowlist', () => {
    const unreviewed = clusters
      .filter((c) => !CURATOR_PENDING_DUPLICATES.has(clusterSignature(c)))
      .map((c) => `${c.key} -> ${clusterSignature(c)}`);
    assert.deepEqual(
      unreviewed,
      [],
      `New two-structure collision(s) need curator review (add to CURATOR_PENDING_DUPLICATES once triaged):\n${unreviewed.join('\n')}`,
    );
  });

  it('the allowlisted curator-pending pair is still present (so the allowlist is not stale)', () => {
    // If a curator merges the pair, this turns red as a reminder to drop the
    // allowlist entry — the allowlist should never outlive the duplicate.
    const present = new Set(clusters.map(clusterSignature));
    for (const allowed of CURATOR_PENDING_DUPLICATES) {
      assert.ok(
        present.has(allowed),
        `Allowlisted signature ${allowed} no longer collides — remove it from CURATOR_PENDING_DUPLICATES.`,
      );
    }
  });
});

describe('clusterSignature — allowlist key binds ids to the path', () => {
  it('changes when the same id-pair collides on a different path (so a moved collision is not waved through)', () => {
    const atOldPath = { key: '2006/06/27/ppl_frmr', records: [{ id: 'RECORD-00191' }, { id: 'RECORD-00607' }] };
    const atNewPath = { key: '2009/01/01/something_else', records: [{ id: 'RECORD-00191' }, { id: 'RECORD-00607' }] };
    assert.notEqual(clusterSignature(atOldPath), clusterSignature(atNewPath));
    assert.equal(clusterSignature(atOldPath), '2006/06/27/ppl_frmr::RECORD-00191|RECORD-00607');
    assert.ok(!CURATOR_PENDING_DUPLICATES.has(clusterSignature(atOldPath)));
    assert.ok(!CURATOR_PENDING_DUPLICATES.has(clusterSignature(atNewPath)));
  });
});
