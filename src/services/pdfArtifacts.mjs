import { ANSWER_OPTIONS, isAnswerCorrect, normaliseAnswer } from '../examDomain.mjs';

const FORM_HEIGHT = 841;
const ANSWER_SCALE = 16.667834;
const SCAN_SCALE = 4;
const X_STARTS = [768, 3134, 5497, 7859];
const Y_STARTS = [9449, 1225, 5361, 9496];
const X_STEP = 377;
const Y_STEP = 378.555555;

export function configuredQuestionCount(answerKey) {
  const keyedQuestions = Object.entries(answerKey ?? {})
    .filter(([, answers]) => Object.values(answers).some(Boolean))
    .map(([question]) => Number(question));
  return keyedQuestions.length === 0 ? 0 : Math.max(...keyedQuestions) + 1;
}

export function scannedStudentCount(config) {
  const pageCount = Math.max(0, Number(config.endAt) - Number(config.startAt) + 1);
  const pagesPerExam = config.twoSided ? 2 : 1;
  return Math.max(0, Math.floor(pageCount / pagesPerExam) - (config.hasMarker ? 1 : 0));
}

export function appendedScanPageIndices(config) {
  let first = Number(config.startAt) - 1;
  const last = Number(config.endAt) - 1;
  if (config.hasMarker) first += config.twoSided ? 2 : 1;
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => first + index);
}

function answerPosition(question, option) {
  if (question < 40) {
    return {
      page: 2,
      y: Y_STARTS[0] + Y_STEP * (question % 10),
      x: X_STARTS[Math.floor(question / 10)] + X_STEP * option
    };
  }

  const row = (question - 40) % 30;
  const column = Math.floor((question - 40) / 30);
  return {
    page: 3,
    y: Y_STARTS[Math.floor(row / 10) + 1] + Y_STEP * (row % 10),
    x: X_STARTS[column] + X_STEP * option
  };
}

export async function createAnswerSheetRequestPdf({ config, details, templateBytes, appendedPdfBytes = null }) {
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  const pdfDocument = await PDFDocument.load(templateBytes);
  const form = pdfDocument.getForm();
  const font = await pdfDocument.embedFont(StandardFonts.Helvetica);
  const pages = pdfDocument.getPages();
  const firstPage = pages[0];
  const text = { size: 12, font, color: rgb(0, 0, 0) };

  const positionedFields = [
    ['name', 90, 236, 330],
    ['email', 120, 256, 420],
    ['facultySchool', 140, 277, 400],
    ['workPh', 444, 236, 125],
    ['mobilePh', 452, 256, 117],
    ['unitCode', 110, 341, 125],
    ['examType', 234, 341, 85],
    ['year', 362, 341, 75],
    ['semester', 468, 341, 105],
    ['description', 118, 362, 440],
    ['questionCount', 241, 404, 170],
    ['studentCount', 493, 404, 75]
  ];
  for (const [field, x, y, maxWidth] of positionedFields) {
    const value = `${details[field] ?? ''}`;
    const naturalWidth = font.widthOfTextAtSize(value, text.size);
    const size = naturalWidth > maxWidth ? Math.max(8, text.size * maxWidth / naturalWidth) : text.size;
    firstPage.drawText(value, { x, y: FORM_HEIGHT - y, ...text, size });
  }

  const commentsField = form.getTextField('comments');
  commentsField.setFontSize(text.size);
  commentsField.setText(details.comments ?? '');
  commentsField.defaultUpdateAppearances(font);
  for (const fieldName of ['test_answer_included', 'master_answer_included', 'acknowledgement']) {
    const checkBox = form.getCheckBox(fieldName);
    checkBox.check();
    checkBox.defaultUpdateAppearances();
  }

  const { height } = pages[2].getSize();
  for (let question = 0; question < 160; question++) {
    for (let option = 0; option < ANSWER_OPTIONS.length; option++) {
      if (!config.answerKey?.[question]?.[ANSWER_OPTIONS[option]]) continue;
      const position = answerPosition(question, option);
      pages[position.page].drawCircle({
        x: position.x / ANSWER_SCALE,
        y: height - position.y / ANSWER_SCALE,
        size: 88 / ANSWER_SCALE,
        color: text.color
      });
    }
  }

  if (appendedPdfBytes) {
    const appendedDocument = await PDFDocument.load(appendedPdfBytes);
    const copiedPages = await pdfDocument.copyPages(appendedDocument, appendedScanPageIndices(config));
    for (const copiedPage of copiedPages) pdfDocument.addPage(copiedPage);
  }

  if (!config.twoSided) {
    pdfDocument.removePage(3);
    pdfDocument.removePage(1);
  }

  return new Blob([await pdfDocument.save()], { type: 'application/pdf' });
}

