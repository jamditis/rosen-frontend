import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import initSqlJs from "sql.js";
import worker from "../src/index.js";
import { runLiveDiscovery } from "../src/ledger.js";
import {
  DISCOVERY_MODE,
  MAX_CANDIDATE_URL_LENGTH,
  MAX_FEED_BYTES,
  discoverSource,
  evaluateRobots,
  extractCandidateUrls,
  fetchAllowedUrl,
  readBoundedText,
  runDiscovery,
} from "../src/discovery.js";
import { SOURCE_MANIFEST_VERSION } from "../src/source-manifest.js";

function source(overrides = {}) {
  return {
    id: "test-feed",
    kind: "rss",
    endpoint: "https://archive.example/feed/",
    robotsUrl: "https://archive.example/robots.txt",
    fetchOrigins: ["https://archive.example"],
    fetchPathPrefixes: ["/feed", "/robots.txt"],
    candidateOrigins: ["https://archive.example"],
    candidatePathPrefixes: ["/posts/"],
    maxCandidates: 10,
    ...overrides,
  };
}

function blueskySource(overrides = {}) {
  return {
    id: "jay-rosen-bluesky",
    kind: "atproto-author-feed",
    actorDid: "did:plc:3t37x6vfigdzzp2gjcfnzlz4",
    endpoint:
      "https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=did%3Aplc%3A3t37x6vfigdzzp2gjcfnzlz4&filter=posts_and_author_threads&limit=25",
    robotsUrl: "https://public.api.bsky.app/robots.txt",
    fetchOrigins: ["https://public.api.bsky.app"],
    fetchPathPrefixes: ["/xrpc/app.bsky.feed.getAuthorFeed", "/robots.txt"],
    maxCandidates: 25,
    ...overrides,
  };
}

async function blueskyFixture() {
  return readFile(
    new URL("./fixtures/bluesky-author-feed.json", import.meta.url),
    "utf8",
  );
}

function blueskyFetch(feedResponse) {
  return async (url, options) => {
    if (url.endsWith("/robots.txt")) {
      return response("User-agent: *\nAllow: /");
    }
    return feedResponse(url, options);
  };
}

function response(body, { status = 200, headers = {} } = {}) {
  return new Response(body, { status, headers });
}

function fakeDatabase({ state = null, originState = null } = {}) {
  const queries = [];
  const batches = [];
  return {
    queries,
    batches,
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              queries.push({ operation: "first", sql, params });
              return sql.includes("FROM discovery_origin_state")
                ? originState
                : state;
            },
            async run() {
              queries.push({ operation: "run", sql, params });
              return {};
            },
          };
        },
      };
    },
    async batch(statements) {
      batches.push(statements);
      return Promise.all(statements.map((statement) => statement.run()));
    },
  };
}

const migrationUrls = [
  new URL("../migrations/0001_initial.sql", import.meta.url),
  new URL("../migrations/0002_bluesky_candidate_metadata.sql", import.meta.url),
  new URL("../migrations/0003_origin_backoff.sql", import.meta.url),
];

async function sqliteDatabase({
  failAfterBatchStatement = null,
  failRunCompletion = false,
} = {}) {
  const SQL = await initSqlJs();
  const raw = new SQL.Database();
  for (const migrationUrl of migrationUrls) {
    raw.run(await readFile(migrationUrl, "utf8"));
  }

  return {
    raw,
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              const statement = raw.prepare(sql);
              try {
                statement.bind(params);
                return statement.step() ? statement.getAsObject() : null;
              } finally {
                statement.free();
              }
            },
            async run() {
              if (
                failRunCompletion &&
                sql.includes("SET finished_at = ?, candidate_count = ?, outcome = ?")
              ) {
                throw new Error("simulated_completion_failure");
              }
              raw.run(sql, params);
              return {};
            },
          };
        },
      };
    },
    async batch(statements) {
      raw.run("BEGIN TRANSACTION");
      try {
        for (const [index, statement] of statements.entries()) {
          await statement.run();
          if (index === failAfterBatchStatement) {
            throw new Error("simulated_batch_failure");
          }
        }
        raw.run("COMMIT");
      } catch (error) {
        raw.run("ROLLBACK");
        throw error;
      }
    },
  };
}

function sqliteRows(raw, sql) {
  const result = raw.exec(sql);
  return result.length === 0 ? [] : result[0].values;
}

test("the health endpoint exposes no fetch trigger or source URL", async () => {
  const result = await worker.fetch(
    new Request("https://rosen-source-discovery.workers.dev/health"),
    { DISCOVERY_MODE: "disabled" },
  );
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.deepEqual(body, {
    status: "ok",
    mode: "disabled",
    manifestVersion: SOURCE_MANIFEST_VERSION,
    sources: [
      {
        id: "jay-rosen-bluesky",
        label: "Jay Rosen Bluesky activity",
        kind: "atproto-author-feed",
        maxCandidates: 25,
      },
      {
        id: "pressthink-wordpress-posts",
        label: "PressThink recent posts",
        kind: "wordpress-api",
        maxCandidates: 25,
      },
    ],
  });
  const missing = await worker.fetch(
    new Request("https://rosen-source-discovery.workers.dev/run"),
    {},
  );
  assert.equal(missing.status, 404);
});

