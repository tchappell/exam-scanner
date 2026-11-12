function describeFailure({ frontPage, page, message, isMarker }) {
  const paper = isMarker ? 'Marker sheet' : `Paper starting on page ${frontPage}`;
  return `${paper}, PDF page ${page} — ${message}`;
}

export function ScanRecoveryStatus({ recovery, pdfLoaded, showFailures }) {
  const { config, pendingCount, failedCount, markerPending, markerFailed, failures, requiresSidedness, inferred } = recovery;
  const counts = [
    pendingCount ? `${pendingCount} ${pendingCount === 1 ? 'paper' : 'papers'} ${inferred ? 'missing' : 'not yet scanned'}` : null,
    failedCount ? `${failedCount} ${failedCount === 1 ? 'paper' : 'papers'} failed` : null,
    markerPending ? 'Marker sheet pending' : null,
    markerFailed ? 'Marker sheet failed' : null
  ].filter(Boolean);

  return <>
    <p>Saved range {config.startAt}–{config.endAt} · {counts.join(' · ')}</p>
    {showFailures && failures.length === 1 ? <p>{describeFailure(failures[0])}</p> : showFailures && failures.length > 1 ? (
      <details class="scan-action-panel__failures">
        <summary>Failed pages</summary>
        <ul>{failures.map(failure => <li key={failure.frontPage}>{describeFailure(failure)}</li>)}</ul>
      </details>
    ) : null}
    {!pdfLoaded ? <p>Reload the original PDF to scan the missing papers.</p>
      : requiresSidedness ? <p>Set Two-sided sheets to match the saved scan before continuing.</p>
      : !recovery.canRecover ? <p>The saved range is outside this PDF.</p>
      : <p>Previously scanned papers and corrections will be kept.</p>}
  </>;
}

export function ScanIssues({ issues, onDismiss }) {
  if (issues.length === 0) return null;

  const groups = [];
  for (const issue of issues) {
    const key = `${issue.stage}\n${issue.message}\n${issue.pdfName ?? ''}`;
    let group = groups.find(item => item.key === key);
    if (!group) {
      group = { key, stage: issue.stage, message: issue.message, pdfName: issue.pdfName, pages: [] };
      groups.push(group);
    }
    if (issue.page !== null && !group.pages.includes(issue.page)) group.pages.push(issue.page);
  }

  return (
    <div class="alert alert-danger" role="alert" aria-live="polite">
      <div class="d-flex justify-content-between align-items-start gap-3">
        <div>
          <p class="fw-bold mb-1">
            {issues.length === 1 ? 'The scanner reported a problem.' : `The scanner reported ${issues.length} problems.`}
          </p>
          <p class="mb-2">Successful pages have been kept. Check the details below before using or exporting the results.</p>
        </div>
        <button type="button" class="btn-close" aria-label="Dismiss scanner problems" onClick={onDismiss}></button>
      </div>
      <ul class="mb-0">
        {groups.map(group => (
          <li key={group.key}>
            <strong>{group.stage}</strong>
            {group.pdfName ? ` — ${group.pdfName}` : ''}
            {group.pages.length > 0 ? ` — ${group.pages.length === 1 ? 'page' : 'pages'} ${group.pages.join(', ')}` : ''}:
            {' '}{group.message || 'The scanner could not complete this page.'}
          </li>
        ))}
      </ul>
    </div>
  );
}
