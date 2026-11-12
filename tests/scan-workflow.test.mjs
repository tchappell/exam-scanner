import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activeMultiAnswerQuestions,
  attachPdfMetadata,
  createScanRun,
  inferScanRun,
  missingScanPages,
  normaliseScanRuns,
  recordScanAttempt,
  scanDocument,
  summarizeMissingScan
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

test('recognition requests are independent of imported comparison results', async () => {
  const calls = [];
  const outcome = await scanDocument({
    scanner: {
      async initialize() {},
      async scanPage(request) {
        calls.push(request);
        return firstSideResponse('C');
      }
    },
    config: { startAt: 1, endAt: 1, twoSided: false, hasMarker: false },
    comparison: { results: new Map([[1, { q: ['B'] }]]) }
  });

  assert.deepEqual(calls, [{ pageNumber: 1, side: 0, multiAnswerQuestions: [] }]);
  assert.equal(outcome.results[0].answers[0], 'C');
  assert.deepEqual(outcome.results[0].diffs, []);
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

test('a saved two-sided run retries only failed and unattempted papers', async () => {
  const abort = new AbortController();
  let run = createScanRun({
    startAt: 1, endAt: 8, twoSided: true, hasMarker: true,
    hasMultiAnswer: true, multiAnswerQuestions: { 40: true }
  });
  const issues = [];
  const scanned = await scanDocument({
    scanner: {
      async initialize() {},
      async scanPage({ pageNumber, side }) {
        if (pageNumber === 6) throw new Error('Reverse could not align');
        if (pageNumber === 8) abort.abort();
        return side ? secondSideResponse() : firstSideResponse();
      }
    },
    config: run.config,
    signal: abort.signal,
    callbacks: {
      onAttempt: attempt => { run = recordScanAttempt(run, attempt); },
      onIssue: issue => issues.push(issue)
    }
  });
  assert.equal(scanned.cancelled, true);
  assert.deepEqual(scanned.results.map(result => result.page), [3]);
  assert.equal(issues[0].page, 6);
  assert.equal(run.markerStatus, 'scanned');

  const saved = JSON.parse(JSON.stringify({ batch: run }));
  const restored = normaliseScanRuns(saved, [{ id: 'batch', numPages: 8 }]).batch;
  const summary = summarizeMissingScan(restored, scanned.results);
  assert.equal(summary.pendingCount, 1);
  assert.equal(summary.failedCount, 1);
  assert.deepEqual(summary.failures, [{ frontPage: 5, page: 6, message: 'Reverse could not align', isMarker: false }]);

  const calls = [];
  const recovered = await scanDocument({
    scanner: {
      async initialize() {},
      async scanPage({ pageNumber, side, multiAnswerQuestions }) {
        calls.push([pageNumber, side, multiAnswerQuestions]);
        return side ? secondSideResponse() : firstSideResponse();
      }
    },
    config: restored.config,
    pages: missingScanPages(restored, scanned.results),
    callbacks: {
      onAttempt: attempt => { run = recordScanAttempt(run, attempt); }
    }
  });
  assert.deepEqual(calls, [[5, 0, [40]], [6, 1, [40]], [7, 0, [40]], [8, 1, [40]]]);
  assert.deepEqual(recovered.results.map(result => result.page), [5, 7]);
  assert.equal(recovered.answerKey, null);
  assert.deepEqual(run.failures, {});
  assert.deepEqual(missingScanPages(run, [...scanned.results, ...recovered.results]), []);
});

test('legacy page gaps are inferred only for results that match the saved layout', () => {
  const source = { numPages: 12, scanConfig: { startAt: 3, endAt: 10, hasMarker: true } };
  const config = { twoSided: true };
  const knownPaper = { page: 5, answers: blankAnswers(160) };
  const run = inferScanRun(source, config, [knownPaper]);
  assert.equal(run.markerStatus, 'skipped');
  assert.equal(run.inferred, true);
  assert.equal(summarizeMissingScan(run, [knownPaper]).failedCount, 0);
  assert.deepEqual(missingScanPages(run, [knownPaper]), [7, 9]);
  assert.equal(inferScanRun(source, config, [{ ...knownPaper, page: 6 }]), null);
  assert.equal(inferScanRun(source, config, [{ ...knownPaper, answers: blankAnswers(40) }]), null);
  assert.equal(inferScanRun(source, config, [knownPaper, { ...knownPaper }]), null);
});

test('saved scan runs reject invalid references and impossible failure pages', () => {
  const run = createScanRun({ startAt: 1, endAt: 4, twoSided: true, hasMarker: true });
  const failed = recordScanAttempt(run, { frontPage: 1, page: 2, status: 'failed', error: new Error('Marker failed') });
  const saved = {
    batch: { ...failed, failures: { ...failed.failures, 3: { page: 2, message: 'Wrong sheet' } } },
    tooLong: run,
    other: run
  };
  const sources = [{ id: 'batch', numPages: 4 }, { id: 'tooLong', numPages: 3 }];
  assert.deepEqual(normaliseScanRuns(saved, sources), { batch: failed });
  const skipped = recordScanAttempt(failed, { frontPage: 1, status: 'skipped' });
  assert.equal(skipped.markerStatus, 'skipped');
  assert.deepEqual(skipped.failures, {});
  assert.deepEqual(missingScanPages(skipped, []), [3]);
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
