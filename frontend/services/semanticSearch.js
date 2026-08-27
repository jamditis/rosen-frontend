/**
 * Main-thread client for the free-text semantic search worker (#279).
 *
 * Mirrors `semanticRecall.js`, with one deliberate difference: an aborted
 * request does NOT terminate the worker. Search aborts on every keystroke, and
 * the worker holds the loaded model, so terminating it would throw away the
 * download the reader just paid for.
 *
 * The worker is created only when the reader turns the toggle on, so a visit
 * that never uses semantic search costs nothing.
 */
const DEFAULT_WORKER_URL = new URL(
  './semantic-search-worker.js?v=3.8.33',
  import.meta.url,
);

// Cold start loads the model, which is tens of megabytes on a first use and can
// take several seconds on a phone. A warm query encodes in well under a second.
// One generous timeout covers both rather than reporting a slow first load as a
// failure.
export const SEMANTIC_SEARCH_TIMEOUT_MS = 60000;

function makeAbortError() {
  if (typeof DOMException === 'function') {
    return new DOMException('Semantic search request aborted', 'AbortError');
  }
  const error = new Error('Semantic search request aborted');
  error.name = 'AbortError';
  return error;
}

function defaultWorkerFactory() {
  if (typeof Worker !== 'function') {
    throw new Error('Semantic search requires Web Worker support');
  }
  return new Worker(DEFAULT_WORKER_URL, {
    type: 'module',
    name: 'archive-semantic-search',
  });
}

export function createSemanticSearchClient({
  workerFactory = defaultWorkerFactory,
  requestTimeoutMs = SEMANTIC_SEARCH_TIMEOUT_MS,
} = {}) {
  let worker = null;
  let nextRequestId = 0;
  const pending = new Map();

  const cleanupRequest = (requestId) => {
    const request = pending.get(requestId);
    if (!request) return null;
    pending.delete(requestId);
    clearTimeout(request.timer);
    request.signal?.removeEventListener('abort', request.onAbort);
    return request;
  };

  const rejectAll = (error) => {
    for (const requestId of [...pending.keys()]) {
      cleanupRequest(requestId)?.reject(error);
    }
  };

  const dropWorker = (error) => {
    rejectAll(error);
    worker?.terminate();
    worker = null;
  };

  const handleMessage = (event) => {
    const message = event?.data;
    if (!message || !pending.has(message.requestId)) return;
    const request = cleanupRequest(message.requestId);
    if (message.type === 'semantic-warmup-result') {
      request.resolve({ count: message.count ?? 0 });
      return;
    }
    if (message.type === 'semantic-query-result') {
      request.resolve({
        query: message.query,
        matches: Array.isArray(message.matches) ? message.matches : [],
        count: message.count ?? 0,
      });
      return;
    }
    if (message.type === 'semantic-query-error') {
      request.reject(new Error(message.error || 'Semantic search worker failed'));
    }
  };

  const handleWorkerError = (event) => {
    // A worker that fails to start (no module worker support, a blocked or
    // missing script) reports here. Drop it so the toggle can fall back to
    // lexical search instead of waiting for a timeout.
    dropWorker(new Error(event?.message || 'Semantic search worker failed'));
  };

  const ensureWorker = () => {
    if (worker) return worker;
    worker = workerFactory();
    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleWorkerError);
    return worker;
  };

  const post = (payload, { signal, timeoutMs = requestTimeoutMs } = {}) => {
    if (signal?.aborted) return Promise.reject(makeAbortError());

    let searchWorker;
    try {
      searchWorker = ensureWorker();
    } catch (error) {
      return Promise.reject(error);
    }

    const requestId = `semantic-search-${++nextRequestId}`;
    return new Promise((resolve, reject) => {
      // Abort forgets this one request and leaves the worker, and its loaded
      // model, in place for the next keystroke.
      const onAbort = () => cleanupRequest(requestId)?.reject(makeAbortError());
      const timer = setTimeout(() => {
        if (!pending.has(requestId)) return;
        // A hung worker cannot be recovered by waiting, so replace it. The
        // browser has the model cached by then, so the retry reloads it fast.
        dropWorker(new Error('Semantic search request timed out'));
      }, timeoutMs);

      pending.set(requestId, { resolve, reject, timer, signal, onAbort });
      signal?.addEventListener('abort', onAbort, { once: true });

      try {
        searchWorker.postMessage({ ...payload, requestId });
      } catch (error) {
        cleanupRequest(requestId)?.reject(error);
      }
    });
  };

  /** Load the artifact and the model without ranking anything. */
  const warmup = (options) => post({ type: 'semantic-warmup' }, options);

  /** Rank the archive against one query. Resolves { query, matches, count }. */
  const search = (query, { k, minScore, ...options } = {}) => {
    if (typeof query !== 'string' || !query.trim()) {
      return Promise.reject(new Error('Semantic search requires a query'));
    }
    return post({ type: 'semantic-query', query, k, minScore }, options);
  };

  // Drop the worker and the model it holds. Called when the reader switches the
  // toggle off: the download stays in the browser cache, so turning it back on
  // reloads from disk. In-flight requests are rejected as aborts, not failures,
  // so an answer that arrives after the reader has left cannot report the
  // feature as broken.
  const terminate = () => {
    dropWorker(makeAbortError());
  };

  return { warmup, search, terminate };
}

let defaultClient;

export function warmupSemanticSearch(options) {
  defaultClient ||= createSemanticSearchClient();
  return defaultClient.warmup(options);
}

export function requestSemanticSearch(query, options) {
  defaultClient ||= createSemanticSearchClient();
  return defaultClient.search(query, options);
}

export function terminateSemanticSearch() {
  defaultClient?.terminate();
  defaultClient = undefined;
}