test("the fixed Bluesky author feed records compact candidate metadata only", async () => {
  const result = await discoverSource(blueskySource(), {
    fetchImpl: blueskyFetch(async () => response(await blueskyFixture(), {
      headers: { "Content-Type": "application/json" },
    })),
    now: () => new Date("2026-08-14T12:34:56.000Z"),
  });

  assert.deepEqual(result.candidates, [
    {
      sourceId: "jay-rosen-bluesky",
      url: "at://did:plc:3t37x6vfigdzzp2gjcfnzlz4/app.bsky.feed.post/original",
      contentId: "bafyoriginal",
      postType: "original_post",
      rootId: null,
      parentId: null,
      discoveredAt: "2026-08-14T12:34:56.000Z",
      externalTimestamp: "2026-08-14T12:00:00.000Z",
      etag: null,
      fingerprint: "bafyoriginal",
    },
    {
      sourceId: "jay-rosen-bluesky",
      url: "at://did:plc:3t37x6vfigdzzp2gjcfnzlz4/app.bsky.feed.post/reply",
      contentId: "bafyreply",
      postType: "reply",
      rootId: "at://did:plc:other/app.bsky.feed.post/root",
      parentId: "at://did:plc:other/app.bsky.feed.post/parent",
      discoveredAt: "2026-08-14T12:34:56.000Z",
      externalTimestamp: "2026-08-14T12:01:00.000Z",
      etag: null,
      fingerprint: "bafyreply",
    },
    {
      sourceId: "jay-rosen-bluesky",
      url: "at://did:plc:3t37x6vfigdzzp2gjcfnzlz4/app.bsky.feed.post/thread-entry",
      contentId: "bafythread",
      postType: "thread_entry",
      rootId: "at://did:plc:3t37x6vfigdzzp2gjcfnzlz4/app.bsky.feed.post/root",
      parentId: "at://did:plc:other/app.bsky.feed.post/parent",
      discoveredAt: "2026-08-14T12:34:56.000Z",
      externalTimestamp: "2026-08-14T12:02:00.000Z",
      etag: null,
      fingerprint: "bafythread",
    },
    {
      sourceId: "jay-rosen-bluesky",
      url: "at://did:plc:3t37x6vfigdzzp2gjcfnzlz4/app.bsky.feed.post/quote",
      contentId: "bafyquote",
      postType: "quote_post",
      rootId: null,
      parentId: null,
      discoveredAt: "2026-08-14T12:34:56.000Z",
      externalTimestamp: "2026-08-14T12:03:00.000Z",
      etag: null,
      fingerprint: "bafyquote",
    },
    {
      sourceId: "jay-rosen-bluesky",
      url: "at://did:plc:other/app.bsky.feed.post/reposted",
      contentId: "bafyrepost",
      postType: "repost",
      rootId: null,
      parentId: null,
      discoveredAt: "2026-08-14T12:34:56.000Z",
      externalTimestamp: "2026-08-14T12:04:01.000Z",
      etag: null,
      fingerprint: "bafyrepost",
    },
  ]);
});

test("the Bluesky adapter does not treat post text as an access-control page", async () => {
  const feed = JSON.parse(await blueskyFixture());
  feed.feed[0].post.record.text = "This article says subscription required.";

  const result = await discoverSource(blueskySource(), {
    fetchImpl: blueskyFetch(async () => response(JSON.stringify(feed), {
      headers: { "Content-Type": "application/json" },
    })),
  });

  assert.equal(result.status, "candidates_found");
});

test("the Bluesky adapter excludes a post from a different DID", async () => {
  const unrelated = JSON.parse(await blueskyFixture());
  unrelated.feed = [unrelated.feed[0]];
  unrelated.feed[0].post.author.did = "did:plc:other";
  unrelated.feed[0].post.uri =
    "at://did:plc:other/app.bsky.feed.post/original";

  const result = await discoverSource(blueskySource(), {
    fetchImpl: blueskyFetch(async () => response(JSON.stringify(unrelated), {
      headers: { "Content-Type": "application/json" },
    })),
  });

  assert.equal(result.status, "no_candidates");
  assert.equal(result.candidateCount, 0);
});

