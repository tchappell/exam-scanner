import { calculateScore, normaliseAnswer } from '../examDomain.mjs';

const QUESTION_COUNT = 160;
const DEFAULT_UNIT_CODE = 'AAA000';

function isoDate(date) {
  return (date instanceof Date ? date : new Date(date)).toISOString().split('T')[0];
}

function exportSurname(surname) {
  return `${surname}            `.substring(0, 12).toUpperCase();
}

export function buildResultsCsvRows({
  examResults,
  answerKey,
  multiAnswerQuestions = {},
  pdfName,
  date = new Date(),
  unitCode = DEFAULT_UNIT_CODE
}) {
  const filename = pdfName ?? 'filename.pdf';

  return [
    ['Unit', 'Exam date', 'Student number', 'Surname', 'Initial', 'Score', 'Scanned file', 'Page in File'],
    ...examResults.map(result => [
      unitCode,
      isoDate(date),
      result.student_number,
      exportSurname(result.surname),
      result.initials.toUpperCase(),
      calculateScore(result.answers, answerKey, multiAnswerQuestions),
      filename,
      result.page
    ])
  ];
}

export function buildRawResultsCsvRows({
  examResults,
  pdfName,
  date = new Date(),
  unitCode = DEFAULT_UNIT_CODE
}) {
  const filename = pdfName ?? 'filename.pdf';

  return [
    [
      'Unit', 'Exam date', 'Student number', 'Surname', 'Initial',
      'Scanned file', 'Page in File',
      ...Array.from({ length: QUESTION_COUNT }, (_, question) => `Q${question + 1}`)
    ],
    ...examResults.map(result => [
      unitCode,
      isoDate(date),
      result.student_number,
      exportSurname(result.surname),
      result.initials.replaceAll(' ', '').toUpperCase(),
      filename,
      result.page,
      ...result.answers.map(answer => normaliseAnswer(answer).trimEnd()),
      ...Array(Math.max(0, QUESTION_COUNT - result.answers.length)).fill('')
    ])
  ];
}
