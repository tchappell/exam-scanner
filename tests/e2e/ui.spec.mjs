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

test('fits all four one-sided answer blocks on one row on a wide display', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');

  const blockTops = await page.locator('.answer-key-block').evaluateAll(blocks =>
    blocks.map(block => block.getBoundingClientRect().top)
  );
  expect(blockTops).toHaveLength(4);
  expect(Math.max(...blockTops) - Math.min(...blockTops)).toBeLessThan(12);
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

test('fits a wide student number crop inside its review container', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const container = document.createElement('button');
    container.type = 'button';
    container.className = 'review-item__image review-item__image--identity review-item__image--student-number';
    container.style.width = '320px';
    const image = document.createElement('img');
    image.alt = 'Test student number crop';
    image.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="900" height="180"%3E%3Crect width="900" height="180" fill="white"/%3E%3C/svg%3E';
    container.append(image);
    document.body.append(container);
    await image.decode();
  });

  const geometry = await page.getByRole('button', { name: 'Test student number crop' }).evaluate(container => ({
    containerWidth: container.clientWidth,
    imageWidth: container.querySelector('img').getBoundingClientRect().width,
    scrollWidth: container.scrollWidth
  }));
  expect(geometry.imageWidth).toBeLessThanOrEqual(geometry.containerWidth);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.containerWidth);
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

test('desktop runtime exposes direct Canvas without removing the CSV workflow', async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.isTauri = true;
    window.__TAURI_INTERNALS__ = {
      invoke: async command => {
        if (command === 'canvas_has_saved_token') return false;
        throw new Error(`Unexpected mocked Tauri command: ${command}`);
      }
    };
  });
  await page.goto('/');

  await expect(page.getByRole('tab', { name: 'Direct Canvas' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Canvas address')).toHaveValue('https://canvas.qut.edu.au');
  await expect(page.getByLabel('Access token')).toBeVisible();
  await expect(page.getByText('operating system credential store')).toBeVisible();

  await page.getByRole('tab', { name: 'Gradebook and rubric CSVs' }).click();
  await expect(page.getByLabel('Submit Canvas Gradebook CSV')).toBeVisible();
});

test('loads Canvas Enhanced Rubrics assessment criteria alongside a Gradebook', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Submit Canvas Gradebook CSV').setInputFiles({
    name: 'gradebook.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from([
      'Student,ID,SIS User ID,SIS Login ID,Integration ID,Section,Exam (42)',
      ',,,,,,Manual Posting',
      '    Points Possible,,,,,,40.00',
      '"Student, Test",204272,,,12345678,Default Section,'
    ].join('\n'))
  });

  await expect(page.getByText('Enhanced Rubrics assessment CSV')).toBeVisible();
  await page.getByLabel('Submit Canvas rubric-assessment CSV').setInputFiles({
    name: 'rubric.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from([
      'Student Id,Student Name,Section A - Rating,Section A - Points,Section A - Comments,Section B - Points,Section B - Comments',
      '204272,"Student, Test",No details,,,20,pretty good'
    ].join('\n'))
  });

  const criterion = page.getByLabel('MCQ rubric criterion');
  await expect(criterion).toContainText('Section A');
  await expect(criterion).toContainText('Section B');
  await expect(page.getByText('2 scored criteria found')).toBeVisible();
});
