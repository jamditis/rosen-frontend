/**
 * Search-text normalization for the archive filter (#456).
 *
 * The archive filter matched query against title/summary/categories with a
 * plain `toLowerCase().includes()`. That is exact-codepoint matching, so a
 * record whose title uses typographic punctuation -- a curly apostrophe
 * (U+2019), curly quotes (U+201C/D), an em or en dash (U+2014/2013), or an
 * ellipsis (U+2026) -- never matched the ASCII a user actually types
 * ('  "  -  ...). Jay reported the symptom on the 2026-06-19 call: "I'd put in
 * the headline of a piece I know is in there, and it says we don't have any
 * such thing." 33 non-social article titles in the archive carry such
 * characters.
 *
 * The fix is one normalization boundary: fold both the stored text and the
 * query through `normalizeForSearch` before comparing, so the whole class of
 * typographic mismatches collapses to ASCII and can't silently fail to match.
 * Diacritics are folded too (cafe matches an accented cafe), which only widens
 * recall. The prime (U+2032) is folded to an apostrophe too -- not present in
 * today's data, but a common apostrophe lookalike in social and OCR text the
 * archive ingests, so the boundary covers the whole class. (Double-prime
 * U+2033 NFKD-decomposes to two primes, so it folds the same way for free.)
 *
 * Special characters are referenced by numeric code point (0x2019, etc.) rather
 * than as literal glyphs, so the whole module is reviewable in plain ASCII.
 */

// Record-internal field separator (U+0001). A real query never contains a
// control character, so joining a record's fields with this and running a
// single `includes()` can never match a phrase that spans two fields (e.g. a
// title's last word plus a summary's first word). Keeps the old per-field
// matching semantics while reducing the matcher to one substring test.
const FIELD_SEP = String.fromCharCode(0x01);
export const MIN_EXACT_PHRASE_WORDS = 2;

/**
 * Fold a string to a normalized, lower-case, ASCII-punctuation form for search.
 * Lower-cases, NFKD-decomposes (so accented letters split into base + combining
 * marks), then walks code points: typographic quotes/dashes become their ASCII
 * equivalents, combining marks are dropped, everything else passes through.
 * Whitespace runs are collapsed last.
 * @param {*} str - any value; null/undefined/non-strings are coerced safely
 * @returns {string} normalized text ('' for empty input)
 */
