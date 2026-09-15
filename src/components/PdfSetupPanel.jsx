export function PdfSetupPanel({
  pdf,
  pdfName,
  previewURI,
  currentPage,
  currentlyScanning,
  onSelect,
  onRemove,
  onPrevious,
  onNext
}) {
  if (!pdf) {
    return (
      <div class="pdf-dropzone">
        <input
          id="pdf-upload"
          type="file"
          accept="application/pdf"
          onChange={onSelect}
          class="visually-hidden"
        />
        <label htmlFor="pdf-upload" class="pdf-dropzone__label">
          <span class="pdf-dropzone__icon" aria-hidden="true">PDF</span>
          <span class="pdf-dropzone__title">Choose a scanned exam PDF</span>
          <span class="pdf-dropzone__hint">The file stays on this computer and is processed locally.</span>
          <span class="btn btn-primary">Choose PDF</span>
        </label>
      </div>
    );
  }

  return (
    <div class="pdf-card">
      <div class="pdf-card__preview">
        {previewURI ? <img src={previewURI} alt={`Preview of page ${currentPage} in ${pdfName}`} /> : (
          <div class="pdf-card__loading">Preparing preview…</div>
        )}
      </div>
      <div class="pdf-card__details">
        <p class="pdf-card__eyebrow">Loaded document</p>
        <h3 title={pdfName}>{pdfName}</h3>
        <p>{pdf.numPages} {pdf.numPages === 1 ? 'page' : 'pages'} · page {currentPage} shown</p>
        <div class="pdf-card__controls" aria-label="PDF preview controls">
          <button type="button" onClick={onPrevious} class="btn btn-outline-secondary">Previous</button>
          <span>{currentPage} / {pdf.numPages}</span>
          <button type="button" onClick={onNext} class="btn btn-outline-secondary">Next</button>
        </div>
        <button
          type="button"
          class="btn btn-link text-danger px-0 pdf-card__remove"
          onClick={onRemove}
          disabled={currentlyScanning}
        >Remove PDF</button>
      </div>
    </div>
  );
}