test("the Bluesky adapter rejects an invalid payload and stops on a rate limit", async () => {
  const invalid = await discoverSource(blueskySource(), {
    fetchImpl: blueskyFetch(async () => response(JSON.stringify({ feed: {} }), {
      headers: { "Content-Type": "application/json" },
    })),
  });
  assert.equal(invalid.status, "invalid_source_payload");

  const malformedQuote = JSON.parse(await blueskyFixture());
  malformedQuote.feed[3].post.record.embed = { $type: "app.bsky.embed.record" };
  const invalidQuote = await discoverSource(blueskySource(), {
    fetchImpl: blueskyFetch(async () => response(JSON.stringify(malformedQuote), {
      headers: { "Content-Type": "application/json" },
    })),
  });
  assert.equal(invalidQuote.status, "invalid_source_payload");

  const quoteWithMedia = JSON.parse(await blueskyFixture());
  quoteWithMedia.feed[3].post.record.embed = {
    $type: "app.bsky.embed.recordWithMedia",
    record: {
      $type: "app.bsky.embed.record",
      record: {
        uri: "at://did:plc:other/app.bsky.feed.post/quoted",
        cid: "bafyquoted",
      },
    },
  };
  const quoteResult = await discoverSource(blueskySource(), {
    fetchImpl: blueskyFetch(async () => response(JSON.stringify(quoteWithMedia), {
      headers: { "Content-Type": "application/json" },
    })),
  });
  const quoteCandidate = quoteResult.candidates.find(
    ({ postType }) => postType === "quote_post",
  );
  assert.equal(
    quoteCandidate.url,
    "at://did:plc:3t37x6vfigdzzp2gjcfnzlz4/app.bsky.feed.post/quote",
  );

  const limited = await discoverSource(blueskySource(), {
    fetchImpl: blueskyFetch(async () => response("", { status: 429 })),
  });
  assert.equal(limited.status, "stop_http_429");

  const oversized = await discoverSource(blueskySource(), {
    fetchImpl: blueskyFetch(async () => response("{}", {
      headers: {
        "Content-Length": String(MAX_FEED_BYTES + 1),
        "Content-Type": "application/json",
      },
    })),
  });
  assert.equal(oversized.status, "response_too_large");

  const overlongUri = JSON.parse(await blueskyFixture());
  overlongUri.feed[0].post.uri =
    "at://did:plc:3t37x6vfigdzzp2gjcfnzlz4/app.bsky.feed.post/" +
    "a".repeat(MAX_CANDIDATE_URL_LENGTH);
  const overlongResult = await discoverSource(blueskySource(), {
    fetchImpl: blueskyFetch(async () => response(JSON.stringify(overlongUri), {
      headers: { "Content-Type": "application/json" },
    })),
  });
  assert.equal(overlongResult.status, "invalid_source_payload");

  const overlongContentId = JSON.parse(await blueskyFixture());
  overlongContentId.feed[0].post.cid = "b".repeat(
    MAX_CANDIDATE_URL_LENGTH + 1,
  );
  const overlongContentIdResult = await discoverSource(blueskySource(), {
    fetchImpl: blueskyFetch(async () => response(JSON.stringify(overlongContentId), {
      headers: { "Content-Type": "application/json" },
    })),
  });
  assert.equal(overlongContentIdResult.status, "invalid_source_payload");
});

test("the Bluesky adapter stops on access denial and rejects invalid JSON responses", async () => {
  for (const status of [401, 403]) {
    const result = await discoverSource(blueskySource(), {
      fetchImpl: blueskyFetch(async () => response("", { status })),
    });
    assert.equal(result.status, `stop_http_${status}`);
  }

  const captcha = await discoverSource(blueskySource(), {
    fetchImpl: blueskyFetch(async () => response("Please verify you are human", {
      headers: { "Content-Type": "application/json" },
    })),
  });
  assert.equal(captcha.status, "invalid_source_payload");

  const paywall = await discoverSource(source(), {
    fetchImpl: async (url) => url.endsWith("/robots.txt")
      ? response("User-agent: *\nAllow: /")
      : response("Subscription required", {
          headers: { "Content-Type": "application/rss+xml" },
        }),
  });
  assert.equal(paywall.status, "access_control_page");
});

test("the Bluesky source stops at its robots policy before fetching the author feed", async () => {
  const calls = [];
  const result = await discoverSource(blueskySource(), {
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.endsWith("/robots.txt")) {
        return response("User-agent: *\nDisallow: /");
      }
      throw new Error("the author feed must not be fetched after a robots denial");
    },
  });

  assert.equal(result.status, "robots_disallow");
  assert.deepEqual(calls, ["https://public.api.bsky.app/robots.txt"]);
});

