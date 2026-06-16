// Scheme allowlist for link hrefs (#322).
//
// Record and thread views render archive-supplied URLs straight into
// an <a href> via HTM, which (unlike React's DOM sink) does not strip dangerous
// schemes. A record whose url is `javascript:...` would then execute on click.
//
// We resolve the value against a dummy base and inspect the parsed protocol.
// Using the platform URL parser (not a regex) is deliberate: the parser strips
// the same tab/newline/null characters browsers strip before scheme dispatch,
// so `java\tscript:` collapses to `javascript:` and is rejected — a bypass a
// naive `/^javascript:/i` check would miss. Resolving against a base (rather
// than bare `new URL`) lets scheme-less relative URLs through (the dissertation
// reader link is relative) while still rejecting opaque `javascript:` URLs.

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

// Any absolute, non-special origin works; it only supplies a scheme for
// relative inputs so they resolve to an allowed protocol.
const RESOLUTION_BASE = 'https://rosen-archive.invalid/';

/**
 * Return `url` unchanged if it is a safe link target, else '#'.
 * Safe = http/https/mailto, or a scheme-less relative/protocol-relative URL.
 * @param {string} url
 * @returns {string}
 */
export const sanitizeHref = (url) => {
  if (typeof url !== 'string') return '#';
  const trimmed = url.trim();
  if (!trimmed) return '#';

  let parsed;
  try {
    parsed = new URL(trimmed, RESOLUTION_BASE);
  } catch {
    return '#';
  }

  return ALLOWED_PROTOCOLS.has(parsed.protocol) ? url : '#';
};
