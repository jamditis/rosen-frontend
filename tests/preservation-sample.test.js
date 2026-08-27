import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  loadPreservationSampleInputs,
  buildPreservationSample,
  formatPreservationSampleJson,
  formatPreservationSampleMarkdown,
  buildBlindSourcesView,
  formatPreservationSampleSourcesJson,
  parseArgs,
  DEFAULT_QUOTAS
} from '../scripts/select-preservation-sample.mjs';

const rootDir = process.cwd();
const fixtureDir = path.join(rootDir, 'tests', 'fixtures', 'preservation-sample');
const testInput = files => ({ commit: 'fixture-commit', dirty: false, files });

// A small, hand-built quota table over the 18-row fixture (10 curated + 8
// social). Order matters: `q_graph_links` runs first against a predicate
// matched by exactly 2 fixture rows (RECORD-00001, RECORD-00006), so its pool
// size cannot be affected by any earlier pick -- its shortfall is deterministic
// regardless of seed. Every other target is kept small (1) so the total any
// seed can claim through these five buckets is capped at 6, always leaving
// room for the random slice on this 18-row, sampleSize-10 fixture.
const FIXTURE_QUOTAS = [
  { id: 'q_graph_links', group: 'graph_links', target: 5, predicate: e => e.hasGraphLinks, reason: () => 'has graph links' },
  { id: 'q_pressthink', group: 'platform', target: 1, predicate: e => e.platformGroup === 'pressthink_longform', reason: () => 'pressthink long-form' },
  { id: 'q_twitter', group: 'platform', target: 1, predicate: e => e.platformGroup === 'twitter_x', reason: () => 'twitter/x' },
  { id: 'q_missing_url', group: 'url_status', target: 1, predicate: e => e.urlStatus === 'missing', reason: () => 'missing url' },
  { id: 'q_unverified', group: 'verification', target: 1, predicate: e => !e.verified, reason: () => 'unverified' }
];

