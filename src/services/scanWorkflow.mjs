import { createAnswerKey, fixAnswers } from '../examDomain.mjs';

const noOp = () => {};

export function activeMultiAnswerQuestions(config) {
  if (!config.hasMultiAnswer) return [];
  return Object.keys(config.multiAnswerQuestions ?? {})
    .filter(question => config.multiAnswerQuestions[question])
    .map(Number);
}

export function comparisonForPage(comparison, pageNumber) {
  if (!comparison || !('results' in comparison)) return {};
  const pageOffset = 1 - comparison.cfg_firstPage;
  const expected = comparison.results.get(pageNumber + pageOffset);
  if (expected === undefined) return {};

  const selected = {};
  if (comparison.cfg_checkNumbers) selected.studentNum = expected.studentNum;
  if (comparison.cfg_checkName) selected.surname = expected.surname;
  if (comparison.cfg_checkInitials) selected.initial = expected.initial;
  if (comparison.cfg_checkAnswers) selected.q = expected.q;
  return selected;
}

function responseAnswers(response, side) {
  const values = side === 0 ? response.answer_values : response.answer_values2;
  const text = side === 0 ? response.answers : response.answers2;
  return values ?? `${text ?? ''}`.split('');
}

function normalizeFirstSideAnswers(answers) {
  return answers.concat(Array(40).fill(' ')).slice(0, 40);
}

function workflowCallbacks(callbacks = {}) {
  return {
    onStage: callbacks.onStage ?? noOp,
    onProgress: callbacks.onProgress ?? noOp,
    onResult: callbacks.onResult ?? noOp,
    onAnswerKey: callbacks.onAnswerKey ?? noOp,
    onIssue: callbacks.onIssue ?? noOp
  };
}

async function prepareScanner(scanner, callbacks) {
  callbacks.onStage('Preparing recognition models');
  try {
    await scanner.initialize();
    return true;
  } catch (error) {
    callbacks.onIssue({ stage: 'Could not prepare scanner', error, page: null });
    return false;
  }
}

export async function scanDocument({
  scanner,
  config,
  comparison = {},
  signal,
  callbacks
}) {
  const events = workflowCallbacks(callbacks);
  const pagesPerExam = config.twoSided ? 2 : 1;
  const totalPages = config.endAt + 1 - config.startAt;
  const totalExams = Math.ceil(totalPages / pagesPerExam);
  const multiAnswerQuestions = activeMultiAnswerQuestions(config);
  const results = [];
  let answerKey = null;

  events.onProgress({ completed: 0, total: totalExams });
  if (!await prepareScanner(scanner, events) || signal?.aborted) {
    return { results, answerKey, cancelled: Boolean(signal?.aborted) };
  }
  events.onStage('Scanning exams');

  let pageNumber = config.startAt;
  let completed = 0;
  while (!signal?.aborted && pageNumber <= config.endAt) {
    try {
      const compare = comparisonForPage(comparison, pageNumber);
      const first = await scanner.scanPage({
        pageNumber,
        side: 0,
        compare,
        multiAnswerQuestions
      });
      let answers = responseAnswers(first, 0);
      let rawAnswers = first.raw_answers ?? [];
      let diffs = first.diffs ?? [];
      let homographies2 = [];

      if (signal?.aborted) break;
      if (config.twoSided && pageNumber + 1 <= config.endAt) {
        const second = await scanner.scanPage({
          pageNumber: pageNumber + 1,
          side: 1,
          compare,
          multiAnswerQuestions
        });
        answers = normalizeFirstSideAnswers(answers).concat(responseAnswers(second, 1));
        rawAnswers = rawAnswers.concat(second.raw_answers2 ?? []);
        diffs = diffs.concat(second.diffs ?? []);
        homographies2 = second.homographies ?? [];
      }

      if (config.hasMarker && pageNumber === config.startAt) {
        answerKey = createAnswerKey(answers);
        events.onAnswerKey(answerKey);
      } else {
        const result = {
          page: pageNumber,
          student_number: first.student_number,
          surname: first.surname,
          initials: first.initials,
          answers: fixAnswers(config, answers),
          raw_student_number: first.raw_student_number,
          raw_surname: first.raw_surname,
          raw_initials: first.raw_initials,
          raw_answers: rawAnswers.map((rawAnswer, index) => ({
            ...rawAnswer,
            scanned_value: answers[index]
          })),
          diffs,
          homographies: first.homographies,
          homographies2
        };
        results.push(result);
        events.onResult(result);
      }
    } catch (error) {
      events.onIssue({ stage: 'Could not scan exam', error, page: pageNumber });
    }

    completed += 1;
    events.onProgress({ completed, total: totalExams });
    pageNumber += pagesPerExam;
  }

  return { results, answerKey, cancelled: Boolean(signal?.aborted) };
}

export async function attachPdfMetadata({
  scanner,
  config,
  results: loadedResults,
  scanMarker = false,
  signal,
  callbacks
}) {
  const events = workflowCallbacks(callbacks);
  const multiAnswerQuestions = activeMultiAnswerQuestions(config);
  const total = loadedResults.length + (scanMarker ? 1 : 0);
  const results = [];
  let answerKey = null;
  let completed = 0;

  events.onProgress({ completed, total });
  if (!await prepareScanner(scanner, events) || signal?.aborted) {
    return { results, answerKey, cancelled: Boolean(signal?.aborted) };
  }
  events.onStage('Matching loaded exams to the PDF');

  if (scanMarker && !signal?.aborted) {
    try {
      const first = await scanner.scanPage({
        pageNumber: config.startAt,
        side: 0,
        compare: {},
        multiAnswerQuestions
      });
      let answers = responseAnswers(first, 0);
      if (config.twoSided) {
        const second = await scanner.scanPage({
          pageNumber: config.startAt + 1,
          side: 1,
          compare: {},
          multiAnswerQuestions
        });
        answers = normalizeFirstSideAnswers(answers).concat(responseAnswers(second, 1));
      }
      answerKey = createAnswerKey(answers);
      events.onAnswerKey(answerKey);
    } catch (error) {
      events.onIssue({ stage: 'Could not scan marker page', error, page: config.startAt });
    }
    completed += 1;
    events.onProgress({ completed, total });
  }

  for (const loadedResult of loadedResults) {
    if (signal?.aborted) break;
    try {
      const first = await scanner.scanMatrix({ pageNumber: loadedResult.page, side: 0 });
      const result = { ...loadedResult, homographies: first.homographies };
      if (config.twoSided) {
        const second = await scanner.scanMatrix({ pageNumber: loadedResult.page + 1, side: 1 });
        result.homographies2 = second.homographies;
      }
      results.push(result);
      events.onResult(result);
    } catch (error) {
      events.onIssue({
        stage: 'Could not match exam to PDF',
        error,
        page: loadedResult.page
      });
      results.push(loadedResult);
      events.onResult(loadedResult);
    }
    completed += 1;
    events.onProgress({ completed, total });
  }

  return { results, answerKey, cancelled: Boolean(signal?.aborted) };
}
