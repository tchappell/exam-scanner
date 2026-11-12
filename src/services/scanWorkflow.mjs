import { createAnswerKey, fixAnswers } from '../examDomain.mjs';

const noOp = () => {};

export function activeMultiAnswerQuestions(config) {
  if (!config.hasMultiAnswer) return [];
  return Object.keys(config.multiAnswerQuestions ?? {})
    .filter(question => config.multiAnswerQuestions[question])
    .map(Number);
}

export function validScanRange(config, numPages) {
  return Number.isSafeInteger(config?.startAt) && Number.isSafeInteger(config?.endAt)
    && config.startAt >= 1 && config.endAt >= config.startAt
    && (numPages == null || config.endAt <= numPages);
}

const pagesPerPaper = config => config.twoSided ? 2 : 1;
const firstExamPage = config => config.startAt + (config.hasMarker ? pagesPerPaper(config) : 0);
const isPaperStart = (config, page) => Number.isSafeInteger(page) && page >= config.startAt
  && page <= config.endAt && (page - config.startAt) % pagesPerPaper(config) === 0;
const isMarkerPage = (config, page) => config.hasMarker && page === config.startAt;
const markerNeedsScan = run => run.markerStatus === 'pending' || run.markerStatus === 'failed';

export function createScanRun(config) {
  return {
    config: {
      startAt: config.startAt,
      endAt: config.endAt,
      twoSided: Boolean(config.twoSided),
      hasMarker: Boolean(config.hasMarker),
      hasMultiAnswer: Boolean(config.hasMultiAnswer),
      multiAnswerQuestions: { ...config.multiAnswerQuestions }
    },
    markerStatus: config.hasMarker ? 'pending' : null,
    failures: {}
  };
}

export function normaliseScanRuns(scanRuns, pdfSources) {
  if (!scanRuns || typeof scanRuns !== 'object') return {};
  return Object.fromEntries(pdfSources.flatMap(({ id, numPages }) => {
    const saved = Object.hasOwn(scanRuns, id) ? scanRuns[id] : null;
    if (!validScanRange(saved?.config, numPages) || typeof saved.config.twoSided !== 'boolean') return [];

    const questionCount = saved.config.twoSided ? 160 : 40;
    const run = createScanRun({
      ...saved.config,
      hasMarker: saved.config.hasMarker === true,
      hasMultiAnswer: saved.config.hasMultiAnswer === true,
      multiAnswerQuestions: Object.fromEntries(Object.entries(saved.config.multiAnswerQuestions ?? {})
        .filter(([question, enabled]) => /^(0|[1-9]\d*)$/.test(question) && Number(question) < questionCount && typeof enabled === 'boolean'))
    });
    const { config } = run;
    if (saved.inferred === true) run.inferred = true;
    if (config.hasMarker && ['pending', 'scanned', 'failed', 'skipped'].includes(saved.markerStatus)) {
      run.markerStatus = saved.markerStatus;
    }
    for (const [key, failure] of Object.entries(saved.failures ?? {})) {
      const frontPage = Number(key);
      if (!isPaperStart(config, frontPage) || !Number.isSafeInteger(failure?.page)
        || failure.page < frontPage || failure.page >= frontPage + pagesPerPaper(config)
        || failure.page > config.endAt || typeof failure.message !== 'string'
        || (isMarkerPage(config, frontPage) && run.markerStatus !== 'failed')) continue;
      run.failures[frontPage] = { page: failure.page, message: failure.message };
    }
    return [[id, run]];
  }));
}

export function inferScanRun(source, config, sourceResults) {
  if (!sourceResults.length || !validScanRange(source.scanConfig, source.numPages)) return null;
  const { startAt, endAt, hasMarker } = source.scanConfig;
  const run = createScanRun({ ...config, startAt, endAt, hasMarker });
  const expectedAnswers = run.config.twoSided ? 160 : 40;
  if (new Set(sourceResults.map(result => Number(result.page))).size !== sourceResults.length
    || sourceResults.some(result => !isPaperStart(run.config, Number(result.page))
    || isMarkerPage(run.config, Number(result.page)) || result.answers?.length !== expectedAnswers)) return null;
  return { ...run, inferred: true, markerStatus: run.config.hasMarker ? 'skipped' : null };
}

function completedPaperPages(run, sourceResults) {
  const { config } = run;
  return new Set(sourceResults.map(result => Number(result.page))
    .filter(page => isPaperStart(config, page) && !isMarkerPage(config, page)));
}

