import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { PDFDocument, rgb } from 'pdf-lib';

async function examPdf(pageCount) {
  const pdf = await PDFDocument.create();
  const width = 200;
  const height = 280;
  for (let page = 1; page <= pageCount; page++) {
    // Give each physical page a distinct shade so the mock can identify rendered pages.
    pdf.addPage([width, height]).drawRectangle({ x: 0, y: 0, width, height, color: rgb(page / 10, 0, 0) });
  }
  return { name: 'synthetic-batch.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) };
}

async function mockScanner(page) {
  await page.addInitScript(() => {
    const RealWorker = window.Worker;
    const mock = { calls: [], failPage: null, holdPage: null, release: null };
    window.mockScanner = mock;
    window.Worker = class extends RealWorker {
      constructor(url, options) {
        if (!String(url).includes('scannerWorker')) {
          super(url, options);
          return;
        }
        return {
          postMessage({ id, cmd, page: side, bmp }) {
            const respond = data => this.onmessage({ data: { id, ...data } });
            if (cmd === 'initialize') {
              queueMicrotask(() => respond({}));
              return;
            }
            const canvas = new OffscreenCanvas(1, 1);
            const context = canvas.getContext('2d');
            context.drawImage(bmp, 0, 0, 1, 1);
            bmp.close();
            const physicalPage = Math.round(context.getImageData(0, 0, 1, 1).data[0] * 10 / 255);
            mock.calls.push([physicalPage, side]);
            const finish = () => {
              if (physicalPage === mock.failPage) {
                respond({ error: 'Synthetic reverse-side alignment failure' });
              } else if (side === 0) {
                respond({ answer_values: ['A'], student_number: `1000000${physicalPage}`, surname: 'SYNTHETIC', initials: 'AB' });
              } else {
                respond({ answer_values2: ['C'] });
              }
            };
            if (physicalPage === mock.holdPage) mock.release = finish;
            else queueMicrotask(finish);
          }
        };
      }
    };
  });
}

function saveButton(page) {
  return page.getByRole('button', { name: 'Download working dataset' });
}

async function saveDataset(page) {
  const download = page.waitForEvent('download');
  await saveButton(page).click();
  return readFile(await (await download).path());
}

async function restoreDataset(page, buffer) {
  await page.getByLabel('Import results from results.json').setInputFiles({
    name: 'results.json', mimeType: 'application/json', buffer
  });
}

test('a reopened batch scans failed and unfinished papers while retaining corrections and the marker key', async ({ page }) => {
  test.setTimeout(45_000);
  const file = await examPdf(8);
  await mockScanner(page);
  await page.goto('/');
  await page.evaluate(() => Object.assign(window.mockScanner, { failPage: 6, holdPage: 7 }));

  const pdfInput = page.locator('#pdf-upload');
  await pdfInput.setInputFiles(file);
  await page.getByLabel('Two-sided?').check();
  await page.getByLabel('Has marker sheet?').check();
  await page.getByRole('button', { name: 'Scan Exams', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.mockScanner.release))).toBe(true);
  const stop = page.getByRole('button', { name: 'Stop scanning', exact: true });
  await stop.click();
  await page.evaluate(() => window.mockScanner.release());
  await expect(stop).toHaveCount(0);
  expect(await page.evaluate(() => window.mockScanner.calls)).toEqual([
    [1, 0], [2, 1], [3, 0], [4, 1], [5, 0], [6, 1], [7, 0]
  ]);

  const papers = page.getByTestId('exam-result');
  await expect(papers).toHaveCount(1);
  const first = papers.and(page.locator('[data-page="3"]'));
  const firstNumber = first.locator('[data-field="student-number"]');
  const firstAnswer = first.getByLabel('Question 1 response', { exact: true });
  await expect(firstNumber).toHaveValue('10000003');
  await firstNumber.fill('55551234');
  await firstNumber.press('Tab');
  await firstAnswer.selectOption('B');

  const markerA = page.locator('#ak_1_A');
  const markerE = page.locator('#ak_1_E');
  await expect(markerA).toBeChecked();
  await page.locator('label[for="ak_1_A"]').click();
  await page.locator('label[for="ak_1_E"]').click();
  await expect(markerE).toBeChecked();
  const saved = await saveDataset(page);

  await page.reload();
  await restoreDataset(page, saved);
  await expect(firstNumber).toHaveValue('55551234');
  await expect(firstAnswer).toHaveValue('B');
  await expect(markerE).toBeChecked();
  const recovery = page.locator('.scan-action-panel');
  await expect(recovery).toContainText('1 paper not yet scanned');
  await expect(recovery).toContainText('1 paper failed');
  await expect(recovery).toContainText('Paper starting on page 5, PDF page 6 — Synthetic reverse-side alignment failure');
  const scanMissing = page.getByRole('button', { name: 'Scan missing papers', exact: true });
  await expect(scanMissing).toBeDisabled();
  await pdfInput.setInputFiles(file);
  await scanMissing.click();
  await expect(papers).toHaveCount(3);
  await expect(stop).toHaveCount(0);
  expect(await page.evaluate(() => window.mockScanner.calls)).toEqual([[5, 0], [6, 1], [7, 0], [8, 1]]);
  expect((await papers.evaluateAll(rows => rows.map(row => Number(row.dataset.page)))).sort((a, b) => a - b)).toEqual([3, 5, 7]);
  await expect(firstNumber).toHaveValue('55551234');
  await expect(firstAnswer).toHaveValue('B');
  await expect(markerE).toBeChecked();
  await expect(markerA).not.toBeChecked();
});

