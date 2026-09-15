import { useState } from 'preact/hooks';
import { ANSWER_OPTIONS, calculateScore, fixAnswers } from '../examDomain.mjs';
import { updateExamResult } from '../services/resultState.mjs';
import { EmptyState } from './WorkspaceSection.jsx';

const range = (start, end = null) => end === null
  ? [...Array(start).keys()]
  : [...Array(end - start).keys()].map(value => value + start);
const multiAnswerQuestionsFor = cfg => cfg.hasMultiAnswer ? (cfg.multiAnswerQuestions ?? {}) : {};
const ANSWER_COMBINATIONS = [
  ' ',
  ...Array.from({ length: 31 }, (_, mask) => ANSWER_OPTIONS
    .filter((_, option) => ((mask + 1) & (1 << option)) !== 0)
    .join(''))
    .sort((left, right) => left.length - right.length || left.localeCompare(right))
];

function ResultRow({ cfg, result, index, setExamResults, onDownloadAnnotatedPdf }) {
  return (
    <div class="exam-row" data-testid="exam-result" data-page={result.page}
      style={{ '--qcount': cfg.twoSided ? 160 : 40 }}>
      {'homographies' in result ? (
        <button type="button" class="result-pdf-button" onClick={() => onDownloadAnnotatedPdf(result)}
          aria-label={`Download annotated PDF for page ${result.page}`}>PDF</button>
      ) : <div aria-hidden="true"></div>}
      <div class="text-end pe-1">{result.page}</div>
      <div><input autocomplete="off" type="text" data-field="student-number" value={result.student_number}
        class="w-100" onChange={event => updateExamResult(setExamResults, index, { student_number: event.target.value })} /></div>
      <div><input autocomplete="off" type="text" data-field="surname" value={result.surname}
        class="w-100" style={{ textTransform: 'uppercase' }}
        onChange={event => updateExamResult(setExamResults, index, { surname: event.target.value })} /></div>
      <div><input autocomplete="off" type="text" data-field="initials" value={result.initials}
        class="w-100" style={{ textTransform: 'uppercase' }}
        onChange={event => updateExamResult(setExamResults, index, { initials: event.target.value })} /></div>
      <div class="ps-2" data-field="score">{calculateScore(result.answers, cfg.answerKey, multiAnswerQuestionsFor(cfg))}</div>
      {fixAnswers(cfg, result.answers).map((answer, question) => {
        const multiple = Boolean(multiAnswerQuestionsFor(cfg)[question]);
        const choices = multiple ? ANSWER_COMBINATIONS : [' ', ...ANSWER_OPTIONS];
        return <div key={question}><select class="w-100" data-question={question + 1}
          aria-label={`Question ${question + 1}${multiple ? ' multi-answer response' : ' response'}`}
          value={answer}
          onChange={event => updateExamResult(setExamResults, index, previous => ({
            answers: previous.answers.map((item, itemIndex) => itemIndex === question ? event.target.value : item)
          }))}>
          {choices.map(choice => <option key={choice} value={choice}>{choice === ' ' ? '-' : choice}</option>)}
        </select></div>;
      })}
    </div>
  );
}

function ResultsSearch({ onSearch }) {
  const [search, setSearch] = useState('');
  return (
    <form class="results-search" onSubmit={event => { event.preventDefault(); onSearch(search); }}>
      <input type="search" value={search} aria-label="Search scanned exams"
        placeholder="Student number, surname or initials" onInput={event => setSearch(event.target.value)} />
      <button type="submit" class="btn btn-sm btn-outline-primary">Search</button>
    </form>
  );
}