export function normalizeForSearch(str) {
  if (str == null) return '';
  const decomposed = String(str).toLowerCase().normalize('NFKD');
  let out = '';
  for (const ch of decomposed) {
    const code = ch.codePointAt(0);
    if ((code >= 0x2018 && code <= 0x201b) || code === 0x2032) { // single/low/high quotes, prime
      out += "'";
    } else if (code >= 0x201c && code <= 0x201f) { // low/high double quotes
      out += '"';
    } else if (code === 0x2013 || code === 0x2014 || code === 0x2015) { // en/em dash, bar
      out += '-';
    } else if (code === 0x2026) {                  // horizontal ellipsis
      out += '...';
    } else if (code >= 0x0300 && code <= 0x036f) { // combining diacritical marks
      // drop
    } else {
      out += ch;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Tokenize text at non-letter/digit boundaries for exact phrases. This covers
 * MiniSearch's whitespace/punctuation boundaries plus symbols, while reusing
 * the archive's case, quote, and diacritic folding.
 */
export function tokenizeSearchWords(value) {
  return normalizeForSearch(value).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * Parse supported quoted phrases without changing ordinary query text.
 * MiniSearch supplies broad token recall; phrase postings verify adjacency.
 */
export function parseSearchQuery(rawQuery) {
  const source = rawQuery == null ? '' : String(rawQuery).trim();
  const normalized = normalizeForSearch(source);
  const quoteCount = [...normalized].filter(character => character === '"').length;
  if (quoteCount % 2 !== 0) {
    return {
      miniQuery: source,
      phraseKeys: [],
      phraseTokens: [],
      unquotedTokens: tokenizeSearchWords(source),
    };
  }
  const phraseTokens = [];
  const unquotedParts = [];
  const quotePattern = /"([^"]+)"/g;
  let cursor = 0;
  let match;

  while ((match = quotePattern.exec(normalized)) !== null) {
    unquotedParts.push(normalized.slice(cursor, match.index));
    const tokens = tokenizeSearchWords(match[1]);
    if (tokens.length >= MIN_EXACT_PHRASE_WORDS) {
      phraseTokens.push(tokens);
    } else {
      unquotedParts.push(match[1]);
    }
    cursor = match.index + match[0].length;
  }
  unquotedParts.push(normalized.slice(cursor));

  if (phraseTokens.length === 0) {
    return {
      miniQuery: source,
      phraseKeys: [],
      phraseTokens: [],
      unquotedTokens: tokenizeSearchWords(source),
    };
  }

  return {
    miniQuery: source
      .replace(/["\u201c\u201d\u201e\u201f]/gu, '')
      .replace(/\s+/g, ' ')
      .trim(),
    phraseKeys: phraseTokens.map(tokens => tokens.join('~')),
    phraseTokens,
    unquotedTokens: tokenizeSearchWords(unquotedParts.join(' ')),
  };
}

function includesTokenSequence(fieldTokens, expectedTokens) {
  if (expectedTokens.length > fieldTokens.length) return false;
  const lastStart = fieldTokens.length - expectedTokens.length;
  for (let start = 0; start <= lastStart; start += 1) {
    if (expectedTokens.every((token, offset) => fieldTokens[start + offset] === token)) {
      return true;
    }
  }
  return false;
}

/**
 * Apply quoted-query semantics to the already normalized in-memory card text.
 * A phrase cannot cross a record field boundary.
 */
export function matchesParsedSearchText(searchText, parsedQuery) {
  const parsed = parsedQuery || parseSearchQuery('');
  if (parsed.phraseTokens.length === 0) {
    return !parsed.miniQuery || searchText.includes(normalizeForSearch(parsed.miniQuery));
  }

  const fieldTokens = String(searchText || '')
    .split(FIELD_SEP)
    .map(tokenizeSearchWords);
  const phrasesMatch = parsed.phraseTokens.every(tokens => (
    fieldTokens.some(field => includesTokenSequence(field, tokens))
  ));
  if (!phrasesMatch) return false;

  const allTokens = fieldTokens.flat();
  return parsed.unquotedTokens.every(expected => (
    allTokens.some(token => token.startsWith(expected))
  ));
}

/**
 * Search every loaded MiniSearch artifact. Quoted queries require each hit to
 * be present in every exact phrase posting list. An artifact without postings
 * cannot verify adjacency and contributes no quoted full-text hits.
 */
export function searchLoadedIndexes(indexes, rawQuery) {
  const parsed = parseSearchQuery(rawQuery);
  if (!parsed.miniQuery) return [];

  return (Array.isArray(indexes) ? indexes : []).flatMap((mini) => {
    const hits = mini.search(parsed.miniQuery, { prefix: true, combineWith: 'AND' });
    if (parsed.phraseKeys.length === 0) return hits;
    if (!(mini.phrasePostings instanceof Map)) return [];

    return hits.filter(hit => parsed.phraseKeys.every(key => (
      mini.phrasePostings.get(key)?.has(hit.id) === true
    )));
  });
}

/**
 * Find ordered autocomplete matches, deduplicated by normalized search text.
 * The first spelling of an equivalent term is preserved for display.
 * @param {Array<*>} terms - autocomplete terms in display-priority order
 * @param {*} rawQuery - the user's unnormalized query
 * @param {number} limit - maximum number of unique suggestions
 * @returns {string[]} first-seen display terms matching the query
 */
export function findSearchSuggestions(terms, rawQuery, limit = 8) {
  if (!Array.isArray(terms) || !Number.isFinite(limit)) return [];

  const query = normalizeForSearch(rawQuery);
  const max = Math.max(0, Math.floor(limit));
  if (!query || max === 0) return [];

  const seen = new Set();
  const suggestions = [];

  for (const term of terms) {
    if (typeof term !== 'string') continue;
    const normalizedTerm = normalizeForSearch(term);
    if (
      !normalizedTerm ||
      !normalizedTerm.includes(query) ||
      seen.has(normalizedTerm)
    ) {
      continue;
    }

    seen.add(normalizedTerm);
    suggestions.push(term);
    if (suggestions.length === max) break;
  }

  return suggestions;
}

/**
 * Build the normalized, searchable blob for a record: title, summary, and each
 * category, normalized and joined with a field separator so matches stay within
 * a single field. Precompute this once per record on data load, then test each
 * keystroke's normalized term against the blob.
 * @param {Object} record - an archive record
 * @returns {string} normalized searchable text
 */
export function buildSearchText(record) {
  if (!record) return '';
  const summary = record.summaryPreview || record.summary || '';
  const parts = [record.title || '', summary, ...(record.categories || [])];
  return parts.map(normalizeForSearch).join(FIELD_SEP);
}

/**
 * Whether a record matches a raw search term. An empty term matches everything,
 * mirroring the filter's "no search" state.
 * @param {Object} record - an archive record
 * @param {string} rawTerm - the user's unnormalized query
 * @returns {boolean}
 */
export function matchesSearch(record, rawTerm) {
  const term = normalizeForSearch(rawTerm);
  if (!term) return true;
  return buildSearchText(record).includes(term);
}

export default {
  normalizeForSearch,
  tokenizeSearchWords,
  parseSearchQuery,
  matchesParsedSearchText,
  searchLoadedIndexes,
  findSearchSuggestions,
  buildSearchText,
  matchesSearch,
};
