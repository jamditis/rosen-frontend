/**
 * Detect duplicate records that represent the same PressThink post captured
 * under two different URL structures (#462).
 *
 * PressThink ran on Movable Type, then WordPress, so the same post can appear as
 * both an archive.pressthink.org Movable Type permalink (a dated path with a
 * trailing "_p.html", e.g. /2006/06/27/ppl_frmr_p.html) and a pressthink.org
 * WordPress URL (the same dated path without the "_p", e.g.
 * /2006/06/27/ppl_frmr.html). The original scrape deduplicated these, but Joe
 * flagged that he isn't confident none slipped through — this is the verification.
 *
 * The detector keys on the host-independent, "_p"-collapsed path so the two forms
 * of one post land on the same key. It is deliberately URL-based, not title-based:
 * a duplicate can carry a garbled title (RECORD-00607's title and summary are
 * confabulated off the slug), so a title+date match would miss it — the shared
 * URL path is the reliable signal.
 *
 * This reports candidate duplicates for a curator to adjudicate. It never deletes
 * or merges records — which copy is canonical is a human decision.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * True when a URL is on the pressthink.org domain or any subdomain of it (the
 * archive.pressthink.org Movable Type host). Rejects lookalikes such as
 * pressthink.org.evil.com by requiring the host to end with ".pressthink.org".
 * Single source of truth for "is PressThink-family" — used by the detector and
 * the runner's reporting so the two cannot drift.
 */
export function isPressthinkUrl(url) {
  if (typeof url !== 'string') return false;
  const m = url.trim().toLowerCase().match(/^https?:\/\/([^/]+)/);
  if (!m) return false;
  const host = m[1].replace(/^www\./, '');
  return host === 'pressthink.org' || host.endsWith('.pressthink.org');
}

/**
 * True for the archive.pressthink.org Movable Type structure specifically (as
 * opposed to the bare pressthink.org WordPress structure). The two structures are
 * the cross-scheme pair #462 verifies; this classifier tells them apart.
 */
export function isArchivePressthinkUrl(url) {
  if (typeof url !== 'string') return false;
  const m = url.trim().toLowerCase().match(/^https?:\/\/([^/]+)/);
  if (!m) return false;
  return m[1].replace(/^www\./, '') === 'archive.pressthink.org';
}

/**
 * True for the WordPress structure specifically: the bare pressthink.org host (the
 * www. variant included). Defined positively rather than as "not archive" so a
 * future, unrelated *.pressthink.org subdomain is not miscounted as the WordPress
 * side of a two-structure pair.
 */
export function isWordpressPressthinkUrl(url) {
  if (typeof url !== 'string') return false;
  const m = url.trim().toLowerCase().match(/^https?:\/\/([^/]+)/);
  if (!m) return false;
  return m[1].replace(/^www\./, '') === 'pressthink.org';
}

/**
 * Normalize a PressThink-family URL to a host-independent comparison key, or
 * return null for any URL not on the pressthink.org domain (including the archive
 * subdomain). Collapses the scheme, host, query/fragment, .html extension,
 * trailing slash, a trailing CSV/markdown ")" artifact, and the Movable Type
 * "_p" permalink suffix — so the archive and WordPress forms of one post match.
 */
