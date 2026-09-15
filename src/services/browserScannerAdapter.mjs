import { renderPdfPageBitmap } from './browserPdfAdapter.mjs';

async function invokeWithPage(scannerClient, pdf, command, pageNumber, side, data = {}) {
  const bitmap = await renderPdfPageBitmap(pdf, pageNumber);
  try {
    return await scannerClient.invoke(command, { bmp: bitmap, page: side, ...data }, [bitmap]);
  } catch (error) {
    try {
      bitmap.close?.();
    } catch {
      // A successfully transferred bitmap is already detached from this thread.
    }
    throw error;
  }
}

export function createBrowserScannerAdapter({ pdf, scannerClient }) {
  return {
    initialize() {
      return scannerClient.invoke('initialize');
    },

    scanPage({ pageNumber, side, compare, multiAnswerQuestions }) {
      return invokeWithPage(scannerClient, pdf, 'scan', pageNumber, side, {
        compare,
        multiAnswerQuestions
      });
    },

    scanMatrix({ pageNumber, side }) {
      return invokeWithPage(scannerClient, pdf, 'scan_matrix', pageNumber, side);
    }
  };
}
