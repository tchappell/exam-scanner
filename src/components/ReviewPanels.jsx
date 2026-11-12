import { useState } from 'preact/hooks';
import { ANSWER_OPTIONS, answerIncludes, normaliseAnswer, updateAnswer } from '../examDomain.mjs';
import { combinedPdfPage } from '../services/pdfSources.mjs';
import { updateExamResult } from '../services/resultState.mjs';

const multiAnswerQuestionsFor = cfg => cfg.hasMultiAnswer ? (cfg.multiAnswerQuestions ?? {}) : {};

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

function QuestionableItem({ cfg, item, examResults, setExamResults, showActioned, canViewPage, onViewPage, onViewImage }) {
  const [actioned, setActioned] = useState(false);
  if (actioned && !showActioned) return null;

  const { resultIndex, question, image, documentPage } = item;
  const result = examResults[resultIndex];
  const physicalPage = result.page + (cfg.twoSided && question >= 40 ? 1 : 0);
  return (
    <article
      class={`review-item review-item--answer ${actioned ? 'is-actioned' : ''}`}
      data-testid="questionable-result"
      data-page={result.page}
      data-question={question + 1}
      data-scanned-answer={result.raw_answers[question].scanned_value}
    >
      <button type="button" class="review-item__image" onClick={() => onViewImage?.(image, `Question ${question + 1} crop`)}>
        <img src={image} alt={`Questionable scan for question ${question + 1}`} />
      </button>
      <div class="review-item__body">
        {canViewPage(physicalPage, result.sourceId) ? <div class="review-item__heading"><span></span>
          <button type="button" onClick={() => onViewPage(physicalPage, `PDF page ${physicalPage} — question ${question + 1}`, result.sourceId)}>View PDF page</button>
        </div> : null}
        <p class="review-item__location">Page {documentPage} · Question {question + 1}</p>
        <ReviewChoiceButtons
          answer={result.answers[question]}
          multiple={Boolean(multiAnswerQuestionsFor(cfg)[question])}
          onChange={value => {
            updateExamResult(setExamResults, resultIndex, previous => ({
              answers: previous.answers.map((answer, index) => index === question ? value : answer)
            }));
            setActioned(true);
          }}
        />
        <p class="review-item__meta">Scanner read: <strong>{result.raw_answers[question].scanned_value.trim() || 'blank'}</strong></p>
      </div>
    </article>
  );
}

export function QuestionableReview({ cfg, setCfg, examResults, setExamResults, pdfSources, canViewPage, onViewPage, onViewImage }) {
  const [sort, setSort] = useState(['page', 'asc']);
  if (!cfg.showQuestionable || examResults.length === 0) return null;

  const items = examResults.flatMap((result, resultIndex) => {
    const documentPage = combinedPdfPage(pdfSources, result.sourceId, result.page) ?? result.page;
    return (result.raw_answers ?? []).flatMap((raw, question) =>
      'questionable' in raw ? [{ resultIndex, question, documentPage, image: raw.questionableImg }] : []);
  });
  const direction = sort[1] === 'desc' ? -1 : 1;
  items.sort((left, right) => {
    if (sort[0] === 'answer') {
      return examResults[left.resultIndex].raw_answers[left.question].scanned_value.localeCompare(
        examResults[right.resultIndex].raw_answers[right.question].scanned_value
      ) * direction;
    }
    return (left.documentPage - right.documentPage || left.question - right.question) * direction;
  });

  const toggleSort = field => setSort(previous => previous[0] === field && previous[1] === 'asc'
    ? [field, 'desc']
    : [field, 'asc']);

  return (
    <div class="review-panel">
      <div class="review-panel__header">
        <div><p class="review-panel__eyebrow">Recognition review</p><h3>Questionable scans</h3></div>
        <label class="review-toggle" htmlFor="showQActioned">
          <input id="showQActioned" type="checkbox" class="form-check-input" autocomplete="off"
            checked={cfg.showQActioned} onChange={event => setCfg(previous => ({ ...previous, showQActioned: event.target.checked }))} />
          Show resolved items
        </label>
      </div>
      <div class="review-sort">
        <span>{items.length} {items.length === 1 ? 'item' : 'items'}</span>
        <button type="button" onClick={() => toggleSort('page')}>Sort by page {sort[0] === 'page' ? (sort[1] === 'asc' ? '↑' : '↓') : ''}</button>
        <button type="button" onClick={() => toggleSort('answer')}>Sort by answer {sort[0] === 'answer' ? (sort[1] === 'asc' ? '↑' : '↓') : ''}</button>
      </div>
      {items.length === 0 ? <p class="review-panel__empty">No questionable scans detected.</p> : items.map(item => (
        <QuestionableItem key={`${examResults[item.resultIndex].sourceId ?? ''}-${examResults[item.resultIndex].page}-${item.question}`} cfg={cfg} item={item}
          examResults={examResults} setExamResults={setExamResults} showActioned={cfg.showQActioned}
          canViewPage={canViewPage} onViewPage={onViewPage} onViewImage={onViewImage} />
      ))}
    </div>
  );
}
