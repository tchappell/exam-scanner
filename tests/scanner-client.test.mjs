import assert from 'node:assert/strict';
import test from 'node:test';

import { createLazyScannerClient, createScannerClient } from '../src/scannerClient.mjs';

class FakeWorker {
  constructor() {
    this.messages = [];
  }

  postMessage(message, transferables) {
    this.messages.push({ message, transferables });
  }
}

test('scanner client resolves the matching worker response', async () => {
  const worker = new FakeWorker();
  const client = createScannerClient(worker);
  const resultPromise = client.invoke('scan', { page: 3 }, ['bitmap']);

  assert.deepEqual(worker.messages[0], {
    message: { id: 1, cmd: 'scan', page: 3 },
    transferables: ['bitmap']
  });

  worker.onmessage({ data: { id: 1, answers: 'ABCDE' } });
  assert.deepEqual(await resultPromise, { id: 1, answers: 'ABCDE' });
});

test('scanner client rejects an error response instead of also resolving it', async () => {
  const worker = new FakeWorker();
  const client = createScannerClient(worker);
  const resultPromise = client.invoke('scan');

  worker.onmessage({ data: { id: 1, error: 'model failed to load' } });
  await assert.rejects(resultPromise, /model failed to load/);
});

test('scanner client reports fatal worker failures and rejects pending work', async () => {
  const worker = new FakeWorker();
  const client = createScannerClient(worker);
  const diagnostics = [];
  client.subscribeToDiagnostics(error => diagnostics.push(error.message));
  const pendingResult = client.invoke('scan');

  worker.onerror({ message: 'worker script could not start' });

  await assert.rejects(pendingResult, /worker script could not start/);
  await assert.rejects(client.invoke('scan'), /worker script could not start/);
  assert.deepEqual(diagnostics, ['worker script could not start']);
});

test('scanner client reports responses with unknown request ids', () => {
  const worker = new FakeWorker();
  const client = createScannerClient(worker);
  const diagnostics = [];
  client.subscribeToDiagnostics(error => diagnostics.push(error.message));

  worker.onmessage({ data: { id: 999, answers: '' } });

  assert.deepEqual(diagnostics, ['Scanner worker returned an unknown request id: 999']);
});

test('lazy scanner client does not construct a worker until its first command', async () => {
  const worker = new FakeWorker();
  let factoryCalls = 0;
  const client = createLazyScannerClient(() => {
    factoryCalls++;
    return worker;
  });

  client.subscribeToDiagnostics(() => {});
  assert.equal(factoryCalls, 0);

  const resultPromise = client.invoke('initialize');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(factoryCalls, 1);
  assert.equal(worker.messages[0].message.cmd, 'initialize');

  worker.onmessage({ data: { id: 1, ready: true } });
  assert.equal((await resultPromise).ready, true);
  assert.equal(factoryCalls, 1);
});
