import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const fixtureUrl = new URL('../fixtures/scan_chappeta.pdf', import.meta.url);
const fixturePath = fileURLToPath(fixtureUrl);
const expectedUrl = new URL('../fixtures/scan_chappeta.expected.json', import.meta.url);
const expected = JSON.parse(await readFile(expectedUrl, 'utf8'));

test('scans the reviewed ten-page fixture without changing recognition output', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').first().setInputFiles(fixturePath);

  await expect(page.locator('#endAt')).toHaveValue(`${expected.scanConfiguration.endAt}`);
  const scanButton = page.locator('button').filter({ hasText: /^Scan Exams$/ });
  await scanButton.click();
  await expect(page.locator('button').filter({ hasText: /^Stop scanning$/ })).toBeVisible();
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
});
