const STUDENT_ID_HEADING = 'Student Id';
const POINTS_SUFFIX = ' - Points';
const RATING_SUFFIX = ' - Rating';
const COMMENTS_SUFFIX = ' - Comments';

function trimmedId(value) {
  return `${value ?? ''}`.trim();
}

function columnFor(header, heading) {
  const column = header.indexOf(heading);
  return column === -1 ? null : column;
}

function requirePointsColumn(rubricCsv, pointsColumn) {
  const heading = rubricCsv?.[0]?.[pointsColumn];
  if (!Number.isInteger(pointsColumn)
    || typeof heading !== 'string'
    || !heading.endsWith(POINTS_SUFFIX)
    || heading.length === POINTS_SUFFIX.length) {
    throw new Error('The selected rubric column is not a criterion Points column.');
  }
}

function hasPoint(pointsByExam, examIndex) {
  if (pointsByExam instanceof Map) return pointsByExam.has(examIndex);
  return pointsByExam !== null
    && typeof pointsByExam === 'object'
    && Object.prototype.hasOwnProperty.call(pointsByExam, examIndex);
}

function pointFor(pointsByExam, examIndex) {
  return pointsByExam instanceof Map
    ? pointsByExam.get(examIndex)
    : pointsByExam[examIndex];
}

export function findRubricCriteria(csv) {
  const header = csv?.[0];
  if (!Array.isArray(header)) return [];

  return header.flatMap((heading, pointsColumn) => {
    if (typeof heading !== 'string'
      || !heading.endsWith(POINTS_SUFFIX)
      || heading.length === POINTS_SUFFIX.length) return [];

    const name = heading.slice(0, -POINTS_SUFFIX.length);
    return [{
      name,
      pointsColumn,
      ratingColumn: columnFor(header, `${name}${RATING_SUFFIX}`),
      commentsColumn: columnFor(header, `${name}${COMMENTS_SUFFIX}`)
    }];
  });
}

export function isCanvasRubricAssessment(csv) {
  return Array.isArray(csv)
    && csv[0]?.[0] === STUDENT_ID_HEADING
    && findRubricCriteria(csv).length > 0;
}

export function matchExamResultsToRubric({ gradebookCsv, rubricCsv, examResultMatches }) {
  const rubricRowsById = new Map();
  const duplicateStudentIds = [];
  const duplicateIds = new Set();

  if (isCanvasRubricAssessment(rubricCsv)) {
    for (let rubricRow = 1; rubricRow < rubricCsv.length; rubricRow++) {
      const studentId = trimmedId(rubricCsv[rubricRow]?.[0]);
      if (studentId === '') continue;

      if (rubricRowsById.has(studentId)) {
        rubricRowsById.delete(studentId);
        if (!duplicateIds.has(studentId)) {
          duplicateIds.add(studentId);
          duplicateStudentIds.push(studentId);
        }
      } else if (!duplicateIds.has(studentId)) {
        rubricRowsById.set(studentId, rubricRow);
      }
    }
  }

  const rubricMatches = new Map();
  const missingExamResults = [];
  for (const [examIndex, gradebookRow] of examResultMatches ?? []) {
    const studentId = trimmedId(gradebookCsv?.[gradebookRow]?.[1]);
    const rubricRow = studentId === '' ? undefined : rubricRowsById.get(studentId);
    if (typeof rubricRow === 'undefined') missingExamResults.push(examIndex);
    else rubricMatches.set(examIndex, rubricRow);
  }

  return {
    examResultMatches: rubricMatches,
    missingExamResults,
    duplicateStudentIds
  };
}

export function countExistingRubricPoints(rubricCsv, pointsColumn, rubricMatches) {
  requirePointsColumn(rubricCsv, pointsColumn);
  let count = 0;
  for (const rubricRow of rubricMatches?.values() ?? []) {
    if (`${rubricCsv[rubricRow]?.[pointsColumn] ?? ''}`.trim() !== '') count++;
  }
  return count;
}

export function writeRubricPoints(rubricCsv, pointsColumn, rubricMatches, pointsByExam) {
  requirePointsColumn(rubricCsv, pointsColumn);
  const output = rubricCsv.map(row => [...row]);

  for (const [examIndex, rubricRow] of rubricMatches ?? []) {
    if (!hasPoint(pointsByExam, examIndex) || !Array.isArray(output[rubricRow])) continue;
    while (output[rubricRow].length <= pointsColumn) output[rubricRow].push('');
    output[rubricRow][pointsColumn] = pointFor(pointsByExam, examIndex);
  }

  return output;
}
