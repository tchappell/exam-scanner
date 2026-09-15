import assert from 'node:assert/strict';
import test from 'node:test';

import { matchExamResultsToCanvas } from '../src/services/canvasMatching.mjs';

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
});
