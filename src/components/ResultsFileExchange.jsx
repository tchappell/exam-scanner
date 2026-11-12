import { buildRawResultsCsvRows, buildResultsCsvRows } from '../services/resultExports.mjs';
import { buildWorkingDataset, readWorkingDataset } from '../services/workingDataset.mjs';
import { createCSV } from '../util/csv.mjs';
import { downloadFile } from '../util/downloads.mjs';

const multiAnswerQuestionsFor = cfg => cfg.hasMultiAnswer ? (cfg.multiAnswerQuestions ?? {}) : {};

export function ResultsFileExchange({
  cfg,
  examResults,
  pdfSources,
  currentlyScanning,
  importCsvPage,
  setImportCsvPage,
  onImportRawCsv,
  comparison,
  onDatasetImporting,
  onRestoreDataset
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
    const dataset = buildWorkingDataset({ config: cfg, examResults, pdfSources, comparison });
    downloadFile('results.json', new Blob([JSON.stringify(dataset)], { type: 'application/json' }));
  };

  const importDataset = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (examResults.length > 0 && !window.confirm('This will replace the current exam scans with the saved results. Continue?')) return;

    onDatasetImporting(true);
    try {
      onRestoreDataset(readWorkingDataset(JSON.parse(await file.text()), pdfSources));
    } catch (error) {
      window.alert(`Invalid JSON file: ${error.message}`);
    } finally {
      onDatasetImporting(false);
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
          <div><strong>Resume saved work</strong><p>Restore scanner settings, answer keys and reviewed results. Open the original PDFs to preview or export papers.</p></div>
          <input type="file" disabled={currentlyScanning} id="resultsJsonImport" class="form-control"
            aria-label="Import results from results.json" accept="application/json" onChange={importDataset} />
        </div>
      </div>
    </section>
  );
}
