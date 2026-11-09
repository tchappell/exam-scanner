import assert from 'node:assert/strict';
import test from 'node:test';

import { applyManualCanvasMatches, matchExamResultsToCanvas, savedCanvasMatches } from '../src/services/canvasMatching.mjs';

const headings = [
  ['Student', 'ID', 'SIS User ID', 'SIS Login ID', 'Integration ID', 'Section'],
  ['', '', '', '', '', ''],
  ['', '', '', '', '', '']
];

test('Canvas matching pairs unique normalized integration IDs', () => {
  const canvasCsv = [
    ...headings,
    ['Smith, Ada', '', '', '', '00123456', ''],
    ['Jones, Bob', '', '', '', '87654321', '']
  ];
  const examResults = [
    { student_number: '123456', surname: 'SMITH' },
    { student_number: '87654321', surname: 'JONES' }
  ];

  const result = matchExamResultsToCanvas(examResults, canvasCsv);

  assert.deepEqual([...result.examResultMatches], [[0, 3], [1, 4]]);
  assert.deepEqual(result.unmatchedExamResults, []);
  assert.deepEqual(result.unmatchedStudents, []);
});

test('Canvas matching leaves duplicate scan IDs for manual resolution', () => {
  const canvasCsv = [
    ...headings,
    ['Smith, Ada', '', '', '', '123456', '']
  ];
  const examResults = [
    { student_number: '123456', surname: 'SMITH' },
    { student_number: '123456', surname: 'SMITH' }
  ];

  const result = matchExamResultsToCanvas(examResults, canvasCsv);

  assert.equal(result.examResultMatches.size, 0);
  assert.deepEqual(result.unmatchedExamResults, [0, 1]);
  assert.deepEqual(result.unmatchedStudents, [3]);
  assert.deepEqual(result.duplicateGroups, [{ studentNumber: '123456', examIndices: [0, 1], studentRows: [3] }]);
});

test('manual Canvas matches pair an unmatched exam without changing its student number', () => {
  const canvasCsv = [
    ...headings,
    ['Smith, Ada', '42', '', '', '', '']
  ];
  const examResults = [{ student_number: '123456', surname: 'SMITH' }];
  const automatic = matchExamResultsToCanvas(examResults, canvasCsv);

  const result = applyManualCanvasMatches(automatic, new Map([[0, 3]]));

  assert.deepEqual([...result.examResultMatches], [[0, 3]]);
  assert.deepEqual(result.unmatchedExamResults, []);
  assert.deepEqual(result.unmatchedStudents, []);
  assert.equal(examResults[0].student_number, '123456');
});

test('either colliding paper can be paired without manufacturing another duplicate number', () => {
  const canvasCsv = [
    ...headings,
    ['Smith, Ada', '42', '', '', '123456', ''],
    ['Jones, Bob', '43', '', '', '87654321', '']
  ];
  const examResults = [
    { student_number: '123456', surname: 'SMITH' },
    { student_number: '123456', surname: 'JONES' }
  ];
  const automatic = matchExamResultsToCanvas(examResults, canvasCsv);

  for (const selectedExam of [0, 1]) {
    const result = applyManualCanvasMatches(automatic, new Map([[selectedExam, 3]]));
    assert.deepEqual([...result.examResultMatches], [[selectedExam, 3]]);
    assert.deepEqual(result.unmatchedExamResults, [1 - selectedExam]);
    assert.deepEqual(result.unmatchedStudents, [4]);
    assert.deepEqual([...result.manualExamIndices], [selectedExam]);
  }
  assert.deepEqual(examResults.map(result => result.student_number), ['123456', '123456']);
});

test('manual pairing overrides an automatic assignment and returns displaced paper to review', () => {
  const canvasCsv = [
    ...headings,
    ['Smith, Ada', '42', '', '', '123456', ''],
    ['Jones, Bob', '43', '', '', '87654321', '']
  ];
  const examResults = [
    { student_number: '123456', surname: 'SMITH' },
    { student_number: '87654321', surname: 'JONES' }
  ];
  const automatic = matchExamResultsToCanvas(examResults, canvasCsv);
  const result = applyManualCanvasMatches(automatic, new Map([[1, 3]]));

  assert.deepEqual([...result.examResultMatches], [[1, 3]]);
  assert.deepEqual(result.unmatchedExamResults, [0]);
  assert.deepEqual(result.unmatchedStudents, [4]);
  assert.equal(new Set(result.examResultMatches.values()).size, result.examResultMatches.size);
});

test('duplicate Canvas identifiers are never arbitrarily assigned to a paper', () => {
  const canvasCsv = [
    ...headings,
    ['Smith, Ada', '42', '', '', '123456', ''],
    ['Jones, Bob', '43', '', '', '123456', '']
  ];
  const result = matchExamResultsToCanvas([{ student_number: '123456', surname: 'SMITH' }], canvasCsv);
  assert.equal(result.examResultMatches.size, 0);
  assert.deepEqual(result.unmatchedExamResults, [0]);
  assert.deepEqual(result.unmatchedStudents, [3, 4]);
});

test('saved pairings follow Canvas user IDs through reordered rosters and invalidate on number correction', () => {
  const canvasCsv = [
    ...headings,
    ['Jones, Bob', '43', '', '', '87654321', ''],
    ['Smith, Ada', '42', '', '', '123456', '']
  ];
  const examResults = [{
    student_number: '12345',
    canvasMatch: { userId: '42', studentNumber: '12345' }
  }];

  assert.deepEqual([...savedCanvasMatches(examResults, canvasCsv)], [[0, 4]]);
  const restored = JSON.parse(JSON.stringify(examResults));
  assert.deepEqual([...savedCanvasMatches(restored, canvasCsv)], [[0, 4]]);
  restored[0].student_number = '87654321';
  assert.deepEqual([...savedCanvasMatches(restored, canvasCsv)], []);
});

test('invalid saved indices cannot add nonexistent papers or Canvas students', () => {
  const canvasCsv = [...headings, ['Smith, Ada', '42', '', '', '123456', '']];
  const automatic = matchExamResultsToCanvas([{ student_number: '', surname: '' }], canvasCsv);
  const result = applyManualCanvasMatches(automatic, new Map([[99, 3], [0, 999]]));
  assert.equal(result.examResultMatches.size, 0);
  assert.deepEqual(result.unmatchedExamResults, [0]);
  assert.deepEqual(result.unmatchedStudents, [3]);
});
