import { useEffect, useState } from 'preact/hooks';

import { updateExamResult } from '../services/resultState.mjs';

function MatchCard({ children, selected, onSelect, side }) {
  return <button type="button" class={`canvas-match-card ${selected ? 'is-selected' : ''}`} onClick={onSelect}
    aria-pressed={selected}>
    <span class="canvas-match-card__side">{side}</span>{children}
  </button>;
}

function PaperCard({ result, resultIndex, selected, onSelect, onViewPage, onCorrectNumber,
  matchedStudent, onUnmatch, duplicateStudent, onMatchDuplicate }) {
  const [number, setNumber] = useState(result.student_number ?? '');
  useEffect(() => setNumber(result.student_number ?? ''), [result.student_number]);

  return <article class="canvas-match-paper" data-exam-index={resultIndex}>
    <MatchCard selected={selected} onSelect={onSelect} side={`PDF page ${result.page}`}>
      <span>{result.surname || '(surname blank)'}, {result.initials || '(initials blank)'}</span>
      <strong class="canvas-match-card__number">{`${result.student_number ?? ''}`.trim() || '(student number blank)'}</strong>
    </MatchCard>
    {matchedStudent ? <p class="canvas-match-paper__status">Matched to {matchedStudent}</p> : null}
    <div class="canvas-match-paper__actions">
      <button type="button" class="btn btn-sm btn-outline-secondary" disabled={!onViewPage}
        onClick={() => onViewPage?.(result.page, `PDF page ${result.page} — student details`)}>
        View paper
      </button>
      {onMatchDuplicate ? <button type="button" class="btn btn-sm btn-outline-primary" onClick={onMatchDuplicate}>
        Match this paper to {duplicateStudent}
      </button> : null}
      {onUnmatch ? <button type="button" class="btn btn-sm btn-outline-secondary" onClick={onUnmatch}>Undo pairing</button> : null}
    </div>
    <details class="canvas-match-paper__correction">
      <summary>Correct recorded student number</summary>
      <form onSubmit={event => {
        event.preventDefault();
        onCorrectNumber(resultIndex, number.trim());
      }}>
        <label htmlFor={`match-number-${resultIndex}`}>Student number on PDF page {result.page}</label>
        <div class="canvas-match-paper__number-edit">
          <input id={`match-number-${resultIndex}`} type="text" inputMode="numeric" value={number}
            onInput={event => setNumber(event.target.value)} />
          <button type="submit" class="btn btn-sm btn-outline-primary" disabled={number.trim() === `${result.student_number ?? ''}`}>
            Save number
          </button>
        </div>
      </form>
    </details>
  </article>;
}

