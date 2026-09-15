import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const fixtureUrl = new URL('./fixtures/scan_chappeta.pdf', import.meta.url);
const expectedUrl = new URL('./fixtures/scan_chappeta.expected.json', import.meta.url);

test('the reviewed scanner characterization fixture is complete', async () => {
  const [pdf, pdfStat, expectedText] = await Promise.all([
    readFile(fixtureUrl),
    stat(fixtureUrl),
    readFile(expectedUrl, 'utf8')
  ]);
  const expected = JSON.parse(expectedText);

  assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(pdfStat.size, expected.source.sizeBytes);
  assert.equal(expected.scanConfiguration.startAt, 1);
  assert.equal(expected.scanConfiguration.endAt, 10);
  assert.equal(expected.scanConfiguration.twoSided, false);
  assert.equal(expected.results.length, 10);
  assert.deepEqual(expected.results.map(result => result.page), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  for (const result of expected.results) {
    assert.match(result.studentNumber, /^ *[0-9]+$/);
    assert.ok(result.answers.length <= 40);
  }
});

test('the reviewed two-sided characterization fixture covers all 160 questions', async () => {
  const fixtureUrl = new URL('./fixtures/mcq_2sided.pdf', import.meta.url);
  const expectedUrl = new URL('./fixtures/mcq_2sided.expected.json', import.meta.url);
  const [pdf, pdfStat, expectedText] = await Promise.all([
    readFile(fixtureUrl),
    stat(fixtureUrl),
    readFile(expectedUrl, 'utf8')
  ]);
  const expected = JSON.parse(expectedText);

  assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(pdfStat.size, expected.source.sizeBytes);
  assert.deepEqual(expected.scanConfiguration, {
    startAt: 1,
    endAt: 2,
    twoSided: true,
    hasMarker: false,
    questionCount: 160
  });
  assert.equal(
    expected.answerPattern.length * expected.answerPatternRepeats,
    expected.scanConfiguration.questionCount
  );
});
