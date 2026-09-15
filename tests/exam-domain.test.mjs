import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateScore,
  fixAnswers,
  normaliseStudentNum
} from '../src/examDomain.mjs';

test('calculateScore accepts any enabled answer for a question', () => {
  const answerKey = {
    0: { A: true, C: true },
    1: { B: true },
    2: { D: false }
  };

  assert.equal(calculateScore(['C', 'B', 'D', 'A'], answerKey), 2);
});

test('normaliseStudentNum trims and normalizes numeric identifiers', () => {
  assert.equal(normaliseStudentNum(' 00123456 '), 123456);
  assert.equal(normaliseStudentNum('not a number'), null);
  assert.equal(normaliseStudentNum('   '), null);
});

test('fixAnswers pads and truncates to the configured sheet size', () => {
  const oneSided = fixAnswers({ twoSided: false }, ['A', 'B']);
  assert.equal(oneSided.length, 40);
  assert.deepEqual(oneSided.slice(0, 3), ['A', 'B', ' ']);

  const twoSided = fixAnswers({ twoSided: true }, Array(200).fill('C'));
  assert.equal(twoSided.length, 160);
  assert.ok(twoSided.every(answer => answer === 'C'));
});
