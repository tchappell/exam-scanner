export function ScanProgress({ progress, stage }) {
  if (progress === null) return null;

  const [completed, total] = progress;
  const percentage = total > 0 ? Math.round(completed * 100 / total) : 0;

  return (
    <div class="scan-progress" aria-live="polite">
      <div class="scan-progress__copy">
        <div>
          <p class="scan-progress__eyebrow">Scanner working</p>
          <p class="scan-progress__stage">{stage ?? 'Scanning exams'}</p>
        </div>
        <strong>{completed} / {total}</strong>
      </div>
      <div
        class="progress"
        role="progressbar"
        aria-label={stage ?? 'Scanning exams'}
        aria-valuenow={percentage}
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div class="progress-bar" style={{ width: `${percentage}%` }}></div>
      </div>
    </div>
  );
}
