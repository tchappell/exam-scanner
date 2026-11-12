import { useRef } from 'preact/hooks';
import { combinedPdfPage } from '../services/pdfSources.mjs';

export function PdfSetupPanel({
  pdf,
  pdfName,
  pdfSources,
  activeSourceId,
  previewURI,
  currentPage,
  busy,
  loadingPdf,
  onSelect,
  onSelectSource,
  onRemove,
  onPrevious,
  onNext
}) {
  const fileInput = useRef(null);
  const showBatchControls = pdfSources.length > 1 || (!pdf && pdfSources.length > 0);
  const documentPage = pdfSources.length > 1 ? combinedPdfPage(pdfSources, activeSourceId, currentPage) : null;
  const chooseFile = () => fileInput.current.click();
  const appendButton = <button type="button" class="btn btn-sm btn-outline-primary" disabled={busy} onClick={chooseFile}>
    {loadingPdf ? 'Opening PDF…' : 'Append PDF'}
  </button>;

  return (
    <>
      <input ref={fileInput} id="pdf-upload" type="file" accept="application/pdf"
        onChange={onSelect} disabled={busy} hidden />
      {showBatchControls ? (
        <div class="pdf-batch-controls">
          <div class="field-group">
            <label htmlFor="pdf-batch">PDF batch</label>
            <select id="pdf-batch" class="form-select" value={activeSourceId} disabled={busy}
              onChange={event => onSelectSource(event.target.value)}>
              {pdfSources.map((source, index) => <option key={source.id} value={source.id}>
                {index + 1}. {source.name ?? 'Original PDF'}{source.pdf ? '' : ' (reload required)'}
              </option>)}
            </select>
          </div>
          {pdf ? appendButton : null}
        </div>
      ) : null}
      {pdf ? (
        <div class="pdf-card">
          <div class="pdf-card__preview">
            {previewURI ? <img src={previewURI} alt={`Preview of page ${currentPage} in ${pdfName}`} /> : (
              <div class="pdf-card__loading">Preparing preview…</div>
            )}
          </div>
          <div class="pdf-card__details">
            <div class="pdf-card__header">
              <p class="pdf-card__eyebrow">Loaded document</p>
              <div class="pdf-card__actions">
                {!showBatchControls ? appendButton : null}
                <button type="button" class="btn btn-sm btn-outline-danger pdf-card__remove"
                  onClick={onRemove} disabled={busy}>Remove PDF</button>
              </div>
            </div>
            <h3 title={pdfName}>{pdfName}</h3>
            <p>{pdf.numPages} {pdf.numPages === 1 ? 'page' : 'pages'} · page {currentPage} shown
              {documentPage === null ? '' : ` · page ${documentPage} across all batches`}</p>
            <div class="pdf-card__controls" aria-label="PDF preview controls">
              <button type="button" onClick={onPrevious} class="btn btn-outline-secondary">Previous</button>
              <span>{currentPage} / {pdf.numPages}</span>
              <button type="button" onClick={onNext} class="btn btn-outline-secondary">Next</button>
            </div>
          </div>
        </div>
      ) : (
        <div class="pdf-dropzone">
          <div class="pdf-dropzone__label">
            <span class="pdf-dropzone__icon" aria-hidden="true">PDF</span>
            <span class="pdf-dropzone__title">{showBatchControls ? 'Reload an original PDF or add a batch' : 'Choose a scanned exam PDF'}</span>
            <span class="pdf-dropzone__hint">{showBatchControls
              ? 'Original files reconnect by their saved hashes. New PDFs are added as separate batches.'
              : 'The file stays on this computer and is processed locally.'}</span>
            <button type="button" class="btn btn-primary" disabled={busy} onClick={chooseFile}>
              {loadingPdf ? 'Opening PDF…' : showBatchControls ? 'Load or append PDF' : 'Choose PDF'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
