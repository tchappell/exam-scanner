import assert from 'node:assert/strict';
import test from 'node:test';

import { buildWorkingDataset, readWorkingDataset } from '../src/services/workingDataset.mjs';

const original = { id: 'first', name: 'original.pdf', hash: 'first-file-hash', numPages: 2, pdf: {} };
const late = { id: 'second', name: 'late.pdf', hash: 'second-file-hash', numPages: 1, pdf: {} };
const correctedResult = {
  page: 1,
  student_number: '12345678',
  answers: ['B'],
  raw_answers: [{ scanned_value: 'A', questionable: true }],
  homographies: [{ matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1] }],
  canvasMatch: { userId: '22', studentNumber: '12345678' }
};

test('multiple PDF references round-trip without PDF data and reconnect by hash', () => {
  const config = { twoSided: false, answerKey: { 0: { B: true } }, hasMultiAnswer: false };
  const examResults = [
    { ...correctedResult, sourceId: original.id },
    { ...correctedResult, sourceId: late.id, answers: ['A'], canvasMatch: null }
  ];
  const pdfSources = [{ ...original, scanConfig: { startAt: 2, endAt: 2, hasMarker: false } }, late];
  const comparison = { sourceId: original.id, results: new Map([[1, { studentNum: '12345678' }]]) };
  const dataset = JSON.parse(JSON.stringify(buildWorkingDataset({ config, examResults, pdfSources, comparison })));
  assert.equal(dataset.pdfSources[0].pdf, undefined);
  assert.equal(dataset.pdfSources[1].pdf, undefined);
  assert.deepEqual(dataset.pdfSources[0].scanConfig, pdfSources[0].scanConfig);

  const restored = readWorkingDataset(dataset, [{ ...late, id: 'new-id', name: 'renamed.pdf' }]);
  assert.equal(restored.pdfSources[0].pdf, undefined);
  assert.equal(restored.pdfSources[1].pdf, late.pdf);
  assert.equal(restored.pdfSources[1].name, late.name);
  assert.deepEqual(restored.examResults.map(result => [result.sourceId, result.page]), [['first', 1], ['second', 1]]);
  assert.equal(restored.examResults[0].answers[0], 'B');
  assert.equal(restored.examResults[0].raw_answers[0].scanned_value, 'A');
  assert.deepEqual(restored.examResults[0].homographies, correctedResult.homographies);
  assert.deepEqual(restored.examResults[0].canvasMatch, correctedResult.canvasMatch);
  assert.deepEqual(restored.comparison, comparison);
});

test('a legacy hash restores existing corrections and retains a detached reference', () => {
  const legacy = { pdfHash: original.hash, twoSided: true, examResults: [correctedResult] };
  const restored = readWorkingDataset(legacy, [late]);
  assert.deepEqual(restored.pdfSources, [
    { id: original.hash, hash: original.hash, name: null, numPages: null }
  ]);
  assert.equal(restored.examResults[0].sourceId, original.hash);
  assert.equal(restored.examResults[0].answers.length, 160);
  assert.deepEqual(restored.examResults[0].homographies, correctedResult.homographies);

  const withPdf = readWorkingDataset(legacy, [late, original]);
  assert.deepEqual(withPdf.pdfSources, [original]);
  assert.equal(withPdf.examResults[0].sourceId, original.id);
});

test('legacy data without a hash can preview a sole open PDF but cannot verify its registration', () => {
  const legacy = { pdfHash: null, examResults: [correctedResult] };
  const withPdf = readWorkingDataset(legacy, [original]);
  assert.equal(withPdf.examResults[0].sourceId, original.id);
  assert.equal(withPdf.examResults[0].homographies, undefined);

  const withoutPdf = readWorkingDataset(legacy);
  assert.equal(withoutPdf.examResults[0].sourceId, undefined);
  assert.deepEqual(withoutPdf.examResults[0].homographies, correctedResult.homographies);

  const multiplePdfs = readWorkingDataset(legacy, [original, late]);
  assert.equal(multiplePdfs.examResults[0].sourceId, undefined);
  assert.deepEqual(multiplePdfs.pdfSources, []);
});

test('a missing source ID is rejected rather than associated with an unrelated file', () => {
  assert.throws(() => readWorkingDataset({
    pdfSources: [], examResults: [{ ...correctedResult, sourceId: original.id }]
  }, [original]), /refers to a PDF missing/);
});

test('restored references cannot attach one PDF to multiple source IDs', () => {
  assert.throws(() => readWorkingDataset({
    pdfSources: [original, { ...late, hash: original.hash }], examResults: []
  }, [original]), /PDF reference is invalid or duplicated/);
});
