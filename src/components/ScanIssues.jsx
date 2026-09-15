export function ScanIssues({ issues, onDismiss }) {
  if (issues.length === 0) return null;

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
        {issues.map((issue, index) =>
          <li key={index}>
            {issue.stage}{issue.page === null ? '' : ` — page ${issue.page}`}: {issue.message}
          </li>
        )}
      </ul>
    </div>
  );
}
