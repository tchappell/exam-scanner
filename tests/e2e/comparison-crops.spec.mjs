import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { PDFDocument, rgb } from 'pdf-lib';

import { buildRawResultsCsvRows } from '../../src/services/resultExports.mjs';
import { createCSV } from '../../src/util/csv.mjs';

const fixtureUrl = new URL('../fixtures/mcq_2sided.pdf', import.meta.url);
const fixturePath = fileURLToPath(fixtureUrl);
const fixtureBytes = await readFile(fixtureUrl);
const fixtureHash = createHash('sha1').update(fixtureBytes).digest('hex');
const sourcePages = (await PDFDocument.load(fixtureBytes)).getPages();
const alignmentFor = page => [{
  rect_x: 0, rect_y: 0, rect_w: 2479, rect_h: 3508,
  matrix: [page.getWidth() * 4 / 2479, 0, 0, 0, page.getHeight() * 4 / 3508, 0, 0, 0, 1]
}];

function reviewedDataset({ aligned = true } = {}) {
  const answers = Array(160).fill('A');
  answers[0] = 'C';
  answers[159] = 'D';
  return {
    pdfHash: fixtureHash,
    twoSided: true,
    hasMultiAnswer: false,
    multiAnswerQuestions: {},
    marking: { defaultMarks: 1, ranges: [], overrides: {} },
    answerKey: { 0: { C: true }, 159: { D: true } },
    examResults: [{
      page: 1,
      student_number: '87654322',
      surname: 'VERIFIED',
      initials: 'AB',
      answers,
      raw_answers: [{ scanned_value: 'A' }],
      diffs: [],
      canvasMatch: { userId: '204272', studentNumber: '87654322' },
      ...(aligned ? { homographies: alignmentFor(sourcePages[0]), homographies2: alignmentFor(sourcePages[1]) } : {})
    }]
  };
}

async function importDataset(page, dataset) {
  await page.getByLabel('Import results from results.json').setInputFiles({
    name: 'synthetic-reviewed-results.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(dataset))
  });
}

async function importOfficialResults(page, dataset) {
  const answers = [...dataset.examResults[0].answers];
  answers[0] = 'B';
  answers[159] = 'E';
  const rows = buildRawResultsCsvRows({
    pdfName: 'official-synthetic.pdf',
    examResults: [{ page: 1, student_number: '12345678', surname: 'MARKER', initials: 'ZYX', answers }]
  });
  await page.getByLabel('Import another scan for comparison').setInputFiles({
    name: 'official-raw_results.csv', mimeType: 'text/csv', buffer: Buffer.from(createCSV(rows))
  });
}

async function downloadDataset(page) {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download working dataset' }).click();
  return JSON.parse(await readFile(await (await downloading).path(), 'utf8'));
}

async function expectAllCrops(panel) {
  await expect(panel.locator('.comparison-difference')).toHaveCount(5);
  await expect.poll(() => panel.locator('.comparison-difference img').evaluateAll(images =>
    images.filter(image => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0).length
  )).toBe(5);
}

