import {
  DISCOVERY_USER_AGENT,
  SOURCE_MANIFEST,
  SOURCE_MANIFEST_VERSION,
} from "./source-manifest.js";

export const DISCOVERY_MODE = Object.freeze({
  DISABLED: "disabled",
  DRY_RUN: "dry-run",
  LIVE: "live",
});

export const MAX_REDIRECTS = 3;
export const MAX_FEED_BYTES = 256 * 1024;
export const MAX_ROBOTS_BYTES = 32 * 1024;
export const MAX_CANDIDATE_URL_LENGTH = 2_048;
export const REQUEST_TIMEOUT_MS = 10_000;
export const RESPONSE_READ_TIMEOUT_MS = 10_000;

const STOP_STATUS_CODES = new Set([401, 403, 429]);
const REDIRECT_STATUS_MIN = 300;
const REDIRECT_STATUS_MAX = 399;
const TRACKING_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
]);
const POST_COLLECTION = "app.bsky.feed.post";
const REPOST_REASON_TYPE = "app.bsky.feed.defs#reasonRepost";
const QUOTE_EMBED_TYPE = "app.bsky.embed.record";
const QUOTE_WITH_MEDIA_EMBED_TYPE = "app.bsky.embed.recordWithMedia";

function header(response, name) {
  return response.headers?.get?.(name) || "";
}

function cacheValidators(response) {
  return {
    etag: header(response, "ETag") || null,
    lastModified: header(response, "Last-Modified") || null,
  };
}

function isRedirect(response) {
  return (
    response.status >= REDIRECT_STATUS_MIN &&
    response.status <= REDIRECT_STATUS_MAX
  );
}

function hasAllowedPath(url, prefixes) {
  return prefixes.some((prefix) => url.pathname.startsWith(prefix));
}

function isAllowedUrl(url, origins, pathPrefixes) {
  return (
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    origins.includes(url.origin) &&
    hasAllowedPath(url, pathPrefixes)
  );
}

function hasFixedAtprotoResource(source, url) {
  if (source.kind !== "atproto-author-feed") return true;
  try {
    const endpoint = new URL(source.endpoint);
    if (url.pathname === endpoint.pathname && url.search === endpoint.search) {
      return true;
    }
    if (typeof source.robotsUrl !== "string" || source.robotsUrl === "") {
      return false;
    }
    return url.toString() === new URL(source.robotsUrl).toString();
  } catch {
    return false;
  }
}

export function isAllowedFetchUrl(source, value) {
  try {
    const url = new URL(value);
    return (
      isAllowedUrl(
        url,
        source.fetchOrigins,
        source.fetchPathPrefixes,
      ) &&
      hasFixedAtprotoResource(source, url)
    );
  } catch {
    return false;
  }
}

export function isAllowedCandidateUrl(source, value) {
  try {
    const url = new URL(value);
    return (
      url.toString().length <= MAX_CANDIDATE_URL_LENGTH &&
      isAllowedUrl(
        url,
        source.candidateOrigins,
        source.candidatePathPrefixes,
      )
    );
  } catch {
    return false;
  }
}

function requestHeaders(accept, conditional = {}) {
  const headers = {
    Accept: accept,
    "User-Agent": DISCOVERY_USER_AGENT,
    DNT: "1",
  };
  if (typeof conditional.etag === "string" && conditional.etag !== "") {
    headers["If-None-Match"] = conditional.etag;
  }
  if (
    typeof conditional.lastModified === "string" &&
    conditional.lastModified !== ""
  ) {
    headers["If-Modified-Since"] = conditional.lastModified;
  }
  return headers;
}