export function ExamResultsTable({ cfg, examResults, setExamResults, onDownloadAnnotatedPdf }) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState(null);

  if (examResults.length === 0) {
    return <EmptyState title="No exams scanned yet"
      description="Your scanned exams will appear here with editable student details, answers and scores." />;
  }

  const shownExams = range(examResults.length).filter(index => {
    if (search === '') return true;
    const value = search.toUpperCase();
    const result = examResults[index];
    return [result.student_number, result.surname, result.initials]
      .some(field => `${field}`.toUpperCase().includes(value));
  });

  if (sorting !== null) {
    const collator = new Intl.Collator('en');
    const [column, directionName] = sorting;
    const direction = directionName === 'asc' ? 1 : -1;
    shownExams.sort((leftIndex, rightIndex) => {
      const left = examResults[leftIndex];
      const right = examResults[rightIndex];
      if (column.startsWith('q')) {
        const question = Number.parseInt(column.slice(1), 10);
        return collator.compare(left.answers[question], right.answers[question]) * direction;
      }
      if (column === 'page') return (left.page - right.page) * direction;
      if (column === 'score') {
        return (calculateScore(left.answers, cfg.answerKey, multiAnswerQuestionsFor(cfg))
          - calculateScore(right.answers, cfg.answerKey, multiAnswerQuestionsFor(cfg))) * direction;
      }
      return collator.compare(`${left[column]}`, `${right[column]}`) * direction;
    });
  }

  const lastPage = Math.max(0, Math.ceil(shownExams.length / pageSize) - 1);
  const activePage = Math.min(page, lastPage);
  const first = activePage * pageSize;
  const last = Math.min(first + pageSize, shownExams.length);
  const visiblePages = range(Math.max(0, activePage - 2), Math.min(lastPage + 1, activePage + 3));
  const toggleSort = column => setSorting(previous => previous?.[0] === column && previous[1] === 'asc'
    ? [column, 'desc']
    : [column, 'asc']);
  const sortIndicator = column => sorting?.[0] === column ? (sorting[1] === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <div class="results-table">
      <div class="results-toolbar">
        <label>Show
          <select value={pageSize} onChange={event => { setPage(0); setPageSize(Number(event.target.value)); }}>
            {[10, 20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
          </select>
          exams
        </label>
        <ResultsSearch onSearch={value => { setPage(0); setSearch(value); }} />
      </div>
      <div class="results-table__scroll" style={{ minHeight: `${pageSize * 2 + 3.5}rem` }}>
        <div class="exam-row" style={{ '--qcount': cfg.twoSided ? 160 : 40 }}>
          <button type="button" class="table-sort" onClick={() => toggleSort('page')} style={{ gridColumn: 'span 2' }}>Page{sortIndicator('page')}</button>
          <button type="button" class="table-sort" onClick={() => toggleSort('student_number')}>Student #{sortIndicator('student_number')}</button>
          <button type="button" class="table-sort" onClick={() => toggleSort('surname')}>Surname{sortIndicator('surname')}</button>
          <button type="button" class="table-sort" onClick={() => toggleSort('initials')}>Initials{sortIndicator('initials')}</button>
          <button type="button" class="table-sort" onClick={() => toggleSort('score')}>Score{sortIndicator('score')}</button>
          {range(cfg.twoSided ? 160 : 40).map(question => (
            <button type="button" key={question} class="table-sort" onClick={() => toggleSort(`q${question}`)}>
              Q{question + 1}{sortIndicator(`q${question}`)}
            </button>
          ))}
        </div>
        {shownExams.slice(first, last).map(index => <ResultRow key={examResults[index].page} cfg={cfg}
          result={examResults[index]} index={index} setExamResults={setExamResults}
          onDownloadAnnotatedPdf={onDownloadAnnotatedPdf} />)}
      </div>
      <div class="results-footer">
        <span>Showing {shownExams.length === 0 ? 0 : first + 1}–{last} of {shownExams.length}
          {search ? ` (${examResults.length} total)` : ''}</span>
        <nav class="results-pagination" aria-label="Results pages">
          <button type="button" onClick={() => setPage(0)} disabled={activePage === 0}>First</button>
          <button type="button" onClick={() => setPage(Math.max(0, activePage - 1))} disabled={activePage === 0}>Previous</button>
          {visiblePages.map(pageNumber => <button type="button" key={pageNumber}
            class={pageNumber === activePage ? 'is-current' : ''} onClick={() => setPage(pageNumber)}>{pageNumber + 1}</button>)}
          <button type="button" onClick={() => setPage(Math.min(lastPage, activePage + 1))} disabled={activePage === lastPage}>Next</button>
          <button type="button" onClick={() => setPage(lastPage)} disabled={activePage === lastPage}>Last</button>
        </nav>
      </div>
    </div>
  );
}
