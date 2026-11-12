import { normaliseAnswer } from '../examDomain.mjs';
import { appendedScanPageIndices } from './pdfArtifacts.mjs';

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

const fileKey = value => text(value).trim().replaceAll('\\', '/').toLowerCase();
const baseFileKey = value => fileKey(value).split('/').at(-1);
const UNLINKED_SOURCE = '@unlinked';
export const COMBINED_COMPARISON_SOURCE = '@combined';
const resultSourceId = result => result.sourceId ?? (fileKey(result.pdfName) ? `@file:${fileKey(result.pdfName)}` : UNLINKED_SOURCE);

export function comparisonPdfSources(examResults, pdfSources = []) {
  const sources = new Map(pdfSources.map(source => [source.id, source]));
  for (const result of examResults) {
    const id = resultSourceId(result);
    if (!sources.has(id)) sources.set(id, { id, name: result.pdfName });
  }
  if (sources.size === 0) sources.set(UNLINKED_SOURCE, { id: UNLINKED_SOURCE });
  return [...sources.values()];
}

export function canCompareCombinedPdf(pdfSources) {
  return pdfSources.length > 1 && pdfSources.every(source => positiveInteger(source.numPages));
}

function matchingSources(filename, sources) {
  const key = fileKey(filename);
  if (!key) return [];
  const exact = sources.filter(source => fileKey(source.name) === key);
  if (exact.length) return exact;
  const basename = baseFileKey(key);
  return sources.filter(source => baseFileKey(source.name) === basename);
}

export function comparisonSourceId(comparison, sources) {
  const configured = comparison.cfg_sourceId;
  if (sources.some(source => source.id === configured)
    || (configured === COMBINED_COMPARISON_SOURCE && sources.length > 1)) return configured;
  if (sources.length === 1) return sources[0].id;
  const matches = matchingSources(comparison.scannedFiles?.[0], sources);
  return matches.length === 1 ? matches[0].id : '';
}

export function buildComparisonFromRows(rows, { filename, scannerConfig, previousComparison = {} }) {
  if (rows[0]?.length !== RAW_RESULTS_COLUMN_COUNT) {
    return { error: `This is not a valid ACSPRI raw results file (must have ${RAW_RESULTS_COLUMN_COUNT} columns)` };
  }
  if (!RAW_RESULTS_HEADINGS.every((value, index) => heading(rows[0][index]) === heading(value))) {
    return { error: 'The CSV headings do not match the raw results format. Choose raw_results.csv, including Q1–Q160.' };
  }

  const groups = new Map();
  for (const [index, row] of rows.slice(1).entries()) {
    if (row.every(value => text(value).trim() === '')) continue;
    if (row.length !== RAW_RESULTS_COLUMN_COUNT) {
      return { error: `CSV row ${index + 2} must contain ${RAW_RESULTS_COLUMN_COUNT} columns.` };
    }
    const [, , studentNum, surname, initial, scannedFile, pageInFile, ...q] = row;
    if (!positiveInteger(pageInFile)) {
      return { error: `CSV row ${index + 2} has an invalid Page in File. Page numbers must be positive whole numbers.` };
    }
    const page = Number(pageInFile);
    const key = fileKey(scannedFile);
    if (!groups.has(key)) groups.set(key, { name: text(scannedFile).trim(), rows: new Map() });
    const group = groups.get(key);
    if (group.rows.has(page)) {
      return { error: `The CSV contains more than one result for page ${page}${group.name ? ` of ${group.name}` : ''}.` };
    }
    group.rows.set(page, { studentNum: text(studentNum), surname: text(surname), initial: text(initial), q: q.map(normaliseAnswer) });
  }
  if (groups.size === 0) {
    return { error: 'The CSV does not contain any exam results.' };
  }
  const unnamed = groups.get('');
  if (unnamed && groups.size > 1) {
    if (groups.size > 2) return { error: 'Every row in a multi-file CSV must identify its Scanned file.' };
    groups.delete('');
    const named = groups.values().next().value;
    for (const [page, result] of unnamed.rows) {
      if (named.rows.has(page)) return { error: `The CSV contains more than one result for page ${page} of ${named.name}.` };
      named.rows.set(page, result);
    }
  }

  const multipleFiles = groups.size > 1;
  const firstGroup = groups.values().next().value;
  const results = multipleFiles ? new Map([...groups.values()].flatMap(group => [...group.rows].map(([page, result]) => [
    JSON.stringify([group.name, page]), { ...result, scannedFile: group.name, page }
  ]))) : firstGroup.rows;
  const scannedFiles = [...groups.values()].map(group => group.name);

  return {
    results,
    filename,
    scannedFiles,
    cfg_sourceId: scannedFiles.length === 1 && scannedFiles[0] === previousComparison.scannedFiles?.[0]
      ? previousComparison.cfg_sourceId ?? null : null,
    cfg_checkNumbers: previousComparison.cfg_checkNumbers ?? true,
    cfg_checkName: previousComparison.cfg_checkName ?? true,
    cfg_checkInitials: previousComparison.cfg_checkInitials ?? true,
    cfg_checkAnswers: previousComparison.cfg_checkAnswers ?? true,
    cfg_firstPage: multipleFiles ? 1 : previousComparison.cfg_firstPage
      ?? (Number(scannerConfig.startAt) || 1) + (scannerConfig.hasMarker ? (scannerConfig.twoSided ? 2 : 1) : 0)
  };
}

