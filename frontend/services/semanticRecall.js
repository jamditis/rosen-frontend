const DEFAULT_WORKER_URL = new URL(
  './embeddings-worker.js?v=3.8.33',
  import.meta.url,
);

export const SEMANTIC_MIN_SCORE = 0.70;
export const SEMANTIC_LIMIT = 5;
export const SEMANTIC_REQUEST_K = 12;
export const SEMANTIC_REQUEST_TIMEOUT_MS = 10000;

function makeAbortError() {
  if (typeof DOMException === 'function') {
    return new DOMException('Semantic recall request aborted', 'AbortError');
  }
  const error = new Error('Semantic recall request aborted');
  error.name = 'AbortError';
  return error;
}

function defaultWorkerFactory() {
  if (typeof Worker !== 'function') {
    throw new Error('Semantic recall requires Web Worker support');
  }
  return new Worker(DEFAULT_WORKER_URL, {
    type: 'module',
    name: 'archive-semantic-recall',
  });
}

export function buildYearIndex(records) {
  const years = {};
  for (const record of Array.isArray(records) ? records : []) {
    if (record?.type !== 'article') continue;
    if (typeof record?.id !== 'string' || !record.id) continue;
    const rawYear = record.year;
    if (rawYear === null || rawYear === undefined || String(rawYear).trim() === '') {
      continue;
    }
    const year = Number(rawYear);
    if (Number.isFinite(year)) years[record.id] = year;
  }
  return years;
}

export function selectSemanticRecords(
  neighbors,
  records,
  { minScore = SEMANTIC_MIN_SCORE, limit = SEMANTIC_LIMIT } = {},
) {
  const recordsById = new Map(
    (Array.isArray(records) ? records : [])
      .filter(record => typeof record?.id === 'string')
      .map(record => [record.id, record]),
  );
  const selected = [];
  const seen = new Set();

  for (const neighbor of Array.isArray(neighbors) ? neighbors : []) {
    if (!Number.isFinite(neighbor?.score) || neighbor.score < minScore) continue;
    if (seen.has(neighbor.id)) continue;
    const record = recordsById.get(neighbor.id);
    if (!record || record.type === 'social') continue;
    seen.add(neighbor.id);
    selected.push({ ...record, semanticScore: neighbor.score });
    if (selected.length >= limit) break;
  }

  return selected;
}

export function createSemanticRecallClient({
  workerFactory = defaultWorkerFactory,
  requestTimeoutMs = SEMANTIC_REQUEST_TIMEOUT_MS,
} = {}) {
  let worker = null;
  let nextRequestId = 0;
  const pending = new Map();
  const yearIndexes = new WeakMap();

  const getYearIndex = (records) => {
    if (!Array.isArray(records)) return {};
    let years = yearIndexes.get(records);
    if (!years) {
      years = buildYearIndex(records);
      yearIndexes.set(records, years);
    }
    return years;
  };

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

  const handleMessage = (event) => {
    const message = event?.data;
    if (!message || !pending.has(message.requestId)) return;
    const request = cleanupRequest(message.requestId);
    if (message.type === 'neighbors-result') {
      request.resolve(Array.isArray(message.neighbors) ? message.neighbors : []);
      return;
    }
    if (message.type === 'neighbors-error') {
      request.reject(new Error(message.error || 'Semantic recall worker failed'));
    }
  };

  const handleWorkerError = (event) => {
    const error = new Error(event?.message || 'Semantic recall worker failed');
    rejectAll(error);
    worker?.terminate();
    worker = null;
  };

  const ensureWorker = () => {
    if (worker) return worker;
    worker = workerFactory();
    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleWorkerError);
    return worker;
  };

  const request = (
    recordId,
    records,
    {
      k = SEMANTIC_REQUEST_K,
      signal,
      timeoutMs = requestTimeoutMs,
    } = {},
  ) => {
    if (typeof recordId !== 'string' || !recordId) {
      return Promise.reject(new Error('Semantic recall requires a record id'));
    }
    if (signal?.aborted) return Promise.reject(makeAbortError());

    let recallWorker;
    try {
      recallWorker = ensureWorker();
    } catch (error) {
      return Promise.reject(error);
    }

    const requestId = `semantic-${++nextRequestId}`;
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        const abortedRequest = cleanupRequest(requestId);
        if (!abortedRequest) return;
        abortedRequest.reject(makeAbortError());
        if (pending.size === 0) {
          worker?.terminate();
          worker = null;
        }
      };
      const timer = setTimeout(() => {
        if (!pending.has(requestId)) return;
        const error = new Error('Semantic recall request timed out');
        rejectAll(error);
        worker?.terminate();
        worker = null;
      }, timeoutMs);

      pending.set(requestId, { resolve, reject, timer, signal, onAbort });
      signal?.addEventListener('abort', onAbort, { once: true });

      try {
        recallWorker.postMessage({
          type: 'neighbors',
          requestId,
          recordId,
          k,
          years: getYearIndex(records),
        });
      } catch (error) {
        cleanupRequest(requestId)?.reject(error);
      }
    });
  };

  const terminate = () => {
    rejectAll(new Error('Semantic recall client terminated'));
    worker?.terminate();
    worker = null;
  };

  return { request, terminate };
}

let defaultClient;

export function requestSemanticNeighbors(recordId, records, options) {
  defaultClient ||= createSemanticRecallClient();
  return defaultClient.request(recordId, records, options);
}

export function resetSemanticRecallClientForTests() {
  defaultClient?.terminate();
  defaultClient = undefined;
}
