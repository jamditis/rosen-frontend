import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

export const BROWSERTRIX_CAPTURE_VERSION = 'browsertrix-capture@0.1.0';
export const BROWSERTRIX_IMAGE = 'webrecorder/browsertrix-crawler:1.14.3';
export const USER_AGENT_SUFFIX = '+RosenArchivePreservation/0.1';
export const PRIVATE_URL_PATTERN = '^https?://(?:localhost(?:[.:/]|$)|'
  + '(?:0|10|127)\\.|100\\.(?:6[4-9]|[7-9]\\d|1[01]\\d|12[0-7])\\.|'
  + '169\\.254\\.|172\\.(?:1[6-9]|2\\d|3[01])\\.|192\\.168\\.|'
  + '192\\.(?:0\\.0|0\\.2|88\\.99)\\.|198\\.(?:1[89]|51\\.100)\\.|203\\.0\\.113\\.|'
  + '\\[(?:::1|f[cd][0-9a-f:]*|fe[89ab][0-9a-f:]*)\\])';

export const CAPTURE_LIMITS = Object.freeze({
  behaviorSeconds: 45,
  cpuCount: 1,
  diskUtilizationPercent: 85,
  memory: '1536m',
  pageLoadSeconds: 60,
  pids: 256,
  settleSeconds: 2,
  sizeBytes: 268_435_456,
  timeSeconds: 300,
});

const TASK_TYPES = Object.freeze({
  'static-article': { scopeType: 'page', pageLimit: 1, depth: 0 },
  'dynamic-social': { scopeType: 'page-spa', pageLimit: 1, depth: 0 },
  'pdf-link': { scopeType: 'page', pageLimit: 1, depth: 0 },
  redirect: { scopeType: 'page', pageLimit: 1, depth: 0 },
  'linked-pages': { scopeType: 'prefix', pageLimit: 5, depth: 1 },
});

const CAPTURE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
const DOCKER_NETWORK_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/;
const EGRESS_NETWORK_LABEL = 'org.rosen-archive.public-egress=restricted';
const MAX_CDX_BYTES = 64 * 1024 * 1024;

function publicSourceUrl(value) {
  if (typeof value !== 'string' || value.length === 0) return null;

  try {
    const url = new URL(value);
    const hostname = url.hostname
      .replace(/^\[|\]$/g, '')
      .replace(/\.+$/, '')
      .toLowerCase();
    const supportedProtocol = url.protocol === 'http:' || url.protocol === 'https:';
    const localHostname = hostname === 'localhost'
      || hostname.endsWith('.localhost')
      || hostname.endsWith('.local');
    const ipLiteral = /^\d+(?:\.\d+){3}$/.test(hostname) || hostname.includes(':');

    if (!supportedProtocol || url.username || url.password || !hostname
        || localHostname || ipLiteral) {
      return null;
    }

    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function publicIpAddress(address) {
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0 && (c === 0 || c === 2))
      || (a === 192 && b === 168)
      || (a === 192 && b === 88 && c === 99)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113)
      || a >= 224);
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith('::ffff:')) {
      return publicIpAddress(normalized.slice('::ffff:'.length));
    }
    const firstHextet = Number.parseInt(normalized.split(':')[0] || '0', 16);
    return normalized !== '::'
      && normalized !== '::1'
      && (firstHextet & 0xfe00) !== 0xfc00
      && (firstHextet & 0xffc0) !== 0xfe80
      && (firstHextet & 0xff00) !== 0xff00;
  }
  return false;
}

export async function assertPublicSeedResolution(sourceUrl, resolver = lookup) {
  const hostname = new URL(sourceUrl).hostname;
  const results = await resolver(hostname, { all: true, verbatim: true });
  if (!results.length || results.some(result => !publicIpAddress(result.address))) {
    throw new Error('sourceUrl DNS must resolve only to public network addresses.');
  }
}

function requireCaptureId(value) {
  if (!CAPTURE_ID_PATTERN.test(value ?? '')) {
    throw new Error('captureId must use 1-63 lowercase letters, digits, or hyphens.');
  }
  return value;
}

function requireOutputRoot(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    throw new Error('outputDir must be an absolute path.');
  }
  return path.resolve(value);
}

function captureNetwork(value) {
  if (value == null) return null;
  if (!DOCKER_NETWORK_PATTERN.test(value)) {
    throw new Error('network must be a Docker network name with 1-63 safe characters.');
  }
  return value;
}

