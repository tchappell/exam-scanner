import { normaliseAnswer } from '../examDomain.mjs';

const RAW_RESULTS_COLUMN_COUNT = 167;
const RAW_RESULTS_HEADINGS = [
  'Unit', 'Exam date', 'Student number', 'Surname', 'Initial', 'Scanned file', 'Page in File',
  ...Array.from({ length: 160 }, (_, index) => `Q${index + 1}`)
];
const text = value => `${value ?? ''}`;
const heading = value => text(value).replace(/^\uFEFF/, '').trim().toLowerCase();
const positiveInteger = value => /^\d+$/.test(text(value).trim())
  && Number.isSafeInteger(Number(value)) && Number(value) > 0;
const identityText = value => text(value).trim().toUpperCase();
const initialsText = value => identityText(value).replaceAll(/\s/g, '');
const studentNumberText = value => {
  const valueText = text(value).trim();
  return /^\d+$/.test(valueText) ? valueText.replace(/^0+(?=\d)/, '') : valueText;
};

function comparisonEntries(comparison) {
  if (comparison.results instanceof Map) return [...comparison.results];
  return Array.isArray(comparison.results) ? comparison.results : [];
}

export function buildComparisonFromRows(rows, { filename, scannerConfig, previousComparison = {} }) {
  if (rows[0]?.length !== RAW_RESULTS_COLUMN_COUNT) {
    return { error: `This is not a valid ACSPRI raw results file (must have ${RAW_RESULTS_COLUMN_COUNT} columns)` };
  }
  if (!RAW_RESULTS_HEADINGS.every((value, index) => heading(rows[0][index]) === heading(value))) {
    return { error: 'The CSV headings do not match the raw results format. Choose raw_results.csv, including Q1–Q160.' };
  }

  const results = new Map();
  const files = new Set();
  for (const [index, row] of rows.slice(1).entries()) {
    if (row.every(value => text(value).trim() === '')) continue;
    if (row.length !== RAW_RESULTS_COLUMN_COUNT) {
      return { error: `CSV row ${index + 2} must contain ${RAW_RESULTS_COLUMN_COUNT} columns.` };
    }
    const [, , studentNum, surname, initial, , pageInFile, ...q] = row;
    if (!positiveInteger(pageInFile)) {
      return { error: `CSV row ${index + 2} has an invalid Page in File. Page numbers must be positive whole numbers.` };
    }
    const page = Number(pageInFile);
    if (results.has(page)) {
      return { error: `The CSV contains more than one result for page ${page}. Choose results for one scanned PDF so each paper can be matched by page.` };
    }
    if (text(row[5]).trim()) files.add(text(row[5]).trim());
    results.set(page, { studentNum: text(studentNum), surname: text(surname), initial: text(initial), q: q.map(normaliseAnswer) });
  }
  if (results.size === 0) {
    return { error: 'The CSV does not contain any exam results.' };
  }
  if (files.size > 1) {
    return { error: 'The CSV contains results from more than one scanned file. Choose results for a single PDF before comparing by page.' };
  }

  return {
    results,
    filename,
    cfg_checkNumbers: previousComparison.cfg_checkNumbers ?? true,
    cfg_checkName: previousComparison.cfg_checkName ?? true,
    cfg_checkInitials: previousComparison.cfg_checkInitials ?? true,
    cfg_checkAnswers: previousComparison.cfg_checkAnswers ?? true,
    cfg_firstPage: previousComparison.cfg_firstPage
      ?? (Number(scannerConfig.startAt) || 1) + (scannerConfig.hasMarker ? (scannerConfig.twoSided ? 2 : 1) : 0)
  };
}

/** Compare a snapshot of reviewed values, pairing papers only by their PDF pages. */
export function buildComparisonReview(examResults, comparison, cfg = {}) {
  const diffs = [];
  const currentOnlyPages = [];
  const importedOnlyPages = [];
  const ambiguousPages = [];
  const invalidCurrentPages = [];
  const summary = { diffs, matchedCount: 0, currentOnlyPages, importedOnlyPages, ambiguousPages, invalidCurrentPages };
  if (!positiveInteger(comparison.cfg_firstPage)) {
    return { ...summary, error: 'Enter the PDF page corresponding to CSV page 1 as a positive whole number.' };
  }
  const offset = Number(comparison.cfg_firstPage) - 1;
  const importedByPage = new Map(comparisonEntries(comparison).map(([page, result]) => [Number(page) + offset, result]));
  const currentByPage = new Map();
  examResults.forEach((result, i) => {
    if (!positiveInteger(result.page)) {
      invalidCurrentPages.push(i);
      return;
    }
    const page = Number(result.page);
    const rows = currentByPage.get(page) ?? [];
    rows.push({ result, i });
    currentByPage.set(page, rows);
  });

  for (const [page, rows] of currentByPage) {
    if (rows.length > 1) {
      ambiguousPages.push(page);
      continue;
    }
    const expected = importedByPage.get(page);
    if (!expected) {
      currentOnlyPages.push(page);
      continue;
    }
    summary.matchedCount++;
    const { result, i } = rows[0];
    const add = (field, type, original, current, normalise, idx) => {
      if (normalise(original) === normalise(current)) return;
      const storedDiff = (result.diffs ?? []).find(diff => diff.field === field && (idx === undefined || diff.idx === idx));
      const img = storedDiff?.img ?? (idx === undefined ? undefined : result.raw_answers?.[idx]?.questionableImg);
      diffs.push({
        id: `${page}:${field}${idx === undefined ? '' : `:${idx}`}`,
        i,
        page,
        field,
        type,
        ...(idx === undefined ? {} : { idx }),
        origValue: text(original),
        scannedValue: text(current),
        ...(img ? { img } : {})
      });
    };
    if (comparison.cfg_checkNumbers) add('studentNum', 'SN', expected.studentNum, result.student_number, studentNumberText);
    if (comparison.cfg_checkName) add('surname', 'Name', expected.surname, result.surname, identityText);
    if (comparison.cfg_checkInitials) add('initials', 'Initial', expected.initial, result.initials, initialsText);
    if (comparison.cfg_checkAnswers) {
      const count = cfg.twoSided ? 160 : 40;
      for (let idx = 0; idx < count; idx++) {
        add('answers', 'Answer', normaliseAnswer(expected.q?.[idx]), normaliseAnswer(result.answers?.[idx]), normaliseAnswer, idx);
      }
    }
  }
  for (const page of importedByPage.keys()) {
    if (!currentByPage.has(page)) importedOnlyPages.push(page);
  }
  for (const pages of [currentOnlyPages, importedOnlyPages, ambiguousPages]) pages.sort((left, right) => left - right);
  return summary;
}

/** Maps need an explicit JSON representation when saving a working dataset. */
export function serializeComparison(comparison = {}) {
  if (!('results' in comparison)) return { ...comparison };
  return { ...comparison, results: comparisonEntries(comparison) };
}

export function restoreComparison(comparison = {}) {
  if (!('results' in comparison)) return { ...comparison };
  return { ...comparison, results: new Map(comparisonEntries(comparison)) };
}
