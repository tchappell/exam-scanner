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

async function renderPageToCanvas(pdf, pageNumber, scale) {
  ensurePdfWorker();
  const page = await pdf.getPage(pageNumber);
  try {
    const viewport = page.getViewport({ scale });
    const canvas = new OffscreenCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height)
    );
    const context = canvas.getContext('2d', { willReadFrequently: true });
    await page.render({ canvasContext: context, viewport }).promise;
    return canvas;
  } finally {
    page.cleanup();
  }
}

export async function renderPdfPageBitmap(pdf, pageNumber, scale = 4) {
  const canvas = await renderPageToCanvas(pdf, pageNumber, scale);
  return createImageBitmap(canvas);
}

export async function renderPdfPagePreview(pdf, pageNumber, scale = 1) {
  const canvas = await renderPageToCanvas(pdf, pageNumber, scale);
  return canvas.convertToBlob({ type: 'image/png' });
}
