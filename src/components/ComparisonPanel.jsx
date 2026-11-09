import { useState } from 'preact/hooks';
import { normaliseAnswer } from '../examDomain.mjs';
import { buildComparisonFromRows, buildComparisonReview } from '../services/comparisonImport.mjs';
import { updateExamResult } from '../services/resultState.mjs';
import { loadCSV } from '../util/csv.mjs';

const fields = [
  ['cfg_checkNumbers', 'Student numbers'],
  ['cfg_checkName', 'Surnames'],
  ['cfg_checkInitials', 'Initials'],
  ['cfg_checkAnswers', 'Answers']
];
const fieldNames = { studentNum: 'Student number', surname: 'Surname', initials: 'Initials', answers: 'Answer' };
const resultFields = { studentNum: 'student_number', surname: 'surname', initials: 'initials' };
const displayValue = value => `${value ?? ''}`.trim() || '(blank)';

function Difference({ diff, decision, cfg, result, onChoose, onViewPage, onViewImage }) {
  const current = diff.field === 'answers' ? result.answers[diff.idx] : result[resultFields[diff.field]];
  const physicalPage = result.page + (cfg.twoSided && diff.field === 'answers' && diff.idx >= 40 ? 1 : 0);
  const title = `PDF page ${physicalPage}${diff.field === 'answers' ? ` — question ${diff.idx + 1}` : ' — student details'}`;
  return <article class={`review-item comparison-difference ${diff.img ? '' : 'comparison-difference--text'} ${decision ? 'is-actioned' : ''}`} data-difference={diff.id}>
    {diff.img ? <button type="button" class="review-item__image" onClick={() => onViewImage?.(diff.img, title)}>
      <img src={diff.img} alt={title} /><span>Enlarge crop</span>
    </button> : null}
    <div class="review-item__body">
      <div class="review-item__heading">
        <p class="review-item__location">PDF page {result.page} · {fieldNames[diff.field]}{diff.field === 'answers' ? ` ${diff.idx + 1}` : ''}</p>
        {onViewPage ? <button type="button" onClick={() => onViewPage(physicalPage, title)}>View PDF page</button> : null}
      </div>
      <div class="review-comparison-values">
        <button type="button" class="btn review-value-button" onClick={() => onChoose(diff.scannedValue)}>
          <span>Keep my result</span>{displayValue(diff.scannedValue)}
        </button>
        <button type="button" class="btn review-value-button" onClick={() => onChoose(diff.origValue)}>
          <span>Use imported result</span>{displayValue(diff.origValue)}
        </button>
        <div class="field-group">
          <label htmlFor={`comparison-${diff.id}`}>Current value / correction</label>
          <input id={`comparison-${diff.id}`} value={current} autocomplete="off"
            onChange={event => onChoose(diff.field === 'answers' ? normaliseAnswer(event.target.value) : event.target.value)} />
        </div>
      </div>
      {decision ? <p class="review-item__meta">Reviewed · current value: <strong>{displayValue(current)}</strong></p> : null}
    </div>
  </article>;
}