async function timedFetch(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a manifest URL with manual redirects. Every hop must stay inside the
 * reviewed source boundary. A stop status never triggers another strategy.
 */
export async function fetchAllowedUrl({
  source,
  url,
  fetchImpl = globalThis.fetch,
  accept,
  conditional,
  maxRedirects = MAX_REDIRECTS,
  timeoutMs = REQUEST_TIMEOUT_MS,
}) {
  let currentUrl;
  try {
    currentUrl = new URL(url);
  } catch {
    return { ok: false, reason: "invalid_manifest_url" };
  }
  if (!isAllowedFetchUrl(source, currentUrl)) {
    return { ok: false, reason: "url_outside_manifest" };
  }

  const redirectChain = [currentUrl.toString()];
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let response;
    try {
      response = await timedFetch(
        fetchImpl,
        currentUrl.toString(),
        {
          headers: requestHeaders(accept, conditional),
          redirect: "manual",
        },
        timeoutMs,
      );
    } catch {
      return { ok: false, reason: "network_error", redirectChain };
    }

    if (STOP_STATUS_CODES.has(response.status)) {
      return {
        ok: false,
        reason: `stop_http_${response.status}`,
        redirectChain,
      };
    }
    if (response.status === 304) {
      return {
        ok: true,
        notModified: true,
        finalUrl: currentUrl.toString(),
        redirectChain,
        ...cacheValidators(response),
      };
    }
    if (!isRedirect(response)) {
      if (!response.ok) {
        return {
          ok: false,
          reason: `http_${response.status}`,
          status: response.status,
          redirectChain,
        };
      }
      return {
        ok: true,
        response,
        finalUrl: currentUrl.toString(),
        redirectChain,
        ...cacheValidators(response),
      };
    }

    const location = header(response, "Location");
    if (location === "") {
      return { ok: false, reason: "redirect_without_location", redirectChain };
    }
    let nextUrl;
    try {
      nextUrl = new URL(location, currentUrl);
    } catch {
      return { ok: false, reason: "invalid_redirect", redirectChain };
    }
    if (!isAllowedFetchUrl(source, nextUrl)) {
      return { ok: false, reason: "redirect_outside_manifest", redirectChain };
    }
    currentUrl = nextUrl;
    redirectChain.push(currentUrl.toString());
  }
  return { ok: false, reason: "redirect_limit", redirectChain };
}