function inspectDockerNetwork(network) {
  const inspection = spawnSync('docker', [
    'network', 'inspect', network,
    '--format', '{{ index .Labels "org.rosen-archive.public-egress" }}',
  ], { encoding: 'utf8' });
  if (inspection.error || inspection.status !== 0) return null;
  return inspection.stdout.trim();
}

export async function assertEgressNetwork(network, inspector = inspectDockerNetwork) {
  if (!network) {
    throw new Error(`Execution requires a Docker network labeled ${EGRESS_NETWORK_LABEL}.`);
  }
  if (await inspector(network) !== 'restricted') {
    throw new Error(`Docker network ${network} is not labeled ${EGRESS_NETWORK_LABEL}.`);
  }
}

function taskProfile(taskType, allowOutlinks) {
  const profile = TASK_TYPES[taskType];
  if (!profile) {
    throw new Error(`Unsupported taskType: ${taskType ?? 'missing'}.`);
  }
  if (taskType === 'linked-pages' && allowOutlinks !== true) {
    throw new Error('linked-pages requires explicit allowOutlinks: true.');
  }
  if (taskType !== 'linked-pages' && allowOutlinks === true) {
    throw new Error(`${taskType} does not permit outlink crawling.`);
  }
  return profile;
}

export function planBrowsertrixCapture(input = {}) {
  const captureId = requireCaptureId(input.captureId);
  const sourceUrl = publicSourceUrl(input.sourceUrl);
  if (!sourceUrl) {
    throw new Error('sourceUrl must be a public HTTP or HTTPS URL without credentials.');
  }

  const taskType = input.taskType ?? 'static-article';
  const profile = taskProfile(taskType, input.allowOutlinks === true);
  const outputRoot = requireOutputRoot(input.outputDir);
  const network = captureNetwork(input.network);
  const collection = `rosen-${captureId}`;
  const collectionDir = path.join(outputRoot, 'collections', collection);
  const resultPath = path.join(outputRoot, 'results', `${captureId}.json`);
  const statsPath = path.join(outputRoot, 'results', `${captureId}.stats.json`);
  const waczPath = path.join(collectionDir, `${collection}.wacz`);
  const screenshots = input.screenshots !== false;

  const crawlerArgs = [
    'crawl',
    '--url', sourceUrl,
    '--collection', collection,
    '--scopeType', profile.scopeType,
    '--depth', String(profile.depth),
    '--extraHops', '0',
    '--pageLimit', String(profile.pageLimit),
    '--maxPageLimit', String(profile.pageLimit),
    '--workers', '1',
    '--timeLimit', String(CAPTURE_LIMITS.timeSeconds),
    '--sizeLimit', String(CAPTURE_LIMITS.sizeBytes),
    '--pageLoadTimeout', String(CAPTURE_LIMITS.pageLoadSeconds),
    '--behaviorTimeout', String(CAPTURE_LIMITS.behaviorSeconds),
    '--pageExtraDelay', String(CAPTURE_LIMITS.settleSeconds),
    '--diskUtilization', String(CAPTURE_LIMITS.diskUtilizationPercent),
    '--maxPageRetries', '1',
    '--failOnFailedSeed',
    '--failOnInvalidStatus',
    '--blockRules', PRIVATE_URL_PATTERN,
    '--blockMessage', 'Blocked private-network resource',
    '--behaviors', 'autoscroll,siteSpecific',
    '--text', 'to-pages,final-to-warc',
    '--logging', 'stats',
    '--statsFilename', `/crawls/results/${captureId}.stats.json`,
    '--userAgentSuffix', USER_AGENT_SUFFIX,
    '--title', `Rosen archive capture ${captureId}`,
    '--description', `${taskType} capture using ${BROWSERTRIX_CAPTURE_VERSION}`,
    '--generateWACZ',
    '--headless',
  ];
  if (screenshots) {
    crawlerArgs.push('--screenshot', 'view,fullPageFinal');
  }

  const containerName = `rosen-browsertrix-${captureId}`;
  const dockerArgs = [
    'run', '--rm',
    '--name', containerName,
    '--cpus', String(CAPTURE_LIMITS.cpuCount),
    '--memory', CAPTURE_LIMITS.memory,
    '--memory-swap', CAPTURE_LIMITS.memory,
    '--pids-limit', String(CAPTURE_LIMITS.pids),
    '--shm-size', '512m',
    ...(network ? ['--network', network] : []),
    '--mount', `type=bind,src=${outputRoot},dst=/crawls`,
    BROWSERTRIX_IMAGE,
    ...crawlerArgs,
  ];

  return {
    adapterVersion: BROWSERTRIX_CAPTURE_VERSION,
    captureId,
    sourceUrl,
    taskType,
    allowOutlinks: input.allowOutlinks === true,
    screenshots,
    collection,
    collectionDir,
    resultPath,
    statsPath,
    waczPath,
    containerName,
    network,
    limits: { ...CAPTURE_LIMITS, pageLimit: profile.pageLimit },
    profile: {
      scopeType: profile.scopeType,
      depth: profile.depth,
      pageLimit: profile.pageLimit,
      workers: 1,
      behaviors: ['autoscroll', 'siteSpecific'],
      extractedText: ['to-pages', 'final-to-warc'],
      screenshots: screenshots ? ['view', 'fullPageFinal'] : [],
      userAgentSuffix: USER_AGENT_SUFFIX,
    },
    crawler: {
      image: BROWSERTRIX_IMAGE,
      executable: 'docker',
      args: dockerArgs,
    },
  };
}

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: Object.hasOwn(options, 'encoding') ? options.encoding : 'utf8',
    maxBuffer: options.maxBuffer ?? 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    throw new Error(detail || `${command} exited with status ${result.status}.`);
  }
  return result.stdout;
}

