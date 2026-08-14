/**
 * Only this manifest may name a remote source. The Worker never accepts a URL
 * from a request, queue, or environment variable. Keep this list small and
 * review each source under the archive policy before enabling dry-run mode.
 */
export const DISCOVERY_USER_AGENT =
  "RosenArchiveDiscovery/0.1 (read-only; https://github.com/jamditis/rosen-frontend/issues/806)";

export const SOURCE_MANIFEST = Object.freeze([
  Object.freeze({
    id: "jay-rosen-bluesky",
    label: "Jay Rosen Bluesky activity",
    kind: "atproto-author-feed",
    actorDid: "did:plc:3t37x6vfigdzzp2gjcfnzlz4",
    endpoint:
      "https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=did%3Aplc%3A3t37x6vfigdzzp2gjcfnzlz4&filter=posts_and_author_threads&limit=25",
    fetchOrigins: ["https://public.api.bsky.app"],
    fetchPathPrefixes: ["/xrpc/app.bsky.feed.getAuthorFeed"],
    maxCandidates: 25,
  }),
  Object.freeze({
    id: "pressthink-wordpress-posts",
    label: "PressThink recent posts",
    kind: "wordpress-api",
    endpoint: "https://pressthink.org/wp-json/wp/v2/posts?per_page=25&orderby=modified&order=desc&_fields=link,modified",
    robotsUrl: "https://pressthink.org/robots.txt",
    fetchOrigins: ["https://pressthink.org"],
    fetchPathPrefixes: ["/wp-json/wp/v2/posts", "/robots.txt"],
    candidateOrigins: ["https://pressthink.org"],
    candidatePathPrefixes: ["/"],
    maxCandidates: 25,
    minimumIntervalHours: 168,
  }),
]);

/** Metadata that the public health endpoint may expose. */
export const PUBLIC_SOURCE_MANIFEST = Object.freeze(
  SOURCE_MANIFEST.map(({ id, label, kind, maxCandidates }) =>
    Object.freeze({ id, label, kind, maxCandidates }),
  ),
);
