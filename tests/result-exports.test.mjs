import assert from 'node:assert/strict';
import test from 'node:test';

import { createCSV } from '../src/util/csv.mjs';
import {
  buildRawResultsCsvRows,
  buildResultsCsvRows
} from '../src/services/resultExports.mjs';

const examResults = [{
  page: 7,
  student_number: '00123456',
  surname: 'O\'MALLEY, JR',
  initials: 'A B',
  answers: ['A', 'B', ' ']
}];

test('results export preserves the existing headings and scoring rules', () => {
  const rows = buildResultsCsvRows({
    examResults,
    answerKey: { 0: { A: true }, 1: { C: true } },
    pdfName: 'exam.pdf',
    date: '2026-09-15'
  });

  assert.deepEqual(rows[0], [
    'Unit', 'Exam date', 'Student number', 'Surname', 'Initial',
    'Score', 'Scanned file', 'Page in File'
  ]);
  assert.deepEqual(rows[1], [
    'AAA000', '2026-09-15', '00123456', "O'MALLEY, JR", 'A B', 1, 'exam.pdf', 7
  ]);
  assert.match(createCSV(rows), /"O'MALLEY, JR"/);
});

test('raw results export always contains 160 answer columns', () => {
  const rows = buildRawResultsCsvRows({
    examResults,
    pdfName: 'exam.pdf',
    date: '2026-09-15'
  });

  assert.equal(rows[0].length, 167);
  assert.equal(rows[1].length, 167);
  assert.deepEqual(rows[1].slice(0, 10), [
    'AAA000', '2026-09-15', '00123456', "O'MALLEY, JR", 'AB',
    'exam.pdf', 7, 'A', 'B', ''
  ]);
});
