import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';

import {
  appendedScanPageIndices,
  configuredQuestionCount,
  createAnnotatedExamPdf,
  createAnswerSheetRequestPdf,
  scannedStudentCount
} from '../src/services/pdfArtifacts.mjs';

const templateUrl = new URL('../public/TAS request form and marker-1.pdf', import.meta.url);
const fixtureUrl = new URL('./fixtures/scan_chappeta.pdf', import.meta.url);
const emptyDetails = {
  name: '', email: '', facultySchool: '', workPh: '', mobilePh: '', unitCode: '',
  examType: '', year: '', semester: '', description: '', questionCount: '',
  studentCount: '', comments: ''
};

test('answer-sheet defaults handle empty keys and marker pages', () => {
  assert.equal(configuredQuestionCount({}), 0);
  assert.equal(configuredQuestionCount({ 0: { A: true }, 7: { C: true }, 9: { D: false } }), 8);
  assert.equal(scannedStudentCount({ startAt: 1, endAt: 10, twoSided: false, hasMarker: true }), 9);
  assert.equal(scannedStudentCount({ startAt: 1, endAt: 6, twoSided: true, hasMarker: true }), 2);
});

test('appended scan pages exclude the configured marker sheet', () => {
  assert.deepEqual(
    appendedScanPageIndices({ startAt: 1, endAt: 5, twoSided: false, hasMarker: true }),
    [1, 2, 3, 4]
  );
  assert.deepEqual(
    appendedScanPageIndices({ startAt: 1, endAt: 6, twoSided: true, hasMarker: true }),
    [2, 3, 4, 5]
  );
});

test('request PDF keeps both answer pages for a two-sided sheet', async () => {
  const blob = await createAnswerSheetRequestPdf({
    config: { twoSided: true, answerKey: { 0: { A: true }, 159: { E: true } } },
    details: emptyDetails,
    templateBytes: await readFile(templateUrl)
  });
  const document = await PDFDocument.load(await blob.arrayBuffer());
  const form = document.getForm();

  assert.equal(blob.type, 'application/pdf');
  assert.equal(document.getPageCount(), 4);
  assert.equal(form.getCheckBox('test_answer_included').isChecked(), true);
  assert.equal(form.getCheckBox('master_answer_included').isChecked(), true);
  assert.equal(form.getCheckBox('acknowledgement').isChecked(), true);
  assert.equal(form.getCheckBox('test_answer_included').needsAppearancesUpdate(), false);
});

test('one-sided request PDF removes the blank and second answer pages and can append scans', async () => {
  const blob = await createAnswerSheetRequestPdf({
    config: {
      startAt: 1,
      endAt: 10,
      twoSided: false,
      hasMarker: true,
      answerKey: { 0: { A: true } }
    },
    details: emptyDetails,
    templateBytes: await readFile(templateUrl),
    appendedPdfBytes: await readFile(fixtureUrl)
  });
  const document = await PDFDocument.load(await blob.arrayBuffer());

  assert.equal(document.getPageCount(), 11);
});

test('request PDF appends every batch in order using its own page range and marker setting', async () => {
  const first = await PDFDocument.create();
  const second = await PDFDocument.create();
  for (const width of [300, 301, 302, 303, 304, 305]) first.addPage([width, 500]);
  for (const width of [400, 401, 402, 403]) second.addPage([width, 500]);
  const blob = await createAnswerSheetRequestPdf({
    config: { twoSided: true },
    details: emptyDetails,
    templateBytes: await readFile(templateUrl),
    appendedScans: [
      { pdf: first, config: { twoSided: true, startAt: 2, endAt: 5, hasMarker: true } },
      { pdf: second, config: { twoSided: true, startAt: 1, endAt: 4, hasMarker: false } }
    ]
  });
  const document = await PDFDocument.load(await blob.arrayBuffer());
  assert.deepEqual(document.getPages().slice(4).map(page => page.getWidth()), [303, 304, 400, 401, 402, 403]);
});

test('marked exports reuse the parsed document for each source PDF', async () => {
  const sourceForWidth = async width => {
    const source = await PDFDocument.create();
    source.addPage([width, 500]);
    const bytes = await source.save();
    return { getData: test.mock.fn(async () => bytes) };
  };
  const first = await sourceForWidth(300);
  const second = await sourceForWidth(400);
  const documents = new WeakMap();
  const result = { page: 1, answers: [] };
  for (const [source, width] of [[first, 300], [second, 400], [first, 300]]) {
    const blob = await createAnnotatedExamPdf({ twoSided: false }, result, source, documents);
    const annotated = await PDFDocument.load(await blob.arrayBuffer());
    assert.equal(annotated.getPage(0).getWidth(), width);
  }
  assert.equal(first.getData.mock.callCount(), 1);
  assert.equal(second.getData.mock.callCount(), 1);
});