test('setup-only datasets restore the key, batch settings and TAS draft, with imports below scanning', async ({ page }) => {
  test.setTimeout(45_000);
  const file = await examPdf(6);
  await page.goto('/');
  for (const label of ['Import results from raw_results.csv', 'Import results from results.json']) {
    const input = page.getByLabel(label);
    await expect(input).toBeVisible();
    expect(await input.evaluate(element => {
      const scan = document.querySelector('.scan-action-panel');
      const results = document.querySelector('#results');
      return Boolean(scan.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)
        && Boolean(element.compareDocumentPosition(results) & Node.DOCUMENT_POSITION_FOLLOWING)
        && !scan.contains(element);
    })).toBe(true);
  }

  await page.locator('label[for="ak_1_D"]').click();
  const marks = page.getByLabel('Default per keyed question');
  await marks.fill('2.5');
  await expect(saveButton(page)).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Download grade summary' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Download detailed responses' })).toBeDisabled();

  const pdfInput = page.locator('#pdf-upload');
  await pdfInput.setInputFiles(file);
  await page.getByLabel('Two-sided?').check();
  await page.getByLabel('Has marker sheet?').check();
  await page.getByLabel('Start page', { exact: true }).fill('2');
  await page.getByLabel('End page', { exact: true }).fill('5');

  const openTas = page.getByRole('button', { name: 'Create TAS request PDF...' });
  const dialog = page.getByRole('dialog', { name: 'Create TAS request PDF' });
  await openTas.click();
  const draftFields = {
    unitCode: 'EXAM123', examType: 'Final', year: '2026', semester: 'Semester 2',
    description: 'Synthetic exam', questionCount: '22', studentCount: '44', comments: 'Synthetic draft notes'
  };
  for (const [field, value] of Object.entries(draftFields)) await dialog.locator(`#${field}`).fill(value);
  await dialog.locator('#name').fill('Unremembered marker');
  await dialog.locator('#appendScans').check();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();

  const saved = await saveDataset(page);
  const dataset = JSON.parse(saved);
  expect(dataset.examResults).toEqual([]);
  expect(dataset.tasDraft).toMatchObject({ ...draftFields, appendScans: true });
  expect(dataset.tasDraft).not.toHaveProperty('name');

  await page.reload();
  await restoreDataset(page, saved);
  await expect(page.locator('#ak_1_D')).toBeChecked();
  await expect(marks).toHaveValue('2.5');
  await expect(page.getByLabel('Two-sided?')).toBeChecked();
  await expect(page.getByTestId('exam-result')).toHaveCount(0);
  await expect(dialog).toBeHidden();

  await pdfInput.setInputFiles(file);
  await expect(page.getByLabel('Has marker sheet?')).toBeChecked();
  await expect(page.getByLabel('Start page', { exact: true })).toHaveValue('2');
  await expect(page.getByLabel('End page', { exact: true })).toHaveValue('5');
  await openTas.click();
  for (const [field, value] of Object.entries(draftFields)) await expect(dialog.locator(`#${field}`)).toHaveValue(value);
  await expect(dialog.locator('#appendScans')).toBeChecked();
  await expect(dialog.locator('#name')).toHaveValue('');
});