function transformPoint([x, y], matrix) {
  const xPrime = matrix[0] * x + matrix[1] * y + matrix[2];
  const yPrime = matrix[3] * x + matrix[4] * y + matrix[5];
  const wPrime = matrix[6] * x + matrix[7] * y + matrix[8];
  return wPrime === 0 ? null : [xPrime / wPrime, yPrime / wPrime];
}

function mapScanPoint(x, y, height, homographies) {
  for (const homography of homographies ?? []) {
    const inside = x >= homography.rect_x && y >= homography.rect_y
      && x < homography.rect_x + homography.rect_w
      && y < homography.rect_y + homography.rect_h;
    if (!inside) continue;
    const point = transformPoint([x - homography.rect_x, y - homography.rect_y], homography.matrix);
    return point ? [point[0] / SCAN_SCALE, height - point[1] / SCAN_SCALE] : null;
  }
  return null;
}

function scannedAnswerPosition(question) {
  if (question < 40) {
    return {
      page: 0,
      column: Math.floor(question / 10),
      y: Y_STARTS[0] + Y_STEP * (question % 10)
    };
  }
  const row = (question - 40) % 30;
  return {
    page: 1,
    column: Math.floor((question - 40) / 30),
    y: Y_STARTS[Math.floor(row / 10) + 1] + Y_STEP * (row % 10)
  };
}

export async function createAnnotatedExamPdf(config, result, sourcePdf) {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const outputDocument = await PDFDocument.create();
  const sourceDocument = sourcePdf instanceof PDFDocument
    ? sourcePdf
    : await PDFDocument.load(await sourcePdf.getData());
  const pageIndices = [result.page - 1, ...(config.twoSided ? [result.page] : [])];
  const pages = [];
  for (const copiedPage of await outputDocument.copyPages(sourceDocument, pageIndices)) {
    pages.push(outputDocument.addPage(copiedPage));
  }

  const squareColor = rgb(0.5, 0.5, 0.5);
  const correctColor = rgb(0, 0.5, 0);
  const incorrectColor = rgb(0.75, 0, 0);
  const { height } = pages[0].getSize();
  const optionIndex = { A: 0, B: 1, C: 2, D: 3, E: 4 };
  const multiAnswerQuestions = config.hasMultiAnswer ? (config.multiAnswerQuestions ?? {}) : {};

  const answerPoint = (question, option) => {
    const position = scannedAnswerPosition(question);
    const x = X_STARTS[position.column] + X_STEP * optionIndex[option];
    const homographies = position.page === 0 ? result.homographies : result.homographies2;
    const point = mapScanPoint(x / SCAN_SCALE, position.y / SCAN_SCALE, height, homographies);
    if (!point) throw new Error(`Could not map question ${question + 1}, option ${option}, onto the scanned exam.`);
    return point;
  };

  const drawCheck = (page, point) => {
    page.drawLine({
      start: { x: point[0] - 5, y: point[1] },
      end: { x: point[0] - 1, y: point[1] - 5 },
      thickness: 2.5,
      color: correctColor
    });
    page.drawLine({
      start: { x: point[0] - 1, y: point[1] - 5 },
      end: { x: point[0] + 8, y: point[1] + 7 },
      thickness: 2.5,
      color: correctColor
    });
  };

  const drawCross = (page, point) => {
    page.drawLine({
      start: { x: point[0] - 6, y: point[1] - 6 },
      end: { x: point[0] + 6, y: point[1] + 6 },
      thickness: 2.5,
      color: incorrectColor
    });
    page.drawLine({
      start: { x: point[0] - 6, y: point[1] + 6 },
      end: { x: point[0] + 6, y: point[1] - 6 },
      thickness: 2.5,
      color: incorrectColor
    });
  };

  const questionCount = config.twoSided ? 160 : 40;
  for (let question = 0; question < questionCount; question++) {
    const answer = normaliseAnswer(result.answers[question]);
    const selectedOptions = answer.trim().split('');
    const position = scannedAnswerPosition(question);
    const correct = isAnswerCorrect(answer, config.answerKey?.[question], Boolean(multiAnswerQuestions[question]));

    for (const option of selectedOptions) {
      const point = answerPoint(question, option);
      pages[position.page].drawSquare({
        x: point[0] - 10,
        y: point[1] - 10,
        size: 20,
        borderColor: squareColor,
        borderWidth: 1
      });
      if (correct) drawCheck(pages[position.page], point);
      else drawCross(pages[position.page], point);
    }

    if (!correct && selectedOptions.length > 0) {
      const missingAnswers = Object.keys(config.answerKey?.[question] ?? {})
        .filter(option => config.answerKey[question][option] && !selectedOptions.includes(option));
      for (const option of missingAnswers) {
        drawCheck(pages[position.page], answerPoint(question, option));
      }
    }
  }

  return new Blob([await outputDocument.save()], { type: 'application/pdf' });
}
