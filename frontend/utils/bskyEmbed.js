// Convert a bsky.app URL to the unauthenticated embed.bsky.app equivalent.
// Single source of truth: CLAUDE.md "Known issues" warns RecordModal and
// ThreadModal must change together if Bluesky moves the embed subdomain, so
// the literal lives here and both import it.
export const toEmbedUrl = (url) => {
  if (!url) return url;
  return url.replace('//bsky.app', '//embed.bsky.app');
};