test('every comparison field gets a saved crop without recognition or changing reviewed results', async ({ page }) => {
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
  await page.locator('#pdf-upload').setInputFiles(fixturePath);
  await expect(page.locator('.pdf-card__preview img')).toBeVisible();
  const dataset = reviewedDataset();
  await importDataset(page, dataset);
  await importOfficialResults(page, dataset);

  const panel = page.getByRole('region', { name: 'Compare another scan' });
  await panel.getByRole('button', { name: 'Compare results', exact: true }).click();
  await expectAllCrops(panel);
  const expectedIds = ['1:studentNum', '1:surname', '1:initials', '1:answers:0', '1:answers:159'];
  for (const id of expectedIds) {
    await expect(panel.locator(`[data-difference="${id}"] img`)).toBeVisible();
  }
  await expect(panel.locator('[data-difference="1:answers:159"] img')).toHaveAttribute('alt', 'PDF page 2 — question 160');
  await panel.screenshot({ path: 'test-results/comparison-crops-preview.png' });

  await panel.locator('[data-difference="1:studentNum"]').getByRole('button', { name: 'Keep my result' }).click();
  const saved = await downloadDataset(page);
  expect(saved.examResults[0]).toEqual({ ...dataset.examResults[0], sourceId: saved.pdfSources[0].id });
  expect(Object.keys(saved.comparison.cropImages).sort()).toEqual([...expectedIds].sort());
  for (const crop of Object.values(saved.comparison.cropImages)) {
    expect(crop.src).toMatch(/^data:image\/jpeg;base64,/);
    expect(crop.approximate).toBe(false);
  }
  expect(saved.comparison.decisions['1:studentNum']).toEqual({ value: '87654322' });
  expect(await page.evaluate(() => window.__scannerWorkersStarted)).toBe(0);

  await page.reload();
  page.once('dialog', dialog => dialog.accept());
  await importDataset(page, saved);
  await panel.getByLabel('Show reviewed differences').check();
  await expectAllCrops(panel);
  await expect(panel.locator('[data-difference="1:studentNum"]')).toContainText('Reviewed · current value: 87654322');
  await expect(panel.getByText('Load the source PDF to show this image.')).toHaveCount(0);
  expect(await page.evaluate(() => window.__scannerWorkersStarted)).toBe(0);
});

test('older results without saved alignment still receive approximate crops on both sides', async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto('/');
  await page.locator('#pdf-upload').setInputFiles(fixturePath);
  await expect(page.locator('.pdf-card__preview img')).toBeVisible();
  const dataset = reviewedDataset({ aligned: false });
  await importDataset(page, dataset);
  await importOfficialResults(page, dataset);

  const panel = page.getByRole('region', { name: 'Compare another scan' });
  await panel.getByRole('button', { name: 'Compare results', exact: true }).click();
  await expectAllCrops(panel);
  const saved = await downloadDataset(page);
  expect(saved.examResults[0]).toEqual({ ...dataset.examResults[0], sourceId: saved.pdfSources[0].id });
  expect(Object.values(saved.comparison.cropImages)).toHaveLength(5);
  expect(Object.values(saved.comparison.cropImages).every(crop => crop.approximate)).toBe(true);
  await expect(panel.locator('[data-difference="1:answers:159"]')).toContainText('Approximate crop');
});

test('CSV import waits for configured fields and page mapping before comparing or preparing images', async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto('/');
  await page.locator('#pdf-upload').setInputFiles(fixturePath);
  await expect(page.locator('.pdf-card__preview img')).toBeVisible();
  await page.evaluate(() => {
    window.__comparisonCropConversions = 0;
    const original = OffscreenCanvas.prototype.convertToBlob;
    OffscreenCanvas.prototype.convertToBlob = function (options) {
      if (options?.type === 'image/jpeg') window.__comparisonCropConversions++;
      return original.call(this, options);
    };
  });
  const dataset = reviewedDataset();
  dataset.twoSided = false;
  dataset.examResults[0].page = 2;
  dataset.examResults[0].answers = dataset.examResults[0].answers.slice(0, 40);
  dataset.examResults[0].homographies = alignmentFor(sourcePages[1]);
  delete dataset.examResults[0].homographies2;
  await importDataset(page, dataset);
  await importOfficialResults(page, dataset);

  const panel = page.getByRole('region', { name: 'Compare another scan' });
  await expect(panel.getByText('official-raw_results.csv', { exact: true })).toBeVisible();
  await expect(panel.locator('.comparison-difference')).toHaveCount(0);
  expect(await page.evaluate(() => window.__comparisonCropConversions)).toBe(0);
  await panel.getByLabel('CSV page 1 corresponds to PDF page').fill('2');
  for (const name of ['Student numbers', 'Surnames', 'Initials']) await panel.getByLabel(name, { exact: true }).uncheck();
  await expect(panel.getByLabel('Answers', { exact: true })).toBeChecked();
  expect(await page.evaluate(() => window.__comparisonCropConversions)).toBe(0);

  await panel.getByRole('button', { name: 'Compare results', exact: true }).click();
  await expect(panel.locator('.comparison-difference')).toHaveCount(1);
  const difference = panel.locator('[data-difference="2:answers:0"]');
  await expect(difference.locator('img')).toBeVisible();
  await expect(difference).toContainText('PDF page 2 · Answer 1');
  expect(await page.evaluate(() => window.__comparisonCropConversions)).toBe(1);
});

