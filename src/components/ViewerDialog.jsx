import { useEffect, useState } from 'preact/hooks';
import { renderPdfPagePreview } from '../services/browserPdfAdapter.mjs';
import { ModalDialog } from './ModalDialog.jsx';

export function ViewerDialog({ viewer, pdf, onClose }) {
  const [pdfImage, setPdfImage] = useState(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelled = false;
    let url = null;
    setZoom(1);
    setPdfImage(null);
    if (!viewer || viewer.type !== 'pdf' || !pdf) return undefined;
    renderPdfPagePreview(pdf, viewer.page, 2).then(blob => {
      if (cancelled) return;
      url = URL.createObjectURL(blob);
      setPdfImage(url);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [viewer, pdf]);

  const image = viewer?.type === 'image' ? viewer.src : pdfImage;
  return (
    <ModalDialog open={Boolean(viewer)} title={viewer?.title ?? 'Scan image'} onClose={onClose} size="viewer">
      <div class="viewer-toolbar">
        <button type="button" class="btn btn-sm btn-outline-secondary" onClick={() => setZoom(value => Math.max(0.5, value - 0.25))}>−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" class="btn btn-sm btn-outline-secondary" onClick={() => setZoom(value => Math.min(3, value + 0.25))}>+</button>
        <button type="button" class="btn btn-sm btn-link" onClick={() => setZoom(1)}>Reset</button>
      </div>
      <div class="viewer-canvas">
        {image ? <img src={image} alt={viewer?.title ?? 'Scanned exam page'} style={{ width: `${zoom * 100}%` }} />
          : <p>Rendering page...</p>}
      </div>
    </ModalDialog>
  );
}