function parseJsonLines(value) {
  return value.split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function inspectZipEntry(waczPath, entryPath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const unzip = spawn('unzip', ['-p', waczPath, entryPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let bytes = 0;
    let stderr = '';
    let tooLarge = false;

    unzip.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > CAPTURE_LIMITS.sizeBytes) {
        tooLarge = true;
        unzip.kill();
        return;
      }
      hash.update(chunk);
    });
    unzip.stderr.on('data', chunk => {
      if (stderr.length < 65_536) stderr += chunk.toString('utf8');
    });
    unzip.once('error', reject);
    unzip.once('close', exitCode => {
      if (tooLarge) {
        reject(new Error(`WACZ resource exceeds the capture size limit: ${entryPath}.`));
      } else if (exitCode !== 0) {
        reject(new Error(stderr.trim() || `Could not read WACZ resource: ${entryPath}.`));
      } else {
        resolve({ bytes, sha256: hash.digest('hex') });
      }
    });
  });
}

function safeWaczResourcePath(value) {
  return typeof value === 'string'
    && value.length > 0
    && !value.startsWith('-')
    && !value.includes('\\')
    && !path.posix.isAbsolute(value)
    && path.posix.normalize(value) === value
    && value !== '.';
}

async function validateWaczResources(waczPath, entries, dataPackage) {
  if (!Array.isArray(dataPackage.resources) || dataPackage.resources.length === 0) {
    throw new Error('WACZ data package has no resources.');
  }

  const resourcePaths = new Set();
  for (const resource of dataPackage.resources) {
    if (!safeWaczResourcePath(resource?.path)) {
      throw new Error('WACZ data package has an invalid resource path.');
    }
    if (resourcePaths.has(resource.path)) {
      throw new Error(`WACZ data package repeats resource ${resource.path}.`);
    }
    resourcePaths.add(resource.path);
    if (!entries.includes(resource.path)) {
      throw new Error(`WACZ is missing declared resource ${resource.path}.`);
    }
    if (!Number.isInteger(resource.bytes) || resource.bytes < 0) {
      throw new Error(`WACZ resource has an invalid byte count: ${resource.path}.`);
    }
    const hashMatch = /^sha256:([0-9a-f]{64})$/i.exec(resource.hash ?? '');
    if (!hashMatch) {
      throw new Error(`WACZ resource has no valid SHA-256 digest: ${resource.path}.`);
    }

    const actual = await inspectZipEntry(waczPath, resource.path);
    if (actual.bytes !== resource.bytes) {
      throw new Error(`WACZ resource byte count does not match: ${resource.path}.`);
    }
    if (actual.sha256 !== hashMatch[1].toLowerCase()) {
      throw new Error(`WACZ resource digest does not match: ${resource.path}.`);
    }
  }

  for (const required of ['indexes/index.cdx.gz', 'pages/pages.jsonl']) {
    if (!resourcePaths.has(required)) {
      throw new Error(`WACZ data package does not declare ${required}.`);
    }
  }
  if (![...resourcePaths].some(resourcePath => /^archive\/.+\.warc(?:\.gz)?$/.test(resourcePath))) {
    throw new Error('WACZ data package has no WARC resource.');
  }
}

