/**
 * Search index builder (build-time, curator-publish step).
 *
 * Turns archive CSV rows into a serialized MiniSearch index so the frontend can
 * run real full-text search (BM25 ranking + prefix matching) over title,
 * summary, key_concepts, tags, thematic_categories, and a raw_text excerpt.
 *
 * Why build from the CSV and not archive-data.json: the export step drops
 * raw_text (it keeps only a ~200-char quote) to keep the served payload small,
 * so the body text is never reachable from the current substring search. The
 * index is the only artifact that carries body tokens to the browser, which is
 * the entire point of issue #276.
 *
 * Pure and side-effect free: rows in -> serializable index out. This module is
 * Shared by data/export-archive-data.js for the separate article and social
 * artifacts, and by the browser loader through their common schema.
 */
import MiniSearch from 'minisearch';
// The index schema (fields/storeFields/idField) is the shared build+runtime
// contract, so it lives in one module that both the builder and the browser
// loader import. It sits under frontend/ because that is what gets deployed;
// see frontend/utils/searchConfig.js for why. Re-exported below so existing
// importers of this builder keep resolving the same names.
import {
  SEARCH_FIELDS,
  SOCIAL_SEARCH_FIELDS,
  STORE_FIELDS,
  searchIndexOptions,
  socialSearchIndexOptions,
} from '../../frontend/utils/searchConfig.js';
import {
  MIN_EXACT_PHRASE_WORDS,
  tokenizeSearchWords,
} from '../../frontend/utils/searchNormalize.js';

// raw_text is the long field. Cap the indexed slice so the artifact stays small
// and the build stays fast. 8000 chars covers roughly the first few screens of
// an article -- enough for recall without indexing the full body of every record.
export const RAW_TEXT_INDEX_CHARS = 8000;

export {
  SEARCH_FIELDS,
  SOCIAL_SEARCH_FIELDS,
  STORE_FIELDS,
  searchIndexOptions,
  socialSearchIndexOptions,
};

const str = (v) => (v == null ? '' : String(v));

export function buildPhraseVocabulary(docs) {
  const vocabulary = new Set();
  for (const doc of docs) {
    const concepts = doc.concepts.split(/[,;]+/u);
    for (const concept of concepts) {
      const tokens = tokenizeSearchWords(concept);
      for (let wordCount = MIN_EXACT_PHRASE_WORDS; wordCount <= tokens.length; wordCount += 1) {
        for (let start = 0; start <= tokens.length - wordCount; start += 1) {
          vocabulary.add(tokens.slice(start, start + wordCount).join('~'));
        }
      }
    }
  }
  return vocabulary;
}

/**
 * Build compact exact-phrase postings for phrases already named in the
 * archive's concept vocabulary. Numeric document ids match MiniSearch's fresh
 * index order and are hydrated to public record ids in the browser loader.
 */
export function buildPhrasePostings(docs, fields = SEARCH_FIELDS) {
  const vocabulary = buildPhraseVocabulary(docs);
  if (vocabulary.size === 0) return null;

  return buildPhrasePostingsForVocabulary(docs, fields, vocabulary);
}

function buildPhrasePostingsForVocabulary(docs, fields, vocabulary) {
  if (vocabulary.size === 0) return null;

  const postings = Object.fromEntries([...vocabulary].sort().map(key => [key, []]));
  const maxPhraseWords = Math.max(
    ...[...vocabulary].map(key => key.split('~').length),
  );
  docs.forEach((doc, documentId) => {
    const matches = new Set();
    for (const field of fields) {
      const tokens = tokenizeSearchWords(doc[field]);
      const maxWords = Math.min(maxPhraseWords, tokens.length);
      for (let wordCount = MIN_EXACT_PHRASE_WORDS; wordCount <= maxWords; wordCount += 1) {
        for (let start = 0; start <= tokens.length - wordCount; start += 1) {
          const key = tokens.slice(start, start + wordCount).join('~');
          if (vocabulary.has(key)) matches.add(key);
        }
      }
    }
    for (const key of matches) postings[key].push(documentId);
  });

  return postings;
}

/**
 * Map one archive CSV row (snake_case keys from csv-parse columns:true) to the
 * document shape MiniSearch indexes. Tolerant of missing columns -- an absent
 * field becomes an empty string rather than undefined, which MiniSearch rejects.
 */
export function recordToSearchDoc(row, { rawTextChars = RAW_TEXT_INDEX_CHARS } = {}) {
  return {
    id: str(row.id),
    title: str(row.title),
    author: str(row.author),
    summary: str(row.summary),
    concepts: str(row.key_concepts),
    tags: str(row.tags),
    categories: str(row.thematic_categories),
    body: str(row.raw_text).slice(0, rawTextChars),
  };
}

/**
 * Build a MiniSearch index from archive CSV rows.
 *
 * Returns { json, count } where json is the serializable index object
 * (MiniSearch.toJSON output -- pass it through JSON.stringify to write the
 * artifact) and count is the number of indexed documents. Rows with no id are
 * skipped; a duplicate id surfaces MiniSearch's own error rather than being
 * silently dropped, so a CSV that violates id uniqueness fails loudly at build.
 */
export function buildSearchIndex(
  rows,
  {
    rawTextChars = RAW_TEXT_INDEX_CHARS,
    indexOptions = searchIndexOptions(),
    phraseVocabulary,
  } = {},
) {
  const mini = new MiniSearch(indexOptions);
  const docs = [];
  for (const row of rows) {
    const doc = recordToSearchDoc(row, { rawTextChars });
    if (!doc.id) continue;
    docs.push(doc);
  }
  mini.addAll(docs);
  const json = mini.toJSON();
  for (let documentId = 0; documentId < docs.length; documentId += 1) {
    if (json.documentIds[documentId] !== docs[documentId].id) {
      throw new Error(
        `MiniSearch document id order changed at ${documentId}; exact phrase postings cannot be built safely`,
      );
    }
  }
  const resolvedPhraseVocabulary = phraseVocabulary || buildPhraseVocabulary(docs);
  const phrasePostings = buildPhrasePostingsForVocabulary(
    docs,
    indexOptions.fields,
    resolvedPhraseVocabulary,
  );
  if (phrasePostings) json.phrasePostings = phrasePostings;
  return { json, count: docs.length, phraseVocabulary: resolvedPhraseVocabulary };
}

export default {
  RAW_TEXT_INDEX_CHARS,
  SEARCH_FIELDS,
  SOCIAL_SEARCH_FIELDS,
  STORE_FIELDS,
  searchIndexOptions,
  socialSearchIndexOptions,
  recordToSearchDoc,
  buildPhraseVocabulary,
  buildPhrasePostings,
  buildSearchIndex,
};
