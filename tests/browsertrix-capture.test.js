import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';
import { gzipSync } from 'node:zlib';

import {
  BROWSERTRIX_IMAGE,
  CAPTURE_LIMITS,
  PRIVATE_URL_PATTERN,
  USER_AGENT_SUFFIX,
  assertEgressNetwork,
  assertPublicSeedResolution,
  finalizeBrowsertrixCapture,
  inspectWacz,
  planBrowsertrixCapture,
  resolveFinalUrl,
  runBrowsertrixCapture,
} from '../preservation/browsertrix-capture.mjs';

function optionValue(args, option) {
  const index = args.indexOf(option);
  assert.notEqual(index, -1, `${option} is present`);
  return args[index + 1];
}

function plan(overrides = {}) {
  return planBrowsertrixCapture({
    captureId: 'fixture-capture',
    sourceUrl: 'https://example.org/article',
    outputDir: '/tmp/rosen-browsertrix-test',
    network: 'rosen-public-egress',
    taskType: 'static-article',
    ...overrides,
  });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function createWaczFixture(outputDir, options = {}) {
  const stagingDir = path.join(outputDir, 'wacz-fixture');
  const waczPath = path.join(outputDir, 'fixture.wacz');
  const pageList = Buffer.from(`${JSON.stringify({ url: 'https://example.org/article' })}\n`);
  const cdx = Buffer.from('org,example)/article 20260921110000 '
    + '{"url":"https://example.org/article","status":"200","mime":"text/html"}\n');
  const files = new Map([
    ['indexes/index.cdx.gz', gzipSync(cdx)],
    ['pages/pages.jsonl', pageList],
  ]);
  if (options.includeWarc !== false) {
    files.set('archive/data.warc.gz', Buffer.from('fixture WARC payload'));
  }

  for (const [filename, contents] of files) {
    const absolutePath = path.join(stagingDir, filename);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents);
  }
  const resources = [...files].map(([filename, contents]) => ({
    name: path.basename(filename),
    path: filename,
    hash: `sha256:${sha256(contents)}`,
    bytes: contents.length,
  }));
  if (options.badWarcDigest) {
    resources.find(resource => resource.path.startsWith('archive/')).hash = `sha256:${'0'.repeat(64)}`;
  }
  writeFileSync(path.join(stagingDir, 'datapackage.json'), JSON.stringify({
    profile: 'wacz',
    created: '2026-09-21T11:00:01Z',
    software: 'Browsertrix-Crawler 1.14.3',
    wacz_version: '1.1.1',
    resources,
  }));

  const zip = spawnSync(
    'zip',
    ['-q', '-0', waczPath, 'datapackage.json', ...files.keys()],
    { cwd: stagingDir, encoding: 'utf8' },
  );
  assert.equal(zip.status, 0, zip.stderr);
  return waczPath;
}

