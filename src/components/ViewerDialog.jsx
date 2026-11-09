import { useEffect, useState } from 'preact/hooks';
import { renderPdfPagePreview } from '../services/browserPdfAdapter.mjs';
import { ModalDialog } from './ModalDialog.jsx';

export function ViewerDialog({ viewer, pdf, onClose }) {
  const [pdfImage, setPdfImage] = useState(null);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pageOffset, setPageOffset] = useState(0);
  const currentPage = viewer?.pages?.[pageOffset] ?? viewer?.page;

  useEffect(() => setPageOffset(0), [viewer]);

  useEffect(() => {
    let cancelled = false;
    let url = null;
    setZoom(1);
    setPdfImage(null);
    setError(null);
    if (!viewer || viewer.type !== 'pdf' || !pdf) return undefined;
    renderPdfPagePreview(pdf, currentPage, 2).then(blob => {
      if (cancelled) return;
      url = URL.createObjectURL(blob);
      setPdfImage(url);
    }).catch(caught => {
      if (!cancelled) setError(`Could not render PDF page ${currentPage}: ${caught.message}`);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [viewer, pdf, currentPage]);

  const image = viewer?.type === 'image' ? viewer.src : pdfImage;
  return (
    <ModalDialog open={Boolean(viewer)} title={viewer?.title ?? 'Scan image'} onClose={onClose} size="viewer">
      <div class="viewer-toolbar">
        {viewer?.pages?.length > 1 ? <>
          <button type="button" class="btn btn-sm btn-outline-secondary" disabled={pageOffset === 0}
            onClick={() => setPageOffset(value => value - 1)}>Previous exam page</button>
          <span>PDF page {currentPage}</span>
          <button type="button" class="btn btn-sm btn-outline-secondary" disabled={pageOffset >= viewer.pages.length - 1}
            onClick={() => setPageOffset(value => value + 1)}>Next exam page</button>
        </> : null}
        <button type="button" class="btn btn-sm btn-outline-secondary" onClick={() => setZoom(value => Math.max(0.5, value - 0.25))}>−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" class="btn btn-sm btn-outline-secondary" onClick={() => setZoom(value => Math.min(3, value + 0.25))}>+</button>
        <button type="button" class="btn btn-sm btn-link" onClick={() => setZoom(1)}>Reset</button>
      </div>
      <div class="viewer-canvas">
        {error ? <p role="alert">{error}</p> : image ? <img src={image} alt={viewer?.type === 'pdf' ? `Original PDF page ${currentPage}` : viewer?.title ?? 'Scanned exam page'} style={{ width: `${zoom * 100}%` }} />
          : <p>Rendering page...</p>}
      </div>
    </ModalDialog>
  );
}
