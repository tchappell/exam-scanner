import { expect, test } from '@playwright/test';

test('the workspace sections collapse and keep edits when reopened', async ({ page }) => {
  await page.goto('/');

  const answer = page.locator('#ak_1_B');
  await page.locator('label[for="ak_1_B"]').click();
  await expect(answer).toBeChecked();
  const setupToggle = page.getByRole('button', { name: /^(Collapse|Expand) Set up the scan$/ });
  await expect(setupToggle).toHaveAttribute('aria-controls', /\S+/);
  const setupBody = page.locator(`#${await setupToggle.getAttribute('aria-controls')}`);
  await setupToggle.press('Enter');
  await expect(setupToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Expand Set up the scan' })).toBeFocused();
  await expect(setupBody).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Answer key', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Scan Exams', exact: true })).toBeVisible();

  await setupToggle.press('Space');
  await expect(setupToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('heading', { name: 'Answer key', exact: true })).toBeVisible();
  await expect(answer).toBeChecked();

  const reviewToggle = page.getByRole('button', { name: 'Collapse Review scanned exams' });
  await reviewToggle.click();
  await expect(page.getByText('No exams scanned yet', { exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Expand Review scanned exams' })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('navigation', { name: 'Exam workflow' }).getByRole('link', { name: /Review/ }).click();
  await expect(page.getByText('No exams scanned yet', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Collapse Export and continue' }).click();
  await expect(page.getByRole('button', { name: 'Download working dataset' })).toBeHidden();
  await page.getByRole('button', { name: 'Expand Export and continue' }).click();
  await expect(page.getByRole('button', { name: 'Download working dataset' })).toBeEnabled();
  await page.getByRole('button', { name: 'Collapse Results and saved work' }).click();
  await expect(page.getByRole('button', { name: 'Download working dataset' })).toBeHidden();
  await page.getByRole('button', { name: 'Collapse Canvas transfer' }).click();
  await expect(page.getByLabel('Submit Canvas Gradebook CSV')).toBeHidden();
  await page.getByRole('button', { name: 'Expand Canvas transfer' }).click();
  await expect(page.getByLabel('Submit Canvas Gradebook CSV')).toBeVisible();
  await page.getByRole('button', { name: 'Expand Results and saved work' }).click();
  await expect(page.getByRole('button', { name: 'Download working dataset' })).toBeEnabled();
});

test('collapsing questionable scans preserves review decisions and list preferences', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Import results from results.json').setInputFiles({
    name: 'synthetic-review.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      pdfHash: null,
      examResults: [{
        page: 1,
        student_number: '11111111',
        surname: 'EXAMPLE',
        initials: 'AB',
        answers: ['A', 'C'],
        raw_answers: [
          { scanned_value: 'A', questionable: true },
          { scanned_value: 'C', questionable: true }
        ]
      }]
    }))
  });

  const items = page.getByTestId('questionable-result');
  await expect(items).toHaveCount(2);
  const comparisonUpload = page.getByLabel('Import another scan for comparison');
  await page.getByRole('button', { name: 'Collapse Compare another scan' }).click();
  await expect(comparisonUpload).toBeHidden();
  await page.getByRole('button', { name: 'Expand Compare another scan' }).click();
  await expect(comparisonUpload).toBeVisible();
  const results = page.getByTestId('exam-result');
  await page.getByRole('button', { name: 'Collapse Scanned papers' }).click();
  await expect(results).toBeHidden();
  const first = items.and(page.locator('[data-question="1"]'));
  await first.getByRole('button', { name: 'B', exact: true }).click();
  const filter = page.getByLabel('Show reviewed items');
  await filter.uncheck();
  await expect(first).toHaveCount(0);
  await page.getByRole('button', { name: /^Sort by answer/ }).click();
  await expect(page.getByRole('button', { name: 'Sort by answer ↑' })).toBeVisible();

  await page.getByRole('button', { name: 'Collapse Questionable scans' }).click();
  await expect(items).toBeHidden();
  await expect(filter).toBeHidden();
  const expand = page.getByRole('button', { name: 'Expand Questionable scans' });
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Collapse Compare another scan' })).toBeVisible();

  await expand.press('Enter');
  await expect(filter).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Sort by answer ↑' })).toBeVisible();
  const second = items.and(page.locator('[data-question="2"]'));
  await expect(second).toBeVisible();
  await expect(first).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand Scanned papers' }).click();
  await expect(results.getByLabel('Question 1 response', { exact: true })).toHaveValue('B');
  await second.getByRole('button', { name: 'Mark as reviewed', exact: true }).click();
  await expect(items).toHaveCount(0);
  await expect(results.getByLabel('Question 2 response', { exact: true })).toHaveValue('C');
});
