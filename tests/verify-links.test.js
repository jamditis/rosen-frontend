/**
 * Unit tests for the pre-launch link-integrity sweep (scripts/verify-links.js,
 * issue #345). These exercise the offline detection logic against a synthetic
 * fixture only (no network, no real dataset), so they stay deterministic and
 * do not flag the live data's known drift.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isWellFormedHttpUrl,
  isValidRecordUrl,
  checkInternalLinks,
  checkUrlWellFormedness,
  collectUrlRecords,
  buildUrlSourceMap,
  collectFeaturedUrls,
  checkFeaturedUrlWellFormedness,
  checkExternalLiveness,
  runExternalLivenessSweep,
  parseArgs
} from '../scripts/verify-links.js';
import { loadState } from '../scripts/lib/link-check-state.js';

const fixture = {
  version: 'test',
  records: [
    { id: 'RECORD-1', url: 'https://example.com/a', relatedIds: ['P0001'] },
    { id: 'RECORD-2', url: 'http://example.com/b', relatedIds: ['P0001', 'P9999'] }, // P9999 dangles
    { id: 'RECORD-3', url: 'mailto:x@example.com' }, // malformed: not http(s) and not site-local
    { id: 'RECORD-4', url: '/j/rosen-archive/dissertation/reader/' }, // valid site-local route
    { id: 'RECORD-5', url: 'https://example.com/e', relatedIds: ['RECORD-1'] } // RECORD-1 is a record id, not an entity
  ],
  entities: [
    { id: 'P0001', firstMentionRecordId: 'RECORD-1' },
    { id: 'P0002', firstMentionRecordId: 'RECORD-404' }, // record id in neither set
    { id: 'P0003', firstMentionRecordId: 'P0001' } // P0001 is an entity id, not a record
  ]
};
const aux = {
  recordEntityMap: {
    'RECORD-1': ['P0001'],
    'RECORD-404': ['P0001'], // dangling key
    'RECORD-2': ['P0001', 'P9999'] // P9999 dangling value
  }
};

describe('isWellFormedHttpUrl', () => {
  it('accepts absolute http and https urls', () => {
    assert.ok(isWellFormedHttpUrl('https://example.com/x'));
    assert.ok(isWellFormedHttpUrl('http://example.com'));
  });
  it('rejects relative paths, empty, non-http schemes', () => {
    assert.ok(!isWellFormedHttpUrl('/relative/path'));
    assert.ok(!isWellFormedHttpUrl(''));
    assert.ok(!isWellFormedHttpUrl(null));
    assert.ok(!isWellFormedHttpUrl('mailto:x@example.com'));
    assert.ok(!isWellFormedHttpUrl('ftp://example.com'));
  });
});

describe('isValidRecordUrl', () => {
  it('accepts absolute http(s) and site-local routes', () => {
    assert.ok(isValidRecordUrl('https://example.com/x'));
    assert.ok(isValidRecordUrl('/j/rosen-archive/dissertation/reader/'));
  });
  it('rejects empty, bare slash, and non-http non-relative values', () => {
    assert.ok(!isValidRecordUrl(''));
    assert.ok(!isValidRecordUrl('/'));
    assert.ok(!isValidRecordUrl('mailto:x@example.com'));
    assert.ok(!isValidRecordUrl(null));
  });
  it('rejects protocol-relative urls that only look site-local', () => {
    // `//host/path` starts with `/` but a browser resolves it as a scheme-relative
    // external link, so it is neither a valid internal route nor a well-formed http url.
    assert.ok(!isValidRecordUrl('//example.com/path'));
    assert.ok(!isValidRecordUrl('//cdn.evil.test'));
  });
});

describe('checkInternalLinks', () => {
  const findings = checkInternalLinks(fixture, aux);
  const ofType = (t) => findings.filter((f) => f.failureType === t);

  it('flags a relatedIds reference that is not a valid entity', () => {
    const f = ofType('dangling_related_entity');
    const targets = f.map((x) => `${x.sourceId}:${x.target}`);
    assert.ok(targets.includes('RECORD-2:P9999'), 'unknown id flagged');
    // RECORD-1 is a valid record id but not an entity. Flagging it proves relatedIds
    // are validated against the entity space alone, not records-or-entities: a union
    // check would false-pass every relatedId and miss all real drift.
    assert.ok(targets.includes('RECORD-5:RECORD-1'), 'record id used as relatedId flagged');
    assert.equal(f.length, 2);
  });

  it('flags a firstMentionRecordId that is not a valid record', () => {
    const f = ofType('dangling_first_mention_record');
    const targets = f.map((x) => `${x.sourceId}:${x.target}`);
    assert.ok(targets.includes('P0002:RECORD-404'), 'unknown id flagged');
    // P0001 is a valid entity id but not a record. Flagging it proves firstMentionRecordId
    // is validated against the record space alone, the mirror of the relatedIds guard.
    assert.ok(targets.includes('P0003:P0001'), 'entity id used as firstMentionRecordId flagged');
    assert.equal(f.length, 2);
  });

  it('flags a recordEntityMap key that is not a record', () => {
    const f = ofType('dangling_record_entity_map_key');
    assert.equal(f.length, 1);
    assert.equal(f[0].sourceId, 'RECORD-404');
  });

  it('flags a recordEntityMap value that is not an entity', () => {
    const f = ofType('dangling_record_entity_map_value');
    assert.equal(f.length, 1);
    assert.equal(f[0].target, 'P9999');
  });

  it('does not flag valid references', () => {
    // RECORD-1 relatedIds P0001, entity P0001 firstMention RECORD-1, map RECORD-1 -> P0001 all resolve.
    const cleanSources = findings.map((f) => `${f.sourceId}:${f.target}`);
    assert.ok(!cleanSources.includes('RECORD-1:P0001'));
  });
});

describe('checkUrlWellFormedness', () => {
  it('flags only the malformed url', () => {
    const findings = checkUrlWellFormedness(fixture.records);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].sourceId, 'RECORD-3');
    assert.equal(findings[0].failureType, 'malformed_url');
  });
});

describe('checkInternalLinks cross-file drift (archive-data.json vs archive-entities.json)', () => {
  it('flags a record whose relatedIds disagree with its recordEntityMap entry', () => {
    // R1: relatedIds {P1,P2} but the map says {P1}; every id resolves, so the
    // dangling checks pass and only a set-equality check catches the drift.
    const data = {
      records: [
        { id: 'R1', url: 'https://e.com/1', relatedIds: ['P1', 'P2'] },
        { id: 'R2', url: 'https://e.com/2', relatedIds: ['P1'] } // matches the map -> clean
      ],
      entities: [{ id: 'P1' }, { id: 'P2' }]
    };
    const drifted = {
      entities: [{ id: 'P1' }, { id: 'P2' }],
      recordEntityMap: { R1: ['P1'], R2: ['P1'] }
    };
    const drift = checkInternalLinks(data, drifted).filter((f) => f.failureType === 'record_entity_map_drift');
    assert.equal(drift.length, 1);
    assert.equal(drift[0].sourceId, 'R1');
  });

  it('flags a map value missing from archive-entities.json even when archive-data.json keeps it', () => {
    // P1 still exists in archive-data.json (entities) but archive-entities.json
    // dropped it, so the entity browser would follow the map into nothing.
    const data = {
      records: [{ id: 'R1', url: 'https://e.com/1', relatedIds: ['P1'] }],
      entities: [{ id: 'P1' }]
    };
    const auxDropped = { entities: [], recordEntityMap: { R1: ['P1'] } };
    const findings = checkInternalLinks(data, auxDropped);
    const aux = findings.filter((f) => f.failureType === 'dangling_record_entity_map_value_aux');
    assert.equal(aux.length, 1);
    assert.equal(aux[0].target, 'P1');
    // The data.entities check still resolves, so no plain dangling-value finding, and
    // relatedIds equals the map entry, so no drift -- the aux check is the only signal.
    assert.equal(findings.filter((f) => f.failureType === 'dangling_record_entity_map_value').length, 0);
    assert.equal(findings.filter((f) => f.failureType === 'record_entity_map_drift').length, 0);
  });

  it('flags a record that keeps relatedIds after its map key is dropped', () => {
    // The base fixture already has this case: RECORD-5 carries relatedIds but has no
    // recordEntityMap entry. The asymmetric check (iterate the map only) would miss it;
    // the union check treats the absent map entry as empty and flags the drift.
    const drift = checkInternalLinks(fixture, aux).filter((f) => f.failureType === 'record_entity_map_drift');
    assert.equal(drift.length, 1);
    assert.equal(drift[0].sourceId, 'RECORD-5');
  });

  it('does not fire the aux-entity check when archive-entities.json has no entity list', () => {
    // Backward-compat: the original fixture has no aux.entities, so the consumed-payload
    // check is skipped rather than treating every map value as dangling.
    const findings = checkInternalLinks(fixture, aux);
    assert.equal(findings.filter((f) => f.failureType === 'dangling_record_entity_map_value_aux').length, 0);
  });
});

describe('collectUrlRecords (core archive-data.json + split archive-details.json)', () => {
  it('merges both files, dedups identical pairs, keeps divergent and details-only urls', () => {
    const core = [
      { id: 'R1', url: 'https://e.com/1' },
      { id: 'R2', url: 'https://e.com/2' }
    ];
    const details = {
      R1: { url: 'https://e.com/1' }, // identical to core -> one entry
      R2: { url: 'https://e.com/2-changed' }, // split/stale deploy diverged -> own entry
      R3: { url: 'https://e.com/3' }, // present only in details -> included
      R4: {} // no url KEY -> modal keeps core url, falls back silently, skipped
    };
    const merged = collectUrlRecords(core, details);
    const pairs = merged.map((r) => `${r.id} ${r.url}`).sort();
    assert.deepEqual(pairs, [
      'R1 https://e.com/1',
      'R2 https://e.com/2',
      'R2 https://e.com/2-changed',
      'R3 https://e.com/3'
    ]);
  });

  it('keeps an explicit bad details url so the malformed modal link is flagged', () => {
    // The modal merges details over the core record, so a url key present-but-empty
    // overrides a valid core url and breaks the link. That must be checked, not skipped;
    // only a missing key falls back to core.
    const core = [{ id: 'R1', url: 'https://e.com/good' }];
    const details = { R1: { url: '' } }; // explicit empty overrides core in the modal
    const merged = collectUrlRecords(core, details);
    assert.ok(merged.some((r) => r.id === 'R1' && r.url === ''), 'empty details url retained for checking');
    const malformed = checkUrlWellFormedness(merged).filter((f) => f.failureType === 'malformed_url');
    assert.ok(malformed.some((f) => f.sourceId === 'R1'), 'the empty modal url is reported');
  });

  it('collects thread-post links with their owning record id', () => {
    const merged = collectUrlRecords([], {
      THREAD1: {
        url: 'https://bsky.app/profile/jayrosen.bsky.social/post/root',
        thread_data: {
          posts: [
            { url: 'https://bsky.app/profile/jayrosen.bsky.social/post/one' },
            { url: 'https://bsky.app/profile/jayrosen.bsky.social/post/two' },
          ],
        },
      },
    });
    assert.deepEqual(
      merged.filter(({ id }) => id === 'THREAD1').map(({ url }) => url).sort(),
      [
        'https://bsky.app/profile/jayrosen.bsky.social/post/one',
        'https://bsky.app/profile/jayrosen.bsky.social/post/root',
        'https://bsky.app/profile/jayrosen.bsky.social/post/two',
      ]
    );
  });

  it('flags a missing thread-post URL rendered by the thread modal', () => {
    const merged = collectUrlRecords([], {
      THREAD1: {
        thread_data: { posts: [{ content: 'A post without its outbound URL' }] },
      },
    });
    assert.ok(merged.some(({ id, url }) => id === 'THREAD1' && url === undefined));
    const malformed = checkUrlWellFormedness(merged);
    assert.ok(malformed.some(({ sourceId }) => sourceId === 'THREAD1'));
  });

  it('collects URLs linkified from summary text but not plain-text quotes', () => {
    const merged = collectUrlRecords([
      {
        id: 'R1',
        url: 'https://example.com/source',
        summary: 'Compare https://example.com/summary with the source.',
        quote: 'See https://example.net/quoted and https://example.com/summary',
      },
    ], {});
    assert.deepEqual(
      merged.map(({ url }) => url).sort(),
      [
        'https://example.com/source',
        'https://example.com/summary',
      ]
    );
  });

  it('checks canonical bsky.app outbound URLs rather than the broken embed host', () => {
    const merged = collectUrlRecords([
      { id: 'R1', url: 'https://bsky.app/profile/jayrosen.bsky.social/post/abc' },
    ], {});
    assert.equal(merged[0].url, 'https://bsky.app/profile/jayrosen.bsky.social/post/abc');
    assert.doesNotMatch(merged[0].url, /embed\.bsky\.app/);
  });
});

describe('buildUrlSourceMap', () => {
  it('maps each probeable url back to every record id that carries it', () => {
    const urlRecords = [
      { id: 'R1', url: 'https://e.com/x' },
      { id: 'R2', url: 'https://e.com/x' }, // shared url -> both ids retained
      { id: 'R3', url: '/site-local' }, // not a probeable http url -> skipped
      { id: 'R4', url: 'mailto:a@b.com' } // not http -> skipped
    ];
    const map = buildUrlSourceMap(urlRecords);
    assert.equal(map.size, 1);
    assert.deepEqual(map.get('https://e.com/x'), ['R1', 'R2']);
  });
});

describe('collectFeaturedUrls (FEATURED_WORKS image + link hotlinks, issue #479)', () => {
  it('emits an { id, url } pair per image and link, tagging the field; a missing field is a null pair', () => {
    const works = [
      { id: 'feat-1', image: 'https://images.unsplash.com/photo-1', link: 'https://pressthink.org/a' },
      { id: 'feat-2', image: 'https://images.unsplash.com/photo-2' } // no link -> a null link pair, not skipped
    ];
    const pairs = collectFeaturedUrls(works).map((p) => `${p.id} ${p.url}`).sort();
    assert.deepEqual(pairs, [
      'feat-1 (image) https://images.unsplash.com/photo-1',
      'feat-1 (link) https://pressthink.org/a',
      'feat-2 (image) https://images.unsplash.com/photo-2',
      'feat-2 (link) null'
    ]);
  });

  it('emits a null-url pair for a missing or null field (FeaturedSection renders it directly) so the check can fail it', () => {
    const works = [{ id: 'feat-1', image: 'https://images.unsplash.com/p', link: null }];
    const pairs = collectFeaturedUrls(works);
    assert.equal(pairs.length, 2);
    const linkPair = pairs.find((p) => p.id === 'feat-1 (link)');
    assert.equal(linkPair.url, null);
  });

  it('handles an empty or absent list', () => {
    assert.deepEqual(collectFeaturedUrls([]), []);
    assert.deepEqual(collectFeaturedUrls(undefined), []);
  });
});

describe('checkExternalLiveness per-host circuit breaker (issue #710)', () => {
  it('stops probing a host after maxHostFailures consecutive failures, without counting the rest as checked', async (t) => {
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url) => {
      calls.push(String(url));
      if (String(url).includes('dead.example')) return { status: 500, headers: { get: () => null } };
      return { status: 200, headers: { get: () => null } };
    });

    const urls = [...Array.from({ length: 5 }, (_, i) => `https://dead.example/${i}`), 'https://healthy.example/a'];
    // concurrency: 1 keeps host-failure counting deterministic -- with the
    // default pool, several dead.example probes can race in flight before
    // any one of them updates the breaker.
    const result = await checkExternalLiveness(urls, { delayMs: 0, concurrency: 1, maxHostFailures: 2 });

    const deadCalls = calls.filter((u) => u.includes('dead.example'));
    assert.equal(deadCalls.length, 2, 'the breaker stops the host after 2 consecutive failures');
    assert.equal(result.skipped.length, 3, 'the remaining dead.example urls are skipped, not probed');
    assert.equal(result.checked, urls.length - 3, '"checked" excludes skipped urls');
    assert.ok(calls.some((u) => u.includes('healthy.example')), 'a different host is unaffected by the breaker');
  });

  it('does not trip the breaker across different hosts', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => ({ status: 500, headers: { get: () => null } }));
    const urls = Array.from({ length: 5 }, (_, i) => `https://host-${i}.example/x`);
    const result = await checkExternalLiveness(urls, { delayMs: 0, maxHostFailures: 2 });
    assert.equal(result.skipped.length, 0);
    assert.equal(result.checked, urls.length);
  });

  it('maxHostFailures: 0 disables the breaker entirely', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => ({ status: 500, headers: { get: () => null } }));
    const urls = Array.from({ length: 10 }, (_, i) => `https://dead.example/${i}`);
    const result = await checkExternalLiveness(urls, { delayMs: 0, maxHostFailures: 0 });
    assert.equal(result.skipped.length, 0);
    assert.equal(result.checked, urls.length);
  });

  it('does not trip the breaker on ordinary redirects, so a host that canonicalizes urls keeps being probed', async (t) => {
    // A 301/302 is a report-only finding, not a host that is failing to answer:
    // one host canonicalizing http->https or adding a trailing slash used to
    // exhaust its own budget after 3 redirects and get the rest of its urls
    // skipped -- which is most of the archive's own source hosts.
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url) => {
      calls.push(String(url));
      return { status: 301, headers: { get: () => 'https://canonical.example/moved' } };
    });

    const urls = Array.from({ length: 6 }, (_, i) => `https://canonical.example/${i}`);
    const result = await checkExternalLiveness(urls, { delayMs: 0, concurrency: 1, maxHostFailures: 3 });

    assert.equal(calls.length, urls.length, 'every url on the redirecting host is still probed');
    assert.equal(result.skipped.length, 0, 'redirects never exhaust a host budget');
    assert.equal(result.checked, urls.length);
    assert.equal(result.findings.length, urls.length, 'each redirect is still reported as a finding');
    assert.ok(result.findings.every((f) => f.failureType === 'redirect_url'));
  });

  it('counts a real failure that follows redirects on the same host', async (t) => {
    // Redirects must not reset the counter into uselessness either: a host
    // that redirects and then genuinely dies still trips the breaker.
    const statuses = [301, 301, 500, 500, 500, 200];
    let i = 0;
    t.mock.method(globalThis, 'fetch', async () => ({
      status: statuses[i++],
      headers: { get: () => null }
    }));

    const urls = Array.from({ length: 6 }, (_, j) => `https://mixed.example/${j}`);
    const result = await checkExternalLiveness(urls, { delayMs: 0, concurrency: 1, maxHostFailures: 3 });

    assert.equal(result.skipped.length, 1, 'the 3 server errors still exhaust the host');
    assert.equal(result.checked, urls.length - 1);
  });

  it('a recovered probe on a host resets its consecutive-failure count', async (t) => {
    const statuses = [500, 200, 500, 500];
    let i = 0;
    t.mock.method(globalThis, 'fetch', async () => ({ status: statuses[i++], headers: { get: () => null } }));
    const urls = Array.from({ length: 4 }, (_, j) => `https://flaky.example/${j}`);
    const result = await checkExternalLiveness(urls, { delayMs: 0, concurrency: 1, maxHostFailures: 2 });
    // fail, ok (resets count), fail, fail -> never reaches 2 CONSECUTIVE failures.
    assert.equal(result.skipped.length, 0);
    assert.equal(result.checked, urls.length);
  });
});

describe('runExternalLivenessSweep (main() wiring: load -> select -> probe -> record -> save)', () => {
  function tempStatePath() {
    return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'verify-links-sweep-')), 'state.json');
  }

  it('persists progress to a real state file across two sweeps, the way two scheduled runs would see each other', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => ({ status: 200, headers: { get: () => null } }));

    const urlRecords = Array.from({ length: 12 }, (_, i) => ({ id: `R${i}`, url: `https://example.com/${i}` }));
    const stateFile = tempStatePath();

    const run1 = await runExternalLivenessSweep({ featuredUrls: [], urlRecords, stateFile, max: 4, now: Date.now(), liveness: { delayMs: 0 } });
    assert.equal(run1.external.checked, 4);

    const afterRun1 = loadState(stateFile);
    assert.equal(Object.keys(afterRun1.urls).length, 4, 'run 1 wrote 4 checked urls to the real state file');

    await runExternalLivenessSweep({ featuredUrls: [], urlRecords, stateFile, max: 4, now: Date.now() + 1000, liveness: { delayMs: 0 } });
    const afterRun2 = loadState(stateFile);
    assert.equal(Object.keys(afterRun2.urls).length, 8, "run 2 read run 1's file back and advanced past it");
  });

  it('does not mark a url skipped by the per-host breaker as healthy in the saved state', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => ({ status: 503, headers: { get: () => null } }));

    const urlRecords = Array.from({ length: 5 }, (_, i) => ({ id: `R${i}`, url: `https://dead.example/${i}` }));
    const stateFile = tempStatePath();

    await runExternalLivenessSweep({
      featuredUrls: [],
      urlRecords,
      stateFile,
      max: 5,
      now: Date.now(),
      liveness: { concurrency: 1, maxHostFailures: 2, delayMs: 0 }
    });

    const state = loadState(stateFile);
    // Only the 2 urls actually probed before the breaker tripped are recorded;
    // the other 3 must be entirely absent from state, not stamped "ok".
    const recorded = Object.values(state.urls);
    assert.equal(recorded.length, 2, 'urls the breaker skipped are not recorded at all -- they stay due');
    for (const entry of recorded) assert.equal(entry.lastStatus, 'failing');
  });
});

describe('checkFeaturedUrlWellFormedness', () => {
  it('passes absolute http(s) hotlinks and flags anything else', () => {
    const featuredUrls = [
      { id: 'feat-1 (image)', url: 'https://images.unsplash.com/photo-1' }, // ok
      { id: 'feat-2 (image)', url: '/relative/path' }, // site-local route is not a valid hotlink
      { id: 'feat-3 (link)', url: '' }, // empty
      { id: 'feat-4 (image)', url: 'not a url' } // malformed
    ];
    const findings = checkFeaturedUrlWellFormedness(featuredUrls);
    const flagged = findings.map((f) => f.sourceId).sort();
    assert.deepEqual(flagged, ['feat-2 (image)', 'feat-3 (link)', 'feat-4 (image)']);
    assert.ok(findings.every((f) => f.failureType === 'malformed_featured_url'));
  });

  it('flags a missing required field (null url) so a broken launch card cannot ship green', () => {
    const featuredUrls = [
      { id: 'feat-1 (image)', url: 'https://images.unsplash.com/p' }, // ok
      { id: 'feat-2 (link)', url: null } // missing required field -> FeaturedSection would render href=undefined
    ];
    const findings = checkFeaturedUrlWellFormedness(featuredUrls);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].sourceId, 'feat-2 (link)');
    assert.equal(findings[0].failureType, 'malformed_featured_url');
    assert.equal(findings[0].target, null);
    assert.match(findings[0].detail, /missing a required/);
  });

  it('returns no findings for an all-clean set', () => {
    const featuredUrls = [{ id: 'feat-1 (image)', url: 'https://images.unsplash.com/photo' }];
    assert.deepEqual(checkFeaturedUrlWellFormedness(featuredUrls), []);
  });
});

describe('verify-links CLI argument parsing', () => {
  it('rejects a non-numeric --concurrency instead of silently starting no workers', () => {
    assert.throws(() => parseArgs(['--concurrency', 'abc']), /--concurrency must be a positive integer/);
  });

  it('rejects a zero or negative --concurrency', () => {
    assert.throws(() => parseArgs(['--concurrency', '0']), /--concurrency must be a positive integer/);
    assert.throws(() => parseArgs(['--concurrency', '-1']), /--concurrency must be a positive integer/);
  });

  it('rejects a fractional --concurrency rather than truncating it silently', () => {
    assert.throws(() => parseArgs(['--concurrency', '1.5']), /--concurrency must be a positive integer/);
  });

  it('rejects a --concurrency with no value instead of parsing undefined as NaN', () => {
    assert.throws(() => parseArgs(['--concurrency']), /--concurrency requires a value/);
    assert.throws(() => parseArgs(['--external', '--concurrency']), /--concurrency requires a value/);
  });

  it('accepts a well-formed --concurrency', () => {
    assert.equal(parseArgs(['--concurrency', '4']).concurrency, 4);
  });

  it('leaves concurrency undefined when the flag is absent, so the library default applies', () => {
    assert.equal(parseArgs(['--external']).concurrency, undefined);
  });

  it('validates the other numeric flags that share the same NaN hazard', () => {
    assert.throws(() => parseArgs(['--max', 'abc']), /--max must be a positive integer/);
    assert.throws(() => parseArgs(['--timeout-ms', '0']), /--timeout-ms must be a positive integer/);
    // 0 is a documented, meaningful value for these two: it disables the
    // breaker and the inter-request delay respectively.
    assert.equal(parseArgs(['--max-host-failures', '0']).maxHostFailures, 0);
    assert.equal(parseArgs(['--delay-ms', '0']).delayMs, 0);
    assert.throws(() => parseArgs(['--max-host-failures', '-1']), /--max-host-failures must be a non-negative integer/);
    assert.throws(() => parseArgs(['--delay-ms', 'abc']), /--delay-ms must be a non-negative integer/);
  });

  it('rejects a value-taking flag left at the end of argv', () => {
    assert.throws(() => parseArgs(['--out']), /--out requires a value/);
    assert.throws(() => parseArgs(['--state-file']), /--state-file requires a value/);
  });
});

describe('checkExternalLiveness worker-pool guard', () => {
  it('refuses a concurrency that would start no workers, rather than reporting unprobed urls as checked', async (t) => {
    // The dangerous shape: no worker ever runs, `skipped` stays empty, so
    // `checked` equals every target and runExternalLivenessSweep persists the
    // whole slice as healthy without a single request having been made.
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => ({ status: 200, headers: { get: () => null } }));
    const urls = ['https://example.com/a', 'https://example.com/b'];

    for (const concurrency of [Number.NaN, 0, -1, 1.5]) {
      await assert.rejects(
        () => checkExternalLiveness(urls, { delayMs: 0, concurrency }),
        /concurrency must be a positive integer/
      );
    }
    assert.equal(fetchMock.mock.callCount(), 0);
  });
});
