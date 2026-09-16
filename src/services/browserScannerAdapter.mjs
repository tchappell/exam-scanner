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
    if ((command === 'scan' || command === 'scan_matrix') && (!error?.message || /undefined/i.test(error.message))) {
      const sheet = side === 1 ? 'reverse-side' : 'front-side';
      const wrapped = new Error(
        `Could not align this PDF page with the ${sheet} answer-sheet template. `
        + 'Check the one-sided/two-sided setting and that paired pages are in the expected order.'
      );
      wrapped.pageNumber = pageNumber;
      throw wrapped;
    }
    if (error instanceof Error) error.pageNumber = pageNumber;
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
