/**
 * Main-thread client for the semantic search worker (#279).
 *
 * The load-bearing difference from the similar-in-theme client is that an
 * aborted search must NOT terminate the worker. Search aborts on every
 * keystroke, and the worker holds the downloaded model, so a client that
 * terminated on abort would re-download it word by word. The first test pins
 * exactly that.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSemanticSearchClient } from '../frontend/services/semanticSearch.js';

class FakeWorker {
  constructor() {
    this.listeners = new Map();
    this.messages = [];
    this.terminated = false;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  postMessage(message) {
    this.messages.push(message);
  }

  emit(type, data) {
    this.listeners.get(type)?.({ data, message: data?.message });
  }

  terminate() {
    this.terminated = true;
  }
}

function clientFixture(options = {}) {
  const workers = [];
  const client = createSemanticSearchClient({
    workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    ...options,
  });
  return { client, workers };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('semantic search client', () => {
  it('resolves a search with the worker matches', async () => {
    const { client, workers } = clientFixture();
    const pending = client.search('the view from nowhere');
    await settle();

    const sent = workers[0].messages[0];
    assert.equal(sent.type, 'semantic-query');
    assert.equal(sent.query, 'the view from nowhere');

    workers[0].emit('message', {
      type: 'semantic-query-result',
      requestId: sent.requestId,
      query: sent.query,
      matches: [{ id: 'RECORD-A', score: 0.81 }],
      count: 947,
    });

    const result = await pending;
    assert.deepEqual(result.matches, [{ id: 'RECORD-A', score: 0.81 }]);
    assert.equal(result.count, 947);
  });

  it('keeps the worker, and its loaded model, when a search is aborted', async () => {
    const { client, workers } = clientFixture();
    const controller = new AbortController();
    const pending = client.search('press think', { signal: controller.signal });
    await settle();

    controller.abort();
    await assert.rejects(pending, error => error.name === 'AbortError');
    assert.equal(workers[0].terminated, false);

    // The next keystroke reuses the same worker rather than starting a new one.
    client.search('press thinking').catch(() => {});
    await settle();
    assert.equal(workers.length, 1);
    assert.equal(workers[0].messages.length, 2);
    client.terminate();
  });

  it('reuses one worker across warmup and searches', async () => {
    const { client, workers } = clientFixture();
    client.warmup().catch(() => {});
    await settle();
    client.search('press').catch(() => {});
    await settle();

    assert.equal(workers.length, 1);
    assert.equal(workers[0].messages[0].type, 'semantic-warmup');
    assert.equal(workers[0].messages[1].type, 'semantic-query');
    client.terminate();
  });

  it('rejects when the worker reports an error', async () => {
    const { client, workers } = clientFixture();
    const pending = client.warmup();
    await settle();
    workers[0].emit('message', {
      type: 'semantic-query-error',
      requestId: workers[0].messages[0].requestId,
      error: 'embeddings binary: 404',
    });
    await assert.rejects(pending, /404/);
  });

  it('rejects and drops the worker when it fails to start', async () => {
    const { client, workers } = clientFixture();
    const pending = client.search('press');
    await settle();
    workers[0].emit('error', { message: 'worker script failed to load' });

    await assert.rejects(pending, /worker script failed to load/);
    assert.equal(workers[0].terminated, true);
  });

  it('replaces a worker that stops answering', async () => {
    const { client, workers } = clientFixture({ requestTimeoutMs: 5 });
    const pending = client.search('press');
    await settle();
    await assert.rejects(pending, /timed out/);
    assert.equal(workers[0].terminated, true);

    client.search('press').catch(() => {});
    await settle();
    assert.equal(workers.length, 2);
    client.terminate();
  });

  it('ignores a late answer to a request that already settled', async () => {
    const { client, workers } = clientFixture();
    const pending = client.search('press');
    await settle();
    const requestId = workers[0].messages[0].requestId;
    workers[0].emit('message', {
      type: 'semantic-query-result',
      requestId,
      matches: [],
      count: 947,
    });
    await pending;

    // A second answer for the same id must not throw on a missing request.
    workers[0].emit('message', {
      type: 'semantic-query-result',
      requestId,
      matches: [{ id: 'RECORD-Z', score: 0.9 }],
      count: 947,
    });
  });

  it('refuses an empty query without starting a worker', async () => {
    const { client, workers } = clientFixture();
    await assert.rejects(client.search('   '), /requires a query/);
    assert.equal(workers.length, 0);
  });
});
