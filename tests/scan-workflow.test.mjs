import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activeMultiAnswerQuestions,
  attachPdfMetadata,
  comparisonForPage,
  scanDocument
} from '../src/services/scanWorkflow.mjs';

const blankAnswers = count => Array(count).fill(' ');

function firstSideResponse(answer = 'A') {
  const answers = blankAnswers(40);
  answers[0] = answer;
  return {
    answer_values: answers,
    raw_answers: answers.map(() => ({})),
    student_number: '12345678',
    surname: 'EXAMPLE',
    initials: 'A',
    raw_student_number: [],
    raw_surname: [],
    raw_initials: [],
    diffs: [],
    homographies: [{ side: 0 }]
  };
}

function secondSideResponse(answer = 'E') {
  const answers = blankAnswers(120);
  answers[119] = answer;
  return {
    answer_values2: answers,
    raw_answers2: answers.map(() => ({})),
    diffs: [],
    homographies: [{ side: 1 }]
  };
}

test('scanner settings expose only enabled multi-answer questions', () => {
  assert.deepEqual(activeMultiAnswerQuestions({
    hasMultiAnswer: true,
    multiAnswerQuestions: { 1: true, 2: false, 17: true }
  }), [1, 17]);
  assert.deepEqual(activeMultiAnswerQuestions({
    hasMultiAnswer: false,
    multiAnswerQuestions: { 1: true }
  }), []);
});

test('comparison settings are translated for the current PDF page', () => {
  const comparison = {
    cfg_firstPage: 5,
    cfg_checkNumbers: true,
    cfg_checkName: false,
    cfg_checkInitials: true,
    cfg_checkAnswers: true,
    results: new Map([[7, {
      studentNum: '12345678', surname: 'EXAMPLE', initial: 'A', q: ['B']
    }]])
  };

  assert.deepEqual(comparisonForPage(comparison, 11), {
    studentNum: '12345678',
    initial: 'A',
    q: ['B']
  });
  assert.deepEqual(comparisonForPage(comparison, 12), {});
});

test('two-sided scanning consumes a marker and returns one 160-answer exam', async () => {
  const calls = [];
  const answerKeys = [];
  const results = [];
  const scanner = {
    async initialize() {
      calls.push('initialize');
    },
    async scanPage(request) {
      calls.push([request.pageNumber, request.side, request.multiAnswerQuestions]);
      return request.side === 0 ? firstSideResponse() : secondSideResponse();
    }
  };

  const outcome = await scanDocument({
    scanner,
    config: {
      startAt: 1,
      endAt: 4,
      twoSided: true,
      hasMarker: true,
      hasMultiAnswer: true,
      multiAnswerQuestions: { 4: true },
      answerKey: {}
    },
    callbacks: {
      onAnswerKey: answerKey => answerKeys.push(answerKey),
      onResult: result => results.push(result)
    }
  });

  assert.deepEqual(calls, [
    'initialize',
    [1, 0, [4]],
    [2, 1, [4]],
    [3, 0, [4]],
    [4, 1, [4]]
  ]);
  assert.equal(answerKeys.length, 1);
  assert.equal(answerKeys[0][0].A, true);
  assert.equal(answerKeys[0][159].E, true);
  assert.equal(results.length, 1);
  assert.equal(results[0].page, 3);
  assert.equal(results[0].answers.length, 160);
  assert.equal(results[0].answers[0], 'A');
  assert.equal(results[0].answers[159], 'E');
  assert.deepEqual(outcome.results, results);
  assert.equal(outcome.cancelled, false);
});

test('a failed page is reported without discarding later scans', async () => {
  const issues = [];
  const scanner = {
    async initialize() {},
    async scanPage({ pageNumber }) {
      if (pageNumber === 1) throw new Error('Unreadable page');
      return firstSideResponse('C');
    }
  };

  const outcome = await scanDocument({
    scanner,
    config: {
      startAt: 1,
      endAt: 2,
      twoSided: false,
      hasMarker: false,
      hasMultiAnswer: false,
      answerKey: {}
    },
    callbacks: { onIssue: issue => issues.push(issue) }
  });

  assert.equal(issues.length, 1);
  assert.equal(issues[0].page, 1);
  assert.equal(outcome.results.length, 1);
  assert.equal(outcome.results[0].page, 2);
  assert.equal(outcome.results[0].answers[0], 'C');
});

test('loaded results can receive PDF homographies without rescanning answers', async () => {
  const matrixCalls = [];
  const loadedResults = [{ page: 3, student_number: '12345678', answers: ['A'] }];
  const scanner = {
    async initialize() {},
    async scanMatrix(request) {
      matrixCalls.push(request);
      return { homographies: [{ side: request.side }] };
    }
  };

  const outcome = await attachPdfMetadata({
    scanner,
    config: { startAt: 1, twoSided: true, hasMarker: false },
    results: loadedResults
  });

  assert.deepEqual(matrixCalls, [
    { pageNumber: 3, side: 0 },
    { pageNumber: 4, side: 1 }
  ]);
  assert.notEqual(outcome.results[0], loadedResults[0]);
  assert.deepEqual(outcome.results[0].homographies, [{ side: 0 }]);
  assert.deepEqual(outcome.results[0].homographies2, [{ side: 1 }]);
});