export function ComparisonPanel({ comparison, setComparison, cfg, examResults, setExamResults, currentlyScanning, onViewPage, onViewImage }) {
  const [error, setError] = useState(null);
  const [showReviewed, setShowReviewed] = useState(false);
  const [page, setPage] = useState(0);
  const review = comparison.review;
  const decisions = comparison.decisions ?? {};
  const differences = review?.diffs ?? [];
  const isReviewed = diff => {
    const decision = decisions[diff.id];
    const result = examResults[diff.i];
    const current = diff.field === 'answers' ? result?.answers[diff.idx] : result?.[resultFields[diff.field]];
    return decision && decision.value === current;
  };
  const pending = differences.filter(diff => !isReviewed(diff));
  const visible = showReviewed ? differences : pending;
  const lastPage = Math.max(0, Math.ceil(visible.length / 30) - 1);
  const activePage = Math.min(page, lastPage);

  const compare = source => {
    const nextReview = buildComparisonReview(examResults, source, cfg);
    if (nextReview.error) {
      setError(nextReview.error);
      return;
    }
    setComparison({ ...source, review: nextReview, decisions: {} });
    setPage(0);
    setError(null);
  };

  const importFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const source = buildComparisonFromRows(await loadCSV(file), {
        filename: file.name, scannerConfig: cfg, previousComparison: comparison
      });
      if (source.error) { setError(source.error); return; }
      compare(source);
    } catch (caught) {
      setError(`Could not read the comparison CSV: ${caught.message}`);
    }
  };

  const choose = (diff, value) => {
    if (diff.field === 'answers') {
      value = normaliseAnswer(value);
      updateExamResult(setExamResults, diff.i, previous => ({
        answers: previous.answers.map((answer, index) => index === diff.idx ? value : answer)
      }));
    } else {
      updateExamResult(setExamResults, diff.i, { [resultFields[diff.field]]: value });
    }
    setComparison(previous => ({ ...previous, decisions: { ...previous.decisions, [diff.id]: { value } } }));
  };

  return <section class="review-panel comparison-panel" aria-labelledby="comparison-title">
    <div class="review-panel__header">
      <div><p class="review-panel__eyebrow">Official results</p><h3 id="comparison-title">Compare another scan</h3></div>
      {comparison.results ? <button type="button" class="btn btn-sm btn-outline-secondary" disabled={currentlyScanning}
        onClick={() => { setComparison({}); setError(null); }}>Remove comparison</button> : null}
    </div>
    <p class="comparison-panel__intro">Import the official raw results CSV when it arrives. Compare it with your reviewed exams, then keep your result or use the imported value for each difference. Papers are paired by PDF page.</p>
    <div class="comparison-panel__import">
      <input type="file" accept=".csv,text/csv" aria-label="Import another scan for comparison"
        disabled={currentlyScanning || examResults.length === 0} onChange={importFile} />
      {comparison.filename ? <strong>{comparison.filename}</strong> : null}
    </div>
    {examResults.length === 0 ? <p class="form-text">Scan exams or resume saved work before importing a comparison.</p> : null}
    {error ? <p class="alert alert-danger" role="alert">{error}</p> : null}
    {comparison.results ? <>
      <div class="comparison-panel__settings">
        {fields.map(([field, label]) => <label class="compact-check" key={field}>
          <input type="checkbox" checked={comparison[field]} disabled={currentlyScanning}
            onChange={event => setComparison(previous => ({ ...previous, [field]: event.target.checked }))} />{label}
        </label>)}
        <div class="field-group">
          <label htmlFor="comparison-first-page">CSV page 1 corresponds to PDF page</label>
          <input id="comparison-first-page" type="number" min="1" step="1" value={comparison.cfg_firstPage} disabled={currentlyScanning}
            onChange={event => setComparison(previous => ({ ...previous, cfg_firstPage: Number(event.target.value) }))} />
        </div>
        <button type="button" class="btn btn-outline-primary" disabled={currentlyScanning || examResults.length === 0}
          onClick={() => compare(comparison)}>Compare results</button>
      </div>
      <p class="form-text">Changing these options takes effect with Compare results. Earlier choices are kept in your exam results.</p>
    </> : null}
    {review ? <>
      <div class="comparison-panel__summary" aria-live="polite">
        <strong>{review.matchedCount} papers compared · {pending.length} differences to review · {differences.length - pending.length} reviewed</strong>
        <label class="compact-check"><input type="checkbox" checked={showReviewed}
          onChange={event => { setShowReviewed(event.target.checked); setPage(0); }} />Show reviewed differences</label>
      </div>
      {review.currentOnlyPages?.length > 0 ? <p class="comparison-panel__notice">No imported result for PDF pages {review.currentOnlyPages.join(', ')}. Your results are kept.</p> : null}
      {review.importedOnlyPages?.length > 0 ? <p class="comparison-panel__notice">Imported PDF pages {review.importedOnlyPages.join(', ')} have no current paper to compare.</p> : null}
      {review.ambiguousPages?.length > 0 ? <p class="comparison-panel__notice">More than one current paper has PDF page {review.ambiguousPages.join(', ')}; these pages were skipped.</p> : null}
      {review.invalidCurrentPages?.length > 0 ? <p class="comparison-panel__notice">{review.invalidCurrentPages.length} current papers have no valid PDF page number and could not be compared.</p> : null}
      {pending.length === 0 ? <p class="review-panel__empty">{differences.length === 0 ? 'No differences found.' : 'All differences reviewed.'}</p> : null}
      {visible.slice(activePage * 30, (activePage + 1) * 30).map(diff => {
        const result = examResults[diff.i];
        if (!result || result.page !== diff.page) return null;
        return <Difference key={diff.id} diff={diff} decision={isReviewed(diff)} cfg={cfg} result={result}
          onChoose={value => choose(diff, value)} onViewPage={onViewPage} onViewImage={onViewImage} />;
      })}
      {lastPage > 0 ? <div class="comparison-panel__pagination">
        <button type="button" class="btn btn-sm btn-outline-secondary" disabled={activePage === 0} onClick={() => setPage(activePage - 1)}>Previous differences</button>
        <span>{activePage + 1} / {lastPage + 1}</span>
        <button type="button" class="btn btn-sm btn-outline-secondary" disabled={activePage === lastPage} onClick={() => setPage(activePage + 1)}>Next differences</button>
      </div> : null}
    </> : null}
  </section>;
}
