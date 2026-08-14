import assert from "node:assert/strict";
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
    '"current-feed"',
    "run-20260814",
  ]);
  assert.equal(
    database.queries.some(({ params }) => params.includes("<rss><channel>")),
    false,
  );
});
