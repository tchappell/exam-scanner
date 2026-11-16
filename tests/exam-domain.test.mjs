import assert from 'node:assert/strict';
import test from 'node:test';

import {
  answerIncludes,
  calculateMaximumScore,
  calculateScore,
  createAnswerKey,
  fixAnswers,
  isAnswerCorrect,
  isMultiAnswerQuestion,
  multiAnswerDefaultForQuestion,
  multiAnswerQuestionsFor,
  normaliseAnswer,
  marksForQuestion,
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

test('mark ranges and individual overrides have predictable precedence', () => {
  const marking = {
    defaultMarks: 1,
    ranges: [{ from: 2, to: 4, marks: 1.5 }],
    overrides: { 3: 0, 5: 2 }
  };
  const answerKey = Object.fromEntries(Array.from({ length: 6 }, (_, question) => [question, { A: true }]));

  assert.equal(marksForQuestion(0, marking), 1);
  assert.equal(marksForQuestion(2, marking), 1.5);
  assert.equal(marksForQuestion(3, marking), 0);
  assert.equal(marksForQuestion(5, marking), 2);
  assert.equal(calculateMaximumScore(answerKey, marking), 7);
  assert.equal(calculateScore(['A', 'A', 'A', 'A', 'B', 'A'], answerKey, {}, marking), 5.5);
});

test('Multi and marks can inherit independently within an overlapping range', () => {
  const config = {
    hasMultiAnswer: true,
    marking: { defaultMarks: 1, ranges: [
      { from: 0, to: 6, marks: 2 },
      { from: 1, to: 5, multiAnswer: false },
      { from: 3, to: 4, marks: 0, multiAnswer: true },
      { from: 4, to: 5, marks: 3 }
    ] },
    multiAnswerQuestions: { 2: true, 4: false }
  };
  const modes = Array.from({ length: 8 }, (_, question) => isMultiAnswerQuestion(config, question));
  assert.deepEqual(modes, [true, false, true, true, false, false, true, true]);
  assert.equal(multiAnswerDefaultForQuestion(config, 2), false);
  assert.equal(multiAnswerDefaultForQuestion(config, 4), true);
  assert.deepEqual(Array.from({ length: 8 }, (_, question) => marksForQuestion(question, config.marking)), [2, 2, 2, 0, 3, 3, 2, 1]);
  const answerKey = { 1: { A: true, C: true }, 2: { A: true, C: true }, 4: { A: true, C: true } };
  assert.equal(calculateScore([' ', 'C', 'C', ' ', 'C'], answerKey, multiAnswerQuestionsFor(config), config.marking), 5);
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
