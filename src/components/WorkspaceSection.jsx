export function SectionToggle({ title, expanded, controls, onClick }) {
  const label = `${expanded ? 'Collapse' : 'Expand'} ${title}`;
  return <button type="button" class="btn btn-sm btn-outline-secondary section-toggle"
    aria-label={label} aria-expanded={expanded} aria-controls={controls} title={label} onClick={onClick}>
    <span class="section-toggle__chevron" aria-hidden="true" />
  </button>;
}

export function WorkspaceSection({
  id,
  number,
  eyebrow,
  title,
  description,
  actions,
  expanded,
  onToggle,
  children,
  className = ''
}) {
  const titleId = `${id}-title`;
  const bodyId = `${id}-body`;

  return (
    <section id={id} class={`workspace-section ${className}`.trim()} aria-labelledby={titleId}>
      <header class="workspace-section__header">
        <div class="workspace-section__heading">
          {number ? <span class="workspace-section__number" aria-hidden="true">{number}</span> : null}
          <div>
            {eyebrow ? <p class="workspace-section__eyebrow">{eyebrow}</p> : null}
            <h2 id={titleId}>{title}</h2>
            {description ? <p class="workspace-section__description">{description}</p> : null}
          </div>
        </div>
        <div class="section-controls">
          {actions ? <div class="workspace-section__actions">{actions}</div> : null}
          <SectionToggle title={title} expanded={expanded} controls={bodyId} onClick={onToggle} />
        </div>
      </header>
      <div class="workspace-section__body" id={bodyId} hidden={!expanded}>{children}</div>
    </section>
  );
}

export function AppHeader({ pdfName, resultCount, onNavigate }) {
  const steps = [
    { id: 'setup', label: 'Set up', ready: Boolean(pdfName) },
    { id: 'results', label: 'Review', ready: resultCount > 0 },
    { id: 'exports', label: 'Export', ready: resultCount > 0 }
  ];

  return (
    <header class="app-header">
      <div class="app-header__brand">
        <div>
          <p class="app-header__eyebrow">QUT Test Answer Sheets</p>
          <h1>Exam Scanner</h1>
          <p class="app-header__description">Scanned exams never leave your browser.</p>
        </div>
      </div>
      <nav class="workflow-nav" aria-label="Exam workflow">
        {steps.map((step, index) => (
          <a key={step.id} href={`#${step.id}`} class={step.ready ? 'is-ready' : ''} onClick={() => onNavigate(step.id)}>
            <span>{index + 1}</span>{step.label}
          </a>
        ))}
      </nav>
    </header>
  );
}

export function EmptyState({ title, description }) {
  return (
    <div class="empty-state">
      <span class="empty-state__icon" aria-hidden="true">✓</span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}