describe('preservation sample selection (fixture mechanics)', () => {
  let inputs;

  before(() => {
    inputs = loadPreservationSampleInputs({ dataDir: fixtureDir });
  });

  it('loads the fixture universe', () => {
    assert.equal(inputs.curated.length, 10);
    assert.equal(inputs.social.length, 8);
    assert.equal(inputs.files.length, 4);
  });

  it('selects exactly sampleSize unique sources, honoring per-quota targets and reporting shortfalls', () => {
    const manifest = buildPreservationSample({
      inputs,
      seed: 'fixture-seed-a',
      sampleSize: 10,
      quotas: FIXTURE_QUOTAS,
      input: testInput(inputs.files)
    });

    assert.equal(manifest.schema.id, 'preservation-sample/1.0.0');
    assert.equal(manifest.sample_size, 10);
    assert.equal(manifest.summary.total_selected, 10);
    assert.equal(manifest.sources.length, 10);
    assert.equal(manifest.selection.length, 10);
    assert.equal(new Set(manifest.sources.map(s => s.id)).size, 10);
    assert.deepEqual(manifest.sources.map(s => s.id), manifest.selection.map(s => s.id));

    // q_graph_links runs first against a fixed 2-row pool (target 5) -- the
    // shortfall is deterministic no matter what the seed does afterward.
    const graphQuota = manifest.quotas.find(q => q.id === 'q_graph_links');
    assert.equal(graphQuota.target, 5);
    assert.equal(graphQuota.selected, 2);
    assert.equal(graphQuota.shortfall, 3);

    // Every quota (including the random slice) is internally consistent, and
    // the whole named+random selection adds up to exactly sample_size.
    let namedTotal = 0;
    for (const q of manifest.quotas) {
      assert.ok(q.selected <= q.target, `${q.id} selected (${q.selected}) must not exceed target (${q.target})`);
      assert.equal(q.selected + q.shortfall, q.target, `${q.id} selected+shortfall must equal target`);
      if (q.group !== 'random') namedTotal += q.selected;
    }
    const randomQuota = manifest.quotas.find(q => q.id === 'random_seed_slice');
    assert.ok(randomQuota, 'random_seed_slice quota must be present');
    assert.equal(randomQuota.selected, 10 - namedTotal);
    assert.ok(randomQuota.selected > 0, 'the fixture is sized so a random slice always survives');

    // Every named pick actually satisfies the predicate it was claimed under.
    const byStratum = Object.fromEntries(FIXTURE_QUOTAS.map(q => [q.id, q]));
    for (const item of manifest.selection) {
      if (item.stratum === 'random_seed_slice') continue;
      const entryLookup = {
        hasGraphLinks: item.has_graph_links,
        platformGroup: item.platform_group,
        urlStatus: item.url_status,
        verified: item.verified
      };
      if (item.stratum === 'q_graph_links') assert.equal(entryLookup.hasGraphLinks, true);
      if (item.stratum === 'q_pressthink') assert.equal(entryLookup.platformGroup, 'pressthink_longform');
      if (item.stratum === 'q_twitter') assert.equal(entryLookup.platformGroup, 'twitter_x');
      if (item.stratum === 'q_missing_url') assert.equal(entryLookup.urlStatus, 'missing');
      if (item.stratum === 'q_unverified') assert.equal(entryLookup.verified, false);
      assert.ok(byStratum[item.stratum], `unexpected stratum ${item.stratum}`);
    }
  });

  it('keeps the worker-facing `sources` view blind to stratum/reason', () => {
    const manifest = buildPreservationSample({
      inputs,
      seed: 'fixture-seed-a',
      sampleSize: 10,
      quotas: FIXTURE_QUOTAS,
      input: testInput(inputs.files)
    });

    for (const item of manifest.sources) {
      assert.deepEqual(Object.keys(item).sort(), ['id', 'objectType', 'url']);
      assert.ok(item.objectType === 'archive-record' || item.objectType === 'social-post');
    }
    // The audit-only view is where stratum/reason live -- never in `sources`.
    for (const item of manifest.selection) {
      assert.ok('stratum' in item);
      assert.ok('reason' in item);
    }
  });

  it('is deterministic: the same seed reproduces byte-identical output', () => {
    const build = () =>
      formatPreservationSampleJson(
        buildPreservationSample({
          inputs,
          seed: 'fixture-seed-a',
          sampleSize: 10,
          quotas: FIXTURE_QUOTAS,
          input: testInput(inputs.files)
        })
      );
    assert.equal(build(), build());
  });

  it('produces a different selection under a different seed', () => {
    const idsFor = seed =>
      buildPreservationSample({
        inputs,
        seed,
        sampleSize: 10,
        quotas: FIXTURE_QUOTAS,
        input: testInput(inputs.files)
      }).sources.map(s => s.id);

    assert.notDeepEqual(idsFor('fixture-seed-a'), idsFor('fixture-seed-b'));
  });

  it('refuses to build a sample larger than the eligible universe', () => {
    assert.throws(
      () =>
        buildPreservationSample({
          inputs,
          seed: 'fixture-seed-a',
          sampleSize: 19,
          quotas: FIXTURE_QUOTAS,
          input: testInput(inputs.files)
        }),
      /Not enough eligible sources/
    );
  });

  it('formats valid, newline-terminated JSON and a readable markdown summary', () => {
    const manifest = buildPreservationSample({
      inputs,
      seed: 'fixture-seed-a',
      sampleSize: 10,
      quotas: FIXTURE_QUOTAS,
      input: testInput(inputs.files)
    });
    const json = formatPreservationSampleJson(manifest);
    assert.ok(json.endsWith('\n'));
    assert.deepEqual(JSON.parse(json).sources.length, 10);

    const markdown = formatPreservationSampleMarkdown(manifest);
    assert.match(markdown, /# Preservation pilot sample/);
    assert.match(markdown, /fixture-seed-a/);
    assert.match(markdown, /q_graph_links/);
  });
});

describe('preservation sample selection (real corpus, default quotas)', () => {
  let inputs;
  let manifest;

  before(() => {
    inputs = loadPreservationSampleInputs({ dataDir: path.join(rootDir, 'data') });
    manifest = buildPreservationSample({ inputs, input: testInput(inputs.files) });
  });

  it('selects exactly 100 unique sources with a reproducible default seed', () => {
    assert.equal(manifest.sample_size, 100);
    assert.equal(manifest.summary.total_selected, 100);
    assert.equal(manifest.sources.length, 100);
    assert.equal(manifest.selection.length, 100);
    assert.equal(new Set(manifest.sources.map(s => s.id)).size, 100);
  });

  it('is reproducible for the same seed and differs for another seed', () => {
    const again = buildPreservationSample({ inputs, input: testInput(inputs.files) });
    assert.equal(formatPreservationSampleJson(manifest), formatPreservationSampleJson(again));

    const altered = buildPreservationSample({ inputs, seed: 'a-different-seed', input: testInput(inputs.files) });
    assert.notEqual(formatPreservationSampleJson(manifest), formatPreservationSampleJson(altered));
  });

  it('draws at least 10 percent of the sample as a reproducible random slice', () => {
    assert.ok(manifest.summary.random_count >= 10, `expected >=10 random picks, got ${manifest.summary.random_count}`);
    const randomQuota = manifest.quotas.find(q => q.id === 'random_seed_slice');
    assert.equal(randomQuota.selected, manifest.summary.random_count);
  });

  it('never lets a quota select more than its target', () => {
    for (const q of manifest.quotas) {
      assert.ok(q.selected <= q.target);
      assert.equal(q.selected + q.shortfall, q.target);
    }
    const total = manifest.quotas.reduce((sum, q) => sum + q.selected, 0);
    assert.equal(total, 100);
  });

  it('covers every major platform named in issue #704', () => {
    const platforms = manifest.summary.by_platform_group;
    for (const group of ['pressthink_longform', 'newspaper_clipping', 'tumblr', 'thread', 'twitter_x', 'bluesky', 'mastodon']) {
      assert.ok((platforms[group] || 0) > 0, `expected at least one ${group} source in the sample`);
    }
  });

  it('covers missing, redirected, and known-difficult URL outcomes without letting them dominate', () => {
    const byStatus = manifest.summary.by_url_status;
    assert.ok((byStatus.missing || 0) > 0);
    assert.ok((byStatus.redirector || 0) > 0);
    assert.ok((byStatus.known_difficult || 0) > 0);
    assert.ok((byStatus.likely_live || 0) > 0);
    // Known failures must not crowd out ordinary pages (issue #704 acceptance
    // criteria): known_difficult should stay a clear minority of the sample.
    // Compare a share, not a raw count, so this still means something under
    // --sample-size instead of only happening to read right at 100.
    const knownDifficultShare = (byStatus.known_difficult || 0) / manifest.sample_size;
    assert.ok(
      knownDifficultShare <= 0.3,
      `known_difficult grew to ${Math.round(knownDifficultShare * 1000) / 10}% of the sample ` +
        `(${byStatus.known_difficult}/${manifest.sample_size})`
    );
  });

  it('covers verified and unverified, present and absent raw text, and present and absent graph links', () => {
    const verifiedStates = new Set(manifest.selection.map(s => s.verified));
    assert.ok(verifiedStates.has(true) && verifiedStates.has(false));

    const rawTextStates = new Set(manifest.selection.map(s => s.has_raw_text));
    assert.ok(rawTextStates.has(true) && rawTextStates.has(false));

    const graphLinkStates = new Set(manifest.selection.map(s => s.has_graph_links));
    assert.ok(graphLinkStates.has(true) && graphLinkStates.has(false));
  });

  it('includes several notable (high-value or at-risk) sources', () => {
    const highValue = manifest.quotas.find(q => q.id === 'notable_high_value');
    const atRisk = manifest.quotas.find(q => q.id === 'notable_at_risk');
    assert.ok(highValue.selected >= 1);
    assert.ok(atRisk.selected >= 1);
  });

  it('never encodes expected success in the worker-facing `sources` view', () => {
    for (const item of manifest.sources) {
      assert.deepEqual(Object.keys(item).sort(), ['id', 'objectType', 'url']);
      assert.ok(!('stratum' in item));
      assert.ok(!('reason' in item));
      assert.ok(!('url_status' in item));
      assert.ok(item.objectType === 'archive-record' || item.objectType === 'social-post');
    }
  });

  it('emits a standalone blind file with no stratum/reason/audit field, matching `sources` exactly', () => {
    const blind = buildBlindSourcesView(manifest);
    assert.deepEqual(Object.keys(blind).sort(), ['credential_policy', 'input', 'sample_size', 'schema', 'seed', 'sources']);
    assert.deepEqual(blind.sources, manifest.sources);
    for (const item of blind.sources) {
      assert.deepEqual(Object.keys(item).sort(), ['id', 'objectType', 'url']);
    }

    const json = formatPreservationSampleSourcesJson(manifest);
    assert.ok(json.endsWith('\n'));
    const parsed = JSON.parse(json);
    assert.equal(parsed.sources.length, manifest.sources.length);
    assert.ok(!('selection' in parsed), 'the blind file must never carry the audit-only `selection` array');
  });

  it('requires no private credentials: URLs carry no embedded auth, and any paywalled host is covered by a stated no-credential policy', () => {
    for (const item of manifest.sources) {
      if (item.url === null) continue;
      assert.match(item.url, /^https?:\/\//, `${item.id} url must be a plain http(s) address`);
      const parsed = new URL(item.url);
      assert.equal(parsed.username, '', `${item.id} url must not embed a username`);
      assert.equal(parsed.password, '', `${item.id} url must not embed a password`);
      assert.ok(
        !/[?&](?:api[_-]?key|token|auth|session|passwd?|password)=/i.test(item.url),
        `${item.id} url must not carry an embedded credential/token query parameter`
      );
    }

    // A source can still sit behind a login/paywall (e.g. newspapers.com, see
    // KNOWN_DIFFICULT_HOSTS) -- the acceptance criterion is about what the
    // pilot worker is allowed to do, not about which hosts may appear. So
    // whenever a known-difficult host is present, the manifest must carry the
    // policy telling the worker a paywall response is a recorded failure, not
    // a reason to authenticate.
    const hasKnownDifficultHost = manifest.selection.some(s => s.url_status === 'known_difficult');
    if (hasKnownDifficultHost) {
      assert.equal(typeof manifest.credential_policy, 'string');
      assert.match(manifest.credential_policy, /never supply|credential/i);
    }
  });
});

describe('preservation sample CLI argument parsing', () => {
  it('rejects a non-numeric --sample-size instead of silently producing NaN', () => {
    assert.throws(() => parseArgs(['--sample-size', 'abc']), /--sample-size must be a positive integer/);
  });

  it('rejects a zero or negative --sample-size', () => {
    assert.throws(() => parseArgs(['--sample-size', '0']), /--sample-size must be a positive integer/);
    assert.throws(() => parseArgs(['--sample-size', '-5']), /--sample-size must be a positive integer/);
  });

  it('rejects a --sample-size with no value instead of taking the next flag as its value', () => {
    assert.throws(() => parseArgs(['--sample-size']), /--sample-size requires a value/);
  });

  it('rejects a --seed with no value instead of using the literal string "undefined"', () => {
    assert.throws(() => parseArgs(['--seed']), /--seed requires a value/);
  });

  it('accepts a well-formed --sample-size and --seed', () => {
    const args = parseArgs(['--sample-size', '20', '--seed', 'my-seed']);
    assert.equal(args.sampleSize, 20);
    assert.equal(args.seed, 'my-seed');
  });
});
