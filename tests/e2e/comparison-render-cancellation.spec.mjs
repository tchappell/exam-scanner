import { expect, test } from '@playwright/test';

test('cancelling a PDF crop render stops its active task and releases the page canvas', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { renderPdfPageCanvas } = await import('/src/services/browserPdfAdapter.mjs');
    const controller = new AbortController();
    let signalStarted;
    const started = new Promise(resolve => { signalStarted = resolve; });
    let canvas;
    let cancelled = 0;
    let cleaned = 0;
    let continued = 0;
    const pdf = {
      async getPage() {
        return {
          getViewport: () => ({ width: 200, height: 300 }),
          cleanup: () => { cleaned++; },
          render({ canvasContext }) {
            canvas = canvasContext.canvas;
            let rejectRender;
            const task = {
              promise: new Promise((resolve, reject) => { rejectRender = reject; }),
              cancel() {
                cancelled++;
                rejectRender(new Error('Rendering cancelled'));
              }
            };
            signalStarted();
            queueMicrotask(() => task.onContinue?.(() => { continued++; }));
            return task;
          }
        };
      }
    };
    const pending = renderPdfPageCanvas(pdf, 1, 4, { signal: controller.signal })
      .then(() => 'unexpected success', error => error.name);
    await started;
    controller.abort();
    const errorName = await pending;
    await new Promise(resolve => setTimeout(resolve, 10));
    return { errorName, cancelled, cleaned, continued, width: canvas.width, height: canvas.height };
  });

  expect(result).toEqual({
    errorName: 'AbortError', cancelled: 1, cleaned: 1, continued: 0, width: 0, height: 0
  });
});

test('cancelling comparison image preparation emits no later crops, errors, or progress', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { renderComparisonCrops } = await import('/src/services/comparisonCrops.mjs');
    const controller = new AbortController();
    let signalStarted;
    const started = new Promise(resolve => { signalStarted = resolve; });
    const requestedPages = [];
    const crops = [];
    const errors = [];
    const progress = [];
    let cancelled = 0;
    let cleaned = 0;
    const pdf = {
      async getPage(pageNumber) {
        requestedPages.push(pageNumber);
        return {
          getViewport: () => ({ width: 200, height: 300 }),
          cleanup: () => { cleaned++; },
          render() {
            let rejectRender;
            const task = {
              promise: new Promise((resolve, reject) => { rejectRender = reject; }),
              cancel() {
                cancelled++;
                rejectRender(new Error('Rendering cancelled'));
              }
            };
            signalStarted();
            return task;
          }
        };
      }
    };
    const options = {
      pdf,
      differences: [
        { id: '1:answers:0', i: 0, page: 1, field: 'answers', idx: 0 },
        { id: '2:answers:0', i: 1, page: 2, field: 'answers', idx: 0 }
      ],
      examResults: [{ page: 1 }, { page: 2 }],
      signal: controller.signal,
      onCrop: (...args) => crops.push(args),
      onError: (...args) => errors.push(args),
      onProgress: value => progress.push(value)
    };
    const pending = renderComparisonCrops(options);
    await started;
    controller.abort();
    await pending;
    // A retry passed an already-cancelled signal must not start another page.
    await renderComparisonCrops(options);
    return { requestedPages, cancelled, cleaned, crops, errors, progress };
  });

  expect(result).toEqual({
    requestedPages: [1], cancelled: 1, cleaned: 1, crops: [], errors: [],
    progress: [{ completed: 0, total: 2 }]
  });
});
