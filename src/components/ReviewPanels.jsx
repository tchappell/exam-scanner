import { useState } from 'preact/hooks';
import { ANSWER_OPTIONS, answerIncludes, normaliseAnswer, updateAnswer } from '../examDomain.mjs';
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

function IdentityDifference({ diff, examResults, setExamResults, field, showActioned, onViewPage, onViewImage }) {
  const [actioned, setActioned] = useState(false);
  if (actioned && !showActioned) return null;

  const result = examResults[diff.i];
  const choose = value => {
    updateExamResult(setExamResults, diff.i, { [field]: value });
    setActioned(true);
  };

  return (
    <article class={`review-item ${actioned ? 'is-actioned' : ''}`}>
      <button type="button" class="review-item__image review-item__image--identity"
        onClick={() => onViewImage?.(diff.img, `Scanned ${field} — PDF page ${result.page}`)}>
        <img src={diff.img} alt="Scanned field requiring comparison" />
        <span>Enlarge crop</span>
      </button>
      <div class="review-item__body">
        <div class="review-item__heading"><p class="review-item__location">PDF page {result.page}</p>
          {onViewPage ? <button type="button" onClick={() => onViewPage(result.page, `PDF page ${result.page}`)}>View PDF page</button> : null}</div>
        <div class="review-comparison-values">
          <button type="button" class="btn btn-sm review-value-button" onClick={() => choose(diff.origValue)}>
            <span>Existing result</span>{diff.origValue || '(blank)'}
          </button>
          <button type="button" class="btn btn-sm review-value-button" onClick={() => choose(diff.scannedValue)}>
            <span>Scanner result</span>{diff.scannedValue || '(blank)'}
          </button>
          <div class="field-group">
            <label htmlFor={`diff_${diff.i}_${field}_e`}>Enter another value</label>
            <input
              autocomplete="off"
              type="text"
              id={`diff_${diff.i}_${field}_e`}
              value={result[field]}
              style={{ textTransform: 'uppercase' }}
              onInput={event => choose(event.target.value)}
            />
          </div>
        </div>
      </div>
    </article>
  );
}

function AnswerDifference({ cfg, diff, examResults, setExamResults, showActioned, onViewPage, onViewImage }) {
  const [actioned, setActioned] = useState(false);
  if (actioned && !showActioned) return null;

  const result = examResults[diff.i];
  const answer = result.answers[diff.idx];
  const physicalPage = result.page + (cfg.twoSided && diff.idx >= 40 ? 1 : 0);
  return (
    <article class={`review-item review-item--answer ${actioned ? 'is-actioned' : ''}`}>
      <button type="button" class="review-item__image" onClick={() => onViewImage?.(diff.img, `Question ${diff.idx + 1} crop`)}>
        <img src={diff.img} alt={`Scanned answer for question ${diff.idx + 1}`} />
      </button>
      <div class="review-item__body">
        {onViewPage ? <div class="review-item__heading">
          <span></span><button type="button" onClick={() => onViewPage(physicalPage, `PDF page ${physicalPage} — question ${diff.idx + 1}`)}>View PDF page</button>
        </div> : null}
        <p class="review-item__location">Page {examResults[diff.i].page} · Question {diff.idx + 1}</p>
        <ReviewChoiceButtons
          answer={answer}
          multiple={Boolean(multiAnswerQuestionsFor(cfg)[diff.idx])}
          onChange={value => {
            updateExamResult(setExamResults, diff.i, previous => ({
              answers: previous.answers.map((item, index) => index === diff.idx ? value : item)
            }));
            setActioned(true);
          }}
        />
        <p class="review-item__meta">Comparison: <strong>{diff.origValue.trim() || 'blank'}</strong> · Scanned: <strong>{diff.scannedValue.trim() || 'blank'}</strong></p>
      </div>
    </article>
  );
}

