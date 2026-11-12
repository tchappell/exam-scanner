import { renderPdfPageCanvas } from './browserPdfAdapter.mjs';
import { COMPARISON_TEMPLATE_SIZE, comparisonCropRegion, mapComparisonCrop } from './comparisonCropGeometry.mjs';

const RENDER_SCALE = 4;

function proportionalCrop(region, canvas) {
  const x = Math.max(0, Math.floor(region.rect.x * canvas.width / COMPARISON_TEMPLATE_SIZE.width));
  const y = Math.max(0, Math.floor(region.rect.y * canvas.height / COMPARISON_TEMPLATE_SIZE.height));
  const right = Math.min(canvas.width, Math.ceil((region.rect.x + region.rect.width) * canvas.width / COMPARISON_TEMPLATE_SIZE.width));
  const bottom = Math.min(canvas.height, Math.ceil((region.rect.y + region.rect.height) * canvas.height / COMPARISON_TEMPLATE_SIZE.height));
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

function dataUrl(blob, signal) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const reader = new FileReader();
    const abort = () => reader.abort();
    const cleanup = () => signal?.removeEventListener('abort', abort);
    reader.onload = () => {
      cleanup();
      resolve(reader.result);
    };
    reader.onerror = () => {
      cleanup();
      reject(new Error('Could not store the crop.'));
    };
    reader.onabort = () => {
      cleanup();
      reject(new DOMException('Image preparation cancelled.', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    reader.readAsDataURL(blob);
  });
}

function yieldToControls() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/** Render pages sequentially and retain only the compact crops, never recognition results. */
export async function renderComparisonCrops({ pdf, getPdf = () => pdf, differences, examResults, signal, onCrop, onError, onProgress }) {
  if (signal?.aborted) return;
  const documents = new Map();
  for (const diff of differences) {
    if (signal?.aborted) return;
    const region = comparisonCropRegion(diff);
    const result = examResults[diff.i];
    if (!region || !result || Number(result.page) !== Number(diff.page)
        || (diff.sourceId && result.sourceId !== diff.sourceId)) {
      onError(diff.id, new Error('The paper or comparison field is no longer available.'));
      continue;
    }
    const sourcePdf = getPdf(result);
    if (!sourcePdf) {
      onError(diff.id, new Error('Load the source PDF to show this image.'));
      continue;
    }
    const pageNumber = Number(result.page) + region.side;
    if (!documents.has(sourcePdf)) documents.set(sourcePdf, new Map());
    const pages = documents.get(sourcePdf);
    if (!pages.has(pageNumber)) pages.set(pageNumber, []);
    pages.get(pageNumber).push({ diff, region, result });
  }

  const pages = [...documents].flatMap(([sourcePdf, byPage]) => [...byPage].map(([pageNumber, items]) => ({ sourcePdf, pageNumber, items })));
  let completed = differences.length - pages.reduce((total, page) => total + page.items.length, 0);
  if (signal?.aborted) return;
  onProgress?.({ completed, total: differences.length });
  for (const { sourcePdf, pageNumber, items } of pages) {
    await yieldToControls();
    if (signal?.aborted) return;
    let canvas;
    try {
      canvas = await renderPdfPageCanvas(sourcePdf, pageNumber, RENDER_SCALE, { signal });
      for (const { diff, region, result } of items) {
        await yieldToControls();
        if (signal?.aborted) return;
        try {
          const homographies = region.side === 0 ? result.homographies : result.homographies2;
          const mapped = mapComparisonCrop(diff, homographies, {
            width: canvas.width, height: canvas.height, scale: RENDER_SCALE
          });
          const rect = mapped ?? proportionalCrop(region, canvas);
          if (!rect) throw new Error('The field is outside the PDF page.');
          const crop = new OffscreenCanvas(rect.width, rect.height);
          try {
            crop.getContext('2d').drawImage(canvas, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
            const src = await dataUrl(await crop.convertToBlob({ type: 'image/jpeg', quality: 0.85 }), signal);
            if (signal?.aborted) return;
            onCrop(diff.id, { src, approximate: mapped === null });
          } finally {
            crop.width = 0;
            crop.height = 0;
          }
        } catch (error) {
          if (!signal?.aborted) onError(diff.id, error);
        }
        if (signal?.aborted) return;
        onProgress?.({ completed: ++completed, total: differences.length });
      }
    } catch (error) {
      for (const { diff } of items) {
        if (signal?.aborted) return;
        onError(diff.id, error);
        if (signal?.aborted) return;
        onProgress?.({ completed: ++completed, total: differences.length });
      }
    } finally {
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
  }
}