function combinedPageReferences(pdfSources, cfg) {
  return pdfSources.flatMap(source => appendedScanPageIndices({
    ...cfg, startAt: 1, endAt: source.numPages, hasMarker: false, ...source.scanConfig
  }).map(index => ({ sourceId: source.id, page: index + 1 })));
}

/** Compare a snapshot of reviewed values, pairing papers by source PDF and page. */
export function buildComparisonReview(examResults, comparison, cfg = {}, { pdfSources = [] } = {}) {
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
  const sources = comparisonPdfSources(examResults, pdfSources);
  const sourceNames = new Map(sources.map(source => [source.id, source.name]));
  const multipleFiles = comparison.scannedFiles?.length > 1;
  const multipleSources = sources.length > 1;
  const sourceId = multipleFiles ? null : comparisonSourceId(comparison, sources);
  const combined = sourceId === COMBINED_COMPARISON_SOURCE;
  const comparedSources = new Set();
  const pairedFiles = new Map();
  if (multipleFiles) {
    for (const filename of comparison.scannedFiles) {
      const matches = matchingSources(filename, sources);
      if (matches.length !== 1 || comparedSources.has(matches[0].id)) {
        return { ...summary, error: `Could not match ${filename} to a unique source PDF. Check the Scanned file names or compare each file separately.` };
      }
      pairedFiles.set(filename, matches[0].id);
      comparedSources.add(matches[0].id);
    }
  } else if (combined && canCompareCombinedPdf(pdfSources)) {
    for (const source of pdfSources) comparedSources.add(source.id);
  } else if (sourceNames.has(sourceId)) {
    comparedSources.add(sourceId);
  } else {
    return { ...summary, error: 'Choose the source PDF that corresponds to this CSV.' };
  }

  const pageKey = (id, page) => JSON.stringify([id, page]);
  const pageReference = (id, page) => multipleSources ? {
    sourceId: id, pdfName: sourceNames.get(id), page
  } : page;
  const combinedPages = combined ? combinedPageReferences(pdfSources, cfg) : null;
  const importedByPage = new Map();
  for (const [key, result] of comparisonEntries(comparison)) {
    const page = Number(result.page ?? key) + offset;
    const reference = combined ? combinedPages[page - 1] : {
      sourceId: multipleFiles ? pairedFiles.get(result.scannedFile) : sourceId, page
    };
    if (!reference) {
      importedOnlyPages.push({ pdfName: 'Combined TAS submission', page });
      continue;
    }
    importedByPage.set(pageKey(reference.sourceId, reference.page), { result, ...reference });
  }
  const currentByPage = new Map();
  examResults.forEach((result, i) => {
    const resultSource = resultSourceId(result);
    if (!comparedSources.has(resultSource)) return;
    if (!positiveInteger(result.page)) {
      invalidCurrentPages.push(i);
      return;
    }
    const page = Number(result.page);
    const key = pageKey(resultSource, page);
    const rows = currentByPage.get(key) ?? [];
    rows.push({ result, i, page, resultSource });
    currentByPage.set(key, rows);
  });

  for (const [key, rows] of currentByPage) {
    const { result, i, page, resultSource } = rows[0];
    if (rows.length > 1) {
      ambiguousPages.push(pageReference(resultSource, page));
      continue;
    }
    const expected = importedByPage.get(key)?.result;
    if (!expected) {
      currentOnlyPages.push(pageReference(resultSource, page));
      continue;
    }
    summary.matchedCount++;
    const add = (field, type, original, current, normalise, idx) => {
      if (normalise(original) === normalise(current)) return;
      const storedDiff = (result.diffs ?? []).find(diff => diff.field === field && (idx === undefined || diff.idx === idx));
      const img = storedDiff?.img ?? (idx === undefined ? undefined : result.raw_answers?.[idx]?.questionableImg);
      diffs.push({
        id: `${multipleSources ? `${encodeURIComponent(resultSource)}:` : ''}${page}:${field}${idx === undefined ? '' : `:${idx}`}`,
        i,
        page,
        ...(result.sourceId ? { sourceId: result.sourceId } : {}),
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
  for (const [key, reference] of importedByPage) {
    if (!currentByPage.has(key)) importedOnlyPages.push(pageReference(reference.sourceId, reference.page));
  }
  for (const pages of [currentOnlyPages, importedOnlyPages, ambiguousPages]) {
    pages.sort((left, right) => text(left.pdfName).localeCompare(text(right.pdfName)) || (left.page ?? left) - (right.page ?? right));
  }
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