test("manual redirects stop when a hop leaves the source manifest", async () => {
  const result = await fetchAllowedUrl({
    source: source(),
    url: "https://archive.example/feed/",
    accept: "application/xml",
    fetchImpl: async () =>
      response("", {
        status: 302,
        headers: { Location: "https://outside.example/feed/" },
      }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "redirect_outside_manifest");
});

test("a Bluesky redirect cannot change the fixed author-feed query", async () => {
  const redirected = new URL(blueskySource().endpoint);
  redirected.searchParams.set("actor", "did:plc:other");
  let requests = 0;
  const result = await fetchAllowedUrl({
    source: blueskySource(),
    url: blueskySource().endpoint,
    accept: "application/json",
    fetchImpl: async () => {
      requests += 1;
      return requests === 1
        ? response("", { status: 302, headers: { Location: redirected.toString() } })
        : response("{}", { headers: { "Content-Type": "application/json" } });
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "redirect_outside_manifest");
  assert.equal(requests, 1);
});

test("bounded reads reject a declared or streamed oversized response", async () => {
  const declared = await readBoundedText(
    response("small", { headers: { "Content-Length": "9" } }),
    8,
  );
  assert.deepEqual(declared, { ok: false, reason: "response_too_large" });

  const streamed = await readBoundedText(response("123456789"), 8);
  assert.deepEqual(streamed, { ok: false, reason: "response_too_large" });
});

test("bounded reads stop a stalled response body", async () => {
  let cancelled = false;
  const stalled = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
  );
  const timedOut = await Promise.race([
    readBoundedText(stalled, 8, { timeoutMs: 5 }),
    new Promise((resolve) => setTimeout(() => resolve("test_timeout"), 50)),
  ]);

  assert.notEqual(timedOut, "test_timeout");
  assert.deepEqual(timedOut, { ok: false, reason: "response_read_timeout" });
  assert.equal(cancelled, true);
});

test("bounded reads use one deadline for a slowly streaming response", async () => {
  let chunksSent = 0;
  let cancelled = false;
  const slowlyStreaming = new Response(
    new ReadableStream({
      async pull(controller) {
        chunksSent += 1;
        await new Promise((resolve) => setTimeout(resolve, 8));
        if (chunksSent > 2) {
          controller.close();
          return;
        }
        controller.enqueue(new Uint8Array([chunksSent]));
      },
      cancel() {
        cancelled = true;
      },
    }),
  );

  const timedOut = await readBoundedText(slowlyStreaming, 8, { timeoutMs: 10 });
  assert.deepEqual(timedOut, { ok: false, reason: "response_read_timeout" });
  assert.equal(cancelled, true);
});

test("bounded reads keep the safe stop status when cancellation fails", async () => {
  const stalled = new Response(
    new ReadableStream({
      cancel() {
        throw new Error("cancellation_failed");
      },
    }),
  );
  const timedOut = await readBoundedText(stalled, 8, { timeoutMs: 5 });
  assert.deepEqual(timedOut, { ok: false, reason: "response_read_timeout" });
});

test("bounded reads keep the safe stop status when oversize cancellation fails", async () => {
  const oversized = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(9));
      },
      cancel() {
        throw new Error("cancellation_failed");
      },
    }),
  );

  const result = await readBoundedText(oversized, 8);
  assert.deepEqual(result, { ok: false, reason: "response_too_large" });
});

test("robots rules stop a denied feed and respect the most-specific allow rule", () => {
  const denied = evaluateRobots("User-agent: *\nDisallow: /feed/", {
    userAgent: "RosenArchiveDiscovery/0.1",
    pathname: "/feed/",
  });
  assert.equal(denied.allowed, false);

  const allowed = evaluateRobots(
    "User-agent: *\nDisallow: /\nAllow: /feed/",
    {
      userAgent: "RosenArchiveDiscovery/0.1",
      pathname: "/feed/",
    },
  );
  assert.equal(allowed.allowed, true);

  const namedAgent = evaluateRobots(
    "User-agent: RosenArchiveDiscovery\nDisallow: /feed/",
    {
      userAgent: "RosenArchiveDiscovery/0.1 (read-only)",
      pathname: "/feed/",
    },
  );
  assert.equal(namedAgent.allowed, false);

  const exactPath = evaluateRobots("User-agent: *\nDisallow: /feed$", {
    userAgent: "RosenArchiveDiscovery/0.1",
    pathname: "/feed",
  });
  assert.equal(exactPath.allowed, false);

  const nestedPath = evaluateRobots("User-agent: *\nDisallow: /feed$", {
    userAgent: "RosenArchiveDiscovery/0.1",
    pathname: "/feed/archive",
  });
  assert.equal(nestedPath.allowed, true);
});

test("a missing robots file permits the fixed source request", async () => {
  const result = await discoverSource(source(), {
    fetchImpl: async (url) =>
      url.endsWith("/robots.txt")
        ? response("", { status: 404 })
        : response(
            "<rss><channel><item><link>https://archive.example/posts/one</link></item></channel></rss>",
            { headers: { "Content-Type": "application/rss+xml" } },
          ),
  });
  assert.equal(result.status, "candidates_found");
});