export function summarizeMissingScan(run, sourceResults) {
  const { config } = run;
  const completed = completedPaperPages(run, sourceResults);
  const failures = Object.entries(run.failures).flatMap(([front, failure]) => {
    const frontPage = Number(front);
    const isMarker = Boolean(isMarkerPage(config, frontPage));
    return completed.has(frontPage) || (isMarker && run.markerStatus !== 'failed') ? []
      : [{ ...failure, frontPage, isMarker }];
  });
  const examCount = Math.max(0, Math.ceil((config.endAt + 1 - firstExamPage(config)) / pagesPerPaper(config)));
  const failedCount = failures.filter(failure => !failure.isMarker).length;
  return {
    config,
    inferred: run.inferred === true,
    pendingCount: examCount - completed.size - failedCount,
    failedCount,
    markerPending: run.markerStatus === 'pending',
    markerFailed: run.markerStatus === 'failed',
    failures
  };
}

function scanStartPages(config) {
  const pages = [];
  for (let page = config.startAt; page <= config.endAt; page += pagesPerPaper(config)) pages.push(page);
  return pages;
}

export function missingScanPages(run, sourceResults) {
  const completed = completedPaperPages(run, sourceResults);
  return scanStartPages(run.config).filter(page => isMarkerPage(run.config, page)
    ? markerNeedsScan(run) : !completed.has(page));
}

export function recordScanAttempt(run, { frontPage, page, status, error }) {
  const markerStatus = isMarkerPage(run.config, frontPage) ? status : run.markerStatus;
  if (status !== 'failed' && markerStatus === run.markerStatus && !Object.hasOwn(run.failures, frontPage)) return run;
  const failures = { ...run.failures };
  if (status === 'failed') failures[frontPage] = { page, message: error instanceof Error ? error.message : String(error) };
  else delete failures[frontPage];
  return { ...run, markerStatus, failures };
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
    onIssue: callbacks.onIssue ?? noOp,
    onAttempt: callbacks.onAttempt ?? noOp
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
  pages = scanStartPages(config),
  signal,
  callbacks
}) {
  const events = workflowCallbacks(callbacks);
  const totalExams = pages.length;
  const multiAnswerQuestions = activeMultiAnswerQuestions(config);
  const results = [];
  let answerKey = null;

  events.onProgress({ completed: 0, total: totalExams });
  if (totalExams === 0 || signal?.aborted || !await prepareScanner(scanner, events) || signal?.aborted) {
    return { results, answerKey, cancelled: Boolean(signal?.aborted) };
  }
  events.onStage('Scanning exams');

  let completed = 0;
  for (const pageNumber of pages) {
    if (signal?.aborted) break;
    let scannedPage = pageNumber;
    const isMarker = isMarkerPage(config, pageNumber);
    try {
      const first = await scanner.scanPage({
        pageNumber,
        side: 0,
        multiAnswerQuestions
      });
      let answers = responseAnswers(first, 0);
      let rawAnswers = first.raw_answers ?? [];
      let homographies2 = [];

      if (signal?.aborted) break;
      if (config.twoSided && pageNumber + 1 <= config.endAt) {
        scannedPage = pageNumber + 1;
        const second = await scanner.scanPage({
          pageNumber: scannedPage,
          side: 1,
          multiAnswerQuestions
        });
        answers = normalizeFirstSideAnswers(answers).concat(responseAnswers(second, 1));
        rawAnswers = rawAnswers.concat(second.raw_answers2 ?? []);
        homographies2 = second.homographies ?? [];
      }

      if (signal?.aborted) break;
      if (isMarker) {
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
          diffs: [],
          homographies: first.homographies,
          homographies2
        };
        results.push(result);
        events.onResult(result);
      }
      events.onAttempt({ frontPage: pageNumber, status: 'scanned' });
    } catch (error) {
      if (signal?.aborted) break;
      events.onAttempt({ frontPage: pageNumber, page: scannedPage, status: 'failed', error });
      events.onIssue({ stage: isMarker ? 'Could not scan marker page' : 'Could not scan exam', error, page: scannedPage });
    }

    completed += 1;
    events.onProgress({ completed, total: totalExams });
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
        multiAnswerQuestions
      });
      let answers = responseAnswers(first, 0);
      if (config.twoSided) {
        const second = await scanner.scanPage({
          pageNumber: config.startAt + 1,
          side: 1,
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
