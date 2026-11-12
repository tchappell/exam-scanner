import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildComparisonFromRows,
  buildComparisonReview,
  COMBINED_COMPARISON_SOURCE,
  restoreComparison,
  serializeComparison
} from '../src/services/comparisonImport.mjs';
import { loadCSV } from '../src/util/csv.mjs';

const headings = [
  'Unit', 'Exam date', 'Student number', 'Surname', 'Initial', 'Scanned file', 'Page in File',
  ...Array.from({ length: 160 }, (_, index) => `Q${index + 1}`)
];
const scannerConfig = { startAt: 1, hasMarker: false };
const csvRow = ({ page = 1, number = '12345678', surname = 'EXAMPLE', initials = 'AB', answers = ['A'], filename = 'exam.pdf' } = {}) => [
  'AAA000', '2026-11-09', number, surname, initials, filename, `${page}`,
  ...answers, ...Array(160 - answers.length).fill('')
];

test('comparison import handles quoted CSV fields and preserves settings', async () => {
  const values = Array(167).fill('');
  values[2] = '00123456';
  values[3] = 'O\'MALLEY, JR';
  values[4] = 'AB';
  values[6] = '7';
  values[7] = 'A';

  const quote = value => value.includes(',') ? `"${value}"` : value;
  const rows = await loadCSV(`${headings.join(',')}\n${values.map(quote).join(',')}\n`);
  const comparison = buildComparisonFromRows(rows, {
    filename: 'raw_results.csv',
    scannerConfig: { startAt: 4, hasMarker: true },
    previousComparison: { cfg_checkName: true }
  });

  assert.equal(comparison.results.get(7).surname, "O'MALLEY, JR");
  assert.equal(comparison.cfg_checkName, true);
  assert.equal(comparison.cfg_firstPage, 5);
});

test('comparison import validates headers and page identity instead of overwriting rows', () => {
  for (const rows of [
    [Array(167).fill('wrong heading'), csvRow()],
    [headings, csvRow({ page: '1banana' })],
    [headings, csvRow({ page: 0 })],
    [headings, csvRow(), csvRow()],
    [headings, csvRow(), csvRow({ filename: 'another-exam.pdf' }), csvRow({ filename: '' })],
    [headings]
  ]) {
    const comparison = buildComparisonFromRows(rows, { filename: 'raw_results.csv', scannerConfig });
    assert.equal(typeof comparison.error, 'string');
    assert.equal('results' in comparison, false);
  }
});

const pdfSources = [
  { id: 'first', name: 'batch-one.pdf', numPages: 3, scanConfig: { startAt: 1, endAt: 3, hasMarker: true } },
  { id: 'second', name: 'batch-two.pdf', numPages: 3, scanConfig: { startAt: 2, endAt: 3, hasMarker: false } }
];
const currentResult = (sourceId, page) => ({
  sourceId, page, student_number: '12345678', surname: 'EXAMPLE', initials: 'AB', answers: ['A']
});

test('multi-file comparison matches overlapping page numbers by source PDF', () => {
  const comparison = buildComparisonFromRows([
    headings,
    csvRow({ filename: 'C:\\scans\\BATCH-ONE.pdf', answers: ['B'] }),
    csvRow({ filename: 'batch-two.pdf', answers: ['C'] })
  ], { filename: 'raw_results.csv', scannerConfig });
  const restored = restoreComparison(JSON.parse(JSON.stringify(serializeComparison(comparison))));
  const review = buildComparisonReview([
    currentResult('first', 1), currentResult('second', 1), currentResult('second', 2)
  ], restored, {}, { pdfSources });

  assert.equal(review.matchedCount, 2);
  assert.deepEqual(review.ambiguousPages, []);
  assert.deepEqual(review.currentOnlyPages, [{ sourceId: 'second', pdfName: 'batch-two.pdf', page: 2 }]);
  assert.deepEqual(review.diffs.map(({ id, sourceId, origValue }) => [id, sourceId, origValue]), [
    ['first:1:answers:0', 'first', 'B'], ['second:1:answers:0', 'second', 'C']
  ]);
  assert.match(buildComparisonReview([], restored, {}, {
    pdfSources: pdfSources.slice(0, 1)
  }).error, /Could not match batch-two\.pdf/);
});