test("an unexpected robots 304 stops one source without crashing the run", async () => {
  const result = await discoverSource(source(), {
    fetchImpl: async () => new Response(null, { status: 304 }),
  });

  assert.equal(result.status, "robots_not_modified");
});

test("feed parsing keeps only allowed, canonical candidate URLs", () => {
  const overlong = `https://archive.example/posts/${"a".repeat(MAX_CANDIDATE_URL_LENGTH)}`;
  const candidates = extractCandidateUrls(
    source(),
    [
      "<rss><channel>",
      "<link>https://archive.example/</link>",
      "<item>",
      "<link>https://archive.example/posts/one?utm_source=mail#section</link>",
      "<link>https://archive.example/posts/one</link>",
      "<link>https://outside.example/posts/two</link>",
      "<link>https://archive.example/about/</link>",
      `<link>${overlong}</link>`,
      "</item>",
      "</channel></rss>",
    ].join(""),
  );
  assert.deepEqual(candidates, ["https://archive.example/posts/one"]);
});

test("the public WordPress index returns only allowed links and item dates", async () => {
  const result = await discoverSource(
    source({
      kind: "wordpress-api",
      endpoint: "https://archive.example/wp-json/wp/v2/posts?per_page=25",
      fetchPathPrefixes: ["/wp-json/wp/v2/posts", "/robots.txt"],
    }),
    {
      fetchImpl: async (url) =>
        url.endsWith("/robots.txt")
          ? response("User-agent: *\nAllow: /")
          : response(
              JSON.stringify([
                {
                  link: "https://archive.example/posts/one?utm_source=feed",
                  modified: "2026-08-14T12:00:00",
                },
                {
                  link: "https://outside.example/posts/two",
                  modified: "2026-08-14T12:01:00",
                },
              ]),
              { headers: { "Content-Type": "application/json" } },
            ),
      now: () => new Date("2026-08-14T12:34:56.000Z"),
    },
  );
  assert.deepEqual(result.candidates, [
    {
      sourceId: "test-feed",
      url: "https://archive.example/posts/one",
      discoveredAt: "2026-08-14T12:34:56.000Z",
      externalTimestamp: "2026-08-14T12:00:00",
      etag: null,
      fingerprint: null,
    },
  ]);
});

test("the WordPress adapter rejects a malformed payload instead of recording an empty success", async () => {
  const result = await discoverSource(
    source({
      kind: "wordpress-api",
      endpoint: "https://archive.example/wp-json/wp/v2/posts?per_page=25",
      fetchPathPrefixes: ["/wp-json/wp/v2/posts", "/robots.txt"],
    }),
    {
      fetchImpl: async (url) =>
        url.endsWith("/robots.txt")
          ? response("User-agent: *\nAllow: /")
          : response("{", { headers: { "Content-Type": "application/json" } }),
    },
  );
  assert.equal(result.status, "invalid_source_payload");
});

test("a dry run records metadata only and stops after a denied response", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.endsWith("/robots.txt")) return response("User-agent: *\nAllow: /");
    return response(
      "<rss><channel><item><link>https://archive.example/posts/one</link></item></channel></rss>",
      {
        headers: {
          "Content-Type": "application/rss+xml",
          ETag: '"feed-v1"',
          "Last-Modified": "Thu, 14 Aug 2026 12:00:00 GMT",
        },
      },
    );
  };
  const result = await discoverSource(source(), {
    fetchImpl,
    now: () => new Date("2026-08-14T12:34:56.000Z"),
  });
  assert.deepEqual(calls, [
    "https://archive.example/robots.txt",
    "https://archive.example/feed/",
  ]);
  assert.deepEqual(result.candidates, [
    {
      sourceId: "test-feed",
      url: "https://archive.example/posts/one",
      discoveredAt: "2026-08-14T12:34:56.000Z",
      externalTimestamp: "Thu, 14 Aug 2026 12:00:00 GMT",
      etag: '"feed-v1"',
      fingerprint: '"feed-v1"',
    },
  ]);

  const stopped = await discoverSource(source(), {
    fetchImpl: async (url) =>
      url.endsWith("/robots.txt")
        ? response("User-agent: *\nAllow: /")
        : response("", { status: 429 }),
  });
  assert.equal(stopped.status, "stop_http_429");
});

test("conditional discovery reports an unchanged feed without parsing it", async () => {
  let feedHeaders;
  const result = await discoverSource(source(), {
    conditional: { etag: '"feed-v1"' },
    fetchImpl: async (url, options) => {
      if (url.endsWith("/robots.txt")) return response("User-agent: *\nAllow: /");
      feedHeaders = options.headers;
      return response(null, { status: 304 });
    },
  });
  assert.equal(feedHeaders["If-None-Match"], '"feed-v1"');
  assert.deepEqual(result, {
    sourceId: "test-feed",
    status: "not_modified",
    candidateCount: 0,
    etag: null,
    lastModified: null,
    finalUrl: "https://archive.example/feed/",
  });
});

