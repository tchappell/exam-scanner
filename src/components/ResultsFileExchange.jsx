import { fixAnswers } from '../examDomain.mjs';
import { hashBlob } from '../services/examArtifacts.mjs';
import { buildRawResultsCsvRows, buildResultsCsvRows } from '../services/resultExports.mjs';
import { createCSV } from '../util/csv.mjs';
import { downloadFile } from '../util/downloads.mjs';

const multiAnswerQuestionsFor = cfg => cfg.hasMultiAnswer ? (cfg.multiAnswerQuestions ?? {}) : {};

export function ResultsFileExchange({
  cfg,
  setCfg,
  examResults,
  setExamResults,
  pdf,
  pdfName,
  currentlyScanning,
  importCsvPage,
  setImportCsvPage,
  onImportRawCsv
}) {
  const exportResults = () => {
    const rows = buildResultsCsvRows({
      examResults,
      answerKey: cfg.answerKey,
      multiAnswerQuestions: multiAnswerQuestionsFor(cfg),
      marking: cfg.marking,
      pdfName
    });
    downloadFile('results.csv', new Blob([createCSV(rows)], { type: 'text/csv' }));
  };

  const exportRawResults = () => {
    const rows = buildRawResultsCsvRows({ examResults, pdfName });
    downloadFile('raw_results.csv', new Blob([createCSV(rows)], { type: 'text/csv' }));
  };

  const exportDataset = async () => {
    const pdfHash = pdf ? await hashBlob(new Blob([await pdf.getData()], { type: 'application/pdf' })) : null;
    const savedResults = structuredClone(examResults).map(result => ({
      ...result,
      diffs: [],
      raw_answers: (result.raw_answers ?? []).map(raw => {
        const saved = { ...raw };
        delete saved.questionable;
        return saved;
      })
    }));
    const dataset = {
      pdfHash,
      twoSided: cfg.twoSided,
      hasMultiAnswer: cfg.hasMultiAnswer,
      multiAnswerQuestions: multiAnswerQuestionsFor(cfg),
      marking: cfg.marking,
      examResults: savedResults,
      answerKey: cfg.answerKey
    };
    downloadFile('results.json', new Blob([JSON.stringify(dataset)], { type: 'application/json' }));
  };

  const importDataset = async event => {
    if (examResults.length > 0 && !window.confirm('This will erase current exam scans. Are you sure?')) return;
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const dataset = JSON.parse(await file.text());
      const currentPdfHash = pdf
        ? await hashBlob(new Blob([await pdf.getData()], { type: 'application/pdf' }))
        : null;
      if (dataset.pdfHash !== null && dataset.pdfHash !== currentPdfHash) {
        const warning = currentPdfHash === null
          ? 'There is no PDF loaded; PDF export will be disabled. Continue?'
          : 'The loaded PDF differs from the saved results; PDF export will be disabled. Continue?';
        if (!window.confirm(warning)) return;
      }

      const loadedResults = dataset.examResults.map(result => {
        const loaded = { ...result };
        if (dataset.pdfHash !== currentPdfHash) {
          delete loaded.homographies;
          delete loaded.homographies2;
        }
        loaded.answers = fixAnswers({ twoSided: dataset.twoSided }, result.answers ?? []);
        return loaded;
      });
      setCfg(previous => ({
        ...previous,
        twoSided: dataset.twoSided,
        answerKey: dataset.answerKey,
        hasMultiAnswer: Boolean(dataset.hasMultiAnswer),
        multiAnswerQuestions: dataset.multiAnswerQuestions ?? {},
        marking: dataset.marking ?? previous.marking
      }));
      setExamResults(loadedResults);
    } catch (error) {
      window.alert(`Invalid JSON file: ${error.message}`);
    }
  };

  return (
    <section class="results-exchange" aria-labelledby="results-files-title">
      <div class="subsection-header">
        <div><p class="subsection-header__eyebrow">Files</p><h3 id="results-files-title">Results and saved work</h3></div>
      </div>
      <div class="export-grid">
        <button class="export-card" disabled={examResults.length === 0} onClick={exportResults}>
          <strong>Download grade summary</strong><span>results.csv · scores and student details</span>
        </button>
        <button class="export-card" disabled={examResults.length === 0} onClick={exportRawResults}>
          <strong>Download detailed responses</strong><span>raw_results.csv · every answer position</span>
        </button>
        <button class="export-card" disabled={examResults.length === 0} onClick={exportDataset}>
          <strong>Download working dataset</strong><span>results.json · resume this scan later</span>
        </button>
      </div>
      <div class="import-grid">
        <div class="import-card">
          <div><strong>Import raw results</strong><p>Bring an existing raw_results.csv back into the review workflow.</p></div>
          <div class="import-card__controls">
            <div class="field-group">
              <label htmlFor="resultsCsvImportPage">Its page 1 corresponds to PDF page</label>
              <input disabled={currentlyScanning} type="number" id="resultsCsvImportPage" value={importCsvPage}
                onInput={event => setImportCsvPage(event.target.value)} />
            </div>
            <input type="file" disabled={currentlyScanning} id="resultsCsvImport" class="form-control"
              aria-label="Import results from raw_results.csv" accept="text/csv"
              onChange={event => onImportRawCsv(event.target.files)} />
          </div>
        </div>
        <div class="import-card">
          <div><strong>Resume saved work</strong><p>Restore scanner settings, answer keys and reviewed results from JSON.</p></div>
          <input type="file" disabled={currentlyScanning} id="resultsJsonImport" class="form-control"
            aria-label="Import results from results.json" accept="application/json" onChange={importDataset} />
        </div>
      </div>
    </section>
  );
}
