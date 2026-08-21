import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SEMANTIC_LIMIT,
  SEMANTIC_MIN_SCORE,
  buildYearIndex,
  createSemanticRecallClient,
  selectSemanticRecords,
} from '../frontend/services/semanticRecall.js';

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

describe('semantic recall presentation helpers', () => {
  it('builds a compact finite year lookup from archive records', () => {
    assert.deepEqual(
      buildYearIndex([
        { id: 'A', type: 'article', year: '2001' },
        { id: 'B', type: 'article', year: 2010 },
        { id: 'C', type: 'article', year: '' },
        { id: 'D', type: 'article', year: 'unknown' },
        { id: 'social', type: 'social', year: '2024' },
        { type: 'article', year: '1999' },
      ]),
      { A: 2001, B: 2010 },
    );
  });

  it('keeps only openable non-social matches at or above the semantic threshold', () => {
    const records = [
      { id: 'A', title: 'A', type: 'article' },
      { id: 'B', title: 'B', type: 'social' },
      { id: 'C', title: 'C', type: 'article' },
      { id: 'D', title: 'D', type: 'article' },
    ];
    const selected = selectSemanticRecords([
      { id: 'A', score: SEMANTIC_MIN_SCORE + 0.1 },
      { id: 'B', score: 0.99 },
      { id: 'missing', score: 0.95 },
      { id: 'C', score: SEMANTIC_MIN_SCORE - 0.01 },
      { id: 'D', score: SEMANTIC_MIN_SCORE },
    ], records);

    assert.deepEqual(selected.map(record => record.id), ['A', 'D']);
    assert.equal(selected[0].semanticScore, SEMANTIC_MIN_SCORE + 0.1);
  });

  it('caps the strand at five records by default', () => {
    const records = Array.from({ length: 8 }, (_value, index) => ({
      id: `R${index}`,
      type: 'article',
      title: `Record ${index}`,
    }));
    const neighbors = records.map((record, index) => ({
      id: record.id,
      score: 0.99 - index * 0.01,
    }));

    assert.equal(selectSemanticRecords(neighbors, records).length, SEMANTIC_LIMIT);
  });
});