export function ComparisonReview({ cfg, setCfg, comparison, examResults, setExamResults, onViewPage, onViewImage }) {
  if (!('results' in comparison)) return null;

  const diffs = examResults.flatMap((row, i) => (row.diffs ?? []).map((diff, j) => ({ ...diff, i, j })));
  const identityGroups = [
    ['student_number', 'Student number differences', diffs.filter(diff => diff.field === 'studentNum')],
    ['surname', 'Surname differences', diffs.filter(diff => diff.field === 'surname')],
    ['initials', 'Initial differences', diffs.filter(diff => diff.field === 'initials')]
  ];
  const answerDiffs = diffs.filter(diff => diff.field === 'answers');

  return (
    <div class="review-panel">
      <div class="review-panel__header">
        <div><p class="review-panel__eyebrow">Comparison review</p><h3>Differences</h3></div>
        <label class="review-toggle" htmlFor="showActioned">
          <input id="showActioned" type="checkbox" class="form-check-input" autocomplete="off"
            checked={cfg.showActioned} onChange={event => setCfg(previous => ({ ...previous, showActioned: event.target.checked }))} />
          Show resolved items
        </label>
      </div>
      {diffs.length === 0 ? <p class="review-panel__empty">No differences detected.</p> : null}
      {identityGroups.map(([field, title, group]) => group.length > 0 ? (
        <section key={field} class="review-group">
          <h4>{title}</h4>
          {group.map(diff => <IdentityDifference key={`${diff.i}-${diff.j}`} diff={diff} examResults={examResults}
            setExamResults={setExamResults} field={field} showActioned={cfg.showActioned}
            onViewPage={onViewPage} onViewImage={onViewImage} />)}
        </section>
      ) : null)}
      {answerDiffs.length > 0 ? (
        <section class="review-group">
          <h4>Answer differences</h4>
          {answerDiffs.map(diff => <AnswerDifference key={`${diff.i}-${diff.j}`} cfg={cfg} diff={diff}
            examResults={examResults} setExamResults={setExamResults} showActioned={cfg.showActioned}
            onViewPage={onViewPage} onViewImage={onViewImage} />)}
        </section>
      ) : null}
    </div>
  );
}

function QuestionableItem({ cfg, item, examResults, setExamResults, showActioned, onViewPage, onViewImage }) {
  const [actioned, setActioned] = useState(false);
  if (actioned && !showActioned) return null;

  const { resultIndex, question, image } = item;
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
        {onViewPage ? <div class="review-item__heading"><span></span>
          <button type="button" onClick={() => onViewPage(physicalPage, `PDF page ${physicalPage} — question ${question + 1}`)}>View PDF page</button>
        </div> : null}
        <p class="review-item__location">Page {result.page} · Question {question + 1}</p>
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

export function QuestionableReview({ cfg, setCfg, examResults, setExamResults, onViewPage, onViewImage }) {
  const [sort, setSort] = useState(['page', 'asc']);
  if (!cfg.showQuestionable || examResults.length === 0) return null;

  const items = examResults.flatMap((result, resultIndex) => (result.raw_answers ?? []).flatMap((raw, question) =>
    'questionable' in raw ? [{ resultIndex, question, image: raw.questionableImg }] : []
  ));
  const direction = sort[1] === 'desc' ? -1 : 1;
  items.sort((left, right) => {
    if (sort[0] === 'answer') {
      return examResults[left.resultIndex].raw_answers[left.question].scanned_value.localeCompare(
        examResults[right.resultIndex].raw_answers[right.question].scanned_value
      ) * direction;
    }
    return (examResults[left.resultIndex].page - examResults[right.resultIndex].page || left.question - right.question) * direction;
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
        <QuestionableItem key={`${item.resultIndex}-${item.question}`} cfg={cfg} item={item}
          examResults={examResults} setExamResults={setExamResults} showActioned={cfg.showQActioned}
          onViewPage={onViewPage} onViewImage={onViewImage} />
      ))}
    </div>
  );
}
