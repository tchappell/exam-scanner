import assert from 'node:assert/strict';
import test from 'node:test';

import { pairExamWithCanvas, updateExamResult } from '../src/services/resultState.mjs';

function stateHarness(initial) {
  let value = initial;
  return {
    read: () => value,
    set: updater => {
      value = updater(value);
    }
  };
}

test('updateExamResult replaces only the selected result', () => {
  const state = stateHarness([
    { page: 1, surname: 'SMITH', score: 10 },
    { page: 2, surname: 'JONES', score: 8 }
  ]);

  updateExamResult(state.set, 1, { surname: 'BROWN' });

  assert.deepEqual(state.read(), [
    { page: 1, surname: 'SMITH', score: 10 },
    { page: 2, surname: 'BROWN', score: 8 }
  ]);
});

test('updateExamResult accepts an update derived from the current result', () => {
  const state = stateHarness([{ page: 4, answers: ['A'], score: 1 }]);

  updateExamResult(state.set, 0, result => ({
    answers: [...result.answers, 'B'],
    score: result.score + 1
  }));

  assert.deepEqual(state.read(), [{ page: 4, answers: ['A', 'B'], score: 2 }]);
});

test('pairing another paper with the same Canvas student clears the earlier choice without changing numbers', () => {
  const state = stateHarness([
    { page: 1, student_number: '12345678', answers: ['A'], canvasMatch: { userId: '42', studentNumber: '12345678' } },
    { page: 2, student_number: '87654321', answers: ['C'] }
  ]);

  pairExamWithCanvas(state.set, 1, ['Student, Test', '42', '', '', '12345678']);

  assert.equal(state.read()[0].canvasMatch, null);
  assert.deepEqual(state.read()[1], {
    page: 2, student_number: '87654321', answers: ['C'],
    canvasMatch: { userId: '42', studentNumber: '87654321' }
  });
});

test('editing a student number clears its old manual Canvas pairing', () => {
  const state = stateHarness([{
    page: 1, student_number: '12345678', canvasMatch: { userId: '42', studentNumber: '12345678' }
  }]);

  updateExamResult(state.set, 0, { student_number: '87654321' });

  assert.equal(state.read()[0].student_number, '87654321');
  assert.equal(state.read()[0].canvasMatch, null);
});
