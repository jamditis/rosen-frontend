// Pure URL-detection helper for linkifying text content.
// Returns null for empty input; otherwise an array of
//   { type: 'text' | 'url', value: string }
// in the order they appear. URLs and surrounding text are separated by
// String.prototype.split with a capture group, so every odd index in
// the raw split is a URL and every even index is plain text — no
// stateful .test() needed.

const URL_PATTERN_SOURCE = String.raw`(https?:\/\/[^\s<>"{}|\\^\`\[\]]+)`;

export const splitUrlsForLinkify = (text) => {
  if (!text) return null;
  const re = new RegExp(URL_PATTERN_SOURCE, 'g');
  const parts = text.split(re);
  return parts.map((value, i) => ({
    type: i % 2 === 1 ? 'url' : 'text',
    value,
  }));
};
