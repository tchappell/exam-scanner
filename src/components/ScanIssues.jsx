export function ScanIssues({ issues, onDismiss }) {
  if (issues.length === 0) return null;

  const groups = [];
  for (const issue of issues) {
    const key = `${issue.stage}\n${issue.message}`;
    let group = groups.find(item => item.key === key);
    if (!group) {
      group = { key, stage: issue.stage, message: issue.message, pages: [] };
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
            {group.pages.length > 0 ? ` — ${group.pages.length === 1 ? 'page' : 'pages'} ${group.pages.join(', ')}` : ''}:
            {' '}{group.message || 'The scanner could not complete this page.'}
          </li>
        ))}
      </ul>
    </div>
  );
}