test('a differently named CSV compares only with the selected batch', () => {
  const comparison = buildComparisonFromRows([
    headings, csvRow({ filename: 'official.pdf', answers: ['B'] })
  ], { filename: 'official.csv', scannerConfig });
  const results = [currentResult('first', 1), currentResult('second', 2)];
  assert.match(buildComparisonReview(results, comparison, {}, { pdfSources }).error, /Choose the source PDF/);
  const review = buildComparisonReview(results, {
    ...comparison, cfg_sourceId: 'second', cfg_firstPage: 2
  }, {}, { pdfSources });

  assert.equal(review.matchedCount, 1);
  assert.deepEqual(review.currentOnlyPages, []);
  assert.equal(review.diffs[0].i, 1);
  assert.equal(review.diffs[0].sourceId, 'second');
});

test('raw results from distinct named files can still be compared without the PDFs', () => {
  const comparison = buildComparisonFromRows([
    headings,
    csvRow({ filename: 'batch-one.pdf', answers: ['B'] }),
    csvRow({ filename: 'batch-two.pdf', answers: ['C'] })
  ], { filename: 'raw_results.csv', scannerConfig });
  const review = buildComparisonReview([
    { ...currentResult(undefined, 1), pdfName: 'batch-one.pdf' },
    { ...currentResult(undefined, 1), pdfName: 'batch-two.pdf' }
  ], comparison);

  assert.equal(review.matchedCount, 2);
  assert.equal(new Set(review.diffs.map(diff => diff.id)).size, 2);
  assert.deepEqual(review.diffs.map(diff => [diff.i, diff.origValue]), [[0, 'B'], [1, 'C']]);
});

test('a combined TAS comparison follows exported ranges and skips the marker', () => {
  const comparison = buildComparisonFromRows([
    headings,
    csvRow({ filename: 'official.pdf', page: 1, answers: ['B'] }),
    csvRow({ filename: 'official.pdf', page: 2, answers: ['C'] })
  ], { filename: 'official.csv', scannerConfig });
  const review = buildComparisonReview([
    currentResult('first', 3), currentResult('second', 2)
  ], { ...comparison, cfg_sourceId: COMBINED_COMPARISON_SOURCE, cfg_firstPage: 2 }, {}, { pdfSources });

  assert.equal(review.matchedCount, 2);
  assert.deepEqual(review.diffs.map(({ sourceId, page, origValue }) => [sourceId, page, origValue]), [
    ['first', 3, 'B'], ['second', 2, 'C']
  ]);
});

test('comparison default page offset accounts for both marker pages and keeps an explicit offset', () => {
  const comparison = buildComparisonFromRows([headings, csvRow()], {
    filename: 'raw_results.csv',
    scannerConfig: { startAt: 4, hasMarker: true, twoSided: true }
  });
  assert.equal(comparison.cfg_firstPage, 6);

  const replacement = buildComparisonFromRows([headings, csvRow()], {
    filename: 'new-results.csv',
    scannerConfig,
    previousComparison: { cfg_firstPage: 9 }
  });
  assert.equal(replacement.cfg_firstPage, 9);
});

