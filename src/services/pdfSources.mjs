export function pdfSourceForResult(sources, result) {
  return result.sourceId ? sources.find(source => source.id === result.sourceId) : undefined;
}

export function combinedPdfPage(sources, sourceId, page) {
  if (!sourceId) return sources.length > 1 ? null : Number(page);
  let precedingPages = 0;
  for (const source of sources) {
    if (source.id === sourceId) return precedingPages + Number(page);
    if (!Number.isSafeInteger(source.numPages)) return null;
    precedingPages += source.numPages;
  }
  return null;
}
