import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { loadCSV } from '../../src/util/csv.mjs';

const fixture = new URL('../fixtures/scan_chappeta.pdf', import.meta.url);

async function examBatch(document, pageIndex, name) {
  const batch = await PDFDocument.create();
  const [copied] = await batch.copyPages(document, [pageIndex]);
  batch.addPage(copied);
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(await batch.save()) };
}

async function downloadFrom(page, button) {
  const event = page.waitForEvent('download');
  await button.click();
  return readFile(await (await event).path());
}

async function restoreDataset(page, bytes) {
  await page.getByLabel('Import results from results.json').setInputFiles({
    name: 'results.json', mimeType: 'application/json', buffer: bytes
  });
}

async function paperImage(page, button) {
  await button.click();
  const dialog = page.getByRole('dialog');
  const image = dialog.locator('img');
  await expect(image).toBeVisible();
  const fingerprint = await image.evaluate(async element => {
    const bytes = await (await fetch(element.src)).arrayBuffer();
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
  });
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  return fingerprint;
}

test('appending a PDF preserves corrections and restores the right papers by hash', async ({ page }) => {
  const document = await PDFDocument.load(await readFile(fixture));
  const firstPdf = await examBatch(document, 0, 'first-batch.pdf');
  const latePdf = await examBatch(document, 1, 'late-batch.pdf');
  await page.goto('/');

  const upload = page.locator('#pdf-upload');
  const scan = page.getByRole('button', { name: 'Scan Exams', exact: true });
  const rows = page.getByTestId('exam-result');
  const corrected = rows.first().locator('[data-field="student-number"]');
  const firstAnswer = rows.first().getByLabel('Question 1 response', { exact: true });

  await upload.setInputFiles(firstPdf);
  await scan.click();
  await expect(rows).toHaveCount(1);
  await expect(scan).toBeEnabled();
  await expect(corrected).toHaveValue('98754310');
  await corrected.fill('22222222');
  await corrected.press('Tab');
  await firstAnswer.selectOption('A');

  const saveButton = page.getByRole('button', { name: 'Download working dataset' });
  const { pdfSources: [firstSource], examResults: [firstResult], ...settings } = JSON.parse(
    (await downloadFrom(page, saveButton)).toString('utf8')
  );
  const { sourceId, ...legacyResult } = firstResult;
  const legacy = { ...settings, pdfHash: firstSource.hash, examResults: [legacyResult] };
  await page.reload();
  await restoreDataset(page, Buffer.from(JSON.stringify(legacy)));
  await expect(corrected).toHaveValue('22222222');
  await expect(firstAnswer).toHaveValue('A');
  await expect(rows.first().getByRole('button', { name: /View original PDF for page 1/ })).toBeDisabled();

  await upload.setInputFiles(latePdf);
  await page.getByRole('button', { name: 'Scan and append exams', exact: true }).click();
  await expect(rows).toHaveCount(2);
  await expect(scan).toBeEnabled();
  await expect(rows.nth(1).locator('[data-field="student-number"]')).toHaveValue('04301234');
  await expect(corrected).toHaveValue('22222222');
  await expect(firstAnswer).toHaveValue('A');
  await expect(rows.nth(0)).toHaveAttribute('data-page', '1');
  await expect(rows.nth(1)).toHaveAttribute('data-page', '1');

  const firstPreview = rows.nth(0).getByRole('button', { name: /View original PDF for page 1/ });
  const latePreview = rows.nth(1).getByRole('button', { name: /View original PDF for page 1/ });
  await expect(firstPreview).toBeDisabled();
  await upload.setInputFiles(firstPdf);
  const firstFingerprint = await paperImage(page, firstPreview);
  const lateFingerprint = await paperImage(page, latePreview);
  expect(firstFingerprint).not.toEqual(lateFingerprint);
  await expect(rows.nth(0)).toHaveAttribute('data-document-page', '1');
  await expect(rows.nth(1)).toHaveAttribute('data-document-page', '2');

  const batchPicker = page.getByLabel('PDF batch', { exact: true });
  const lateOption = batchPicker.locator('option', { hasText: 'late-batch.pdf' });
  await batchPicker.selectOption(await lateOption.getAttribute('value'));
  page.once('dialog', confirmation => confirmation.accept());
  await page.getByRole('button', { name: 'Remove PDF', exact: true }).click();
  await expect(latePreview).toBeDisabled();
  expect(await paperImage(page, firstPreview)).toEqual(firstFingerprint);
  await upload.setInputFiles(latePdf);
  await expect(latePreview).toBeEnabled();

  await page.getByRole('button', { name: 'Create TAS request PDF...' }).click();
  const request = page.getByRole('dialog', { name: 'Create TAS request PDF' });
  await request.getByLabel('Append 2 scanned PDFs').check();
  const requestBytes = await downloadFrom(page, request.getByRole('button', { name: 'Export PDF', exact: true }));
  expect((await PDFDocument.load(requestBytes)).getPageCount()).toBe(4);
  await request.getByRole('button', { name: 'Close dialog' }).click();

  const csvBytes = await downloadFrom(page, page.getByRole('button', { name: 'Download detailed responses' }));
  const csv = await loadCSV(csvBytes.toString('utf8'));
  expect(csv.slice(1).map(row => row.slice(5, 7))).toEqual([['first-batch.pdf', '1'], ['late-batch.pdf', '1']]);

  const saved = await downloadFrom(page, saveButton);
  const dataset = JSON.parse(saved.toString('utf8'));
  expect(dataset.pdfSources.map(source => source.name)).toEqual(['first-batch.pdf', 'late-batch.pdf']);
  expect(dataset.examResults.map(result => result.sourceId)).toEqual(dataset.pdfSources.map(source => source.id));
  expect(dataset.examResults[0].homographies.length).toBeGreaterThan(0);

  await page.reload();
  await restoreDataset(page, saved);
  await expect(rows).toHaveCount(2);
  await expect(corrected).toHaveValue('22222222');
  await expect(firstAnswer).toHaveValue('A');
  await expect(firstPreview).toBeDisabled();
  await expect(latePreview).toBeDisabled();

  await upload.setInputFiles({ ...latePdf, name: 'late-batch-renamed.pdf' });
  await expect(latePreview).toBeEnabled();
  await expect(firstPreview).toBeDisabled();
  expect(await paperImage(page, latePreview)).toEqual(lateFingerprint);

  await upload.setInputFiles(firstPdf);
  await expect(firstPreview).toBeEnabled();
  expect(await paperImage(page, firstPreview)).toEqual(firstFingerprint);
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toHaveAttribute('data-document-page', '2');
  await expect(corrected).toHaveValue('22222222');
  const marked = await downloadFrom(page, rows.first().getByRole('button', { name: /Download annotated PDF for page 1/ }));
  expect((await PDFDocument.load(marked)).getPageCount()).toBe(1);
});