export function normalizePressthinkPath(url) {
  if (!isPressthinkUrl(url)) return null;
  const m = url.trim().toLowerCase().match(/^https?:\/\/[^/]+(\/[^?#]*)?/);
  let p = (m[1] || '').replace(/\)+$/, ''); // drop trailing ) artifacts
  p = p.replace(/\/+$/, ''); // strip trailing slash first, so .html/ and the WordPress pretty-permalink /slug/ both normalize
  p = p.replace(/\.html?$/, ''); // strip .html / .htm
  p = p.replace(/^\/+/, ''); // strip leading slash
  p = p.replace(/_p$/, ''); // collapse the Movable Type _p permalink twin
  return p; // may be '' for a bare domain root; caller filters empties
}

/**
 * Group records by normalized PressThink path and return the clusters where two
 * or more DISTINCT record ids collide — the candidate duplicates.
 *
 * @param {Array<{id:string,title?:string,date?:string,url?:string}>} records
 * @returns {Array<{key:string, records:Array}>} clusters, each sorted by id
 */
export function findPressthinkDuplicates(records) {
  const byKey = new Map();
  for (const rec of records) {
    const key = normalizePressthinkPath(rec.url);
    if (!key) continue; // not pressthink-family, or a bare-root URL
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(rec);
  }
  const clusters = [];
  for (const [key, recs] of byKey) {
    const distinctIds = new Set(recs.map((r) => r.id));
    if (distinctIds.size < 2) continue;
    // #462 targets the cross-structure collision specifically: the same post under
    // the archive.pressthink.org Movable Type form AND the pressthink.org WordPress
    // form. A same-structure repeat (two archive URLs, or two pressthink.org URLs)
    // is a different dedup concern (general link-integrity, #345) and is not a
    // two-structure finding, so require the cluster to span both structures.
    const hasArchive = recs.some((r) => isArchivePressthinkUrl(r.url));
    const hasWordpress = recs.some((r) => isWordpressPressthinkUrl(r.url));
    if (!hasArchive || !hasWordpress) continue;
    clusters.push({ key, records: [...recs].sort((a, b) => a.id.localeCompare(b.id)) });
  }
  return clusters.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Stable signature for a cluster: its normalized path AND its distinct record ids.
 * Keying the allowlist on both (not ids alone) means an allowlisted pair that
 * later collides on a DIFFERENT PressThink path is treated as a new finding, not
 * silently waved through — the allowlist pardons one exact collision, not a pair
 * of ids forever.
 */
export function clusterSignature(cluster) {
  const ids = [...new Set(cluster.records.map((r) => r.id))].sort().join('|');
  return `${cluster.key}::${ids}`;
}

/**
 * Curator-reviewed candidate duplicates, keyed by clusterSignature. A cluster in
 * this set is a known pending pair, not a regression — the guard test allows it
 * while still failing on any NEW two-structure collision a future scrape
 * introduces. Resolution (which record to keep) is a curator decision, not here.
 */
export const CURATOR_PENDING_DUPLICATES = new Set([
  // "The People Formerly Known As The Audience" (2006-06-27) captured twice:
  // RECORD-00191 archive.pressthink.org/.../ppl_frmr_p.html (Movable Type) and
  // RECORD-00607 pressthink.org/.../ppl_frmr.html (WordPress). RECORD-00607's
  // title ("People Former & Latter") and summary are confabulated off the slug.
  // Pending curator decision to keep RECORD-00191 — see #469.
  '2006/06/27/ppl_frmr::RECORD-00191|RECORD-00607',
]);

/**
 * Load the published archive records (id, title, date, url) from the committed
 * JSON artifacts, joining archive-core.json (title/date) with archive-details.json
 * (url). Dependency-free on purpose: the check runs locally and in CI without the
 * CSV parser, and it verifies the data the site actually ships.
 */
export function loadPublishedRecords(dataDir) {
  const core = JSON.parse(fs.readFileSync(path.join(dataDir, 'archive-core.json'), 'utf8')).records;
  const details = JSON.parse(fs.readFileSync(path.join(dataDir, 'archive-details.json'), 'utf8')).details;
  return core
    .filter((r) => /^RECORD-/.test(r.id))
    .map((r) => {
      // Every published RECORD-* must carry a details entry with a url. Defaulting
      // a missing one to '' would silently drop that record from duplicate
      // detection (it would read as "not a PressThink URL") and the guard would
      // still pass — so fail loudly on the integrity break instead.
      const detail = details[r.id];
      if (!detail) throw new Error(`archive-details.json has no entry for ${r.id}`);
      if (!detail.url || !String(detail.url).trim()) throw new Error(`archive-details.json has no url for ${r.id}`);
      return { id: r.id, title: r.title || '', date: r.date || '', url: detail.url };
    });
}

export default { isPressthinkUrl, isArchivePressthinkUrl, isWordpressPressthinkUrl, normalizePressthinkPath, findPressthinkDuplicates, clusterSignature, loadPublishedRecords, CURATOR_PENDING_DUPLICATES };
