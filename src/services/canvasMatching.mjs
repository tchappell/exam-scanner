import levenshteinModule from 'fast-levenshtein';

import { normaliseStudentNum } from '../examDomain.mjs';

const { get: levenshtein } = levenshteinModule;

const CANVAS_NAME_COLUMN = 0;
const CANVAS_INTEGRATION_ID_COLUMN = 4;
const CANVAS_FIRST_STUDENT_ROW = 3;

function surnameFromCanvasRow(row) {
  return row[CANVAS_NAME_COLUMN].split(', ')[0].toUpperCase();
}

function matchDistance(examResult, canvasRow) {
  let distance = levenshtein(
    canvasRow[CANVAS_INTEGRATION_ID_COLUMN],
    examResult.student_number
  );
  distance += 0.01 * levenshtein(
    surnameFromCanvasRow(canvasRow),
    examResult.surname.toUpperCase()
  );
  return distance;
}

export function matchExamResultsToCanvas(examResults, canvasCsv) {
  const examResultMatches = new Map();
  const unmatchedExamResults = [];
  const unmatchedStudents = [];

  if (canvasCsv === null) {
    return { examResultMatches, unmatchedExamResults, unmatchedStudents };
  }

  const canvasIds = new Map();
  for (let row = CANVAS_FIRST_STUDENT_ROW; row < canvasCsv.length; row++) {
    const studentNumber = normaliseStudentNum(canvasCsv[row][CANVAS_INTEGRATION_ID_COLUMN]);
    if (studentNumber) canvasIds.set(studentNumber, row);
  }

  const unmatchedExamRows = [];
  const canvasIdsUsed = new Map();
  for (let index = 0; index < examResults.length; index++) {
    const studentNumber = normaliseStudentNum(examResults[index].student_number);
    if (canvasIds.has(studentNumber)) {
      canvasIdsUsed.set(studentNumber, (canvasIdsUsed.get(studentNumber) || 0) + 1);
      examResultMatches.set(index, canvasIds.get(studentNumber));
    } else {
      unmatchedExamRows.push(index);
    }
  }

  for (let index = 0; index < examResults.length; index++) {
    const studentNumber = normaliseStudentNum(examResults[index].student_number);
    if (canvasIdsUsed.get(studentNumber) > 1) {
      examResultMatches.delete(index);
      unmatchedExamRows.push(index);
    }
  }

  const unmatchedCanvasRows = [];
  for (let row = CANVAS_FIRST_STUDENT_ROW; row < canvasCsv.length; row++) {
    const studentNumber = normaliseStudentNum(canvasCsv[row][CANVAS_INTEGRATION_ID_COLUMN]);
    if ((canvasIdsUsed.get(studentNumber) || 0) !== 1) unmatchedCanvasRows.push(row);
  }

  while (unmatchedExamRows.length > 0 && unmatchedCanvasRows.length > 0) {
    let bestDistance = Infinity;
    let bestExamPosition = -1;
    let bestCanvasPosition = -1;

    for (let examPosition = 0; examPosition < unmatchedExamRows.length; examPosition++) {
      for (let canvasPosition = 0; canvasPosition < unmatchedCanvasRows.length; canvasPosition++) {
        const distance = matchDistance(
          examResults[unmatchedExamRows[examPosition]],
          canvasCsv[unmatchedCanvasRows[canvasPosition]]
        );
        if (distance < bestDistance) {
          bestDistance = distance;
          bestExamPosition = examPosition;
          bestCanvasPosition = canvasPosition;
        }
      }
    }

    unmatchedExamResults.push(unmatchedExamRows[bestExamPosition]);
    unmatchedStudents.push(unmatchedCanvasRows[bestCanvasPosition]);
    unmatchedExamRows.splice(bestExamPosition, 1);
    unmatchedCanvasRows.splice(bestCanvasPosition, 1);
  }

  const remainingExams = unmatchedExamRows.map(index => [
    index,
    Math.min(
      ...unmatchedStudents.map(row => matchDistance(examResults[index], canvasCsv[row])),
      Infinity
    )
  ]);
  remainingExams.sort((a, b) => a[1] - b[1]);
  unmatchedExamResults.push(...remainingExams.map(([index]) => index));

  const remainingStudents = unmatchedCanvasRows.map(row => [
    row,
    Math.min(
      ...unmatchedExamResults.map(index => matchDistance(examResults[index], canvasCsv[row])),
      Infinity
    )
  ]);
  remainingStudents.sort((a, b) => a[1] - b[1]);
  unmatchedStudents.push(...remainingStudents.map(([row]) => row));

  return { examResultMatches, unmatchedExamResults, unmatchedStudents };
}

export function applyManualCanvasMatches(matchResult, manualMatches) {
  const examResultMatches = new Map(matchResult.examResultMatches);
  const unmatchedExamResults = new Set(matchResult.unmatchedExamResults);
  const unmatchedStudents = new Set(matchResult.unmatchedStudents);

  for (const [examIndex, studentRow] of manualMatches) {
    if (!unmatchedExamResults.has(examIndex) || !unmatchedStudents.has(studentRow)) continue;
    examResultMatches.set(examIndex, studentRow);
    unmatchedExamResults.delete(examIndex);
    unmatchedStudents.delete(studentRow);
  }

  return {
    examResultMatches,
    unmatchedExamResults: matchResult.unmatchedExamResults.filter(index => unmatchedExamResults.has(index)),
    unmatchedStudents: matchResult.unmatchedStudents.filter(row => unmatchedStudents.has(row))
  };
}
