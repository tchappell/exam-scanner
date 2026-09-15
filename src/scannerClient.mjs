function workerFailure(event, fallbackMessage) {
  if (event?.error instanceof Error) return event.error;
  return new Error(event?.message || fallbackMessage);
}

/**
 * Wrap the scanner worker's message protocol in promises.
 *
 * Keeping this separate from the UI lets us test worker failures without loading
 * OpenCV, TensorFlow, or a PDF in a browser.
 */
export function createScannerClient(worker) {
  let nextId = 1;
  let fatalError = null;
  const pending = new Map();
  const diagnosticListeners = new Set();

  const notify = error => {
    for (const listener of diagnosticListeners) listener(error);
  };

  const rejectAll = error => {
    fatalError = error;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    notify(error);
  };

  worker.onmessage = event => {
    const request = pending.get(event.data?.id);
    if (!request) {
      notify(new Error(`Scanner worker returned an unknown request id: ${event.data?.id ?? '(missing)'}`));
      return;
    }

    pending.delete(event.data.id);
    if ('error' in event.data) {
      request.reject(new Error(event.data.error));
      return;
    }
    request.resolve(event.data);
  };

  worker.onerror = event => {
    rejectAll(workerFailure(event, 'The scanner worker stopped unexpectedly.'));
  };

  worker.onmessageerror = event => {
    rejectAll(workerFailure(event, 'The browser could not read a response from the scanner worker.'));
  };

  return {
    invoke(command, data = {}, transferables = []) {
      if (fatalError) return Promise.reject(fatalError);

      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        try {
          worker.postMessage({ id, cmd: command, ...data }, transferables);
        } catch (error) {
          pending.delete(id);
          reject(error);
        }
      });
    },

    subscribeToDiagnostics(listener) {
      diagnosticListeners.add(listener);
      return () => diagnosticListeners.delete(listener);
    }
  };
}

/**
 * Delay construction of the heavyweight recognition worker until the first
 * scanner command. Diagnostics can still be subscribed to before that point.
 */
export function createLazyScannerClient(workerFactory) {
  let client = null;
  let clientPromise = null;
  const diagnosticListeners = new Set();

  const notify = error => {
    for (const listener of diagnosticListeners) listener(error);
  };

  const getClient = () => {
    if (clientPromise === null) {
      clientPromise = Promise.resolve()
        .then(workerFactory)
        .then(worker => {
          client = createScannerClient(worker);
          client.subscribeToDiagnostics(notify);
          return client;
        })
        .catch(error => {
          const failure = error instanceof Error ? error : new Error(`${error}`);
          notify(failure);
          throw failure;
        });
    }
    return clientPromise;
  };

  return {
    async invoke(command, data = {}, transferables = []) {
      const scanner = client ?? await getClient();
      return scanner.invoke(command, data, transferables);
    },

    subscribeToDiagnostics(listener) {
      diagnosticListeners.add(listener);
      return () => diagnosticListeners.delete(listener);
    }
  };
}
