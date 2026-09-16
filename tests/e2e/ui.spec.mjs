import { expect, test } from '@playwright/test';

test('presents the scanner as a compact three-step workflow', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Exam Scanner' })).toBeVisible();
  const workflow = page.getByRole('navigation', { name: 'Exam workflow' });
  await expect(workflow.getByRole('link')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Set up the scan' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Answer key' })).toBeVisible();
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

test('opens the answer-sheet request form with finite defaults', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Create TAS request PDF...' }).click();

  await expect(page.locator('#answer-key-request-form')).toBeVisible();
  await expect(page.locator('#questionCount')).toHaveValue('0');
  await expect(page.locator('#studentCount')).toHaveValue('1');
  await expect(page.locator('#appendScans')).toBeDisabled();

  await page.locator('#name').fill('Test Marker');
  await page.locator('#rememberRequestDetails').check();
  await page.reload();
  await page.getByRole('button', { name: 'Create TAS request PDF...' }).click();
  await expect(page.locator('#name')).toHaveValue('Test Marker');
});

test('lays out setup columns side by side when the viewport has room', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const topPositions = await page.locator('.setup-layout > .setup-column').evaluateAll(columns =>
    columns.map(column => column.getBoundingClientRect().top)
  );
  expect(topPositions).toHaveLength(2);
  expect(Math.max(...topPositions) - Math.min(...topPositions)).toBeLessThan(12);
});

test('keeps Multi inside its control when individual marks are visible', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contains multi-answer questions?').check();
  await page.getByLabel('Edit individual questions').check();

  const geometry = await page.locator('label[for="ak_1_multi"]').evaluate(label => {
    const labelBox = label.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(label);
    const textBox = range.getBoundingClientRect();
    return {
      labelLeft: labelBox.left,
      labelRight: labelBox.right,
      textLeft: textBox.left,
      textRight: textBox.right
    };
  });
  expect(geometry.textLeft).toBeGreaterThanOrEqual(geometry.labelLeft);
  expect(geometry.textRight).toBeLessThanOrEqual(geometry.labelRight);
});

test('configures mark ranges and individual zero-mark overrides', async ({ page }) => {
  await page.goto('/');
  await page.locator('label[for="ak_1_A"]').click();
  await page.locator('label[for="ak_2_A"]').click();
  await expect(page.getByText('2 marks available')).toBeVisible();

  await page.getByRole('button', { name: 'Add mark range' }).click();
  await page.getByLabel('Range 1 first question').fill('2');
  await page.getByLabel('Range 1 last question').fill('2');
  await page.getByLabel('Range 1 marks per question').fill('2.5');
  await expect(page.getByText('3.5 marks available')).toBeVisible();

  await page.getByLabel('Edit individual questions').check();
  await page.getByLabel('Marks for question 1', { exact: true }).fill('0');
  await expect(page.getByText('2.5 marks available')).toBeVisible();
});
