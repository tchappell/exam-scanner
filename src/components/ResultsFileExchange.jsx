import { buildRawResultsCsvRows, buildResultsCsvRows } from '../services/resultExports.mjs';
import { buildWorkingDataset, readWorkingDataset } from '../services/workingDataset.mjs';
import { createCSV } from '../util/csv.mjs';
import { downloadFile } from '../util/downloads.mjs';

const multiAnswerQuestionsFor = cfg => cfg.hasMultiAnswer ? (cfg.multiAnswerQuestions ?? {}) : {};

export function ResultsFileExchange({
  cfg,
  examResults,
  pdfSources,
  comparison,
  scanRuns,
  tasDraft,
  canSaveDataset
}) {
  const exportResults = () => {
    const rows = buildResultsCsvRows({
      examResults,
      answerKey: cfg.answerKey,
      multiAnswerQuestions: multiAnswerQuestionsFor(cfg),
      marking: cfg.marking,
      pdfSources
    });
    downloadFile('results.csv', new Blob([createCSV(rows)], { type: 'text/csv' }));
  };

  const exportRawResults = () => {
    const rows = buildRawResultsCsvRows({ examResults, pdfSources });
    downloadFile('raw_results.csv', new Blob([createCSV(rows)], { type: 'text/csv' }));
  };

  const exportDataset = () => {
    const dataset = buildWorkingDataset({ config: cfg, examResults, pdfSources, comparison, scanRuns, tasDraft });
    downloadFile('results.json', new Blob([JSON.stringify(dataset)], { type: 'application/json' }));
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
        <button class="export-card" disabled={!canSaveDataset} onClick={exportDataset}>
          <strong>Download working dataset</strong><span>results.json · save setup, scans and review progress</span>
        </button>
      </div>
    </section>
  );
}

export function ResultsImports({
  pdfSources, hasWorkToReplace, busy, importCsvPage, setImportCsvPage,
  onImportRawCsv, onDatasetImporting, onRestoreDataset
}) {
  const importDataset = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy) return;

    onDatasetImporting(true);
    try {
      const dataset = readWorkingDataset(JSON.parse(await file.text()), pdfSources);
      if (hasWorkToReplace && !window.confirm('Replace the current exam setup and results with this saved work?')) return;
      onRestoreDataset(dataset);
    } catch (error) {
      window.alert(`Invalid JSON file: ${error.message}`);
    } finally {
      onDatasetImporting(false);
    }
  };

  return (
    <section class="import-grid scan-imports" aria-label="Import exam work">
      <div class="import-card">
        <div><strong>Import raw results</strong><p>Bring an existing raw_results.csv back into the review workflow.</p></div>
        <div class="import-card__controls">
          <div class="field-group">
            <label htmlFor="resultsCsvImportPage">Its page 1 corresponds to PDF page</label>
            <input disabled={busy} type="number" id="resultsCsvImportPage" value={importCsvPage}
              onInput={event => setImportCsvPage(event.target.value)} />
          </div>
          <input type="file" disabled={busy} id="resultsCsvImport" class="form-control"
            aria-label="Import results from raw_results.csv" accept="text/csv"
            onChange={event => onImportRawCsv(event.target.files)} />
        </div>
      </div>
      <div class="import-card">
        <div><strong>Resume saved work</strong><p>Load results.json to restore setup, scan progress and reviewed results.</p></div>
        <input type="file" disabled={busy} id="resultsJsonImport" class="form-control"
          aria-label="Import results from results.json" accept="application/json" onChange={importDataset} />
      </div>
    </section>
  );
}
