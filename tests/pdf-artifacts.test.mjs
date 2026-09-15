import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';

import {
  appendedScanPageIndices,
  configuredQuestionCount,
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
