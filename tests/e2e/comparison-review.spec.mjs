import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

import { buildRawResultsCsvRows } from '../../src/services/resultExports.mjs';
import { createCSV } from '../../src/util/csv.mjs';

const currentDataset = () => ({
  pdfHash: null,
  twoSided: false,
  hasMultiAnswer: false,
  multiAnswerQuestions: {},
  marking: { defaultMarks: 1, ranges: [], overrides: {} },
  answerKey: { 0: { B: true }, 1: { E: true }, 2: { E: true } },
  examResults: [{
    page: 1,
    student_number: '87654322',
    surname: 'VERIFIED',
    initials: 'AB',
    answers: ['C', 'E', 'D'],
    raw_answers: [{ scanned_value: 'A' }, { scanned_value: 'E' }, { scanned_value: 'D' }],
    raw_student_number: ['original recognition'],
    diffs: [],
    homographies: [{ testRegistration: 'first paper' }],
    canvasMatch: { userId: '204272', studentNumber: '87654322' }
  }, {
    page: 2,
    student_number: '55555555',
    surname: 'EXAMPLE TWO',
    initials: 'CD',
    answers: ['E'],
    diffs: [],
    homographies: [{ testRegistration: 'second paper' }]
  }]
});

const jsonFile = dataset => ({
  name: 'reviewed-results.json',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(dataset))
});

async function downloadDataset(page) {
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download working dataset' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('results.json');
  return JSON.parse(await readFile(await download.path(), 'utf8'));
}

test('late official results merge into reviewed exams and resume with comparison decisions', async ({ page }) => {
  test.setTimeout(45_000);
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    window.__scannerWorkersStarted = 0;
    window.Worker = class extends OriginalWorker {
      constructor(url, options) {
        if (`${url}`.includes('scannerWorker')) window.__scannerWorkersStarted++;
        super(url, options);
      }
    };
  });
  await page.goto('/');
  await page.getByLabel('Import results from results.json').setInputFiles(jsonFile(currentDataset()));

  const firstPaper = page.locator('[data-testid="exam-result"][data-page="1"]');
  await expect(firstPaper.locator('[data-field="student-number"]')).toHaveValue('87654322');
  await firstPaper.getByLabel('Question 3 response', { exact: true }).selectOption('E');

  const officialRows = buildRawResultsCsvRows({
    pdfName: 'official.pdf',
    examResults: [{
      page: 1, student_number: '12345678', surname: 'VERIFIED', initials: 'AB', answers: ['B', 'D', 'E']
    }, {
      page: 2, student_number: '55555555', surname: 'EXAMPLE TWO', initials: 'CD', answers: ['E']
    }]
  });
  await page.getByLabel('Import another scan for comparison').setInputFiles({
    name: 'official-raw_results.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(createCSV(officialRows))
  });

  const panel = page.getByRole('region', { name: 'Compare another scan' });
  await panel.getByRole('button', { name: 'Compare results', exact: true }).click();
  await expect(panel.getByText('2 papers compared · 3 differences to review · 0 reviewed')).toBeVisible();
  await panel.screenshot({ path: 'test-results/comparison-review-preview.png' });
  await expect(panel.locator('[data-difference="1:studentNum"]')).toContainText('87654322');
  await expect(panel.locator('[data-difference="1:answers:0"]')).toContainText('C');
  await expect(panel.locator('[data-difference="1:answers:2"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Scan Exams', exact: true })).toBeDisabled();

  await panel.locator('[data-difference="1:studentNum"]').getByRole('button', { name: 'Keep my result' }).click();
  await panel.locator('[data-difference="1:answers:0"]').getByRole('button', { name: 'Use imported result' }).click();
  await expect(panel.getByText('2 papers compared · 1 differences to review · 2 reviewed')).toBeVisible();

  const saved = await downloadDataset(page);
  expect(saved.examResults[0]).toMatchObject({
    student_number: '87654322',
    surname: 'VERIFIED',
    raw_answers: [{ scanned_value: 'A' }, { scanned_value: 'E' }, { scanned_value: 'D' }],
    homographies: [{ testRegistration: 'first paper' }],
    canvasMatch: { userId: '204272', studentNumber: '87654322' }
  });
  expect(saved.examResults[0].answers.slice(0, 3)).toEqual(['B', 'E', 'E']);
  expect(saved.examResults[1].student_number).toBe('55555555');
  expect(saved.examResults[1].homographies).toEqual([{ testRegistration: 'second paper' }]);
  expect(saved.comparison.decisions).toEqual({
    '1:studentNum': { value: '87654322' },
    '1:answers:0': { value: 'B' }
  });
  expect(await page.evaluate(() => window.__scannerWorkersStarted)).toBe(0);

  await page.reload();
  await page.getByLabel('Import results from results.json').setInputFiles(jsonFile(saved));
  await expect(panel.getByText('2 papers compared · 1 differences to review · 2 reviewed')).toBeVisible();
  await expect(panel.locator('[data-difference="1:answers:1"]')).toBeVisible();
  await expect(panel.locator('[data-difference="1:answers:0"]')).toHaveCount(0);
  await panel.getByLabel('Show reviewed differences').check();
  await expect(panel.locator('[data-difference="1:studentNum"]')).toContainText('Reviewed · current value: 87654322');
  await expect(panel.locator('[data-difference="1:answers:0"]')).toContainText('Reviewed · current value: B');

  await panel.locator('[data-difference="1:answers:1"]').getByRole('button', { name: 'Keep my result' }).click();
  await expect(panel.getByText('All differences reviewed.')).toBeVisible();
  const finished = await downloadDataset(page);
  expect(finished.examResults[0].answers.slice(0, 3)).toEqual(['B', 'E', 'E']);
  expect(finished.examResults[0].student_number).toBe('87654322');
  expect(await page.evaluate(() => window.__scannerWorkersStarted)).toBe(0);
});
