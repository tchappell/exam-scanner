import levenshteinModule from 'fast-levenshtein';

import { normaliseStudentNum } from '../examDomain.mjs';

const { get: levenshtein } = levenshteinModule;
const CANVAS_FIRST_STUDENT_ROW = 3;

function matchDistance(examResult, canvasRow) {
  const surname = `${canvasRow[0] ?? ''}`.split(', ')[0].toUpperCase();
  return levenshtein(`${canvasRow[4] ?? ''}`, `${examResult.student_number ?? ''}`)
    + 0.01 * levenshtein(surname, `${examResult.surname ?? ''}`.toUpperCase());
}

function groupNumbers(indices, getNumber) {
  const groups = new Map();
  for (const index of indices) {
    const number = normaliseStudentNum(getNumber(index));
    if (number === null) continue;
    if (!groups.has(number)) groups.set(number, []);
    groups.get(number).push(index);
  }
  return groups;
}

export function matchExamResultsToCanvas(examResults, canvasCsv) {
  const allExamIndices = examResults.map((_, index) => index);
  const allStudentRows = canvasCsv === null ? [] : canvasCsv.slice(CANVAS_FIRST_STUDENT_ROW)
    .map((_, index) => index + CANVAS_FIRST_STUDENT_ROW);
  const examResultMatches = new Map();
  const examsByNumber = groupNumbers(allExamIndices, index => examResults[index].student_number);
  const studentsByNumber = groupNumbers(allStudentRows, row => canvasCsv[row][4]);
  const duplicateGroups = [...examsByNumber].filter(([, indices]) => indices.length > 1)
    .map(([studentNumber, examIndices]) => ({
      studentNumber: `${studentNumber}`,
      examIndices,
      studentRows: studentsByNumber.get(studentNumber) ?? []
    }));

  for (const [number, examIndices] of examsByNumber) {
    const studentRows = studentsByNumber.get(number) ?? [];
    if (examIndices.length === 1 && studentRows.length === 1) {
      examResultMatches.set(examIndices[0], studentRows[0]);
    }
  }

  const matchedRows = new Set(examResultMatches.values());
  const unmatchedExamResults = allExamIndices.filter(index => !examResultMatches.has(index));
  const unmatchedStudents = allStudentRows.filter(row => !matchedRows.has(row));
  // Suggestions affect display order only. They never establish a match.
  unmatchedExamResults.sort((left, right) => {
    const nearest = index => Math.min(...unmatchedStudents.map(row => matchDistance(examResults[index], canvasCsv[row])), Infinity);
    return nearest(left) - nearest(right) || left - right;
  });
  unmatchedStudents.sort((left, right) => {
    const nearest = row => Math.min(...unmatchedExamResults.map(index => matchDistance(examResults[index], canvasCsv[row])), Infinity);
    return nearest(left) - nearest(right) || left - right;
  });

  return { examResultMatches, unmatchedExamResults, unmatchedStudents, duplicateGroups, allExamIndices, allStudentRows };
}

// Store the Canvas user ID with the paper, so pairing survives saved-work export
// and is independent of roster ordering. A number correction invalidates the pair.
export function savedCanvasMatches(examResults, canvasCsv) {
  const rowsByUserId = new Map();
  for (let row = CANVAS_FIRST_STUDENT_ROW; row < (canvasCsv?.length ?? 0); row++) {
    const userId = `${canvasCsv[row][1] ?? ''}`.trim();
    if (!userId) continue;
    if (!rowsByUserId.has(userId)) rowsByUserId.set(userId, []);
    rowsByUserId.get(userId).push(row);
  }
  const matches = new Map();
  examResults.forEach((result, index) => {
    const saved = result.canvasMatch;
    if (!saved || `${saved.studentNumber ?? ''}` !== `${result.student_number ?? ''}`) return;
    const rows = rowsByUserId.get(`${saved.userId ?? ''}`.trim());
    if (rows?.length === 1) matches.set(index, rows[0]);
  });
  return matches;
}

export function applyManualCanvasMatches(matchResult, manualMatches) {
  const examResultMatches = new Map(matchResult.examResultMatches);
  const allExamIndices = matchResult.allExamIndices
    ?? [...examResultMatches.keys(), ...matchResult.unmatchedExamResults];
  const allStudentRows = matchResult.allStudentRows
    ?? [...examResultMatches.values(), ...matchResult.unmatchedStudents];
  const validExams = new Set(allExamIndices);
  const validStudents = new Set(allStudentRows);
  const manualExamIndices = new Set();

  for (const [examIndex, studentRow] of manualMatches) {
    if (!validExams.has(examIndex) || !validStudents.has(studentRow)) continue;
    for (const [otherExam, otherStudent] of examResultMatches) {
      if (otherStudent === studentRow) {
        examResultMatches.delete(otherExam);
        manualExamIndices.delete(otherExam);
      }
    }
    examResultMatches.set(examIndex, studentRow);
    manualExamIndices.add(examIndex);
  }

  const matchedStudents = new Set(examResultMatches.values());
  const examOrder = [...new Set([...matchResult.unmatchedExamResults, ...allExamIndices])];
  const studentOrder = [...new Set([...matchResult.unmatchedStudents, ...allStudentRows])];
  return {
    ...matchResult,
    examResultMatches,
    manualExamIndices,
    unmatchedExamResults: examOrder.filter(index => !examResultMatches.has(index)),
    unmatchedStudents: studentOrder.filter(row => !matchedStudents.has(row))
  };
}