test('explicit cancellation unlocks comparison settings and prevents late images reaching the next comparison', async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto('/');
  await page.locator('#pdf-upload').setInputFiles(fixturePath);
  await expect(page.locator('.pdf-card__preview img')).toBeVisible();
  const dataset = reviewedDataset();
  await importDataset(page, dataset);
  await importOfficialResults(page, dataset);
  const panel = page.getByRole('region', { name: 'Compare another scan' });
  await page.evaluate(() => {
    const original = OffscreenCanvas.prototype.convertToBlob;
    window.__heldComparisonCropStarted = false;
    let cropConversions = 0;
    OffscreenCanvas.prototype.convertToBlob = async function (options) {
      if (options?.type !== 'image/jpeg' || ++cropConversions !== 2) return original.call(this, options);
      const blob = await original.call(this, options);
      window.__heldComparisonCropStarted = true;
      return new Promise(resolve => { window.__releaseComparisonCrop = () => resolve(blob); });
    };
  });
  await panel.getByRole('button', { name: 'Compare results', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__heldComparisonCropStarted)).toBe(true);
  await expect(panel.getByLabel('Student numbers', { exact: true })).toBeDisabled();
  await expect(panel.getByLabel('CSV page 1 corresponds to PDF page')).toBeDisabled();
  await expect(panel.getByLabel('Import another scan for comparison')).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Compare results', exact: true })).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Remove comparison', exact: true })).toBeDisabled();
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(panel.getByText('Image preparation cancelled. Prepared images and your corrections have been kept.', { exact: true })).toBeVisible();
  await expect(panel.getByLabel('Student numbers', { exact: true })).toBeEnabled();
  await expect(panel.getByLabel('CSV page 1 corresponds to PDF page')).toBeEnabled();
  await expect(panel.getByRole('button', { name: 'Prepare remaining images', exact: true })).toBeVisible();
  const cancelled = await downloadDataset(page);
  expect(Object.keys(cancelled.comparison.cropImages)).toEqual(['1:studentNum']);
  expect(cancelled.examResults[0]).toEqual({ ...dataset.examResults[0], sourceId: cancelled.pdfSources[0].id });
  await panel.getByLabel('Student numbers', { exact: true }).uncheck();
  await expect(panel.locator('.comparison-difference')).toHaveCount(0);
  await expect(panel.getByText('Settings changed. Choose Compare results to update the differences.', { exact: true })).toBeVisible();
  for (const name of ['Surnames', 'Initials']) await panel.getByLabel(name, { exact: true }).uncheck();
  await panel.getByRole('button', { name: 'Compare results', exact: true }).click();
  await expect(panel.locator('.comparison-difference')).toHaveCount(2);
  await expect(panel.locator('.comparison-difference img')).toHaveCount(2);
  await page.evaluate(() => window.__releaseComparisonCrop());
  // A UI round trip lets a stale conversion finish, then the saved state proves it cannot write into the new comparison.
  const saved = await downloadDataset(page);
  expect(Object.keys(saved.comparison.cropImages).sort()).toEqual(['1:answers:0', '1:answers:159']);
  expect(saved.examResults[0]).toEqual({ ...dataset.examResults[0], sourceId: saved.pdfSources[0].id });
});