async function readChunk(reader, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      reader.read().then(
        (result) => ({ kind: "chunk", result }),
        () => ({ kind: "error" }),
      ),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function cancelReader(reader, reason) {
  try {
    await reader.cancel(reason);
  } catch {
    // A failed cancellation must not turn a safe stop into a failed run.
  }
}

/** Read only a small, time-bounded response body. Never call Response.text() here. */
export async function readBoundedText(
  response,
  maxBytes,
  { timeoutMs = RESPONSE_READ_TIMEOUT_MS } = {},
) {
  const declaredLength = Number(header(response, "Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false, reason: "response_too_large" };
  }
  if (!response.body) return { ok: true, text: "" };

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  const deadline = Date.now() + timeoutMs;
  try {
    while (true) {
      const remainingMs = deadline - Date.now();
      const chunk = remainingMs <= 0
        ? { kind: "timeout" }
        : await readChunk(reader, remainingMs);
      if (chunk.kind === "timeout") {
        await cancelReader(reader, "response_read_timeout");
        return { ok: false, reason: "response_read_timeout" };
      }
      if (chunk.kind === "error") {
        return { ok: false, reason: "response_read_error" };
      }
      const { done, value } = chunk.result;
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await cancelReader(reader, "response_too_large");
        return { ok: false, reason: "response_too_large" };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(bytes) };
}

function splitRobotsGroups(text) {
  const groups = [];
  let group = null;
  for (const sourceLine of text.split(/\r?\n/)) {
    const line = sourceLine.split("#", 1)[0].trim();
    if (line === "") continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      if (!group || group.rules.length > 0) {
        group = { agents: [], rules: [] };
        groups.push(group);
      }
      group.agents.push(value.toLowerCase());
    } else if (
      group &&
      (field === "allow" || field === "disallow" || field === "crawl-delay")
    ) {
      group.rules.push({ field, value });
    }
  }
  return groups;
}

function robotsRuleMatches(pathname, pattern) {
  if (pattern === "") return false;
  const endsAtPathBoundary = pattern.endsWith("$");
  const expression = pattern.slice(0, endsAtPathBoundary ? -1 : undefined)
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${expression}${endsAtPathBoundary ? "$" : ""}`).test(pathname);
}

/**
 * Evaluate only the simple robots directives needed by a fixed feed URL. A
 * nonzero crawl delay stops this edge-only scaffold because it has no durable,
 * per-origin scheduler yet.
 */
export function evaluateRobots(text, { userAgent, pathname }) {
  const agent = userAgent.toLowerCase();
  const groups = splitRobotsGroups(text);
  const exactGroups = groups.filter((group) =>
    group.agents.some(
      (declaredAgent) =>
        declaredAgent !== "*" && agent.startsWith(declaredAgent),
    ),
  );
  const matchedGroups =
    exactGroups.length > 0
      ? exactGroups
      : groups.filter((group) => group.agents.includes("*"));
  if (matchedGroups.length === 0) {
    return { allowed: true, crawlDelaySeconds: 0, reason: "no_matching_rule" };
  }

  const delays = matchedGroups
    .flatMap((group) => group.rules)
    .filter((rule) => rule.field === "crawl-delay")
    .map((rule) => Number(rule.value))
    .filter((delay) => Number.isFinite(delay) && delay > 0);
  const crawlDelaySeconds = delays.length > 0 ? Math.max(...delays) : 0;

  let matchedRule = null;
  for (const rule of matchedGroups.flatMap((group) => group.rules)) {
    if (
      (rule.field !== "allow" && rule.field !== "disallow") ||
      !robotsRuleMatches(pathname, rule.value)
    ) {
      continue;
    }
    if (
      !matchedRule ||
      rule.value.length > matchedRule.value.length ||
      (rule.value.length === matchedRule.value.length && rule.field === "allow")
    ) {
      matchedRule = rule;
    }
  }
  return {
    allowed: !matchedRule || matchedRule.field === "allow",
    crawlDelaySeconds,
    reason: matchedRule ? `${matchedRule.field}:${matchedRule.value}` : "allowed",
  };
}

function decodeXmlValue(value) {
  const cdata = value.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i);
  const decoded = cdata ? cdata[1] : value;
  return decoded
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x27;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .trim();
}

function valuesInTag(text, tagName) {
  const expression = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  return Array.from(text.matchAll(expression), (match) => decodeXmlValue(match[1]));
}

function atomHrefValues(text) {
  const expression = /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
  return Array.from(text.matchAll(expression), (match) => decodeXmlValue(match[1]));
}

function valuesInContainers(text, containerName, valueReader) {
  const expression = new RegExp(
    `<${containerName}\\b[^>]*>([\\s\\S]*?)<\\/${containerName}>`,
    "gi",
  );
  return Array.from(text.matchAll(expression), (match) => valueReader(match[1])).flat();
}

function parseWordPressPostValues(text) {
  try {
    const items = JSON.parse(text);
    if (!Array.isArray(items)) return { valid: false, values: [] };
    return {
      valid: true,
      values: items.filter((item) => item && typeof item === "object").map((item) => ({
        url: typeof item.link === "string" ? item.link : "",
        externalTimestamp: typeof item.modified === "string" ? item.modified : null,
      })),
    };
  } catch {
    return { valid: false, values: [] };
  }
}

function wordPressPostValues(text) {
  return parseWordPressPostValues(text).values;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function atPostUri(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_CANDIDATE_URL_LENGTH
  ) {
    return null;
  }
  const match = value.match(
    /^at:\/\/(did:[a-z0-9:%._-]+)\/app\.bsky\.feed\.post\/[a-z0-9._~-]+$/i,
  );
  return match ? { uri: value, actorDid: match[1] } : null;
}

function stringValue(value) {
  return typeof value === "string" && value !== "" ? value : null;
}

function atprotoPost(post) {
  if (!isObject(post) || !isObject(post.author) || !isObject(post.record)) return null;
  const uri = atPostUri(post.uri);
  const authorDid = stringValue(post.author.did);
  const contentId = stringValue(post.cid);
  if (
    !uri ||
    !authorDid ||
    uri.actorDid !== authorDid ||
    !contentId ||
    contentId.length > MAX_CANDIDATE_URL_LENGTH ||
    post.record.$type !== POST_COLLECTION
  ) {
    return null;
  }
  return {
    uri,
    authorDid,
    contentId,
    record: post.record,
    indexedAt: stringValue(post.indexedAt),
  };
}

function replyReferences(record) {
  if (!Object.hasOwn(record, "reply")) return { rootId: null, parentId: null };
  if (!isObject(record.reply) || !isObject(record.reply.root) || !isObject(record.reply.parent)) {
    return null;
  }
  const root = atPostUri(record.reply.root.uri);
  const parent = atPostUri(record.reply.parent.uri);
  if (!root || !parent) return null;
  return { rootId: root.uri, parentId: parent.uri, rootActorDid: root.actorDid };
}

function isQuotePost(record) {
  if (!Object.hasOwn(record, "embed")) return false;
  if (!isObject(record.embed)) return null;
  if (record.embed.$type !== QUOTE_EMBED_TYPE && record.embed.$type !== QUOTE_WITH_MEDIA_EMBED_TYPE) {
    return false;
  }
  const reference = record.embed.$type === QUOTE_EMBED_TYPE
    ? record.embed.record
    : record.embed.record?.record;
  if (!isObject(reference) || typeof reference.uri !== "string" || typeof reference.cid !== "string") {
    return null;
  }
  return true;
}

function postType({ isRepost, isThreadEntry, isReply, quote }) {
  if (isRepost) return "repost";
  if (isThreadEntry) return "thread_entry";
  if (isReply) return "reply";
  if (quote) return "quote_post";
  return "original_post";
}

function atprotoAuthorFeedValues(source, text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return { valid: false, values: [] };
  }
  if (!isObject(payload) || !Array.isArray(payload.feed)) {
    return { valid: false, values: [] };
  }

  const values = [];
  for (const entry of payload.feed) {
    if (!isObject(entry)) return { valid: false, values: [] };
    const post = atprotoPost(entry.post);
    if (!post) return { valid: false, values: [] };
    const reply = replyReferences(post.record);
    if (!reply) return { valid: false, values: [] };
    const quote = isQuotePost(post.record);
    if (quote === null) return { valid: false, values: [] };
    const repost = isObject(entry.reason) && entry.reason.$type === REPOST_REASON_TYPE;
    const repostBy = repost ? stringValue(entry.reason.by?.did) : null;
    const authoredByTarget = post.authorDid === source.actorDid;
    if (!authoredByTarget && repostBy !== source.actorDid) continue;
    if (authoredByTarget && post.uri.actorDid !== source.actorDid) {
      return { valid: false, values: [] };
    }
    const createdAt = stringValue(post.record.createdAt) || post.indexedAt;
    if (!createdAt) return { valid: false, values: [] };
    values.push({
      url: post.uri.uri,
      contentId: post.contentId,
      postType: postType({
        isRepost: repostBy === source.actorDid,
        isThreadEntry: reply.rootActorDid === source.actorDid,
        isReply: reply.rootId !== null,
        quote,
      }),
      rootId: reply.rootId,
      parentId: reply.parentId,
      externalTimestamp:
        (repost && stringValue(entry.reason.indexedAt)) || createdAt,
    });
  }
  return { valid: true, values };
}

function rawCandidateValues(source, text) {
  if (source.kind === "atproto-author-feed") {
    return atprotoAuthorFeedValues(source, text);
  }
  if (source.kind === "wordpress-api") return wordPressPostValues(text);
  if (source.kind === "sitemap") return valuesInTag(text, "loc");
  return [
    ...valuesInContainers(text, "item", (item) => valuesInTag(item, "link")),
    ...valuesInContainers(text, "entry", (entry) => [
      ...valuesInTag(entry, "link"),
      ...atomHrefValues(entry),
    ]),
  ];
}

export function extractCandidateMetadata(source, text) {
  const rawValues = rawCandidateValues(source, text);
  if (source.kind === "atproto-author-feed") {
    if (!rawValues.valid) return [];
    const seen = new Set();
    return rawValues.values.filter((candidate) => {
      if (seen.has(candidate.url)) return false;
      seen.add(candidate.url);
      return true;
    }).slice(0, source.maxCandidates);
  }
  if (!Array.isArray(rawValues)) return [];
  const candidates = [];
  const seen = new Set();
  for (const value of rawValues) {
    const rawValue = typeof value === "string" ? value : value.url;
    if (!isAllowedCandidateUrl(source, rawValue)) continue;
    const url = new URL(rawValue);
    url.hash = "";
    for (const name of [...url.searchParams.keys()]) {
      if (name.toLowerCase().startsWith("utm_") || TRACKING_PARAMETERS.has(name)) {
        url.searchParams.delete(name);
      }
    }
    const normalized = url.toString();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    const candidate = {
      url: normalized,
      externalTimestamp: typeof value === "string" ? null : value.externalTimestamp,
    };
    if (typeof value !== "string" && value.contentId) {
      candidate.contentId = value.contentId;
      candidate.postType = value.postType;
      candidate.rootId = value.rootId;
      candidate.parentId = value.parentId;
    }
    candidates.push(candidate);
    if (candidates.length >= source.maxCandidates) break;
  }
  return candidates;
}

export function extractCandidateUrls(source, text) {
  return extractCandidateMetadata(source, text).map(({ url }) => url);
}

function looksLikeAccessControlPage(text) {
  const sample = text.slice(0, 8_192).toLowerCase();
  return [
    "captcha",
    "verify you are human",
    "checking your browser",
    "sign in to continue",
    "subscription required",
  ].some((marker) => sample.includes(marker));
}

function isExpectedSourceContentType(source, value) {
  const contentType = value.toLowerCase();
  if (source.kind === "wordpress-api") {
    return contentType === "" || contentType.includes("application/json");
  }
  if (source.kind === "atproto-author-feed") {
    return contentType === "" || contentType.includes("application/json");
  }
  return (
    contentType === "" ||
    contentType.includes("application/rss+xml") ||
    contentType.includes("application/xml") ||
    contentType.includes("text/xml")
  );
}

function sourceAcceptHeader(source) {
  return source.kind === "wordpress-api" || source.kind === "atproto-author-feed"
    ? "application/json"
    : "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8";
}

async function readRobotsPolicy(source, options) {
  if (typeof source.robotsUrl !== "string" || source.robotsUrl === "") {
    return { allowed: true };
  }
  const result = await fetchAllowedUrl({
    source,
    url: source.robotsUrl,
    accept: "text/plain, text/*;q=0.9",
    ...options,
  });
  if (!result.ok) {
    if (result.status === 404 || result.status === 410) return { allowed: true };
    return { allowed: false, reason: `robots_${result.reason}` };
  }
  if (result.notModified) {
    return { allowed: false, reason: "robots_not_modified" };
  }
  const body = await readBoundedText(result.response, MAX_ROBOTS_BYTES, {
    timeoutMs: RESPONSE_READ_TIMEOUT_MS,
  });
  if (!body.ok) return { allowed: false, reason: `robots_${body.reason}` };
  const policy = evaluateRobots(body.text, {
    userAgent: DISCOVERY_USER_AGENT,
    pathname: new URL(source.endpoint).pathname,
  });
  if (!policy.allowed) return { allowed: false, reason: "robots_disallow" };
  if (policy.crawlDelaySeconds > 0) {
    return { allowed: false, reason: "robots_crawl_delay" };
  }
  return { allowed: true };
}

export async function discoverSource(source, {
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  conditional,
} = {}) {
  const robots = await readRobotsPolicy(source, { fetchImpl });
  if (!robots.allowed) return { sourceId: source.id, status: robots.reason };

  const result = await fetchAllowedUrl({
    source,
    url: source.endpoint,
    accept: sourceAcceptHeader(source),
    conditional,
    fetchImpl,
  });
  if (!result.ok) return { sourceId: source.id, status: result.reason };
  if (result.notModified) {
    return {
      sourceId: source.id,
      status: "not_modified",
      candidateCount: 0,
      etag: result.etag,
      lastModified: result.lastModified,
      finalUrl: result.finalUrl,
    };
  }
  if (!isExpectedSourceContentType(source, header(result.response, "Content-Type"))) {
    return { sourceId: source.id, status: "unexpected_content_type" };
  }

  const body = await readBoundedText(result.response, MAX_FEED_BYTES, {
    timeoutMs: RESPONSE_READ_TIMEOUT_MS,
  });
  if (!body.ok) return { sourceId: source.id, status: body.reason };
  if (
    source.kind !== "atproto-author-feed" &&
    source.kind !== "wordpress-api" &&
    looksLikeAccessControlPage(body.text)
  ) {
    return { sourceId: source.id, status: "access_control_page" };
  }
  if (source.kind === "atproto-author-feed") {
    const parsed = atprotoAuthorFeedValues(source, body.text);
    if (!parsed.valid) return { sourceId: source.id, status: "invalid_source_payload" };
  }
  if (source.kind === "wordpress-api" && !parseWordPressPostValues(body.text).valid) {
    return { sourceId: source.id, status: "invalid_source_payload" };
  }

  const discoveredAt = now().toISOString();
  const fingerprint = result.etag || result.lastModified;
  const candidates = extractCandidateMetadata(source, body.text).map((candidate) => ({
    sourceId: source.id,
    url: candidate.url,
    ...(candidate.contentId
      ? {
          contentId: candidate.contentId,
          postType: candidate.postType,
          rootId: candidate.rootId,
          parentId: candidate.parentId,
        }
      : {}),
    discoveredAt,
    externalTimestamp: candidate.externalTimestamp || result.lastModified,
    etag: result.etag,
    fingerprint: candidate.contentId || fingerprint,
  }));
  return {
    sourceId: source.id,
    status: candidates.length > 0 ? "candidates_found" : "no_candidates",
    candidateCount: candidates.length,
    candidates,
    finalUrl: result.finalUrl,
    etag: result.etag,
    lastModified: result.lastModified,
  };
}

/**
 * Process sources sequentially. This prevents a manifest expansion from
 * concurrently hitting one origin. The default mode performs no network I/O.
 */
export async function runDiscovery({
  mode = DISCOVERY_MODE.DISABLED,
  sources = SOURCE_MANIFEST,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  conditionalBySource = {},
} = {}) {
  const startedAt = now().toISOString();
  if (mode !== DISCOVERY_MODE.DRY_RUN) {
    return {
      mode: DISCOVERY_MODE.DISABLED,
      manifestVersion: SOURCE_MANIFEST_VERSION,
      startedAt,
      sourceCount: sources.length,
      sources: [],
    };
  }

  const outcomes = [];
  for (const source of sources) {
    outcomes.push(
      await discoverSource(source, {
        fetchImpl,
        now,
        conditional: conditionalBySource[source.id],
      }),
    );
  }
  return {
    mode: DISCOVERY_MODE.DRY_RUN,
    manifestVersion: SOURCE_MANIFEST_VERSION,
    startedAt,
    sourceCount: sources.length,
    sources: outcomes,
  };
}
