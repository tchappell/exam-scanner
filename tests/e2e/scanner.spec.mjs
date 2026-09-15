import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';

const fixtureUrl = new URL('../fixtures/scan_chappeta.pdf', import.meta.url);
const fixturePath = fileURLToPath(fixtureUrl);
const expectedUrl = new URL('../fixtures/scan_chappeta.expected.json', import.meta.url);
const expected = JSON.parse(await readFile(expectedUrl, 'utf8'));
const twoSidedFixturePath = fileURLToPath(new URL('../fixtures/mcq_2sided.pdf', import.meta.url));
const twoSidedExpected = JSON.parse(await readFile(
  new URL('../fixtures/mcq_2sided.expected.json', import.meta.url),
  'utf8'
));

test('scans the reviewed ten-page fixture without changing recognition output', async ({ page }, testInfo) => {
  const scannerWorkerRequests = [];
  page.on('request', request => {
    if (request.url().includes('scannerWorker')) scannerWorkerRequests.push(request.url());
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(scannerWorkerRequests).toEqual([]);

  await page.locator('input[type="file"]').first().setInputFiles(fixturePath);

  await expect(page.locator('#endAt')).toHaveValue(`${expected.scanConfiguration.endAt}`);
  const scanButton = page.locator('button').filter({ hasText: /^Scan Exams$/ });
  await scanButton.click();
  await expect(page.locator('button').filter({ hasText: /^Stop scanning$/ })).toBeVisible();
  await expect.poll(() => scannerWorkerRequests.length).toBeGreaterThan(0);
  await expect(scanButton).toBeVisible({ timeout: 180_000 });
  await expect(page.locator('[role="alert"]')).toHaveCount(0);

  const resultRows = page.getByTestId('exam-result');
  await expect(resultRows).toHaveCount(expected.results.length);

  for (let index = 0; index < expected.results.length; index++) {
    const expectedResult = expected.results[index];
    const row = resultRows.nth(index);
    await expect(row).toHaveAttribute('data-page', `${expectedResult.page}`);
    await expect(row.locator('[data-field="student-number"]')).toHaveValue(expectedResult.studentNumber);
    await expect(row.locator('[data-field="surname"]')).toHaveValue(expectedResult.surname);
    await expect(row.locator('[data-field="initials"]')).toHaveValue(expectedResult.initials);

    const answers = await row.locator('select[data-question]').evaluateAll(selects =>
      selects.map(select => select.value).join('').trimEnd()
    );
    expect(answers).toBe(expectedResult.answers);
  }

  const questionableRows = page.getByTestId('questionable-result');
  await expect(questionableRows).toHaveCount(expected.questionable.length);
  const questionable = await questionableRows.evaluateAll(rows => rows.map(row => ({
    page: Number(row.dataset.page),
    question: Number(row.dataset.question),
    scannedAnswer: row.dataset.scannedAnswer
  })));
  expect(questionable).toEqual(expected.questionable);

  const downloadPromise = Promise.race([
    page.waitForEvent('download', { timeout: 30_000 }),
    page.waitForEvent('pageerror', { timeout: 30_000 }).then(error => Promise.reject(error))
  ]);
  await resultRows.first().getByRole('button', { name: `Download annotated PDF for page ${expected.results[0].page}` }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  const annotatedPdfPath = testInfo.outputPath('annotated-exam.pdf');
  await download.saveAs(annotatedPdfPath);
  const annotatedPdf = await PDFDocument.load(await readFile(annotatedPdfPath));
  expect(annotatedPdf.getPageCount()).toBe(1);
});

test('scans both sides of a 160-question answer sheet', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').first().setInputFiles(twoSidedFixturePath);
  await page.getByLabel('Two-sided?').check();

  await expect(page.locator('#endAt')).toHaveValue(`${twoSidedExpected.scanConfiguration.endAt}`);
  const scanButton = page.locator('button').filter({ hasText: /^Scan Exams$/ });
  await scanButton.click();
  await expect(page.locator('button').filter({ hasText: /^Stop scanning$/ })).toBeVisible();
  await expect(scanButton).toBeVisible({ timeout: 180_000 });
  await expect(page.locator('[role="alert"]')).toHaveCount(0);

  const resultRows = page.getByTestId('exam-result');
  await expect(resultRows).toHaveCount(1);
  const row = resultRows.first();
  await expect(row).toHaveAttribute('data-page', '1');
  await expect(row.locator('[data-field="student-number"]')).toHaveValue(twoSidedExpected.studentNumber);
  await expect(row.locator('[data-field="surname"]')).toHaveValue(twoSidedExpected.surname);
  await expect(row.locator('[data-field="initials"]')).toHaveValue(twoSidedExpected.initials);

  const answers = await row.locator('select[data-question]').evaluateAll(selects =>
    selects.map(select => select.value).join('').trimEnd()
  );
  expect(answers).toBe(
    twoSidedExpected.answerPattern.repeat(twoSidedExpected.answerPatternRepeats)
  );

  const questionable = await page.getByTestId('questionable-result').evaluateAll(rows => rows.map(item => ({
    page: Number(item.dataset.page),
    question: Number(item.dataset.question),
    scannedAnswer: item.dataset.scannedAnswer
  })));
  expect(questionable).toEqual(twoSidedExpected.questionable);
});
