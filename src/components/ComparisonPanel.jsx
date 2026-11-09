import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { normaliseAnswer } from '../examDomain.mjs';
import { buildComparisonFromRows, buildComparisonReview } from '../services/comparisonImport.mjs';
import { renderComparisonCrops } from '../services/comparisonCrops.mjs';
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
const comparisonSettings = (source, cfg) => ({
  ...Object.fromEntries(fields.map(([field]) => [field, Boolean(source[field])])),
  cfg_firstPage: Number(source.cfg_firstPage),
  twoSided: Boolean(cfg.twoSided)
});

function Difference({ diff, crop, cropError, hasPdf, preparing, cancelled, decision, cfg, result, onChoose, onViewPage, onViewImage, onRetryCrop }) {
  const current = diff.field === 'answers' ? result.answers[diff.idx] : result[resultFields[diff.field]];
  const physicalPage = result.page + (cfg.twoSided && diff.field === 'answers' && diff.idx >= 40 ? 1 : 0);
  const title = `PDF page ${physicalPage}${diff.field === 'answers' ? ` — question ${diff.idx + 1}` : ' — student details'}`;
  const image = crop?.src ?? diff.img;
  const imageClass = `review-item__image${diff.field !== 'answers' ? ' review-item__image--identity' : ''}${diff.field === 'studentNum' ? ' review-item__image--student-number' : ''}`;
  return <article class={`review-item comparison-difference ${decision ? 'is-actioned' : ''}`} data-difference={diff.id}>
    {image ? <button type="button" class={imageClass} onClick={() => onViewImage?.(image, title)}>
      <img src={image} alt={title} /><span>{crop?.approximate ? 'Approximate crop · enlarge' : 'Enlarge crop'}</span>
    </button> : <div class={`${imageClass} comparison-crop-placeholder`}>
      {!hasPdf ? <span>Load the source PDF to show this image.</span>
        : cropError ? <><span>Could not prepare this image: {cropError}</span>
          <button type="button" class="btn btn-sm btn-outline-secondary" disabled={preparing} onClick={onRetryCrop}>Retry image</button></>
          : <span role="status">{preparing ? 'Preparing comparison image…' : cancelled ? 'Image preparation cancelled.' : 'Image not prepared yet.'}</span>}
    </div>}
    <div class="review-item__body">
      <div class="review-item__heading">
        <p class="review-item__location">PDF page {physicalPage} · {fieldNames[diff.field]}{diff.field === 'answers' ? ` ${diff.idx + 1}` : ''}</p>
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

export function ComparisonPanel({ comparison, setComparison, cfg, pdf, examResults, setExamResults, currentlyScanning, onViewPage, onViewImage }) {
  const [error, setError] = useState(null);
  const [showReviewed, setShowReviewed] = useState(false);
  const [page, setPage] = useState(0);
  const [cropProgress, setCropProgress] = useState(null);
  const [cropErrors, setCropErrors] = useState({});
  const [cropRunning, setCropRunning] = useState(false);
  const [cropCancelled, setCropCancelled] = useState(false);
  const cropJob = useRef(null);
  const review = comparison.review;
  const appliedSettings = useMemo(() => review?.settings ?? comparisonSettings(comparison, cfg), [review]);
  const settings = comparisonSettings(comparison, cfg);
  const settingsChanged = Boolean(review) && Object.keys(settings).some(field => settings[field] !== appliedSettings[field]);
  const controlsLocked = currentlyScanning || cropRunning;
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
  const missingImages = differences.filter(diff => !(diff.img || comparison.cropImages?.[diff.id]?.src));

  const cancelPreparation = (showCancellation = true) => {
    const job = cropJob.current;
    cropJob.current = null;
    job?.controller.abort();
    setCropRunning(false);
    setCropCancelled(Boolean(job) && showCancellation);
    if (!showCancellation) setCropProgress(null);
  };

  const prepareImages = source => {
    if (!pdf || !source.review || cropJob.current || currentlyScanning) return;
    if (source.review === review && settingsChanged) return;
    const missing = source.review.diffs.filter(diff => !(diff.img || source.cropImages?.[diff.id]?.src));
    if (missing.length === 0) return;
    const job = { pdf, review: source.review, controller: new AbortController() };
    cropJob.current = job;
    const active = () => cropJob.current === job && !job.controller.signal.aborted;
    setCropErrors({});
    setCropProgress({ completed: 0, total: missing.length });
    setCropCancelled(false);
    setCropRunning(true);
    renderComparisonCrops({
      pdf, differences: missing, examResults, signal: job.controller.signal,
      onCrop: (id, crop) => setComparison(previous => {
        if (!active() || previous.review !== job.review) return previous;
        return { ...previous, cropImages: { ...previous.cropImages, [id]: crop } };
      }),
      onError: (id, caught) => {
        if (active()) setCropErrors(previous => ({ ...previous, [id]: caught.message ?? `${caught}` }));
      },
      onProgress: progress => {
        if (active()) setCropProgress(progress);
      }
    }).catch(caught => {
      if (active()) setCropErrors(Object.fromEntries(missing.map(diff => [diff.id, caught.message ?? `${caught}`])));
    }).finally(() => {
      if (cropJob.current !== job) return;
      cropJob.current = null;
      setCropRunning(false);
    });
  };

  useEffect(() => {
    const job = cropJob.current;
    if (job && (job.pdf !== pdf || job.review !== review || currentlyScanning || settingsChanged)) cancelPreparation(false);
  }, [pdf, review, currentlyScanning, settingsChanged]);

  useEffect(() => () => {
    const job = cropJob.current;
    cropJob.current = null;
    job?.controller.abort();
  }, []);

  const compare = source => {
    if (controlsLocked) return;
    if (!fields.some(([field]) => source[field])) {
      setError('Select at least one field to compare.');
      return;
    }
    const nextReview = buildComparisonReview(examResults, source, cfg);
    if (nextReview.error) {
      setError(nextReview.error);
      return;
    }
    nextReview.settings = comparisonSettings(source, cfg);
    const nextComparison = { ...source, review: nextReview, decisions: {}, cropImages: {} };
    setComparison(nextComparison);
    setPage(0);
    setError(null);
    setCropErrors({});
    setCropCancelled(false);
    setCropProgress(null);
    prepareImages(nextComparison);
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
      cancelPreparation(false);
      setComparison(source);
      setPage(0);
      setCropErrors({});
      setError(null);
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
      {comparison.results ? <button type="button" class="btn btn-sm btn-outline-secondary" disabled={controlsLocked}
        onClick={() => { cancelPreparation(false); setComparison({}); setError(null); }}>Remove comparison</button> : null}
    </div>
    <p class="comparison-panel__intro">Import the official raw results CSV when it arrives. Compare it with your reviewed exams, then keep your result or use the imported value for each difference. Papers are paired by PDF page.</p>
    <div class="comparison-panel__import">
      <input type="file" accept=".csv,text/csv" aria-label="Import another scan for comparison"
        disabled={controlsLocked || examResults.length === 0} onChange={importFile} />
      {comparison.filename ? <strong>{comparison.filename}</strong> : null}
    </div>
    {examResults.length === 0 ? <p class="form-text">Scan exams or resume saved work before importing a comparison.</p> : null}
    {error ? <p class="alert alert-danger" role="alert">{error}</p> : null}
    {comparison.results ? <>
      <div class="comparison-panel__settings">
        {fields.map(([field, label]) => <label class="compact-check" key={field}>
          <input type="checkbox" checked={comparison[field]} disabled={controlsLocked}
            onChange={event => setComparison(previous => ({ ...previous, [field]: event.target.checked }))} />{label}
        </label>)}
        <div class="field-group">
          <label htmlFor="comparison-first-page">CSV page 1 corresponds to PDF page</label>
          <input id="comparison-first-page" type="number" min="1" step="1" value={comparison.cfg_firstPage} disabled={controlsLocked}
            onChange={event => setComparison(previous => ({ ...previous, cfg_firstPage: Number(event.target.value) }))} />
        </div>
        <button type="button" class="btn btn-primary" disabled={controlsLocked || examResults.length === 0}
          onClick={() => compare(comparison)}>Compare results</button>
      </div>
      <p class="form-text">{cropRunning
        ? 'Comparison settings are locked while images are prepared. Use Cancel to stop and change the settings.'
        : !review ? 'CSV loaded. Choose the fields and page offset, then select Compare results.'
          : 'Changing these options takes effect with Compare results. Earlier choices are kept in your exam results.'}</p>
    </> : null}
    {settingsChanged ? <p class="comparison-panel__notice" role="status">Settings changed. Choose Compare results to update the differences.</p> : null}
    {review && !settingsChanged ? <>
      <div class="comparison-panel__summary" aria-live="polite">
        <strong>{review.matchedCount} papers compared · {pending.length} differences to review · {differences.length - pending.length} reviewed</strong>
        <label class="compact-check"><input type="checkbox" checked={showReviewed}
          onChange={event => { setShowReviewed(event.target.checked); setPage(0); }} />Show reviewed differences</label>
      </div>
      {cropRunning ? <div class="comparison-panel__image-progress">
        <span class="form-text" role="status">Preparing comparison images: {cropProgress?.completed ?? 0} / {cropProgress?.total ?? missingImages.length}</span>
        <button type="button" class="btn btn-sm btn-outline-secondary" onClick={() => cancelPreparation()}>Cancel</button>
      </div> : null}
      {cropCancelled ? <p class="comparison-panel__notice" role="status">Image preparation cancelled. Prepared images and your corrections have been kept.</p> : null}
      {!cropRunning && pdf && missingImages.length > 0 ? <button type="button" class="btn btn-sm btn-outline-primary comparison-panel__prepare-images"
        disabled={controlsLocked} onClick={() => prepareImages(comparison)}>
        {cropCancelled || missingImages.length < differences.length ? 'Prepare remaining images' : 'Prepare comparison images'}
      </button> : null}
      {review.currentOnlyPages?.length > 0 ? <p class="comparison-panel__notice">No imported result for PDF pages {review.currentOnlyPages.join(', ')}. Your results are kept.</p> : null}
      {review.importedOnlyPages?.length > 0 ? <p class="comparison-panel__notice">Imported PDF pages {review.importedOnlyPages.join(', ')} have no current paper to compare.</p> : null}
      {review.ambiguousPages?.length > 0 ? <p class="comparison-panel__notice">More than one current paper has PDF page {review.ambiguousPages.join(', ')}; these pages were skipped.</p> : null}
      {review.invalidCurrentPages?.length > 0 ? <p class="comparison-panel__notice">{review.invalidCurrentPages.length} current papers have no valid PDF page number and could not be compared.</p> : null}
      {pending.length === 0 ? <p class="review-panel__empty">{differences.length === 0 ? 'No differences found.' : 'All differences reviewed.'}</p> : null}
      {visible.slice(activePage * 30, (activePage + 1) * 30).map(diff => {
        const result = examResults[diff.i];
        if (!result || result.page !== diff.page) return null;
        return <Difference key={diff.id} diff={diff} crop={comparison.cropImages?.[diff.id]} cropError={cropErrors[diff.id]}
          hasPdf={Boolean(pdf)} preparing={cropRunning} cancelled={cropCancelled} decision={isReviewed(diff)} cfg={cfg} result={result}
          onChoose={value => choose(diff, value)} onViewPage={onViewPage} onViewImage={onViewImage}
          onRetryCrop={() => prepareImages(comparison)} />;
      })}
      {lastPage > 0 ? <div class="comparison-panel__pagination">
        <button type="button" class="btn btn-sm btn-outline-secondary" disabled={activePage === 0} onClick={() => setPage(activePage - 1)}>Previous differences</button>
        <span>{activePage + 1} / {lastPage + 1}</span>
        <button type="button" class="btn btn-sm btn-outline-secondary" disabled={activePage === lastPage} onClick={() => setPage(activePage + 1)}>Next differences</button>
      </div> : null}
    </> : null}
  </section>;
}
