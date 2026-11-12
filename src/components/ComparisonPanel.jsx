import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { normaliseAnswer } from '../examDomain.mjs';
import {
  buildComparisonFromRows, buildComparisonReview, canCompareCombinedPdf,
  COMBINED_COMPARISON_SOURCE, comparisonPdfSources, comparisonSourceId
} from '../services/comparisonImport.mjs';
import { renderComparisonCrops } from '../services/comparisonCrops.mjs';
import { combinedPdfPage } from '../services/pdfSources.mjs';
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
  cfg_sourceId: source.cfg_sourceId ?? null,
  twoSided: Boolean(cfg.twoSided)
});

const matchesDifference = (result, diff) => result && Number(result.page) === Number(diff.page)
  && (!diff.sourceId || result.sourceId === diff.sourceId);

function formatPageReferences(references) {
  if (references.every(page => typeof page === 'number')) return `PDF pages ${references.join(', ')}`;
  return references.map(({ page, pdfName }) => `${pdfName ? `${pdfName} ` : ''}page ${page}`).join(', ');
}

function Difference({ diff, crop, cropError, hasPdf, preparing, cancelled, decision, cfg, result, pdfSources, onChoose, onViewPage, onViewImage, onRetryCrop }) {
  const current = diff.field === 'answers' ? result.answers[diff.idx] : result[resultFields[diff.field]];
  const physicalPage = Number(result.page) + (cfg.twoSided && diff.field === 'answers' && diff.idx >= 40 ? 1 : 0);
  const displayPage = combinedPdfPage(pdfSources, result.sourceId, physicalPage) ?? physicalPage;
  const sourceName = pdfSources.length > 1 ? pdfSources.find(source => source.id === result.sourceId)?.name : result.pdfName;
  const location = `PDF page ${displayPage}${sourceName ? ` (${sourceName}, page ${physicalPage})` : ''}`;
  const detail = diff.field === 'answers' ? `question ${diff.idx + 1}` : 'student details';
  const title = `${location} — ${detail}`;
  const image = crop?.src ?? diff.img;
  const imageClass = `review-item__image${diff.field !== 'answers' ? ' review-item__image--identity' : ''}${diff.field === 'studentNum' ? ' review-item__image--student-number' : ''}`;
  return <article class={`review-item comparison-difference ${decision ? 'is-actioned' : ''}`} data-difference={diff.id}>
    {image ? <button type="button" class={imageClass} onClick={() => onViewImage?.(image, title)}>
      <img src={image} alt={title} /><span>{crop?.approximate ? 'Approximate crop · enlarge' : 'Enlarge crop'}</span>
    </button> : <div class={`${imageClass} review-crop-placeholder`}>
      {!hasPdf ? <span>Load the source PDF to show this image.</span>
        : cropError ? <><span>Could not prepare this image: {cropError}</span>
          <button type="button" class="btn btn-sm btn-outline-secondary" disabled={preparing} onClick={onRetryCrop}>Retry image</button></>
          : <span role="status">{preparing ? 'Preparing comparison image…' : cancelled ? 'Image preparation cancelled.' : 'Image not prepared yet.'}</span>}
    </div>}
    <div class="review-item__body">
      <div class="review-item__heading">
        <p class="review-item__location">{location} · {fieldNames[diff.field]}{diff.field === 'answers' ? ` ${diff.idx + 1}` : ''}</p>
        {hasPdf && onViewPage ? <button type="button"
          onClick={() => onViewPage(physicalPage, `PDF page ${displayPage} — ${detail}`, result.sourceId)}>View PDF page</button> : null}
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

export function ComparisonPanel({ comparison, setComparison, cfg, pdfSources = [], examResults, setExamResults, currentlyScanning, onViewPage, onViewImage }) {
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
  const settingsChanged = Boolean(review) && Object.keys(settings).some(field => settings[field] !== (appliedSettings[field] ?? null));
  const controlsLocked = currentlyScanning || cropRunning;
  const sources = useMemo(() => comparisonPdfSources(examResults, pdfSources), [examResults, pdfSources]);
  const loadedPdfs = useMemo(() => new Map(pdfSources.filter(source => source.pdf).map(source => [source.id, source.pdf])), [pdfSources]);
  const targetSourceId = comparisonSourceId(comparison, sources);
  const multipleFiles = comparison.scannedFiles?.length > 1;
  const combined = targetSourceId === COMBINED_COMPARISON_SOURCE;
  const decisions = comparison.decisions ?? {};
  const differences = review?.diffs ?? [];
  const isReviewed = diff => {
    const decision = decisions[diff.id];
    const result = examResults[diff.i];
    if (!matchesDifference(result, diff)) return false;
    const current = diff.field === 'answers' ? result.answers[diff.idx] : result[resultFields[diff.field]];
    return decision && decision.value === current;
  };
  const pending = differences.filter(diff => !isReviewed(diff));
  const visible = showReviewed ? differences : pending;
  const lastPage = Math.max(0, Math.ceil(visible.length / 30) - 1);
  const activePage = Math.min(page, lastPage);
  const missingImages = source => source.review.diffs.filter(diff => {
    const result = examResults[diff.i];
    return matchesDifference(result, diff) && loadedPdfs.has(result.sourceId)
      && !(diff.img || source.cropImages?.[diff.id]?.src);
  });
  const missingCount = review ? missingImages(comparison).length : 0;

  const cancelPreparation = (showCancellation = true) => {
    const job = cropJob.current;
    cropJob.current = null;
    job?.controller.abort();
    setCropRunning(false);
    setCropCancelled(Boolean(job) && showCancellation);
    if (!showCancellation) setCropProgress(null);
  };

  const prepareImages = source => {
    if (!source.review || cropJob.current || currentlyScanning) return;
    if (source.review === review && settingsChanged) return;
    const missing = missingImages(source);
    if (missing.length === 0) return;
    const usedPdfs = new Map(missing.map(diff => {
      const id = examResults[diff.i].sourceId;
      return [id, loadedPdfs.get(id)];
    }));
    const job = { usedPdfs, review: source.review, controller: new AbortController() };
    cropJob.current = job;
    const active = () => cropJob.current === job && !job.controller.signal.aborted;
    setCropErrors({});
    setCropProgress({ completed: 0, total: missing.length });
    setCropCancelled(false);
    setCropRunning(true);
    renderComparisonCrops({
      getPdf: result => usedPdfs.get(result.sourceId), differences: missing, examResults, signal: job.controller.signal,
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
    if (job && (job.review !== review || currentlyScanning || settingsChanged
      || [...job.usedPdfs].some(([id, pdf]) => loadedPdfs.get(id) !== pdf))) cancelPreparation(false);
  }, [loadedPdfs, review, currentlyScanning, settingsChanged]);

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
    const configured = multipleFiles ? source : { ...source, cfg_sourceId: targetSourceId };
    const nextReview = buildComparisonReview(examResults, configured, cfg, { pdfSources });
    if (nextReview.error) {
      setError(nextReview.error);
      return;
    }
    nextReview.settings = comparisonSettings(configured, cfg);
    const nextComparison = { ...configured, review: nextReview, decisions: {}, cropImages: {} };
    setComparison(nextComparison);
    setPage(0);
    setError(null);
    setCropErrors({});
    setCropCancelled(false);
    setCropProgress(null);
    prepareImages(nextComparison);
  };

  const defaultFirstPage = id => {
    if (id === COMBINED_COMPARISON_SOURCE) return 1;
    const config = sources.find(source => source.id === id)?.scanConfig;
    if (!config) return 1;
    return (Number(config.startAt) || 1) + (config.hasMarker ? (cfg.twoSided ? 2 : 1) : 0);
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
      if (sources.length > 1 && source.scannedFiles.length === 1 && !source.cfg_sourceId) {
        const id = comparisonSourceId(source, sources);
        if (id) source.cfg_firstPage = defaultFirstPage(id);
      }
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
    <p class="comparison-panel__intro">Import the official raw results CSV when it arrives. Compare it with your reviewed exams, then keep your result or use the imported value for each difference. Papers are paired by source PDF and page.</p>
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
        {sources.length > 1 && !multipleFiles ? <div class="field-group">
          <label htmlFor="comparison-source">Match CSV pages against</label>
          <select id="comparison-source" class="form-select" value={targetSourceId} disabled={controlsLocked}
            onChange={event => {
              const id = event.target.value;
              setComparison(previous => ({ ...previous, cfg_sourceId: id, cfg_firstPage: defaultFirstPage(id) }));
              setError(null);
            }}>
            <option value="" disabled>Choose a source PDF</option>
            {sources.map((source, index) => <option key={source.id} value={source.id}>
              {source.name ? `${index + 1}. ${source.name}` : 'Papers without a source PDF'}
            </option>)}
            {canCompareCombinedPdf(pdfSources) ? <option value={COMBINED_COMPARISON_SOURCE}>Combined TAS submission</option> : null}
          </select>
        </div> : null}
        <div class="field-group">
          <label htmlFor="comparison-first-page">CSV page 1 corresponds to {combined ? 'combined submission page' : 'PDF page'}</label>
          <input id="comparison-first-page" type="number" min="1" step="1" value={comparison.cfg_firstPage} disabled={controlsLocked}
            onChange={event => setComparison(previous => ({ ...previous, cfg_firstPage: Number(event.target.value) }))} />
        </div>
        <button type="button" class="btn btn-primary" disabled={controlsLocked || examResults.length === 0}
          onClick={() => compare(comparison)}>Compare results</button>
      </div>
      {multipleFiles ? <p class="form-text">The CSV lists multiple scanned files. File names identify the batches, and the page offset applies to each file.</p> : null}
      {combined ? <p class="form-text">Combined pages follow the batch order and page ranges used when appending scans to the TAS request. Page 1 is the first appended scan page.</p> : null}
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
        <span class="form-text" role="status">Preparing comparison images: {cropProgress?.completed ?? 0} / {cropProgress?.total ?? missingCount}</span>
        <button type="button" class="btn btn-sm btn-outline-secondary" onClick={() => cancelPreparation()}>Cancel</button>
      </div> : null}
      {cropCancelled ? <p class="comparison-panel__notice" role="status">Image preparation cancelled. Prepared images and your corrections have been kept.</p> : null}
      {!cropRunning && missingCount > 0 ? <button type="button" class="btn btn-sm btn-outline-primary comparison-panel__prepare-images"
        disabled={controlsLocked} onClick={() => prepareImages(comparison)}>
        {cropCancelled || differences.some(diff => diff.img || comparison.cropImages?.[diff.id]?.src) ? 'Prepare remaining images' : 'Prepare comparison images'}
      </button> : null}
      {review.currentOnlyPages?.length > 0 ? <p class="comparison-panel__notice">No imported result for {formatPageReferences(review.currentOnlyPages)}. Your results are kept.</p> : null}
      {review.importedOnlyPages?.length > 0 ? <p class="comparison-panel__notice">Imported {formatPageReferences(review.importedOnlyPages)} have no current paper to compare.</p> : null}
      {review.ambiguousPages?.length > 0 ? <p class="comparison-panel__notice">More than one current paper has the same page reference: {formatPageReferences(review.ambiguousPages)}.</p> : null}
      {review.invalidCurrentPages?.length > 0 ? <p class="comparison-panel__notice">{review.invalidCurrentPages.length} current papers have no valid PDF page number and could not be compared.</p> : null}
      {pending.length === 0 ? <p class="review-panel__empty">{differences.length === 0 ? 'No differences found.' : 'All differences reviewed.'}</p> : null}
      {visible.slice(activePage * 30, (activePage + 1) * 30).map(diff => {
        const result = examResults[diff.i];
        if (!matchesDifference(result, diff)) return null;
        return <Difference key={diff.id} diff={diff} crop={comparison.cropImages?.[diff.id]} cropError={cropErrors[diff.id]}
          hasPdf={loadedPdfs.has(result.sourceId)} preparing={cropRunning} cancelled={cropCancelled} decision={isReviewed(diff)}
          cfg={cfg} result={result} pdfSources={pdfSources}
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
