import { useEffect } from 'preact/hooks';

export function ModalDialog({ open, title, onClose, children, size = 'normal' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div class="modal-layer" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section class={`modal-card modal-card--${size}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header class="modal-card__header">
          <h2 id="modal-title">{title}</h2>
          <button type="button" class="btn-close" aria-label="Close dialog" onClick={onClose}></button>
        </header>
        <div class="modal-card__body">{children}</div>
      </section>
    </div>
  );
}
