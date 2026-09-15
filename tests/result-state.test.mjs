import assert from 'node:assert/strict';
import test from 'node:test';

import { updateExamResult } from '../src/services/resultState.mjs';

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