function cdxRecords(compressedCdx) {
  return gunzipSync(compressedCdx, { maxOutputLength: MAX_CDX_BYTES })
    .toString('utf8').split('\n')
    .filter(line => line && !line.startsWith('!meta '))
    .flatMap(line => {
      const separator = line.indexOf(' {');
      if (separator < 0) return [];
      return [JSON.parse(line.slice(separator + 1))];
    });
}

export function resolveFinalUrl(requestedUrl, pageUrl, logEntries, records) {
  let currentUrl = requestedUrl;
  const visited = new Set();
  while (!visited.has(currentUrl)) {
    visited.add(currentUrl);
    const redirect = records.find(record => record.url === currentUrl
      && /^3\d\d$/.test(String(record.status))
      && typeof record.redirect === 'string'
      && record.redirect !== '-');
    if (!redirect) break;
    try {
      const redirectedUrl = publicSourceUrl(new URL(redirect.redirect, currentUrl).href);
      if (!redirectedUrl) break;
      currentUrl = redirectedUrl;
    } catch {
      break;
    }
  }
  if (currentUrl !== requestedUrl) return currentUrl;

  for (let index = logEntries.length - 1; index >= 0; index -= 1) {
    const entry = logEntries[index];
    if (!entry?.message?.startsWith('Seed page redirected out of scope')) continue;
    if (entry.details?.origUrl !== requestedUrl) continue;
    const redirectedUrl = publicSourceUrl(entry.details?.newUrl);
    if (redirectedUrl) return redirectedUrl;
  }
  return publicSourceUrl(pageUrl);
}

function summarizeCdx(records) {
  const statusCounts = {};
  const mimeCounts = {};

  for (const record of records) {
    const status = String(record.status ?? 'unknown');
    const mime = record.mime ?? 'unknown';
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    mimeCounts[mime] = (mimeCounts[mime] ?? 0) + 1;
  }

  return { loadedResources: records.length, statusCounts, mimeCounts };
}

async function sha256File(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

export async function inspectWacz(waczPath, requestedUrl) {
  runChecked('unzip', ['-tqq', waczPath]);
  const entries = runChecked('unzip', ['-Z1', waczPath]).split('\n').filter(Boolean);
  for (const required of ['datapackage.json', 'indexes/index.cdx.gz', 'pages/pages.jsonl']) {
    if (!entries.includes(required)) throw new Error(`WACZ is missing ${required}.`);
  }

  const seedPages = parseJsonLines(runChecked('unzip', ['-p', waczPath, 'pages/pages.jsonl']));
  const extraPages = entries.includes('pages/extraPages.jsonl')
    ? parseJsonLines(runChecked('unzip', ['-p', waczPath, 'pages/extraPages.jsonl']))
    : [];
  const pages = [...seedPages, ...extraPages];
  const capturedPage = seedPages.find(entry => typeof entry.url === 'string');
  if (!capturedPage) throw new Error('WACZ page list has no captured page.');
  const crawlLogEntries = entries
    .filter(entry => /^logs\/.*\.log$/.test(entry))
    .flatMap(entry => parseJsonLines(runChecked('unzip', ['-p', waczPath, entry])));
  const dataPackage = JSON.parse(runChecked('unzip', ['-p', waczPath, 'datapackage.json']));
  await validateWaczResources(waczPath, entries, dataPackage);
  const compressedCdx = runChecked(
    'unzip',
    ['-p', waczPath, 'indexes/index.cdx.gz'],
    { encoding: null, maxBuffer: 32 * 1024 * 1024 },
  );
  const records = cdxRecords(compressedCdx);
  const finalUrl = resolveFinalUrl(
    requestedUrl,
    capturedPage.url,
    crawlLogEntries,
    records,
  );
  if (!finalUrl) throw new Error('WACZ does not record a public final URL.');
  const interruption = crawlLogEntries.find(entry =>
    entry?.message === 'Crawler interrupted, gracefully finishing current pages');
  const archive = statSync(waczPath);

  return {
    finalUrl,
    interruptionReason: interruption?.message ?? null,
    metadata: {
      created: dataPackage.created ?? null,
      software: dataPackage.software ?? null,
      waczVersion: dataPackage.wacz_version ?? null,
    },
    resourceSummary: {
      ...summarizeCdx(records),
      capturedPages: pages.filter(entry => typeof entry.url === 'string').length,
      waczBytes: archive.size,
    },
    sha256: await sha256File(waczPath),
  };
}

function readStats(statsPath) {
  try {
    const stats = JSON.parse(readFileSync(statsPath, 'utf8'));
    return {
      crawled: stats.crawled ?? null,
      failed: stats.failed ?? null,
      pending: stats.pending ?? null,
      total: stats.total ?? null,
      excluded: stats.excluded ?? null,
      pageLimitHit: stats.limit?.hit ?? null,
    };
  } catch {
    return null;
  }
}

function writeJson(filename, value) {
  mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, filename);
}

