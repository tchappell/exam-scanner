import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { PDFDocument, rgb } from 'pdf-lib';

async function twoSidedSource() {
  const width = 595;
  const height = 842;
  const pdf = await PDFDocument.create();
  for (const color of [rgb(1, 0, 0), rgb(0, 1, 0)]) {
    pdf.addPage([width, height]).drawRectangle({ x: 0, y: 0, width, height, color });
  }
  const buffer = Buffer.from(await pdf.save());
  return {
    file: { name: 'questionable-two-sided.pdf', mimeType: 'application/pdf', buffer },
    hash: createHash('sha1').update(buffer).digest('hex'),
    alignment: [{
      rect_x: 0, rect_y: 0, rect_w: 2479, rect_h: 3508,
      matrix: [width * 4 / 2479, 0, 0, 0, height * 4 / 3508, 0, 0, 0, 1]
    }]
  };
}

async function importDataset(page, dataset) {
  await page.getByLabel('Import results from results.json').setInputFiles({
    name: 'results.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(dataset))
  });
}

async function downloadDataset(page) {
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download working dataset' }).click();
  return JSON.parse(await readFile(await (await downloadEvent).path(), 'utf8'));
}

async function expectCropColor(image, channel) {
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
}

test('resuming saved work restores questionable marks, review decisions and the crops for both sides', async ({ page }) => {
  test.setTimeout(45_000);
  const source = await twoSidedSource();
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
  const legacyCrop = await page.evaluate(() => document.createElement('canvas').toDataURL('image/png'));
  const rawAnswers = Array.from({ length: 41 }, () => ({ scanned_value: 'A' }));
  rawAnswers[0].questionableImg = legacyCrop;
  rawAnswers[40].questionableImg = legacyCrop;
  await importDataset(page, {
    pdfHash: source.hash,
    twoSided: true,
    examResults: [{
      page: 1, student_number: '12345678', surname: 'SYNTHETIC', initials: 'AB',
      answers: Array(160).fill('A'), raw_answers: rawAnswers,
      homographies: source.alignment, homographies2: source.alignment
    }]
  });

  const questionable = page.getByTestId('questionable-result');
  const first = questionable.and(page.locator('[data-question="1"]'));
  const reverse = questionable.and(page.locator('[data-question="41"]'));
  const showResolved = page.getByLabel('Show resolved items');
  const corrected = page.getByTestId('exam-result').getByLabel('Question 1 response', { exact: true });
  const pdfInput = page.locator('#pdf-upload');
  await expect(questionable).toHaveCount(2);
  await expect(reverse.locator('img')).toHaveAttribute('src', legacyCrop);
  await first.getByRole('button', { name: 'B', exact: true }).click();
  await expect(corrected).toHaveValue('B');
  await showResolved.uncheck();
  await expect(first).toHaveCount(0);
  await expect(reverse).toBeVisible();

  await pdfInput.setInputFiles(source.file);
  await expect(page.locator('.pdf-card__preview img')).toBeVisible();
  const saved = await downloadDataset(page);
  const [paper] = saved.examResults;
  expect(paper.answers[0]).toBe('B');
  expect(paper.raw_answers[0]).toMatchObject({ questionable: true, reviewed: true, scanned_value: 'A' });
  expect(paper.raw_answers[40]).toMatchObject({ questionable: true, scanned_value: 'A' });
  expect(paper.raw_answers[40].reviewed).not.toBe(true);
  expect(paper.raw_answers[0]).not.toHaveProperty('questionableImg');
  expect(paper.raw_answers[40]).not.toHaveProperty('questionableImg');
  expect(await page.evaluate(() => window.__scannerWorkersStarted)).toBe(0);

  await page.reload();
  await importDataset(page, saved);
  await expect(corrected).toHaveValue('B');
  await showResolved.uncheck();
  await expect(first).toHaveCount(0);
  await expect(reverse).toBeVisible();
  await expect(reverse.locator('img')).toHaveCount(0);
  await expect(reverse).toContainText(/load .*pdf/i);

  await showResolved.check();
  await pdfInput.setInputFiles(source.file);
  await expectCropColor(first.locator('img'), 0);
  await expectCropColor(reverse.locator('img'), 1);
  await expect(corrected).toHaveValue('B');
  expect(await page.evaluate(() => window.__scannerWorkersStarted)).toBe(0);
});