test('comparison crops and original-page previews use the correct batch after reattaching a PDF', async ({ page }) => {
  test.setTimeout(45_000);
  const createSource = async (id, color) => {
    const pdf = await PDFDocument.create();
    const sheet = pdf.addPage([595, 842]);
    sheet.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color });
    const buffer = Buffer.from(await pdf.save());
    const file = { name: `${id}.pdf`, mimeType: 'application/pdf', buffer };
    return { file, metadata: { id, name: file.name, hash: createHash('sha1').update(buffer).digest('hex'), numPages: 1 } };
  };
  const first = await createSource('first-batch', rgb(1, 0, 0));
  const second = await createSource('second-batch', rgb(0, 1, 0));
  const pdfSources = [first.metadata, second.metadata];
  const examResults = pdfSources.map(source => ({
    sourceId: source.id, page: 1, student_number: '12345678', surname: 'TEST', initials: 'AB', answers: ['A']
  }));
  const compareRows = buildRawResultsCsvRows({
    examResults: examResults.map((result, index) => ({ ...result, answers: [index === 0 ? 'B' : 'C'] })), pdfSources
  });
  const colorChannel = async (image, channel) => {
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((img, index) => {
      if (!img.complete || !img.naturalWidth) return false;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d');
      context.drawImage(img, 0, 0, 1, 1);
      const channels = context.getImageData(0, 0, 1, 1).data;
      return channels[index] > 220 && channels[1 - index] < 30;
    }, channel)).toBe(true);
  };

  await page.goto('/');
  const pdfInput = page.locator('#pdf-upload');
  await pdfInput.setInputFiles(first.file);
  await expect(page.locator('.pdf-card__preview img')).toBeVisible();
  await importDataset(page, { pdfSources, twoSided: false, answerKey: {}, examResults });
  const comparisonInput = page.getByLabel('Import another scan for comparison');
  await expect(comparisonInput).toBeEnabled();
  await comparisonInput.setInputFiles({
    name: 'official-raw_results.csv', mimeType: 'text/csv', buffer: Buffer.from(createCSV(compareRows))
  });
  const panel = page.getByRole('region', { name: 'Compare another scan' });
  await panel.getByRole('button', { name: 'Compare results', exact: true }).click();
  const firstDifference = panel.locator('[data-difference="first-batch:1:answers:0"]');
  const secondDifference = panel.locator('[data-difference="second-batch:1:answers:0"]');
  await colorChannel(firstDifference.locator('img'), 0);
  await expect(secondDifference.getByText('Load the source PDF to show this image.')).toBeVisible();
  await firstDifference.getByRole('button', { name: 'Keep my result' }).click();

  await pdfInput.setInputFiles(second.file);
  await expect(page.locator('.pdf-card__preview img')).toHaveAttribute('alt', /second-batch\.pdf/);
  await panel.getByRole('button', { name: 'Prepare remaining images' }).click();
  await expect(secondDifference).toContainText('PDF page 2 (second-batch.pdf, page 1)');
  await colorChannel(secondDifference.locator('img'), 1);
  await secondDifference.getByRole('button', { name: 'View PDF page' }).click();
  const viewer = page.getByRole('dialog');
  await expect(viewer.getByRole('heading')).toContainText('second-batch.pdf');
  await colorChannel(viewer.getByRole('img'), 1);
  await viewer.getByRole('button', { name: 'Close dialog' }).click();
  await secondDifference.getByRole('button', { name: 'Use imported result' }).click();

  const saved = await downloadDataset(page);
  expect(saved.examResults.map(result => [result.sourceId, result.answers[0]])).toEqual([
    ['first-batch', 'A'], ['second-batch', 'C']
  ]);
  expect(Object.keys(saved.comparison.cropImages)).toEqual(['first-batch:1:answers:0', 'second-batch:1:answers:0']);
  expect(Object.keys(saved.comparison.decisions)).toEqual(['first-batch:1:answers:0', 'second-batch:1:answers:0']);
});