function quarantineCollection(plan, reason) {
  if (!existsSync(plan.collectionDir)) return { path: null, reason };
  const quarantineRoot = path.join(path.dirname(path.dirname(plan.collectionDir)), 'quarantine');
  mkdirSync(quarantineRoot, { recursive: true });
  const target = path.join(quarantineRoot, `${plan.collection}-${Date.now()}`);
  renameSync(plan.collectionDir, target);
  return { path: target, reason };
}

export async function finalizeBrowsertrixCapture(plan, processResult, dependencies = {}) {
  const inspectArchive = dependencies.inspectArchive ?? inspectWacz;
  const terminationError = () => dependencies.getTerminationError?.() ?? null;
  let inspection = null;
  let invalidReason = processResult.error ?? terminationError();

  if (!invalidReason && processResult.exitCode !== 0) {
    invalidReason = `Browsertrix exited with status ${processResult.exitCode}.`;
  }
  if (!invalidReason && !existsSync(plan.waczPath)) {
    invalidReason = 'Browsertrix did not produce the expected WACZ.';
  }
  if (!invalidReason) {
    try {
      inspection = await inspectArchive(plan.waczPath, plan.sourceUrl);
    } catch (error) {
      invalidReason = terminationError() ?? `WACZ validation failed: ${error.message}`;
    }
  }
  if (!invalidReason) invalidReason = terminationError();

  const stats = readStats(plan.statsPath);
  if (!invalidReason && !stats) {
    invalidReason = 'Browsertrix stats are missing or invalid.';
  } else if (!invalidReason && !['crawled', 'failed', 'pending', 'total']
    .every(field => Number.isInteger(stats[field]) && stats[field] >= 0)) {
    invalidReason = 'Browsertrix stats counters are missing or invalid.';
  } else if (!invalidReason && stats.pending !== 0) {
    invalidReason = 'Browsertrix stopped with pending pages.';
  } else if (!invalidReason && stats.failed !== 0) {
    invalidReason = 'Browsertrix stopped with failed pages.';
  } else if (!invalidReason && stats.crawled !== stats.total) {
    invalidReason = 'Browsertrix did not complete every queued page.';
  } else if (!invalidReason && inspection?.interruptionReason) {
    invalidReason = inspection.interruptionReason;
  }
  if (!invalidReason) invalidReason = terminationError();

  const completedAt = new Date().toISOString();
  const result = {
    adapterVersion: plan.adapterVersion,
    captureId: plan.captureId,
    status: invalidReason ? 'quarantined' : 'captured',
    requestedUrl: plan.sourceUrl,
    finalUrl: inspection?.finalUrl ?? null,
    taskType: plan.taskType,
    allowOutlinks: plan.allowOutlinks,
    startedAt: processResult.startedAt,
    completedAt,
    crawlerExitCode: processResult.exitCode,
    crawler: {
      image: plan.crawler.image,
      limits: plan.limits,
      profile: plan.profile,
    },
    crawlStats: stats,
    interruptionReason: inspection?.interruptionReason ?? null,
    resourceSummary: inspection?.resourceSummary ?? null,
    wacz: inspection ? {
      path: plan.waczPath,
      sha256: inspection.sha256,
      metadata: inspection.metadata,
    } : null,
    quarantine: invalidReason ? quarantineCollection(plan, invalidReason) : null,
  };
  if (result.status === 'quarantined') result.wacz = null;
  writeJson(plan.resultPath, result);
  return result;
}

function stopNamedContainer(containerName) {
  return new Promise(resolve => {
    const stop = spawn('docker', ['stop', '--time', '30', containerName], {
      stdio: 'ignore',
    });
    stop.once('error', () => resolve());
    stop.once('exit', () => resolve());
  });
}