test("feed discovery rejects HTML before it parses candidate links", async () => {
  const result = await discoverSource(source(), {
    fetchImpl: async (url) =>
      url.endsWith("/robots.txt")
        ? response("User-agent: *\nAllow: /")
        : response("<a href='https://archive.example/posts/one'>one</a>", {
            headers: { "Content-Type": "text/html" },
          }),
  });
  assert.equal(result.status, "unexpected_content_type");
});

test("a robots crawl delay stops before the Worker reads the feed", async () => {
  let calls = 0;
  const result = await discoverSource(source(), {
    fetchImpl: async () => {
      calls++;
      return response("User-agent: *\nCrawl-delay: 10\nAllow: /");
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.status, "robots_crawl_delay");
});

test("disabled mode makes no network request", async () => {
  let calls = 0;
  const report = await runDiscovery({
    mode: DISCOVERY_MODE.DISABLED,
    sources: [source()],
    fetchImpl: async () => {
      calls++;
      throw new Error("must not fetch in disabled mode");
    },
    now: () => new Date("2026-08-14T12:34:56.000Z"),
  });
  assert.equal(calls, 0);
  assert.equal(report.mode, "disabled");
  assert.equal(report.manifestVersion, SOURCE_MANIFEST_VERSION);
  assert.deepEqual(report.sources, []);
});

test("live discovery stores validators and candidate metadata without a feed body", async () => {
  const database = fakeDatabase({
    state: {
      etag: '"previous-feed"',
      last_modified: "Wed, 13 Aug 2026 12:00:00 GMT",
    },
  });
  let feedHeaders;
  const report = await runLiveDiscovery({
    database,
    sources: [source()],
    makeRunId: () => "run-20260814",
    now: () => new Date("2026-08-14T12:34:56.000Z"),
    fetchImpl: async (url, options) => {
      if (url.endsWith("/robots.txt")) return response("User-agent: *\nAllow: /");
      feedHeaders = options.headers;
      return response(
        "<rss><channel><item><link>https://archive.example/posts/one</link></item></channel></rss>",
        {
          headers: {
            "Content-Type": "application/rss+xml",
            ETag: '"current-feed"',
            "Last-Modified": "Thu, 14 Aug 2026 12:00:00 GMT",
          },
        },
      );
    },
  });

  assert.equal(report.mode, DISCOVERY_MODE.LIVE);
  assert.equal(report.manifestVersion, SOURCE_MANIFEST_VERSION);
  assert.equal(report.sources[0].candidateCount, 1);
  assert.equal(feedHeaders["If-None-Match"], '"previous-feed"');
  assert.equal(database.batches.length, 1);
  assert.equal(database.batches[0].length, 3);
  const candidateWrite = database.queries.find(({ sql }) =>
    sql.includes("INSERT INTO discovery_candidates"),
  );
  assert.deepEqual(candidateWrite.params, [
    "test-feed",
    "https://archive.example/posts/one",
    "2026-08-14T12:34:56.000Z",
    "2026-08-14T12:34:56.000Z",
    "Thu, 14 Aug 2026 12:00:00 GMT",
    '"current-feed"',
    null,
    null,
    null,
    null,
    '"current-feed"',
    "run-20260814",
  ]);
  assert.equal(
    database.queries.some(({ params }) => params.includes("<rss><channel>")),
    false,
  );
});

test("the ledger upserts Bluesky content identifiers and source classifications", async () => {
  const database = fakeDatabase();
  await runLiveDiscovery({
    database,
    sources: [blueskySource()],
    makeRunId: () => "run-bluesky",
    now: () => new Date("2026-08-14T12:34:56.000Z"),
    fetchImpl: blueskyFetch(async () => response(await blueskyFixture(), {
      headers: { "Content-Type": "application/json" },
    })),
  });
  const candidateWrite = database.queries.find(({ sql }) =>
    sql.includes("INSERT INTO discovery_candidates"),
  );
  assert.equal(candidateWrite.sql.includes("ON CONFLICT(source_id, canonical_url)"), true);
  assert.deepEqual(candidateWrite.params, [
    "jay-rosen-bluesky",
    "at://did:plc:3t37x6vfigdzzp2gjcfnzlz4/app.bsky.feed.post/original",
    "2026-08-14T12:34:56.000Z",
    "2026-08-14T12:34:56.000Z",
    "2026-08-14T12:00:00.000Z",
    null,
    "bafyoriginal",
    "original_post",
    null,
    null,
    "bafyoriginal",
    "run-bluesky",
  ]);
});

test("a successful source waits for its configured low-frequency interval", async () => {
  const database = fakeDatabase({
    state: { last_success_at: "2026-08-14T12:00:00.000Z" },
  });
  const report = await runLiveDiscovery({
    database,
    sources: [source({ minimumIntervalHours: 168 })],
    makeRunId: () => "run-backstop",
    now: () => new Date("2026-08-15T12:00:00.000Z"),
    fetchImpl: async () => {
      throw new Error("the backstop must not fetch before its interval");
    },
  });
  assert.equal(report.sources[0].status, "skipped_interval");
});

test("the scheduled handler records a bounded internal error message", async () => {
  const originalError = console.error;
  const entries = [];
  console.error = (entry) => entries.push(JSON.parse(entry));
  try {
    await worker.scheduled({}, { DISCOVERY_MODE: "live" });
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(entries, [
    {
      event: "rosen_source_discovery_error",
      error: "Error",
      message: "missing_d1_binding",
    },
  ]);
});

test("a transient source result records a per-origin backoff and skips the next run", async () => {
  const checkedAt = "2026-08-14T12:00:00.000Z";
  const firstDatabase = fakeDatabase();
  const firstReport = await runLiveDiscovery({
    database: firstDatabase,
    sources: [source()],
    fetchImpl: async (url) =>
      url.endsWith("/robots.txt")
        ? response("User-agent: *\nAllow: /")
        : response("", { status: 429 }),
    now: () => new Date(checkedAt),
    makeRunId: () => "first-run",
  });

  assert.equal(firstReport.sources[0].status, "stop_http_429");
  const backoffWrite = firstDatabase.queries.find(({ sql }) =>
    sql.includes("INSERT INTO discovery_origin_state"),
  );
  assert.deepEqual(backoffWrite.params, [
    "https://archive.example",
    "2026-08-14T12:15:00.000Z",
    1,
    checkedAt,
    "stop_http_429",
  ]);

  let fetchCalls = 0;
  const secondReport = await runLiveDiscovery({
    database: fakeDatabase({
      originState: {
        backoff_until: "2026-08-14T12:15:00.000Z",
        consecutive_failures: 1,
      },
    }),
    sources: [source()],
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("source fetch must remain in backoff");
    },
    now: () => new Date("2026-08-14T12:05:00.000Z"),
    makeRunId: () => "second-run",
  });

  assert.equal(secondReport.sources[0].status, "skipped_backoff");
  assert.equal(fetchCalls, 0);
});

test("a transient robots result records an origin backoff", async () => {
  const checkedAt = "2026-08-14T12:00:00.000Z";
  const database = fakeDatabase({
    originState: { backoff_until: null, consecutive_failures: 1 },
  });
  const report = await runLiveDiscovery({
    database,
    sources: [source()],
    fetchImpl: async () => response("", { status: 429 }),
    now: () => new Date(checkedAt),
    makeRunId: () => "robots-backoff-run",
  });

  assert.equal(report.sources[0].status, "robots_stop_http_429");
  const backoffWrite = database.queries.find(({ sql }) =>
    sql.includes("INSERT INTO discovery_origin_state"),
  );
  assert.deepEqual(backoffWrite.params, [
    "https://archive.example",
    "2026-08-14T12:30:00.000Z",
    2,
    checkedAt,
    "robots_stop_http_429",
  ]);
});

test("a stream read error records an origin backoff", async () => {
  const checkedAt = "2026-08-14T12:00:00.000Z";
  const database = fakeDatabase();
  const report = await runLiveDiscovery({
    database,
    sources: [source()],
    fetchImpl: async (url) => {
      if (url.endsWith("/robots.txt")) return response("User-agent: *\nAllow: /");
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error("stream_read_failed"));
          },
        }),
      );
    },
    now: () => new Date(checkedAt),
    makeRunId: () => "stream-error-run",
  });

  assert.equal(report.sources[0].status, "response_read_error");
  const backoffWrite = database.queries.find(({ sql }) =>
    sql.includes("INSERT INTO discovery_origin_state"),
  );
  assert.deepEqual(backoffWrite.params, [
    "https://archive.example",
    "2026-08-14T12:15:00.000Z",
    1,
    checkedAt,
    "response_read_error",
  ]);
});