export function CanvasRosterMatch({ examResults, setExamResults, canvasCSV, matchResult, onMatch,
  onUnmatch, onCorrectNumber, onViewPage }) {
  const [matchSelection, setMatchSelection] = useState(null);
  const { examResultMatches, unmatchedExamResults, unmatchedStudents, duplicateGroups = [], manualExamIndices = new Set() } = matchResult;
  const duplicateExams = new Set(duplicateGroups.flatMap(group => group.examIndices));
  const ordinaryUnmatched = unmatchedExamResults.filter(index => !duplicateExams.has(index));

  useEffect(() => setMatchSelection(null), [examResults, canvasCSV]);

  useEffect(() => {
    setMatchSelection(previous => {
      if (!previous) return previous;
      const available = previous[0] === 'exam' ? unmatchedExamResults : unmatchedStudents;
      return available.includes(previous[1]) ? previous : null;
    });
  }, [unmatchedExamResults.join(','), unmatchedStudents.join(',')]);

  const chooseMatch = (side, index) => {
    if (!matchSelection || matchSelection[0] === side) {
      setMatchSelection(matchSelection?.[0] === side && matchSelection[1] === index ? null : [side, index]);
      return;
    }
    const examIndex = side === 'exam' ? index : matchSelection[1];
    const studentRow = side === 'student' ? index : matchSelection[1];
    if (unmatchedExamResults.includes(examIndex) && unmatchedStudents.includes(studentRow)) {
      onMatch?.(examIndex, studentRow);
    }
    setMatchSelection(null);
  };

  const correctNumber = (index, number) => {
    if (onCorrectNumber) onCorrectNumber(index, number);
    else updateExamResult(setExamResults, index, { student_number: number, canvasMatch: undefined });
    setMatchSelection(null);
  };

  const paper = (resultIndex, group = null) => {
    const studentRow = examResultMatches.get(resultIndex);
    const candidateRow = group?.studentRows.length === 1 ? group.studentRows[0] : null;
    return <PaperCard key={resultIndex} result={examResults[resultIndex]} resultIndex={resultIndex}
      selected={matchSelection?.[0] === 'exam' && matchSelection[1] === resultIndex}
      onSelect={() => unmatchedExamResults.includes(resultIndex) && chooseMatch('exam', resultIndex)}
      onViewPage={onViewPage} onCorrectNumber={correctNumber}
      matchedStudent={studentRow === undefined ? null : canvasCSV[studentRow][0]}
      onUnmatch={onUnmatch && manualExamIndices.has(resultIndex) ? () => onUnmatch(resultIndex) : null}
      duplicateStudent={candidateRow === null ? null : canvasCSV[candidateRow][0]}
      onMatchDuplicate={onMatch && candidateRow !== null && candidateRow !== studentRow
        ? () => { onMatch(resultIndex, candidateRow); setMatchSelection(null); }
        : null} />;
  };

  return <>
    <div class="canvas-summary">
      <div><strong>{examResultMatches.size}</strong><span>matched exams</span></div>
      <div><strong>{unmatchedExamResults.length}</strong><span>unmatched exams</span></div>
      <div><strong>{unmatchedStudents.length}</strong><span>students without scans</span></div>
    </div>
    {duplicateGroups.length > 0 ? <div class="canvas-duplicates">
      <h4>Duplicate student numbers</h4>
      <p>These papers contain the same recorded number. View each paper, pair the correct paper with the Canvas student, and correct the other number if you can read it.</p>
      {duplicateGroups.map(group => <section class="canvas-duplicate-group" key={group.studentNumber}
        aria-label={`Duplicate student number ${group.studentNumber}`}>
        <h5>{group.examIndices.length} papers with student number <strong>{group.studentNumber}</strong></h5>
        {group.studentRows.length === 0 ? <p>No Canvas student has this number.</p> : null}
        {group.studentRows.length > 1 ? <p>Multiple Canvas students also have this number; choose a student below.</p> : null}
        <div class="canvas-duplicate-group__papers">{group.examIndices.map(index => paper(index, group))}</div>
      </section>)}
    </div> : null}
    {(unmatchedExamResults.length > 0 || unmatchedStudents.length > 0) ? <div class="canvas-matches">
      <p>Select one paper and one Canvas student to pair them. Pairing does not change the recorded student number.</p>
      {matchSelection ? <p class="canvas-match-selection" role="status">
        {matchSelection[0] === 'exam' ? `PDF page ${examResults[matchSelection[1]]?.page} selected. Choose a Canvas student.`
          : `${canvasCSV[matchSelection[1]]?.[0]} selected. Choose a paper.`}
        {' '}<button type="button" class="btn btn-sm btn-link" onClick={() => setMatchSelection(null)}>Cancel selection</button>
      </p> : null}
      <div class="canvas-matches__columns">
        <div>
          <h4>Unmatched papers</h4>
          {ordinaryUnmatched.map(index => paper(index))}
          {ordinaryUnmatched.length === 0 ? <p>{duplicateGroups.length > 0 && unmatchedExamResults.length > 0
            ? 'Unmatched papers with duplicate numbers are grouped above.' : 'All papers are paired.'}</p> : null}
        </div>
        <div>
          <h4>Canvas students</h4>
          {unmatchedStudents.map(studentRow => <MatchCard key={studentRow} side="Canvas student"
            selected={matchSelection?.[0] === 'student' && matchSelection[1] === studentRow}
            onSelect={() => chooseMatch('student', studentRow)}>
            <span>{canvasCSV[studentRow][0]}</span>
            <strong class="canvas-match-card__number">{canvasCSV[studentRow][4] || 'No usable student number returned'}</strong>
          </MatchCard>)}
          {unmatchedStudents.length === 0 ? <p>All Canvas students have a paper.</p> : null}
        </div>
      </div>
    </div> : null}
    {[...manualExamIndices].some(index => !duplicateExams.has(index)) ? <details class="canvas-manual-pairings">
      <summary>Review manual pairings</summary>
      <div class="canvas-duplicate-group__papers">{[...manualExamIndices].filter(index => !duplicateExams.has(index)).map(index => paper(index))}</div>
    </details> : null}
  </>;
}
