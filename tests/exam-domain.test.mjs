import assert from 'node:assert/strict';
import test from 'node:test';

import {
  answerIncludes,
  calculateScore,
  createAnswerKey,
  fixAnswers,
  isAnswerCorrect,
  normaliseAnswer,
  normaliseStudentNum,
  updateAnswer
} from '../src/examDomain.mjs';

test('calculateScore accepts any enabled answer for a question', () => {
  const answerKey = {
    0: { A: true, C: true },
    1: { B: true },
    2: { D: false }
  };

  assert.equal(calculateScore(['C', 'B', 'D', 'A'], answerKey), 2);
});

test('multi-answer questions require the exact keyed set', () => {
  const answerKey = {
    0: { B: true, D: true },
    1: { A: true, C: true },
    2: { B: true, D: true }
  };
  const multiAnswerQuestions = { 0: true, 1: true, 2: true };

  assert.equal(calculateScore(['DB', 'A', 'BDE'], answerKey, multiAnswerQuestions), 1);
  assert.equal(isAnswerCorrect('BD', answerKey[0], true), true);
  assert.equal(isAnswerCorrect('B', answerKey[0], true), false);
  assert.equal(isAnswerCorrect('BDE', answerKey[0], true), false);
});

test('answers are stored in a canonical, CSV-friendly form', () => {
  assert.equal(normaliseAnswer('d, b, B'), 'BD');
  assert.equal(normaliseAnswer(''), ' ');
  assert.equal(answerIncludes('DB', 'B'), true);
  assert.equal(updateAnswer('BD', 'B', true), 'D');
  assert.equal(updateAnswer('D', 'B', true), 'BD');
  assert.equal(updateAnswer('BD', 'A', false), 'A');
});

test('a marker sheet creates one keyed option per selected bubble', () => {
  assert.deepEqual(createAnswerKey(['CB', 'D', ' ']), {
    0: { B: true, C: true },
    1: { D: true }
  });
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