test("an invalid manifest source does not stop a valid source", async () => {
  const database = fakeDatabase();
  const report = await runLiveDiscovery({
    database,
    sources: [
      source({
        id: "invalid-manifest-source",
        endpoint: "https://outside.example/feed/",
      }),
      source({ id: "valid-manifest-source" }),
    ],
    fetchImpl: async (url) =>
      url.endsWith("/robots.txt")
        ? response("User-agent: *\nAllow: /")
        : response(
            "<rss><channel><item><link>https://archive.example/posts/one</link></item></channel></rss>",
            { headers: { "Content-Type": "application/rss+xml" } },
          ),
    now: () => new Date("2026-08-14T12:00:00.000Z"),
    makeRunId: () => "invalid-manifest-run",
  });

  assert.deepEqual(
    report.sources.map(({ sourceId, status, candidateCount }) => ({
      sourceId,
      status,
      candidateCount,
    })),
    [
      {
        sourceId: "invalid-manifest-source",
        status: "invalid_source_origin",
        candidateCount: 0,
      },
      {
        sourceId: "valid-manifest-source",
        status: "candidates_found",
        candidateCount: 1,
      },
    ],
  );
});

test("D1 migrations execute the ledger upsert and expire a stale run", async () => {
  const database = await sqliteDatabase();
  try {
    database.raw.run(`
      INSERT INTO discovery_runs (
        run_id, started_at, source_count, candidate_count, outcome
      ) VALUES ('stale-run', '2026-08-13T00:00:00.000Z', 1, 0, 'running')
    `);
    let etag = '"first-feed"';
    const fetchImpl = async (url) =>
      url.endsWith("/robots.txt")
        ? response("User-agent: *\nAllow: /")
        : response(
            "<rss><channel><item><link>https://archive.example/posts/one</link></item></channel></rss>",
            { headers: { "Content-Type": "application/rss+xml", ETag: etag } },
          );

    await runLiveDiscovery({
      database,
      sources: [source()],
      fetchImpl,
      now: () => new Date("2026-08-14T12:00:00.000Z"),
      makeRunId: () => "first-sql-run",
    });
    etag = '"second-feed"';
    await runLiveDiscovery({
      database,
      sources: [source()],
      fetchImpl,
      now: () => new Date("2026-08-14T12:05:00.000Z"),
      makeRunId: () => "second-sql-run",
    });

    assert.deepEqual(
      sqliteRows(
        database.raw,
        "SELECT canonical_url, first_seen_at, last_seen_at, etag, latest_run_id FROM discovery_candidates",
      ),
      [[
        "https://archive.example/posts/one",
        "2026-08-14T12:00:00.000Z",
        "2026-08-14T12:05:00.000Z",
        '"second-feed"',
        "second-sql-run",
      ]],
    );
    assert.deepEqual(
      sqliteRows(
        database.raw,
        "SELECT outcome, finished_at FROM discovery_runs WHERE run_id = 'stale-run'",
      ),
      [["failed", "2026-08-14T12:00:00.000Z"]],
    );
  } finally {
    database.raw.close();
  }
});

