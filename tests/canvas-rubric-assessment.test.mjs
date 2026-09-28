import assert from 'node:assert/strict';
import test from 'node:test';

import {
  countExistingRubricPoints,
  findRubricCriteria,
  isCanvasRubricAssessment,
  matchExamResultsToRubric,
  writeRubricPoints
} from '../src/services/canvasRubricAssessment.mjs';

const gradebookHeadings = [
  ['Student', 'ID', 'SIS User ID', 'SIS Login ID', 'Integration ID', 'Section'],
  ['', '', '', '', '', ''],
  ['Points Possible', '', '', '', '', '']
];

const gradebookCsv = [
  ...gradebookHeadings,
  ['Student, Ada', ' 204272 ', '', '', '00123456', 'Section 1'],
  ['Student, Bob', '204273', '', '', '00876543', 'Section 1']
];

const scaleRubricCsv = [
  [
    'Student Id', 'Student Name',
    'Section A - Rating', 'Section A - Points', 'Section A - Comments',
    'Section B - Rating', 'Section B - Points', 'Section B - Comments',
    'Unrelated column'
  ],
  ['204273', 'Student, Bob', 'No details', '', '', 'Full marks', '20.0', 'pretty good', 'keep Bob'],
  ['204272', 'Student, Ada', 'Some details', '4.0', 'existing comment', 'Full marks', '20.0', '', 'keep Ada']
];

test('rubric criteria are detected for Written Feedback and Scale exports', () => {
  const writtenFeedbackCsv = [[
    'Student Id', 'Student Name',
    'Section A - Points', 'Section A - Comments',
    'Section B - Points', 'Section B - Comments'
  ]];

  assert.equal(isCanvasRubricAssessment(writtenFeedbackCsv), true);
  assert.deepEqual(findRubricCriteria(writtenFeedbackCsv), [
    { name: 'Section A', pointsColumn: 2, ratingColumn: null, commentsColumn: 3 },
    { name: 'Section B', pointsColumn: 4, ratingColumn: null, commentsColumn: 5 }
  ]);

  assert.equal(isCanvasRubricAssessment(scaleRubricCsv), true);
  assert.deepEqual(findRubricCriteria(scaleRubricCsv), [
    { name: 'Section A', pointsColumn: 3, ratingColumn: 2, commentsColumn: 4 },
    { name: 'Section B', pointsColumn: 6, ratingColumn: 5, commentsColumn: 7 }
  ]);
});

test('rubric validation requires Student Id in the first column and a Points criterion', () => {
  assert.equal(isCanvasRubricAssessment([['Student ID', 'Section A - Points']]), false);
  assert.equal(isCanvasRubricAssessment([['Student Id', 'Student Name', 'Section A - Comments']]), false);
  assert.equal(isCanvasRubricAssessment([['Student Id', 'Student Name', ' - Points']]), false);
});

test('matched exams crosswalk through the Gradebook Canvas ID without relying on row order', () => {
  const result = matchExamResultsToRubric({
    gradebookCsv,
    rubricCsv: scaleRubricCsv,
    examResultMatches: new Map([[0, 3], [1, 4]])
  });

  assert.deepEqual([...result.examResultMatches], [[0, 2], [1, 1]]);
  assert.deepEqual(result.missingExamResults, []);
  assert.deepEqual(result.duplicateStudentIds, []);
});

test('Canvas IDs are trimmed strings and duplicate or missing rubric IDs are skipped and reported', () => {
  const extendedGradebook = [
    ...gradebookCsv,
    ['Student, Cara', '204274', '', '', '00000003', 'Section 1'],
    ['Student, Dan', '0007', '', '', '00000004', 'Section 1'],
    ['Student, Eve', '', '', '', '00000005', 'Section 1']
  ];
  const rubricCsv = [
    ['Student Id', 'Student Name', 'MCQ - Points', 'MCQ - Comments'],
    [' 204272 ', 'Student, Ada', '', 'first duplicate'],
    ['204272', 'Student, Ada duplicate', '', 'second duplicate'],
    ['204273', 'Student, Bob', '', 'unique'],
    ['7', 'Student, Dan', '', 'numeric but not the same string'],
    ['', 'Student, Missing ID', '', 'blank ID']
  ];

  const result = matchExamResultsToRubric({
    gradebookCsv: extendedGradebook,
    rubricCsv,
    examResultMatches: new Map([[0, 3], [1, 4], [2, 5], [3, 6], [4, 7]])
  });

  assert.deepEqual([...result.examResultMatches], [[1, 3]]);
  assert.deepEqual(result.missingExamResults, [0, 2, 3, 4]);
  assert.deepEqual(result.duplicateStudentIds, ['204272']);
});

test('existing-point summary counts nonblank values only for matched students', () => {
  const matches = new Map([[0, 2], [1, 1]]);

  assert.equal(countExistingRubricPoints(scaleRubricCsv, 3, matches), 1);
  assert.equal(countExistingRubricPoints(scaleRubricCsv, 6, matches), 2);
});

test('writing rubric points clones the matrix and changes only the selected Points cells', () => {
  const original = structuredClone(scaleRubricCsv);
  const matches = new Map([[0, 2], [1, 1]]);
  const output = writeRubricPoints(scaleRubricCsv, 3, matches, new Map([[0, 9], [1, 0]]));

  assert.deepEqual(scaleRubricCsv, original);
  assert.notStrictEqual(output, scaleRubricCsv);
  assert.notStrictEqual(output[1], scaleRubricCsv[1]);
  assert.deepEqual(output, [
    original[0],
    ['204273', 'Student, Bob', 'No details', 0, '', 'Full marks', '20.0', 'pretty good', 'keep Bob'],
    ['204272', 'Student, Ada', 'Some details', 9, 'existing comment', 'Full marks', '20.0', '', 'keep Ada']
  ]);
});

test('writing skips exams without a supplied score and rejects non-Points columns', () => {
  const matches = new Map([[0, 2], [1, 1]]);
  const output = writeRubricPoints(scaleRubricCsv, 3, matches, { 0: 7.5 });

  assert.equal(output[2][3], 7.5);
  assert.equal(output[1][3], '');
  assert.throws(
    () => writeRubricPoints(scaleRubricCsv, 2, matches, new Map()),
    /not a criterion Points column/
  );
});