describe('semantic recall worker client', () => {
  it('creates one lazy worker, sends years, and resolves matching request ids', async () => {
    const workers = [];
    const client = createSemanticRecallClient({
      workerFactory: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
      requestTimeoutMs: 1000,
    });

    const first = client.request('A', [{ id: 'A', type: 'article', year: '2000' }]);
    assert.equal(workers.length, 1);
    assert.deepEqual(workers[0].messages[0], {
      type: 'neighbors',
      requestId: 'semantic-1',
      recordId: 'A',
      k: 12,
      years: { A: 2000 },
    });
    workers[0].emit('message', {
      type: 'neighbors-result',
      requestId: 'semantic-1',
      neighbors: [{ id: 'B', score: 0.8 }],
    });
    assert.deepEqual(await first, [{ id: 'B', score: 0.8 }]);

    const second = client.request('B', []);
    assert.equal(workers.length, 1, 'the worker should be reused');
    workers[0].emit('message', {
      type: 'neighbors-result',
      requestId: 'semantic-2',
      neighbors: [],
    });
    assert.deepEqual(await second, []);
    client.terminate();
  });

  it('reuses a compact article-year index for a stable archive collection', async () => {
    const worker = new FakeWorker();
    const client = createSemanticRecallClient({
      workerFactory: () => worker,
      requestTimeoutMs: 1000,
    });
    const records = [
      { id: 'A', type: 'article', year: '2000' },
      { id: 'B', type: 'article', year: 2010 },
      { id: 'social', type: 'social', year: 2024 },
    ];

    const first = client.request('A', records);
    assert.deepEqual(worker.messages[0].years, { A: 2000, B: 2010 });
    worker.emit('message', {
      type: 'neighbors-result',
      requestId: 'semantic-1',
      neighbors: [],
    });
    await first;

    const second = client.request('B', records);
    assert.strictEqual(worker.messages[1].years, worker.messages[0].years);
    worker.emit('message', {
      type: 'neighbors-result',
      requestId: 'semantic-2',
      neighbors: [],
    });
    await second;
    client.terminate();
  });

  it('rejects worker errors without resolving a stale request', async () => {
    const worker = new FakeWorker();
    const client = createSemanticRecallClient({
      workerFactory: () => worker,
      requestTimeoutMs: 1000,
    });
    const request = client.request('A', []);
    worker.emit('message', {
      type: 'neighbors-error',
      requestId: 'semantic-1',
      error: 'digest mismatch',
    });
    await assert.rejects(request, /digest mismatch/);
    client.terminate();
  });

  it('drops an aborted request and ignores its late response', async () => {
    const worker = new FakeWorker();
    const client = createSemanticRecallClient({
      workerFactory: () => worker,
      requestTimeoutMs: 1000,
    });
    const controller = new AbortController();
    const request = client.request('A', [], { signal: controller.signal });
    controller.abort();
    await assert.rejects(request, error => error.name === 'AbortError');

    worker.emit('message', {
      type: 'neighbors-result',
      requestId: 'semantic-1',
      neighbors: [{ id: 'late', score: 1 }],
    });
    client.terminate();
  });

  it('recycles an idle worker after its only request is aborted', async () => {
    const workers = [];
    const client = createSemanticRecallClient({
      workerFactory: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
      requestTimeoutMs: 1000,
    });
    const controller = new AbortController();
    const first = client.request('A', [], { signal: controller.signal });

    controller.abort();
    await assert.rejects(first, error => error.name === 'AbortError');
    assert.equal(workers[0].terminated, true);

    const retry = client.request('B', []);
    assert.equal(workers.length, 2);
    workers[1].emit('message', {
      type: 'neighbors-result',
      requestId: 'semantic-2',
      neighbors: [],
    });
    assert.deepEqual(await retry, []);
    client.terminate();
  });

  it('keeps the worker while another request remains pending', async () => {
    const worker = new FakeWorker();
    const client = createSemanticRecallClient({
      workerFactory: () => worker,
      requestTimeoutMs: 1000,
    });
    const controller = new AbortController();
    const aborted = client.request('A', [], { signal: controller.signal });
    const active = client.request('B', []);

    controller.abort();
    await assert.rejects(aborted, error => error.name === 'AbortError');
    assert.equal(worker.terminated, false);
    worker.emit('message', {
      type: 'neighbors-result',
      requestId: 'semantic-2',
      neighbors: [],
    });
    assert.deepEqual(await active, []);
    client.terminate();
  });

  it('discards a failed worker so the next request can create a clean one', async () => {
    const workers = [];
    const client = createSemanticRecallClient({
      workerFactory: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
      requestTimeoutMs: 1000,
    });

    const first = client.request('A', []);
    workers[0].emit('error', { message: 'worker crashed' });
    await assert.rejects(first, /worker crashed/);
    assert.equal(workers[0].terminated, true);

    const second = client.request('B', []);
    assert.equal(workers.length, 2);
    workers[1].emit('message', {
      type: 'neighbors-result',
      requestId: 'semantic-2',
      neighbors: [],
    });
    assert.deepEqual(await second, []);
    client.terminate();
  });

  it('recycles a timed-out worker so retry starts with a clean store load', async () => {
    const workers = [];
    const client = createSemanticRecallClient({
      workerFactory: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
      requestTimeoutMs: 5,
    });

    await assert.rejects(client.request('A', []), /timed out/);
    assert.equal(workers[0].terminated, true);

    const retry = client.request('A', []);
    assert.equal(workers.length, 2);
    workers[1].emit('message', {
      type: 'neighbors-result',
      requestId: 'semantic-2',
      neighbors: [],
    });
    assert.deepEqual(await retry, []);
    client.terminate();
  });
});
