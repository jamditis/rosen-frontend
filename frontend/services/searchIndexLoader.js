/**
 * Load independent full-text indexes without letting one unavailable artifact
 * discard siblings that loaded successfully.
 */
export function loadSearchIndexArtifact(serialized, options, loadJS) {
  const { phrasePostings, ...artifact } = JSON.parse(serialized);
  const index = loadJS(artifact, options);
  if (phrasePostings && typeof phrasePostings === 'object') {
    index.phrasePostings = new Map(
      Object.entries(phrasePostings).map(([key, documentIds]) => {
        const recordIds = documentIds.map((documentId) => {
          if (!Object.hasOwn(artifact.documentIds, documentId)) {
            throw new Error(`exact phrase posting ${key} references missing document ${documentId}`);
          }
          return artifact.documentIds[documentId];
        });
        return [key, new Set(recordIds)];
      }),
    );
  }
  return index;
}

export async function loadAvailableSearchIndexes(
  specs,
  { fetchImpl = globalThis.fetch, loadJSON } = {},
) {
  const settled = await Promise.allSettled(specs.map(async ({ url, options }) => {
    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new Error(`search index fetch failed (${url}): HTTP ${response.status}`);
    }
    return loadJSON(await response.text(), options);
  }));

  const loaded = [];
  const failures = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      loaded.push({ url: specs[index].url, index: result.value });
      return;
    }
    failures.push({
      url: specs[index].url,
      error: result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
    });
  });

  if (loaded.length === 0) {
    throw new AggregateError(
      failures.map(failure => failure.error),
      'all full-text search indexes failed to load',
    );
  }

  return { indexes: loaded.map(entry => entry.index), loaded, failures };
}

/**
 * Cache each successfully loaded index independently while retrying only the
 * artifacts that remain unavailable. Concurrent callers share one attempt,
 * and results always follow the original spec order even when recovery happens
 * across multiple attempts.
 */
export function createResilientSearchIndexLoader(
  specs,
  { fetchImpl = globalThis.fetch, loadJSON } = {},
) {
  const loadedByUrl = new Map();
  let inFlight = null;

  const orderedIndexes = () => specs
    .filter(spec => loadedByUrl.has(spec.url))
    .map(spec => loadedByUrl.get(spec.url));

  const load = () => {
    if (inFlight) return inFlight;

    const missingSpecs = specs.filter(spec => !loadedByUrl.has(spec.url));
    if (missingSpecs.length === 0) {
      return Promise.resolve({ indexes: orderedIndexes(), failures: [], complete: true });
    }

    inFlight = loadAvailableSearchIndexes(missingSpecs, { fetchImpl, loadJSON })
      .then(({ loaded, failures }) => {
        for (const entry of loaded) loadedByUrl.set(entry.url, entry.index);
        const result = {
          indexes: orderedIndexes(),
          failures,
          complete: loadedByUrl.size === specs.length,
        };
        if (!result.complete) inFlight = null;
        return result;
      })
      .catch((error) => {
        inFlight = null;
        if (loadedByUrl.size > 0 && error instanceof AggregateError) {
          return {
            indexes: orderedIndexes(),
            failures: missingSpecs.map((spec, index) => ({
              url: spec.url,
              error: error.errors[index] instanceof Error
                ? error.errors[index]
                : new Error(String(error.errors[index])),
            })),
            complete: false,
          };
        }
        throw error;
      });

    return inFlight;
  };

  return { load };
}
