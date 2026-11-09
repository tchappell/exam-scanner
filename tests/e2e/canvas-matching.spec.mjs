import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const pdfFixture = fileURLToPath(new URL('../fixtures/mcq_2sided.pdf', import.meta.url));
const students = [
  ['Synthetic, One', '900001', '', '', '11111111', 'Test section', ''],
  ['Synthetic, Two', '900002', '', '', '22222222', 'Test section', '']
];

function dataset(papers) {
  return {
    pdfHash: null,
    twoSided: false,
    hasMultiAnswer: false,
    multiAnswerQuestions: {},
    marking: { defaultMarks: 1, ranges: [], overrides: {} },
    answerKey: { 0: { A: true } },
    examResults: papers.map((paper, index) => ({
      page: index + 1,
      student_number: '',
      surname: 'SYNTHETIC',
      initials: index === 0 ? 'O' : 'T',
      answers: [index === 0 ? 'A' : 'B'],
      diffs: [],
      ...paper
    }))
  };
}

async function importDataset(page, contents) {
  await page.getByLabel('Import results from results.json').setInputFiles({
    name: 'synthetic-results.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(contents))
  });
}

async function importRoster(page, rows = students) {
  const headings = [
    'Student,ID,SIS User ID,SIS Login ID,Integration ID,Section,Exam (42)',
    ',,,,,,Manual Posting',
    '    Points Possible,,,,,,1'
  ];
  const csvRows = rows.map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(','));
  await page.getByLabel('Submit Canvas Gradebook CSV').setInputFiles({
    name: 'synthetic-gradebook.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from([...headings, ...csvRows].join('\n'))
  });
}

async function downloadDataset(page) {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download working dataset' }).click();
  const download = await downloading;
  return JSON.parse(await readFile(await download.path(), 'utf8'));
}

async function expectMatchedCount(page, count) {
  const matched = page.locator('.canvas-transfer .canvas-summary > div').filter({ hasText: 'matched exams' }).first();
  await expect(matched.locator('strong')).toHaveText(`${count}`);
}

test('duplicate papers can be inspected and either one paired without rewriting their numbers', async ({ page }) => {
  await page.goto('/');
  await page.locator('#pdf-upload').setInputFiles(pdfFixture);
  await expect(page.getByRole('button', { name: 'Remove PDF', exact: true })).toBeVisible();
  await importDataset(page, dataset([
    { student_number: '11111111' },
    { student_number: '11111111' }
  ]));
  await importRoster(page);

  const group = page.getByRole('region', { name: 'Duplicate student number 11111111' });
  await expect(group).toBeVisible();
  await expect(group.locator('.canvas-match-paper')).toHaveCount(2);
  await expectMatchedCount(page, 0);
  await group.screenshot({ path: 'test-results/canvas-matching-preview.png' });

  const secondPaper = group.locator('[data-exam-index="1"]');
  await secondPaper.getByRole('button', { name: 'View paper', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'PDF page 2 — student details' });
  await expect(preview.locator('img')).toBeVisible();
  await expect(preview.locator('img')).toHaveJSProperty('complete', true);
  await preview.getByRole('button', { name: '+', exact: true }).click();
  await expect(preview.getByText('125%', { exact: true })).toBeVisible();
  await preview.screenshot({ path: 'test-results/canvas-matching-paper-preview.png' });
  await preview.getByRole('button', { name: 'Close dialog' }).click();

  await secondPaper.getByRole('button', { name: 'Match this paper to Synthetic, One', exact: true }).click();
  await expect(secondPaper.getByText('Matched to Synthetic, One', { exact: true })).toBeVisible();
  await expectMatchedCount(page, 1);
  let saved = await downloadDataset(page);
  expect(saved.examResults.map(result => result.student_number)).toEqual(['11111111', '11111111']);
  expect(saved.examResults[1].canvasMatch).toEqual({ userId: '900001', studentNumber: '11111111' });

  const firstPaper = group.locator('[data-exam-index="0"]');
  await firstPaper.getByRole('button', { name: 'Match this paper to Synthetic, One', exact: true }).click();
  await expect(firstPaper.getByText('Matched to Synthetic, One', { exact: true })).toBeVisible();
  await expect(secondPaper.locator('.canvas-match-paper__status')).toHaveCount(0);
  await expectMatchedCount(page, 1);
  saved = await downloadDataset(page);
  expect(saved.examResults[0].canvasMatch).toEqual({ userId: '900001', studentNumber: '11111111' });
  expect(saved.examResults[1].canvasMatch ?? null).toBeNull();
  expect(saved.examResults.map(result => result.student_number)).toEqual(['11111111', '11111111']);

  await secondPaper.getByText('Correct recorded student number', { exact: true }).click();
  await secondPaper.getByLabel('Student number on PDF page 2').fill('22222222');
  await secondPaper.getByRole('button', { name: 'Save number', exact: true }).click();
  await expect(group).toHaveCount(0);
  await expectMatchedCount(page, 2);
  saved = await downloadDataset(page);
  expect(saved.examResults.map(result => result.student_number)).toEqual(['11111111', '22222222']);
});

test('manual paper pairing survives saved-work export and a reordered Canvas roster', async ({ page }) => {
  await page.goto('/');
  await importDataset(page, dataset([{ student_number: '11111119' }]));
  await importRoster(page, [students[0]]);

  const transfer = page.locator('.canvas-transfer');
  await transfer.locator('[data-exam-index="0"] .canvas-match-card').click();
  await transfer.getByRole('button', { name: 'Canvas student Synthetic, One 11111111', exact: true }).click();
  await expectMatchedCount(page, 1);

  const saved = await downloadDataset(page);
  expect(saved.examResults[0].student_number).toBe('11111119');
  expect(saved.examResults[0].canvasMatch).toEqual({ userId: '900001', studentNumber: '11111119' });

  await page.reload();
  await importDataset(page, saved);
  await importRoster(page, [students[1], students[0]]);
  await expectMatchedCount(page, 1);
  await transfer.getByText('Review manual pairings', { exact: true }).click();
  const paired = transfer.locator('.canvas-manual-pairings [data-exam-index="0"]');
  await expect(paired.getByText('Matched to Synthetic, One', { exact: true })).toBeVisible();
  await expect(paired.locator('.canvas-match-card__number')).toHaveText('11111119');

  await paired.getByRole('button', { name: 'Undo pairing', exact: true }).click();
  await expectMatchedCount(page, 0);
  const undone = await downloadDataset(page);
  expect(undone.examResults[0].canvasMatch ?? null).toBeNull();
  expect(undone.examResults[0].student_number).toBe('11111119');
});