describe('bounded Browsertrix capture profile (#716)', () => {
  it('uses the matching closed scope for each required source fixture', () => {
    const fixtures = [
      ['static-article', 'https://example.org/report', 'page'],
      ['dynamic-social', 'https://social.example/@reporter/post/1', 'page-spa'],
      ['pdf-link', 'https://example.org/report.pdf', 'page'],
      ['redirect', 'https://example.org/go/report', 'page'],
    ];

    for (const [taskType, sourceUrl, expectedScope] of fixtures) {
      const capture = plan({ taskType, sourceUrl });
      assert.equal(optionValue(capture.crawler.args, '--scopeType'), expectedScope);
      assert.equal(optionValue(capture.crawler.args, '--pageLimit'), '1');
      assert.equal(optionValue(capture.crawler.args, '--maxPageLimit'), '1');
      assert.equal(capture.allowOutlinks, false);
    }
  });

  it('permits a small prefix crawl only through an explicit task and opt-in', () => {
    assert.throws(
      () => plan({ taskType: 'linked-pages' }),
      /explicit allowOutlinks/,
    );
    assert.throws(
      () => plan({ taskType: 'static-article', allowOutlinks: true }),
      /does not permit outlink/,
    );

    const capture = plan({ taskType: 'linked-pages', allowOutlinks: true });
    assert.equal(optionValue(capture.crawler.args, '--scopeType'), 'prefix');
    assert.equal(optionValue(capture.crawler.args, '--pageLimit'), '5');
    assert.equal(optionValue(capture.crawler.args, '--depth'), '1');
  });

  it('pins the crawler and enforces process, crawl, byte, and behavior ceilings', () => {
    const capture = plan();
    const args = capture.crawler.args;

    assert.equal(args[args.indexOf(BROWSERTRIX_IMAGE)], BROWSERTRIX_IMAGE);
    assert.equal(optionValue(args, '--cpus'), String(CAPTURE_LIMITS.cpuCount));
    assert.equal(optionValue(args, '--memory'), CAPTURE_LIMITS.memory);
    assert.equal(optionValue(args, '--memory-swap'), CAPTURE_LIMITS.memory);
    assert.equal(optionValue(args, '--network'), 'rosen-public-egress');
    assert.equal(optionValue(args, '--pids-limit'), String(CAPTURE_LIMITS.pids));
    assert.equal(optionValue(args, '--timeLimit'), String(CAPTURE_LIMITS.timeSeconds));
    assert.equal(optionValue(args, '--sizeLimit'), String(CAPTURE_LIMITS.sizeBytes));
    assert.equal(optionValue(args, '--behaviorTimeout'), String(CAPTURE_LIMITS.behaviorSeconds));
    assert.equal(optionValue(args, '--behaviors'), 'autoscroll,siteSpecific');
    assert.equal(optionValue(args, '--text'), 'to-pages,final-to-warc');
    assert.equal(optionValue(args, '--userAgentSuffix'), USER_AGENT_SUFFIX);
    assert.equal(optionValue(args, '--screenshot'), 'view,fullPageFinal');
    assert.ok(args.includes('--generateWACZ'));
    assert.ok(args.includes('--headless'));
    assert.ok(args.includes('--failOnFailedSeed'));
    assert.ok(args.includes('--failOnInvalidStatus'));
    assert.equal(optionValue(args, '--blockRules'), PRIVATE_URL_PATTERN);
    const privateUrlRule = new RegExp(PRIVATE_URL_PATTERN, 'i');
    for (const privateUrl of [
      'http://localhost/admin',
      'http://10.4.2.1/admin',
      'https://169.254.169.254/latest/meta-data/',
      'https://192.168.1.4/private',
      'http://[::1]/private',
      'http://[fd00::8]/private',
    ]) assert.match(privateUrl, privateUrlRule);
    assert.ok(!args.includes('--profile'));
    assert.ok(!args.includes('--username'));
    assert.ok(!args.includes('--password'));
  });

  it('requires an operator-attested egress-filtered Docker network', async () => {
    await assert.rejects(
      assertEgressNetwork(null, async () => 'restricted'),
      /requires a Docker network/,
    );
    await assert.rejects(
      assertEgressNetwork('ordinary-bridge', async () => ''),
      /is not labeled/,
    );
    await assert.doesNotReject(
      assertEgressNetwork('public-egress', async () => 'restricted'),
    );
  });

  it('rejects seed DNS that includes a private destination', async () => {
    await assert.rejects(
      assertPublicSeedResolution(
        'https://example.org/article',
        async () => [{ address: '203.0.113.10' }, { address: '10.0.0.8' }],
      ),
      /only to public network addresses/,
    );
    await assert.doesNotReject(assertPublicSeedResolution(
      'https://example.org/article',
      async () => [{ address: '93.184.216.34' }, { address: '2606:2800:220:1:248:1893:25c8:1946' }],
    ));
  });

  it('waits for container shutdown before returning from a parent signal', () => {
    const moduleUrl = pathToFileURL(path.resolve('preservation/browsertrix-capture.mjs')).href;
    const script = `
      import { runProcess } from ${JSON.stringify(moduleUrl)};
      let stopped = false;
      const pending = runProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        containerName: 'fixture',
        stopContainer: async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          stopped = true;
        },
      });
      setTimeout(() => process.emit('SIGTERM'), 25);
      const result = await pending;
      if (!stopped || result.error !== 'Adapter received SIGTERM.') process.exit(2);
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
      timeout: 5_000,
    });

    assert.equal(result.status, 0, result.stderr);
  });

  it('keeps signal handling active until finalization quarantines the capture', async () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), 'rosen-browsertrix-signal-'));
    const originalListeners = process.listenerCount('SIGTERM');
    let stopped = false;
    try {
      const result = await runBrowsertrixCapture({
        captureId: 'signal-finalize',
        sourceUrl: 'https://example.org/article',
        outputDir,
        network: 'rosen-public-egress',
      }, {
        inspectNetwork: async () => 'restricted',
        resolveHostname: async () => [{ address: '93.184.216.34' }],
        stopContainer: async () => { stopped = true; },
        execute: async () => {
          const capture = plan({ captureId: 'signal-finalize', outputDir });
          mkdirSync(capture.collectionDir, { recursive: true });
          writeFileSync(capture.waczPath, 'fixture WACZ');
          writeFileSync(capture.statsPath, JSON.stringify({
            crawled: 1,
            failed: 0,
            pending: 0,
            total: 1,
          }));
          setTimeout(() => process.emit('SIGTERM'), 20);
          return { exitCode: 0, error: null };
        },
        inspectArchive: async () => {
          await new Promise(resolve => setTimeout(resolve, 60));
          return {
            finalUrl: 'https://example.org/article',
            interruptionReason: null,
            metadata: {},
            resourceSummary: { loadedResources: 1 },
            sha256: 'c'.repeat(64),
          };
        },
      });

      assert.equal(result.status, 'quarantined');
      assert.equal(result.quarantine.reason, 'Adapter received SIGTERM.');
      assert.equal(stopped, true);
      assert.equal(process.listenerCount('SIGTERM'), originalListeners);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('uses CDX and log redirect evidence instead of the queued page URL', () => {
    const requestedUrl = 'https://example.org/go/report';
    const logEntries = [
      {
        message: 'Seed page redirected out of scope, not adding new seed',
        details: {
          origUrl: requestedUrl,
          newUrl: 'https://publisher.example/report#top',
        },
      },
    ];

    assert.equal(
      resolveFinalUrl(requestedUrl, requestedUrl, logEntries, []),
      'https://publisher.example/report',
    );
    assert.equal(
      resolveFinalUrl(requestedUrl, requestedUrl, [], [
        {
          url: requestedUrl,
          status: '302',
          redirect: '/final-report',
        },
      ]),
      'https://example.org/final-report',
    );
    assert.equal(resolveFinalUrl(requestedUrl, requestedUrl, [], []), requestedUrl);
  });

  it('rejects local, numeric, credential-bearing, and unsupported sources', () => {
    for (const sourceUrl of [
      'http://localhost/private',
      'http://service.local/private',
      'http://127.0.0.1/private',
      'http://[::1]/private',
      'https://user:secret@example.org/private',
      'file:///etc/passwd',
    ]) {
      assert.throws(() => plan({ sourceUrl }), /public HTTP or HTTPS URL/, sourceUrl);
    }
  });

  it('validates declared WACZ resources, WARC payloads, and SHA-256 digests', async () => {
    for (const fixture of [
      { name: 'valid', options: {}, error: null },
      { name: 'missing-warc', options: { includeWarc: false }, error: /no WARC resource/ },
      { name: 'bad-digest', options: { badWarcDigest: true }, error: /digest does not match/ },
    ]) {
      const outputDir = mkdtempSync(path.join(tmpdir(), `rosen-wacz-${fixture.name}-`));
      try {
        const waczPath = createWaczFixture(outputDir, fixture.options);
        if (fixture.error) {
          await assert.rejects(inspectWacz(waczPath, 'https://example.org/article'), fixture.error);
        } else {
          const inspection = await inspectWacz(waczPath, 'https://example.org/article');
          assert.equal(inspection.finalUrl, 'https://example.org/article');
          assert.equal(inspection.resourceSummary.loadedResources, 1);
          assert.match(inspection.sha256, /^[0-9a-f]{64}$/);
        }
      } finally {
        rmSync(outputDir, { recursive: true, force: true });
      }
    }
  });

  it('refuses to reuse a capture id after its collection was quarantined', async () => {
    for (const artifact of ['resultPath', 'statsPath']) {
      const outputDir = mkdtempSync(path.join(tmpdir(), `rosen-browsertrix-${artifact}-`));
      try {
        const capture = plan({ captureId: `existing-${artifact.toLowerCase()}`, outputDir });
        mkdirSync(path.dirname(capture[artifact]), { recursive: true });
        writeFileSync(capture[artifact], '{}');
        await assert.rejects(runBrowsertrixCapture({
          captureId: capture.captureId,
          sourceUrl: capture.sourceUrl,
          outputDir,
          network: capture.network,
        }), new RegExp(`Capture artifact already exists: ${capture[artifact]}`));
      } finally {
        rmSync(outputDir, { recursive: true, force: true });
      }
    }
  });

  it('records a validated WACZ, final URL, resources, fixity, and crawler stats', async () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), 'rosen-browsertrix-valid-'));
    try {
      const capture = plan({ outputDir });
      mkdirSync(capture.collectionDir, { recursive: true });
      mkdirSync(path.dirname(capture.statsPath), { recursive: true });
      writeFileSync(capture.waczPath, 'fixture WACZ');
      writeFileSync(capture.statsPath, JSON.stringify({
        crawled: 1,
        failed: 0,
        pending: 0,
        total: 1,
        limit: { hit: true },
      }));

      const result = await finalizeBrowsertrixCapture(
        capture,
        { exitCode: 0, error: null, startedAt: '2026-09-21T11:00:00.000Z' },
        {
          inspectArchive: async () => ({
            finalUrl: 'https://example.org/final-article',
            interruptionReason: null,
            metadata: {
              created: '2026-09-21T11:00:01Z',
              software: 'Browsertrix-Crawler 1.14.3, Chrome 140',
              waczVersion: '1.1.1',
            },
            resourceSummary: {
              loadedResources: 12,
              capturedPages: 1,
              waczBytes: 12,
              statusCounts: { 200: 12 },
              mimeCounts: { 'text/html': 1, 'image/png': 11 },
            },
            sha256: 'a'.repeat(64),
          }),
        },
      );

      assert.equal(result.status, 'captured');
      assert.equal(result.requestedUrl, 'https://example.org/article');
      assert.equal(result.finalUrl, 'https://example.org/final-article');
      assert.equal(result.resourceSummary.loadedResources, 12);
      assert.equal(result.wacz.sha256, 'a'.repeat(64));
      assert.match(result.wacz.metadata.software, /Browsertrix-Crawler/);
      assert.equal(result.crawlStats.pending, 0);
      assert.deepEqual(JSON.parse(readFileSync(capture.resultPath, 'utf8')), result);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('quarantines nonzero, invalid, and incomplete capture output', async () => {
    for (const failure of [
      { name: 'nonzero', exitCode: 2, pending: 0, inspectError: null },
      { name: 'invalid', exitCode: 0, pending: 0, inspectError: 'bad central directory' },
      { name: 'pending', exitCode: 0, pending: 1, inspectError: null },
      { name: 'failed', exitCode: 0, pending: 0, failed: 1, inspectError: null },
      { name: 'queued', exitCode: 0, pending: 0, failed: 0, crawled: 1, total: 2, inspectError: null },
      { name: 'interrupted', exitCode: 0, pending: 0, failed: 0, interrupted: true, inspectError: null },
      { name: 'missing-pending', exitCode: 0, stats: { failed: 0, crawled: 1, total: 1 } },
      { name: 'missing-failed', exitCode: 0, stats: { pending: 0, crawled: 1, total: 1 } },
      { name: 'negative-pending', exitCode: 0, stats: { pending: -1, failed: 0, crawled: 1, total: 1 } },
    ]) {
      const outputDir = mkdtempSync(path.join(tmpdir(), `rosen-${failure.name}-`));
      try {
        const capture = plan({ captureId: failure.name, outputDir });
        mkdirSync(capture.collectionDir, { recursive: true });
        mkdirSync(path.dirname(capture.statsPath), { recursive: true });
        writeFileSync(capture.waczPath, 'partial WACZ');
        writeFileSync(capture.statsPath, JSON.stringify(failure.stats ?? {
          pending: failure.pending,
          failed: failure.failed ?? 0,
          crawled: failure.crawled ?? 1,
          total: failure.total ?? 1,
        }));
        const result = await finalizeBrowsertrixCapture(
          capture,
          { exitCode: failure.exitCode, error: null, startedAt: '2026-09-21T11:00:00.000Z' },
          {
            inspectArchive: async () => {
              if (failure.inspectError) throw new Error(failure.inspectError);
              return {
                finalUrl: 'https://example.org/article',
                interruptionReason: failure.interrupted
                  ? 'Crawler interrupted, gracefully finishing current pages'
                  : null,
                metadata: {},
                resourceSummary: { loadedResources: 1 },
                sha256: 'b'.repeat(64),
              };
            },
          },
        );

        assert.equal(result.status, 'quarantined', failure.name);
        assert.equal(result.wacz, null, failure.name);
        assert.ok(result.quarantine.reason, failure.name);
        assert.ok(result.quarantine.path, failure.name);
        assert.ok(existsSync(result.quarantine.path), failure.name);
        assert.ok(!existsSync(capture.collectionDir), failure.name);
      } finally {
        rmSync(outputDir, { recursive: true, force: true });
      }
    }
  });
});
