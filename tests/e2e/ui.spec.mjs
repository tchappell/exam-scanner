import { expect, test } from '@playwright/test';

test('presents the scanner as a four-step workflow', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Exam Scanner' })).toBeVisible();
  const workflow = page.getByRole('navigation', { name: 'Exam workflow' });
  await expect(workflow.getByRole('link')).toHaveCount(4);
  await expect(page.getByRole('heading', { name: 'Set up the scan' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Configure the answer key' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Review scanned exams' })).toBeVisible();
  await expect(page.getByText('No exams scanned yet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Scan Exams' })).toBeDisabled();
});

test('reveals per-question multi-answer controls and updates the key summary', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Contains multi-answer questions?').check();
  await expect(page.getByLabel('Question 1 uses multiple answers')).toBeVisible();
  await page.locator('label[for="ak_1_A"]').click();
  await page.locator('label[for="ak_1_C"]').click();
  await expect(page.locator('#ak_1_A')).toBeChecked();
  await expect(page.locator('#ak_1_C')).toBeChecked();
  await expect(page.getByText('1 keyed')).toBeVisible();
});
