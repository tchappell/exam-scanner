import { useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import { ANSWER_OPTIONS, answerIncludes, isMultiAnswerQuestion, normaliseAnswer, updateAnswer } from '../examDomain.mjs';
import { renderComparisonCrops } from '../services/comparisonCrops.mjs';
import { combinedPdfPage, pdfSourceForResult } from '../services/pdfSources.mjs';
import { updateExamResult } from '../services/resultState.mjs';
import { SectionToggle } from './WorkspaceSection.jsx';

function ReviewChoiceButtons({ answer, multiple, onChange }) {
  return (
    <div class="btn-group btn-group-sm w-100" role="group" aria-label="Correct scanned response">
      {['-', ...ANSWER_OPTIONS].map(option => {
        const selected = option === '-'
          ? normaliseAnswer(answer) === ' '
          : answerIncludes(answer, option);
        return <button
          type="button"
          key={option}
          class={`btn fw-bold btn-outline-primary${selected ? ' btn-dark text-light' : ''}`}
          onClick={() => onChange(updateAnswer(answer, option, multiple))}
        >{option}</button>;
      })}
    </div>
  );
}

function useQuestionableCrops({ items, examResults, pdfSources, enabled }) {
  const cache = useRef(new WeakMap());
  const [, refresh] = useReducer(count => count + 1, 0);
  const [retry, setRetry] = useState(0);
  const getCrop = item => {
    const crop = cache.current.get(item.pdf)?.get(item.cropKey);
    return crop?.homographies === item.homographies ? crop : undefined;
  };

  useEffect(() => {
    if (!enabled) return;
    const missing = items.filter(item => item.pdf && !item.raw.questionableImg && !getCrop(item));
    if (missing.length === 0) return;

    const controller = new AbortController();
    const { signal } = controller;
    const requests = new Map(missing.map(item => [item.id, item]));
    const storeCrop = (id, crop) => {
      if (signal.aborted) return;
      const { pdf, cropKey, homographies } = requests.get(id);
      if (!cache.current.has(pdf)) cache.current.set(pdf, new Map());
      cache.current.get(pdf).set(cropKey, { ...crop, homographies });
      refresh();
    };
    const onError = (id, error) => storeCrop(id, { error: error.message ?? String(error) });
    renderComparisonCrops({
      getPdf: result => pdfSourceForResult(pdfSources, result)?.pdf,
      differences: missing.map(({ id, resultIndex, question, result }) => ({
        id, i: resultIndex, page: result.page, sourceId: result.sourceId, field: 'answers', idx: question
      })),
      examResults,
      signal,
      onCrop: storeCrop,
      onError
    }).catch(error => {
      for (const item of missing) {
        if (!getCrop(item)) onError(item.id, error);
      }
    });
    return () => controller.abort();
  }, [enabled, items, examResults, pdfSources, retry]);

  return {
    getCrop,
    retryCrop: item => {
      cache.current.get(item.pdf)?.delete(item.cropKey);
      setRetry(previous => previous + 1);
    }
  };
}

function QuestionableItem({ cfg, item, crop, onRetryCrop, setExamResults, onViewPage, onViewImage }) {
  const { resultIndex, question, raw, result, documentPage, physicalPage, pdf } = item;
  const actioned = raw.reviewed === true;
  const image = raw.questionableImg ?? crop?.src;
  const imageTitle = `Question ${question + 1} crop`;
  const reviewAnswer = value => updateExamResult(setExamResults, resultIndex, previous => ({
    answers: value === undefined ? previous.answers : previous.answers.map((answer, index) => index === question ? value : answer),
    raw_answers: previous.raw_answers[question].reviewed ? previous.raw_answers : previous.raw_answers.map((answer, index) =>
      index === question ? { ...answer, reviewed: true } : answer)
  }));
  return (
    <article
      class={`review-item review-item--answer ${actioned ? 'is-actioned' : ''}`}
      data-testid="questionable-result"
      data-page={result.page}
      data-question={question + 1}
      data-scanned-answer={raw.scanned_value}
    >
      {image ? <button type="button" class="review-item__image" onClick={() => onViewImage(image, imageTitle)}>
        <img src={image} alt={`Questionable scan for question ${question + 1}`} />
        {crop?.approximate ? <span>Approximate crop · enlarge</span> : null}
      </button> : <div class="review-item__image review-crop-placeholder">
        {!pdf ? <p class="m-0">Load the source PDF to show this image.</p>
          : crop?.error ? <>
            <p class="m-0">Could not prepare this image. {crop.error}</p>
            <button type="button" class="btn btn-sm btn-outline-secondary" onClick={onRetryCrop}>Retry image</button>
          </> : <p class="m-0">Preparing review image…</p>}
      </div>}
      <div class="review-item__body">
        <div class="review-item__heading">
          <p class="review-item__location">Page {documentPage} · Question {question + 1}</p>
          {pdf ? <button type="button"
            onClick={() => onViewPage(physicalPage, `PDF page ${physicalPage} — question ${question + 1}`, result.sourceId)}>View PDF page</button> : null}
        </div>
        <ReviewChoiceButtons
          answer={result.answers[question]}
          multiple={isMultiAnswerQuestion(cfg, question)}
          onChange={reviewAnswer}
        />
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <p class="review-item__meta">Scanner read: <strong>{raw.scanned_value?.trim() || 'blank'}</strong>
            {actioned ? ' · Reviewed' : ''}</p>
          {!actioned ? <button type="button" class="btn btn-sm btn-outline-secondary" onClick={() => reviewAnswer()}>
            Mark as reviewed
          </button> : null}
        </div>
      </div>
    </article>
  );
}

export function QuestionableReview({ cfg, setCfg, examResults, setExamResults, pdfSources, busy, onViewPage, onViewImage }) {
  const [expanded, setExpanded] = useState(true);
  const [sort, setSort] = useState(['page', 'asc']);
  const items = useMemo(() => examResults.flatMap((result, resultIndex) => {
    const sourcePdf = pdfSourceForResult(pdfSources, result)?.pdf;
    return (result.raw_answers ?? []).flatMap((raw, question) => {
      if (raw?.questionable !== true) return [];
      const reverse = question >= 40;
      const physicalPage = Number(result.page) + (reverse ? 1 : 0);
      const documentPage = combinedPdfPage(pdfSources, result.sourceId, physicalPage) ?? physicalPage;
      const pdf = physicalPage >= 1 && physicalPage <= sourcePdf?.numPages ? sourcePdf : null;
      return [{
        id: `${resultIndex}:${question}`, cropKey: `${physicalPage}:${question}`, result, resultIndex,
        question, raw, physicalPage, documentPage, pdf, homographies: reverse ? result.homographies2 : result.homographies
      }];
    });
  }), [examResults, pdfSources]);
  const pending = useMemo(() => items.filter(item => item.raw.reviewed !== true), [items]);
  const visible = cfg.showQActioned ? items : pending;
  const sorted = useMemo(() => {
    const [field, order] = sort;
    const direction = order === 'desc' ? -1 : 1;
    return [...visible].sort((left, right) => {
      if (field === 'answer') return (left.raw.scanned_value ?? '').localeCompare(right.raw.scanned_value ?? '') * direction;
      return (left.documentPage - right.documentPage || left.question - right.question) * direction;
    });
  }, [sort, visible]);
  const { getCrop, retryCrop } = useQuestionableCrops({ items: visible, examResults, pdfSources, enabled: cfg.showQuestionable && !busy });
  if (!cfg.showQuestionable || examResults.length === 0) return null;

  const toggleSort = field => setSort(previous => previous[0] === field && previous[1] === 'asc'
    ? [field, 'desc']
    : [field, 'asc']);

  return (
    <section class="review-panel" aria-labelledby="questionable-scans-title">
      <div class={`review-panel__header${expanded ? '' : ' mb-0'}`}>
        <div>
          <p class="review-panel__eyebrow">Recognition review</p>
          <h3 id="questionable-scans-title">Questionable scans</h3>
          <p class="form-text mb-0">{pending.length} to review · {items.length - pending.length} reviewed</p>
        </div>
        <SectionToggle title="Questionable scans" expanded={expanded} controls="questionable-scans-body"
          onClick={() => setExpanded(previous => !previous)} />
      </div>
      <div id="questionable-scans-body" hidden={!expanded}>
        {items.length > 0 ? <>
          <p id="questionable-scans-help" class="form-text">Choose a correction or select Mark as reviewed to keep the current answer.</p>
          <div class="review-sort flex-wrap">
            <label class="review-toggle me-auto" htmlFor="showQActioned">
              <input id="showQActioned" type="checkbox" class="form-check-input" autocomplete="off"
                checked={cfg.showQActioned} aria-describedby="questionable-scans-help"
                onChange={event => setCfg(previous => ({ ...previous, showQActioned: event.target.checked }))} />
              Show reviewed items
            </label>
            <button type="button" onClick={() => toggleSort('page')}>Sort by page {sort[0] === 'page' ? (sort[1] === 'asc' ? '↑' : '↓') : ''}</button>
            <button type="button" onClick={() => toggleSort('answer')}>Sort by answer {sort[0] === 'answer' ? (sort[1] === 'asc' ? '↑' : '↓') : ''}</button>
          </div>
        </> : null}
        {sorted.length === 0 ? <p class="review-panel__empty">{items.length ? 'All questionable scans reviewed.' : 'No questionable scans detected.'}</p> : sorted.map(item => (
          <QuestionableItem key={item.id} cfg={cfg} item={item} crop={getCrop(item)} onRetryCrop={() => retryCrop(item)}
            setExamResults={setExamResults} onViewPage={onViewPage} onViewImage={onViewImage} />
        ))}
      </div>
    </section>
  );
}
