import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import worker from "../src/index.js";
import { runLiveDiscovery } from "../src/ledger.js";
import {
  DISCOVERY_MODE,
  discoverSource,
  evaluateRobots,
  extractCandidateUrls,
  fetchAllowedUrl,
  readBoundedText,
  runDiscovery,
} from "../src/discovery.js";

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
    fetchOrigins: ["https://public.api.bsky.app"],
    fetchPathPrefixes: ["/xrpc/app.bsky.feed.getAuthorFeed"],
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

function response(body, { status = 200, headers = {} } = {}) {
  return new Response(body, { status, headers });
}

function fakeDatabase({ state = null } = {}) {
  const queries = [];
  return {
    queries,
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              queries.push({ operation: "first", sql, params });
              return state;
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
      return Promise.all(statements.map((statement) => statement.run()));
    },
  };
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
    fetchImpl: async () => response(await blueskyFixture(), {
      headers: { "Content-Type": "application/json" },
    }),
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

test("the Bluesky adapter rejects an invalid payload and stops on a rate limit", async () => {
  const invalid = await discoverSource(blueskySource(), {
    fetchImpl: async () => response(JSON.stringify({ feed: {} }), {
      headers: { "Content-Type": "application/json" },
    }),
  });
  assert.equal(invalid.status, "invalid_source_payload");

  const malformedQuote = JSON.parse(await blueskyFixture());
  malformedQuote.feed[3].post.record.embed = { $type: "app.bsky.embed.record" };
  const invalidQuote = await discoverSource(blueskySource(), {
    fetchImpl: async () => response(JSON.stringify(malformedQuote), {
      headers: { "Content-Type": "application/json" },
    }),
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
    fetchImpl: async () => response(JSON.stringify(quoteWithMedia), {
      headers: { "Content-Type": "application/json" },
    }),
  });
  const quoteCandidate = quoteResult.candidates.find(
    ({ postType }) => postType === "quote_post",
  );
  assert.equal(
    quoteCandidate.url,
    "at://did:plc:3t37x6vfigdzzp2gjcfnzlz4/app.bsky.feed.post/quote",
  );

  const limited = await discoverSource(blueskySource(), {
    fetchImpl: async () => response("", { status: 429 }),
  });
  assert.equal(limited.status, "stop_http_429");

  const oversized = await discoverSource(blueskySource(), {
    fetchImpl: async () => response("{}", {
      headers: {
        "Content-Length": "131073",
        "Content-Type": "application/json",
      },
    }),
  });
  assert.equal(oversized.status, "response_too_large");
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

test("bounded reads reject a declared or streamed oversized response", async () => {
  const declared = await readBoundedText(
    response("small", { headers: { "Content-Length": "9" } }),
    8,
  );
  assert.deepEqual(declared, { ok: false, reason: "response_too_large" });

  const streamed = await readBoundedText(response("123456789"), 8);
  assert.deepEqual(streamed, { ok: false, reason: "response_too_large" });
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

test("feed parsing keeps only allowed, canonical candidate URLs", () => {
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
  assert.equal(report.sources[0].candidateCount, 1);
  assert.equal(feedHeaders["If-None-Match"], '"previous-feed"');
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
    fetchImpl: async () => response(await blueskyFixture(), {
      headers: { "Content-Type": "application/json" },
    }),
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
