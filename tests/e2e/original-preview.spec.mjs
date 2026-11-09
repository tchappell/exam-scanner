import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const pdfFixture = fileURLToPath(new URL('../fixtures/mcq_2sided.pdf', import.meta.url));

test('results preview opens both untouched exam pages without requiring an annotated download', async ({ page }) => {
  const downloads = [];
  page.on('download', download => downloads.push(download));
  await page.goto('/');
  await page.locator('#pdf-upload').setInputFiles(pdfFixture);
  await expect(page.locator('.pdf-card__preview img')).toBeVisible();

  const source = page.locator('.setup-column--source');
  const cardBounds = await source.locator('.pdf-card').boundingBox();
  const headingBounds = await source.locator('.setup-stack-section > h3').filter({ hasText: 'Scan configuration' }).boundingBox();
  expect(headingBounds.y).toBeGreaterThan(cardBounds.y + cardBounds.height + 15);
  await source.screenshot({ path: 'test-results/pdf-setup-polish-preview.png' });

  await page.getByLabel('Import results from results.json').setInputFiles({
    name: 'synthetic-two-sided-results.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      pdfHash: null,
      twoSided: true,
      hasMultiAnswer: false,
      multiAnswerQuestions: {},
      marking: { defaultMarks: 1, ranges: [], overrides: {} },
      answerKey: { 0: { A: true } },
      examResults: [{
        page: 1,
        student_number: '11111111',
        surname: 'SYNTHETIC',
        initials: 'T',
        answers: ['A'],
        diffs: []
      }]
    }))
  });

  const row = page.getByTestId('exam-result');
  await expect(row.getByRole('button', { name: 'Download annotated PDF for page 1', exact: true })).toHaveCount(0);
  await row.getByRole('button', { name: 'View original PDF for page 1', exact: true }).click();
  const viewer = page.getByRole('dialog');
  await expect(viewer.getByText('PDF page 1', { exact: true })).toBeVisible();
  await expect(viewer.locator('img')).toBeVisible();
  const firstImage = await viewer.locator('img').getAttribute('src');

  await viewer.getByRole('button', { name: 'Next exam page', exact: true }).click();
  await expect(viewer.getByText('PDF page 2', { exact: true })).toBeVisible();
  await expect(viewer.locator('img')).toBeVisible();
  await expect(viewer.locator('img')).not.toHaveAttribute('src', firstImage);
  await viewer.screenshot({ path: 'test-results/original-exam-preview.png' });

  await viewer.getByRole('button', { name: 'Previous exam page', exact: true }).click();
  await expect(viewer.getByText('PDF page 1', { exact: true })).toBeVisible();
  await expect(viewer.locator('img')).toBeVisible();
  await viewer.getByRole('button', { name: 'Close dialog', exact: true }).click();
  expect(downloads).toEqual([]);
});
