/**
 * Only this manifest may name a remote source. The Worker never accepts a URL
 * from a request, queue, or environment variable. Keep this list small and
 * review each source under the archive policy before enabling dry-run mode.
 */
export const DISCOVERY_USER_AGENT =
  "RosenArchiveDiscovery/0.1 (read-only; https://github.com/jamditis/rosen-frontend/issues/806)";

/** Increment when the reviewed source boundary or adapter shape changes. */
export const SOURCE_MANIFEST_VERSION = "2026-11-02.1";

export const SOURCE_MANIFEST = Object.freeze([
  Object.freeze({
    id: "jay-rosen-bluesky",
    label: "Jay Rosen Bluesky activity",
    kind: "atproto-author-feed",
    actorDid: "did:plc:3t37x6vfigdzzp2gjcfnzlz4",
    endpoint:
      "https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=did%3Aplc%3A3t37x6vfigdzzp2gjcfnzlz4&filter=posts_with_replies&limit=25",
    robotsUrl: "https://public.api.bsky.app/robots.txt",
    fetchOrigins: ["https://public.api.bsky.app"],
    fetchPathPrefixes: ["/xrpc/app.bsky.feed.getAuthorFeed", "/robots.txt"],
    maxCandidates: 100,
    maxPages: 4,
  }),
  Object.freeze({
    id: "pressthink-wordpress-posts",
    label: "PressThink recent posts",
    kind: "wordpress-api",
    ingestion: true,
    endpoint: "https://pressthink.org/wp-json/wp/v2/posts?per_page=25&orderby=modified&order=desc&_fields=link,modified",
    robotsUrl: "https://pressthink.org/robots.txt",
    fetchOrigins: ["https://pressthink.org"],
    fetchPathPrefixes: ["/wp-json/wp/v2/posts", "/robots.txt"],
    candidateOrigins: ["https://pressthink.org"],
    candidatePathPrefixes: ["/"],
    maxCandidates: 25,
    minimumIntervalHours: 168,
  }),
  ...[
    ["cjr-jay-rosen-search", "CJR articles about Jay Rosen", "https://www.cjr.org/search/Jay+Rosen/feed/rss2/", "about_jay"],
    ["cjr-jay-rosen-author", "Jay Rosen at CJR", "https://www.cjr.org/author/jay-rosen/feed", "by_jay"],
    ["common-dreams-jay-rosen-author", "Jay Rosen at Common Dreams", "https://www.commondreams.org/feeds/community/jay-rosen.rss", "by_jay"],
  ].map(([id, label, endpoint, relevance]) => {
    const { origin, pathname } = new URL(endpoint);
    return Object.freeze({ id, label, endpoint, relevance, kind: "rss", ingestion: true,
      robotsUrl: origin + "/robots.txt", fetchOrigins: [origin],
      fetchPathPrefixes: [pathname, "/robots.txt"], candidateOrigins: [origin],
      candidatePathPrefixes: ["/"], maxCandidates: 100 });
  }),
]);

/** Metadata that the public health endpoint may expose. */
export const PUBLIC_SOURCE_MANIFEST = Object.freeze(
  SOURCE_MANIFEST.map(({ id, label, kind, maxCandidates }) =>
    Object.freeze({ id, label, kind, maxCandidates }),
  ),
);

/** Only these reviewed article consumers may record source receipts. */
export const ARTICLE_SOURCE_IDS = Object.freeze(SOURCE_MANIFEST.filter(source => source.ingestion).map(source => source.id));

export function isArticleSourceUrl(sourceId, value) {
  const source = SOURCE_MANIFEST.find(item => item.id === sourceId && item.ingestion);
  if (!source || typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
      || !source.candidateOrigins.includes(url.origin)) return false;
    return source.kind === "wordpress-api"
      ? /^\/\d{4}\/\d{2}\/[^/]+\/$/.test(url.pathname)
      : url.pathname !== "/";
  } catch { return false; }
}