test('comparison uses corrected values and page alignment without changing current scans', () => {
  const comparison = buildComparisonFromRows([headings, csvRow({ answers: ['B'] }), csvRow({ page: 2 })], {
    filename: 'raw_results.csv', scannerConfig,
    previousComparison: { cfg_firstPage: 3 }
  });
  const exams = [{
    page: 3,
    student_number: '87654321',
    surname: 'EXAMPLE',
    initials: 'AB',
    answers: ['C'],
    raw_answers: [{ scanned_value: 'A', questionableImg: 'data:test' }],
    homographies: [{ x: 1 }]
  }, {
    page: 5, student_number: '12345678', surname: 'OTHER', initials: 'C', answers: ['D']
  }];
  const before = structuredClone(exams);
  const review = buildComparisonReview(exams, comparison, {});

  assert.equal(review.matchedCount, 1);
  assert.deepEqual(review.currentOnlyPages, [5]);
  assert.deepEqual(review.importedOnlyPages, [4]);
  assert.equal(review.diffs.length, 2);
  assert.deepEqual(review.diffs[0], {
    id: '3:studentNum', i: 0, page: 3, field: 'studentNum', type: 'SN',
    origValue: '12345678', scannedValue: '87654321'
  });
  assert.deepEqual(review.diffs[1], {
    id: '3:answers:0', i: 0, page: 3, field: 'answers', type: 'Answer', idx: 0,
    origValue: 'B', scannedValue: 'C', img: 'data:test'
  });
  assert.deepEqual(exams, before);
});

test('comparison ignores formatting and answer order but includes questions on the second side', () => {
  const answers = Array(160).fill('');
  answers[0] = 'DB';
  answers[159] = 'E';
  const comparison = buildComparisonFromRows([headings, csvRow({ number: '00123456', surname: ' example  ', initials: 'A B', answers })], {
    filename: 'raw_results.csv', scannerConfig
  });
  const currentAnswers = [...answers];
  currentAnswers[0] = 'BD';
  currentAnswers[159] = 'A';
  const exam = { page: 1, student_number: '123456', surname: 'EXAMPLE', initials: 'AB', answers: currentAnswers };
  assert.equal(buildComparisonReview([exam], comparison, {}).diffs.length, 0);
  const diffs = buildComparisonReview([exam], comparison, { twoSided: true }).diffs;
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].idx, 159);
});

test('comparison skips duplicate current pages and honors selected fields', () => {
  const comparison = buildComparisonFromRows([headings, csvRow()], {
    filename: 'raw_results.csv', scannerConfig
  });
  const exam = { page: 1, student_number: '87654321', surname: 'DIFFERENT', initials: 'C', answers: ['B'] };
  const ambiguous = buildComparisonReview([exam, { ...exam }], comparison, {});
  assert.equal(ambiguous.matchedCount, 0);
  assert.deepEqual(ambiguous.ambiguousPages, [1]);
  assert.deepEqual(ambiguous.diffs, []);

  const answersOnly = buildComparisonReview([exam], {
    ...comparison, cfg_checkNumbers: false, cfg_checkName: false, cfg_checkInitials: false
  }, {});
  assert.deepEqual(answersOnly.diffs.map(diff => diff.field), ['answers']);
  assert.match(buildComparisonReview([exam], { ...comparison, cfg_firstPage: '2.5' }).error, /positive whole number/);
});

test('comparison and its review decisions survive a working dataset JSON round trip', () => {
  assert.deepEqual(restoreComparison(serializeComparison({})), {});
  const comparison = buildComparisonFromRows([headings, csvRow()], {
    filename: 'raw_results.csv', scannerConfig
  });
  comparison.review = { diffs: [{ id: '1:studentNum', i: 0, page: 1 }], decisions: { '1:studentNum': 'current' } };
  const restored = restoreComparison(JSON.parse(JSON.stringify(serializeComparison(comparison))));
  assert.deepEqual(restored, comparison);
});

test('comparison import rejects the wrong number of columns', () => {
  assert.deepEqual(
    buildComparisonFromRows([['too', 'short']], {
      filename: 'bad.csv',
      scannerConfig: { startAt: 1, hasMarker: false }
    }),
    { error: 'This is not a valid ACSPRI raw results file (must have 167 columns)' }
  );
});
