import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';

let pdfWorker = null;

function ensurePdfWorker() {
  if (pdfWorker === null) {
    pdfWorker = new Worker(
      new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url),
      { type: 'module' }
    );
    GlobalWorkerOptions.workerPort = pdfWorker;
  }
}

export async function loadBrowserPdf(file) {
  ensurePdfWorker();
  const data = new Uint8Array(await file.arrayBuffer());
  return getDocument({ data }).promise;
}

export async function renderPdfPageCanvas(pdf, pageNumber, scale, { signal } = {}) {
  signal?.throwIfAborted();
  ensurePdfWorker();
  const page = await pdf.getPage(pageNumber);
  let canvas;
  let renderTask;
  let continuationTimer;
  const cancelRender = () => {
    clearTimeout(continuationTimer);
    renderTask?.cancel();
  };
  try {
    signal?.throwIfAborted();
    const viewport = page.getViewport({ scale });
    canvas = new OffscreenCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height)
    );
    const context = canvas.getContext('2d', { willReadFrequently: true });
    renderTask = page.render({ canvasContext: context, viewport });
    if (signal) {
      // PDF.js otherwise continues OffscreenCanvas work through microtasks,
      // which can starve the controls needed to cancel a long comparison.
      renderTask.onContinue = resume => {
        continuationTimer = setTimeout(() => {
          if (!signal.aborted) resume();
        }, 0);
      };
      signal.addEventListener('abort', cancelRender, { once: true });
      if (signal.aborted) cancelRender();
    }
    await renderTask.promise;
    signal?.throwIfAborted();
    return canvas;
  } catch (error) {
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    signal?.throwIfAborted();
    throw error;
  } finally {
    clearTimeout(continuationTimer);
    signal?.removeEventListener('abort', cancelRender);
    page.cleanup();
  }
}

export async function renderPdfPageBitmap(pdf, pageNumber, scale = 4) {
  const canvas = await renderPdfPageCanvas(pdf, pageNumber, scale);
  return createImageBitmap(canvas);
}

export async function renderPdfPagePreview(pdf, pageNumber, scale = 1) {
  const canvas = await renderPdfPageCanvas(pdf, pageNumber, scale);
  return canvas.convertToBlob({ type: 'image/png' });
}
