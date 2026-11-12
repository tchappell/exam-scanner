import { fixAnswers } from '../examDomain.mjs';
import { restoreComparison, serializeComparison } from './comparisonImport.mjs';

function sourceMetadata({ id, name, hash, numPages, scanConfig }) {
  return {
    id,
    name: name ?? null,
    hash,
    numPages: numPages ?? null,
    ...(scanConfig ? { scanConfig } : {})
  };
}

export function buildWorkingDataset({ config, examResults, pdfSources, comparison }) {
  const recoverableSources = new Set(pdfSources.filter(source => source.hash).map(source => source.id));
  const savedResults = examResults.map(result => ({
    ...result,
    diffs: [],
    raw_answers: (result.raw_answers ?? []).map(answer => {
      if (!answer?.questionableImg || !recoverableSources.has(result.sourceId)) return answer;
      const { questionableImg, ...raw } = answer;
      return raw;
    })
  }));
  return {
    pdfSources: pdfSources.map(sourceMetadata),
    twoSided: config.twoSided,
    hasMultiAnswer: config.hasMultiAnswer,
    multiAnswerQuestions: config.hasMultiAnswer ? config.multiAnswerQuestions ?? {} : {},
    marking: config.marking,
    examResults: savedResults,
    answerKey: config.answerKey,
    comparison: serializeComparison(comparison)
  };
}

function restorePdfSources(sources, loadedPdfSources) {
  if (!Array.isArray(sources)) throw new Error('PDF references must be an array.');
  const loadedByHash = new Map(loadedPdfSources.filter(source => source.pdf).map(source => [source.hash, source]));
  const seenIds = new Set();
  const seenHashes = new Set();
  return sources.map(source => {
    if (typeof source?.id !== 'string' || !source.id || seenIds.has(source.id)
      || typeof source.hash !== 'string' || !source.hash || seenHashes.has(source.hash)) {
      throw new Error('A PDF reference is invalid or duplicated.');
    }
    seenIds.add(source.id);
    seenHashes.add(source.hash);
    const attached = loadedByHash.get(source.hash);
    return {
      ...sourceMetadata(source),
      name: source.name ?? attached?.name ?? null,
      numPages: attached?.numPages ?? source.numPages ?? null,
      ...(attached ? { pdf: attached.pdf } : {})
    };
  });
}

export function readWorkingDataset(dataset, loadedPdfSources = []) {
  if (!Array.isArray(dataset?.examResults)) throw new Error('The dataset does not contain exam results.');

  const legacy = !Object.hasOwn(dataset, 'pdfSources');
  let legacySource;
  let pdfSources;
  if (legacy && dataset.pdfHash) {
    if (typeof dataset.pdfHash !== 'string') throw new Error('The saved PDF hash is invalid.');
    const known = loadedPdfSources.find(source => source.hash === dataset.pdfHash);
    legacySource = known ?? sourceMetadata({ id: dataset.pdfHash, hash: dataset.pdfHash });
    pdfSources = [legacySource];
  } else if (legacy) {
    // A single open PDF supplied the page previews for legacy datasets saved without a hash.
    const attached = loadedPdfSources.filter(source => source.pdf);
    legacySource = attached.length === 1 ? attached[0] : undefined;
    pdfSources = legacySource ? [legacySource] : [];
  } else {
    pdfSources = restorePdfSources(dataset.pdfSources, loadedPdfSources);
  }

  const config = {
    twoSided: Boolean(dataset.twoSided),
    answerKey: dataset.answerKey ?? {},
    hasMultiAnswer: Boolean(dataset.hasMultiAnswer),
    multiAnswerQuestions: dataset.multiAnswerQuestions ?? {},
    ...(dataset.marking ? { marking: dataset.marking } : {})
  };
  const sourceIds = new Set(pdfSources.map(source => source.id));
  const examResults = dataset.examResults.map(result => {
    if (!result || typeof result !== 'object') throw new Error('The dataset contains an invalid exam result.');
    const loaded = { ...result, answers: fixAnswers(config, result.answers ?? []) };
    if (Array.isArray(result.raw_answers)) {
      // Older exports kept the crop while dropping the flag that added the answer to the review queue.
      loaded.raw_answers = result.raw_answers.map(answer => (
        typeof answer?.questionableImg === 'string' && answer.questionableImg && !Object.hasOwn(answer, 'questionable')
          ? { ...answer, questionable: true }
          : answer
      ));
    }
    if (legacySource) {
      loaded.sourceId = legacySource.id;
      if (!dataset.pdfHash) {
        delete loaded.homographies;
        delete loaded.homographies2;
      }
    }
    if (loaded.sourceId != null && !sourceIds.has(loaded.sourceId)) {
      throw new Error('An exam result refers to a PDF missing from the dataset.');
    }
    return loaded;
  });
  return { config, examResults, pdfSources, comparison: restoreComparison(dataset.comparison ?? {}) };
}