function createTerminationController(options = {}) {
  let child = null;
  let terminationSignal = null;
  let shutdownPromise = null;
  const onSigint = () => onSignal('SIGINT');
  const onSigterm = () => onSignal('SIGTERM');
  const onSignal = signal => {
    if (terminationSignal) return;
    terminationSignal = signal;
    const stopContainer = options.stopContainer ?? stopNamedContainer;
    shutdownPromise = Promise.resolve()
      .then(() => stopContainer(options.containerName))
      .catch(() => {});
    try {
      child?.kill(signal);
    } catch {
      // The crawler may already have exited while finalization is still active.
    }
  };

  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);
  return {
    attach(childProcess) {
      child = childProcess;
      if (terminationSignal) child.kill(terminationSignal);
    },
    dispose() {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
    },
    error() {
      return terminationSignal ? `Adapter received ${terminationSignal}.` : null;
    },
    waitForShutdown() {
      return shutdownPromise ?? Promise.resolve();
    },
  };
}

export function runProcess(executable, args, options = {}) {
  return new Promise(resolve => {
    const child = spawn(executable, args, { stdio: 'inherit' });
    const ownsTerminationController = !options.terminationController;
    const terminationController = options.terminationController
      ?? createTerminationController(options);
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      void terminationController.waitForShutdown().then(() => {
        const error = terminationController.error() ?? result.error;
        if (ownsTerminationController) terminationController.dispose();
        resolve({ ...result, error });
      });
    };

    terminationController.attach(child);
    child.once('error', error => finish({ exitCode: null, error: error.message }));
    child.once('exit', (exitCode, signal) => {
      finish({
        exitCode,
        error: signal ? `Browsertrix stopped after signal ${signal}.` : null,
      });
    });
  });
}

export async function runBrowsertrixCapture(input, dependencies = {}) {
  const plan = planBrowsertrixCapture(input);
  const existingArtifact = [plan.collectionDir, plan.resultPath, plan.statsPath]
    .find(filename => existsSync(filename));
  if (existingArtifact) {
    throw new Error(`Capture artifact already exists: ${existingArtifact}`);
  }
  mkdirSync(path.dirname(plan.resultPath), { recursive: true });

  const startedAt = new Date().toISOString();
  await assertEgressNetwork(plan.network, dependencies.inspectNetwork ?? inspectDockerNetwork);
  await assertPublicSeedResolution(plan.sourceUrl, dependencies.resolveHostname ?? lookup);
  const execute = dependencies.execute ?? runProcess;
  const terminationController = createTerminationController({
    containerName: plan.containerName,
    stopContainer: dependencies.stopContainer,
  });
  try {
    const processResult = await execute(plan.crawler.executable, plan.crawler.args, {
      containerName: plan.containerName,
      stopContainer: dependencies.stopContainer,
      terminationController,
    });
    return await finalizeBrowsertrixCapture(
      plan,
      { ...processResult, startedAt },
      {
        ...dependencies,
        getTerminationError: () => terminationController.error(),
      },
    );
  } finally {
    await terminationController.waitForShutdown();
    terminationController.dispose();
  }
}

function usage() {
  return 'Usage: node preservation/browsertrix-capture.mjs '
    + '--capture-id ID --source-url URL --output-dir ABSOLUTE_PATH '
    + '[--network NAME] [--task-type static-article|dynamic-social|pdf-link|redirect|linked-pages] '
    + '[--allow-outlinks] [--no-screenshots] [--plan]';
}

function parseCli(argv) {
  const input = {};
  let planOnly = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}.`);
      index += 1;
      return value;
    };
    if (argument === '--capture-id') input.captureId = nextValue();
    else if (argument === '--source-url') input.sourceUrl = nextValue();
    else if (argument === '--output-dir') input.outputDir = nextValue();
    else if (argument === '--task-type') input.taskType = nextValue();
    else if (argument === '--network') input.network = nextValue();
    else if (argument === '--allow-outlinks') input.allowOutlinks = true;
    else if (argument === '--no-screenshots') input.screenshots = false;
    else if (argument === '--plan') planOnly = true;
    else throw new Error(`Unknown argument: ${argument}.`);
  }
  return { input, planOnly };
}

async function main() {
  try {
    const { input, planOnly } = parseCli(process.argv.slice(2));
    const result = planOnly
      ? planBrowsertrixCapture(input)
      : await runBrowsertrixCapture(input);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!planOnly && result.status !== 'captured') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n${usage()}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