test("a failed D1 source batch rolls back its ledger writes and marks the run failed", async () => {
  const database = await sqliteDatabase({ failAfterBatchStatement: 0 });
  try {
    await assert.rejects(
      runLiveDiscovery({
        database,
        sources: [source()],
        fetchImpl: async (url) =>
          url.endsWith("/robots.txt")
            ? response("User-agent: *\nAllow: /")
            : response(
                "<rss><channel><item><link>https://archive.example/posts/one</link></item></channel></rss>",
                { headers: { "Content-Type": "application/rss+xml" } },
              ),
        now: () => new Date("2026-08-14T12:00:00.000Z"),
        makeRunId: () => "rollback-sql-run",
      }),
      /simulated_batch_failure/,
    );
    assert.deepEqual(
      sqliteRows(database.raw, "SELECT source_id FROM discovery_source_state"),
      [],
    );
    assert.deepEqual(
      sqliteRows(database.raw, "SELECT canonical_url FROM discovery_candidates"),
      [],
    );
    assert.deepEqual(
      sqliteRows(
        database.raw,
        "SELECT outcome, candidate_count FROM discovery_runs WHERE run_id = 'rollback-sql-run'",
      ),
      [["failed", 0]],
    );
  } finally {
    database.raw.close();
  }
});

test("a failed run completion preserves the original error and logs the completion failure", async () => {
  const database = await sqliteDatabase({
    failAfterBatchStatement: 0,
    failRunCompletion: true,
  });
  const originalError = console.error;
  const entries = [];
  console.error = (entry) => entries.push(JSON.parse(entry));
  try {
    await assert.rejects(
      runLiveDiscovery({
        database,
        sources: [source()],
        fetchImpl: async (url) =>
          url.endsWith("/robots.txt")
            ? response("User-agent: *\nAllow: /")
            : response(
                "<rss><channel><item><link>https://archive.example/posts/one</link></item></channel></rss>",
                { headers: { "Content-Type": "application/rss+xml" } },
              ),
        now: () => new Date("2026-08-14T12:00:00.000Z"),
        makeRunId: () => "completion-failure-run",
      }),
      /simulated_batch_failure/,
    );
    assert.deepEqual(entries, [{
      event: "rosen_source_discovery_failure_completion_failed",
      runId: "completion-failure-run",
      error: "Error",
      message: "simulated_completion_failure",
    }]);
  } finally {
    console.error = originalError;
    database.raw.close();
  }
});
