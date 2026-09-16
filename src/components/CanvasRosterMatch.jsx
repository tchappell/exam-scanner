import { useState } from 'preact/hooks';

import { normaliseStudentNum } from '../examDomain.mjs';
import { updateExamResult } from '../services/resultState.mjs';

function MatchCard({ children, selected, onSelect, side }) {
  return (
    <button type="button" class={`canvas-match-card ${selected ? 'is-selected' : ''}`} onClick={onSelect}>
      <span class="canvas-match-card__side">{side}</span>{children}
    </button>
  );
}

export function CanvasRosterMatch({ examResults, setExamResults, canvasCSV, matchResult, onMatch }) {
  const [matchSelection, setMatchSelection] = useState(null);
  const { examResultMatches, unmatchedExamResults, unmatchedStudents } = matchResult;

  const match = (examIndex, studentIndex) => {
    if (onMatch) {
      onMatch(unmatchedExamResults[examIndex], unmatchedStudents[studentIndex]);
      return;
    }
    updateExamResult(setExamResults, unmatchedExamResults[examIndex], {
      student_number: `${normaliseStudentNum(canvasCSV[unmatchedStudents[studentIndex]][4]) ?? ''}`
    });
  };

  const chooseMatch = (side, index) => {
    setMatchSelection(previous => {
      if (previous === null) return [side, index];
      if (previous[0] !== side) {
        const examIndex = side === 'exam' ? index : previous[1];
        const studentIndex = side === 'student' ? index : previous[1];
        match(examIndex, studentIndex);
      }
      return null;
    });
  };

  return <>
    <div class="canvas-summary">
      <div><strong>{examResultMatches.size}</strong><span>matched exams</span></div>
      <div><strong>{unmatchedExamResults.length}</strong><span>unmatched exams</span></div>
      <div><strong>{canvasCSV.length - 3 - examResultMatches.size}</strong><span>students without scans</span></div>
    </div>
    {(unmatchedExamResults.length > 0 || unmatchedStudents.length > 0) ? (
      <div class="canvas-matches">
        <p>Select one exam and one Canvas student to match them.{onMatch ? '' : ' This updates the scanned student number.'}</p>
        <div class="canvas-matches__columns">
          <div>
            <h4>Unmatched exams</h4>
            {unmatchedExamResults.map((resultIndex, index) => <MatchCard key={resultIndex} side="Exam"
              selected={matchSelection?.[0] === 'exam' && matchSelection[1] === index}
              onSelect={() => chooseMatch('exam', index)}>
              Page {examResults[resultIndex].page}: {examResults[resultIndex].surname}, {examResults[resultIndex].initials}
              <small>{examResults[resultIndex].student_number}</small>
            </MatchCard>)}
          </div>
          <div>
            <h4>Canvas students</h4>
            {unmatchedStudents.map((studentIndex, index) => <MatchCard key={studentIndex} side="Student"
              selected={matchSelection?.[0] === 'student' && matchSelection[1] === index}
              onSelect={() => chooseMatch('student', index)}>
              {canvasCSV[studentIndex][0]}<small>{canvasCSV[studentIndex][4] || 'No usable student number returned'}</small>
            </MatchCard>)}
          </div>
        </div>
      </div>
    ) : null}
  </>;
}
