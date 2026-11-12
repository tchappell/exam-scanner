import { useEffect, useState } from 'preact/hooks';
import { loadCSV } from './util/csv.mjs';
import { normaliseAnswer } from './examDomain.mjs';
import { createLazyScannerClient } from './scannerClient.mjs';
import { ScanIssues } from './components/ScanIssues.jsx';
import { ScannerConfig } from './components/ScannerConfig.jsx';
import { ComparisonPanel } from './components/ComparisonPanel.jsx';
import { AnswerKeyPanel } from './components/AnswerKeyPanel.jsx';
import { AppHeader, WorkspaceSection } from './components/WorkspaceSection.jsx';
import { PdfSetupPanel } from './components/PdfSetupPanel.jsx';
import { ScanProgress } from './components/ScanProgress.jsx';
import { QuestionableReview } from './components/ReviewPanels.jsx';
import { ExamResultsTable } from './components/ExamResultsTable.jsx';
import { ResultsFileExchange } from './components/ResultsFileExchange.jsx';
import { CanvasTransfer } from './components/CanvasTransfer.jsx';
import { ExamAnalysis } from './components/ExamAnalysis.jsx';
import { ViewerDialog } from './components/ViewerDialog.jsx';
import { examResultFilename, hashBytes } from './services/examArtifacts.mjs';
import { createAnnotatedExamPdf } from './services/pdfArtifacts.mjs';
import { loadBrowserPdf, renderPdfPagePreview } from './services/browserPdfAdapter.mjs';
import { pdfSourceForResult } from './services/pdfSources.mjs';
import { useScanWorkflow } from './hooks/useScanWorkflow.mjs';
import { downloadFile } from './util/downloads.mjs';

const scannerClient = createLazyScannerClient(() => new Worker(
  new URL('./scannerWorker.js', import.meta.url), { type: 'module' }
));

const initialScanConfig = (endAt = 1) => ({ startAt: 1, endAt, hasMarker: false });
const filenameKey = name => `${name ?? ''}`.trim().replaceAll('\\', '/').split('/').at(-1).toLowerCase();

export function App() {
  const [pdfSources, setPdfSources] = useState([]);
  const [activeSourceId, setActiveSourceId] = useState(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [importingResults, setImportingResults] = useState(false);
  const [pdfPage, setPdfPage] = useState(1);
  const [previewURI, setPreviewURI] = useState(null);
  const [comparison, setComparison] = useState({});
  const [viewer, setViewer] = useState(null);
  const [importCSVPage1, setImportCSVPage1] = useState(1);
  const [cfg, setCfg] = useState({
    twoSided: false,
    hasMultiAnswer: false,
    multiAnswerQuestions: {},
    answerKey: {},
    marking: { defaultMarks: 1, ranges: [], overrides: {} },
    showQuestionable: true,
    showQActioned: true,
    showActioned: true
  });
  const source = pdfSources.find(item => item.id === activeSourceId);
  const pdf = source?.pdf ?? null;
  const pdfName = source?.name ?? null;
  const scanConfig = source?.scanConfig ?? initialScanConfig(source?.numPages ?? 1);
  const activeConfig = { ...cfg, ...scanConfig };

  const {
    progress,
    stage: scanStage,
    results: examResults,
    setResults: setExamResults,
    issues: scanIssues,
    clearIssues: clearScanIssues,
    reportIssue: reportScanIssue,
    currentlyScanning,
    scanExams,
    matchLoadedExamsToPdf
  } = useScanWorkflow({
    source,
    config: activeConfig,
    setConfig: setCfg,
    scannerClient,
    onBatchReplaced: () => setComparison(({ review, cropImages, decisions, ...settings }) => settings)
  });
  const busy = currentlyScanning || loadingPdf || importingResults;
  const hasBatchResults = Boolean(source && examResults.some(result => result.sourceId === source.id));
  const hasOtherResults = examResults.some(result => result.sourceId !== source?.id);
  const loadedPdfSources = pdfSources.filter(item => item.pdf);

  useEffect(() => {
    document.title = progress === null
      ? 'exam-scanner'
      : `exam-scanner ${progress[0]}/${progress[1]}`;
    return () => { document.title = 'exam-scanner'; };
  }, [progress]);

  const rawCsvImport = async files => {
    const file = files?.[0];
    if (!file || busy) return;
    if (examResults.length > 0) {
      const confirmation = window.confirm("This will erase current exam scans. Are you sure?");
      if (!confirmation) return;
    }
    setImportingResults(true);
    try {
      const csv = await loadCSV(file);
      const headings = ['Unit', 'Exam date', 'Student number', 'Surname', 'Initial'];
      if (!headings.every((heading, index) => csv[0]?.[index] === heading) || csv[0]?.[7] !== 'Q1' || csv[0]?.[166] !== 'Q160') {
        window.alert('Invalid headings; this is not a raw_results format CSV.');
        return;
      }
      const rows = csv.slice(1).filter(row => row.some(cell => cell.trim()));
      const fileNames = new Set(rows.map(row => filenameKey(row[5])).filter(Boolean));
      const firstPage = Number(importCSVPage1);
      if (!Number.isSafeInteger(firstPage) || firstPage < 1 || rows.some(row => {
        const page = Number(row[6]);
        return !Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(page + firstPage - 1);
      })) {
        window.alert('Enter positive whole page numbers for the CSV offset and every paper.');
        return;
      }
      const newResults = rows.map(row => {
        const [, , student_number, surname, initials, scannedFile, pageInFile, ...q] = row;
        const page = Number(pageInFile) + firstPage - 1;
        const sameName = pdfSources.filter(item => filenameKey(scannedFile) && filenameKey(item.name) === filenameKey(scannedFile));
        const linked = sameName.length === 1 ? sameName[0]
          : fileNames.size <= 1 && pdfSources.length === 1 && pdf ? source : null;
        return {
          page,
          student_number,
          surname,
          initials,
          ...(scannedFile ? { pdfName: scannedFile } : {}),
          ...(linked && (!linked.numPages || page <= linked.numPages) ? { sourceId: linked.id } : {}),
          answers: q.map(v => normaliseAnswer(v || ' ')).slice(0, cfg.twoSided ? 160 : 40),
          diffs: []
        };
      });
      const pagesPerExam = cfg.twoSided ? 2 : 1;
      const firstExamPage = scanConfig.startAt + (scanConfig.hasMarker ? pagesPerExam : 0);
      const expectedCount = (scanConfig.endAt + 1 - firstExamPage) / pagesPerExam;
      const canMatch = pdf && newResults.length > 0 && newResults.length === expectedCount
        && new Set(newResults.map(result => result.page)).size === expectedCount
        && newResults.every(result => result.sourceId === source.id
          && result.page >= firstExamPage && result.page <= scanConfig.endAt
          && (result.page - firstExamPage) % pagesPerExam === 0);
      setComparison({});

      if (canMatch && window.confirm('Match loaded exams against the current PDF? (This will take some time, but will enable exporting of marked PDFs.)')) {
        setImportingResults(false);
        await matchLoadedExamsToPdf(newResults);
      } else {
        setExamResults(newResults);
      }
    } catch (error) {
      window.alert(`Could not import raw results: ${error.message}`);
    } finally {
      setImportingResults(false);
    }
  };

  const selectSource = id => {
    setActiveSourceId(id);
    setPdfPage(1);
  };

  const pdfSelected = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy) return;
    setLoadingPdf(true);
    try {
      const bytes = await file.arrayBuffer();
      const hash = await hashBytes(bytes);
      const known = pdfSources.find(item => item.hash === hash);
      const loadedPdf = known?.pdf ?? await loadBrowserPdf(bytes);
      const loadedSource = {
        ...known,
        id: known?.id ?? hash,
        hash,
        name: known?.name ?? file.name,
        numPages: loadedPdf.numPages,
        pdf: loadedPdf,
        scanConfig: known?.scanConfig ?? initialScanConfig(loadedPdf.numPages)
      };
      setPdfSources(previous => known ? previous.map(item => item.id === known.id ? loadedSource : item) : [...previous, loadedSource]);
      selectSource(loadedSource.id);
      clearScanIssues();
    } catch (error) {
      reportScanIssue('Could not open PDF', error, null, file.name);
    } finally {
      setLoadingPdf(false);
    }
  };

  const pdfDeselected = () => {
    if (busy || !pdf) return;
    if (hasBatchResults && !window.confirm('Remove this PDF? Its reviewed results will stay. Reload the original file to preview or export its pages.')) return;
    const remaining = hasBatchResults ? pdfSources.map(item => item === source ? { ...item, pdf: undefined } : item)
      : pdfSources.filter(item => item !== source);
    setPdfSources(remaining);
    setViewer(null);
    selectSource((remaining.find(item => item.pdf) ?? remaining[0])?.id ?? null);
    pdf.destroy().catch(error => reportScanIssue('Could not close PDF', error, null, pdfName));
  };

  const updateScanConfig = (field, value) => setPdfSources(previous => previous.map(item => item.id === activeSourceId
    ? { ...item, scanConfig: { ...(item.scanConfig ?? initialScanConfig(item.numPages)), [field]: value } } : item));

  const restoreDataset = ({ config, examResults, pdfSources: restoredSources, comparison }) => {
    setCfg(previous => ({ ...previous, ...config }));
    setExamResults(examResults);
    setPdfSources(restoredSources);
    setComparison(comparison);
    setViewer(null);
    selectSource((restoredSources.find(item => item.pdf) ?? restoredSources[0])?.id ?? null);
    clearScanIssues();
    for (const item of loadedPdfSources) {
      if (!restoredSources.some(restored => restored.pdf === item.pdf)) {
        item.pdf.destroy().catch(error => reportScanIssue('Could not close PDF', error, null, item.name));
      }
    }
  };

  // Update preview URI
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let previewUrl = null;

    if (pdf === null) {
      setPreviewURI(null);
      return undefined;
    }

    setPreviewURI(null);
    renderPdfPagePreview(pdf, pdfPage, 1, { signal })
      .then(blob => {
        if (signal.aborted) return;
        previewUrl = URL.createObjectURL(blob);
        setPreviewURI(previewUrl);
      })
      .catch(error => {
        if (!signal.aborted) reportScanIssue('Could not render PDF preview', error, pdfPage, pdfName);
      });

    return () => {
      controller.abort();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [pdf, pdfName, pdfPage, reportScanIssue]);

  const prevPage = () => {
    if (pdfPage === 1) setPdfPage(pdf.numPages);
    else setPdfPage(pdfPage - 1);
  };
  const nextPage = () => {
    if (pdfPage >= pdf.numPages) setPdfPage(1);
    else setPdfPage(pdfPage + 1);
  };

  const keyedQuestionCount = Object.values(cfg.answerKey)
    .filter(answer => Object.values(answer).some(Boolean)).length;
  const canViewPage = (page, sourceId) => {
    const document = pdfSourceForResult(pdfSources, { sourceId })?.pdf;
    return Boolean(document && Number(page) >= 1 && Number(page) <= document.numPages);
  };
  const viewPage = (page, title, sourceId, pages) => {
    if (!canViewPage(page, sourceId)) return;
    const item = pdfSourceForResult(pdfSources, { sourceId });
    setViewer({ type: 'pdf', sourceId, page, pages,
      title: pdfSources.length > 1 ? `${title} · ${item.name}` : title });
  };
  const viewOriginal = result => {
    const page = Number(result.page);
    const pages = [page];
    if (cfg.twoSided && canViewPage(page + 1, result.sourceId)) pages.push(page + 1);
    const title = pages.length > 1 ? `Original exam — PDF pages ${page}–${page + 1}` : `Original exam — PDF page ${page}`;
    viewPage(page, title, result.sourceId, pages);
  };
  const canAnnotatePdf = result => Boolean(result.homographies
    && canViewPage(Number(result.page) + (cfg.twoSided ? 1 : 0), result.sourceId));
  const createAnnotatedPdf = (result, sourceDocuments) => createAnnotatedExamPdf(
    cfg, result, pdfSourceForResult(pdfSources, result)?.pdf, sourceDocuments
  );

  return (
    <div class="exam-scanner-app">
      <div class="app-backdrop" aria-hidden="true"></div>
      <div class="app-container">
        <AppHeader pdfName={loadedPdfSources[0]?.name} resultCount={examResults.length} />

        <main class="workspace">
          <WorkspaceSection
            id="setup"
            number="1"
            eyebrow="Document"
            title="Set up the scan"
            description="Load exam PDFs, configure the scan and set the answer key."
            actions={<span class="section-count">{keyedQuestionCount} keyed</span>}
          >
            <div class="setup-layout">
              <div class="setup-column setup-column--source">
                <div class="setup-stack-section">
                  <h3>PDF</h3>
                  <PdfSetupPanel
                    pdf={pdf}
                    pdfName={pdfName}
                    pdfSources={pdfSources}
                    activeSourceId={activeSourceId}
                    previewURI={previewURI}
                    currentPage={pdfPage}
                    busy={busy}
                    loadingPdf={loadingPdf}
                    onSelect={pdfSelected}
                    onSelectSource={selectSource}
                    onRemove={pdfDeselected}
                    onPrevious={prevPage}
                    onNext={nextPage}
                  />
                </div>
                <div class="setup-stack-section setup-layout__options">
                  <h3>Scan configuration</h3>
                  <ScannerConfig config={activeConfig} setConfig={setCfg} setScanConfig={updateScanConfig}
                    pdf={pdf} currentlyScanning={busy} keepAnswerKey={hasOtherResults} />
                </div>
              </div>
              <div class="setup-column setup-column--answer" id="answer-key">
                <h3>Answer key</h3>
                <p class="setup-column__description">Select every accepted answer. Enable Multi only where the complete set is required.</p>
                <AnswerKeyPanel cfg={cfg} setCfg={setCfg} pdfBatches={loadedPdfSources}
                  missingPdfCount={pdfSources.length - loadedPdfSources.length} currentlyScanning={busy} />
              </div>
            </div>
          </WorkspaceSection>

          <div class="scan-action-panel">
            <div>
              <p class="scan-action-panel__eyebrow">Ready to process</p>
              <h2>{pdf ? (pdfSources.length > 1 ? `Scan ${pdfName}` : `${pdf.numPages} page PDF loaded`) : 'Load a PDF to scan'}</h2>
              <p>{hasOtherResults ? 'The other batches stay in your reviewed results.'
                : 'Recognition runs locally. Review uncertain marks before exporting final grades.'}</p>
            </div>
            <button
              disabled={pdf === null || (busy && !currentlyScanning)}
              onClick={scanExams}
              class={`btn btn-lg ${currentlyScanning ? 'btn-danger' : 'btn-primary'} scan-action-panel__button`}
            >
              {currentlyScanning ? 'Stop scanning' : hasOtherResults && !hasBatchResults ? 'Scan and append exams' : 'Scan Exams'}
            </button>
          </div>

          <ScanProgress progress={progress} stage={scanStage} />
          <ScanIssues issues={scanIssues} onDismiss={clearScanIssues} />

          <WorkspaceSection
            id="results"
            number="2"
            eyebrow="Verification"
            title="Review scanned exams"
            description="Confirm student details, answers and scores. Question columns scroll horizontally."
            actions={<span class="section-count">{examResults.length} scanned</span>}
          >
            <ExamResultsTable cfg={cfg} examResults={examResults} setExamResults={setExamResults} pdfSources={pdfSources}
              canViewOriginalPdf={result => canViewPage(result.page, result.sourceId)} onViewOriginalPdf={viewOriginal}
              canAnnotatePdf={canAnnotatePdf}
              onDownloadAnnotatedPdf={async result => {
                try {
                  const blob = await createAnnotatedPdf(result);
                  downloadFile(examResultFilename(result) + '.pdf', blob);
                } catch (error) {
                  reportScanIssue('Could not create annotated PDF', error, result.page);
                }
              }} />
            <ComparisonPanel cfg={activeConfig} pdfSources={pdfSources} comparison={comparison} setComparison={setComparison} currentlyScanning={busy}
              examResults={examResults} setExamResults={setExamResults}
              onViewPage={viewPage}
              onViewImage={(src, title) => setViewer({ type: 'image', src, title })} />
            <QuestionableReview cfg={cfg} setCfg={setCfg}
              examResults={examResults} setExamResults={setExamResults} pdfSources={pdfSources}
              busy={busy} onViewPage={viewPage}
              onViewImage={(src, title) => setViewer({ type: 'image', src, title })} />
            <ExamAnalysis examResults={examResults} cfg={cfg} />
          </WorkspaceSection>

          <WorkspaceSection
            id="exports"
            number="3"
            eyebrow="Output"
            title="Export and continue"
            description="Download results, resume previous work, or prepare grades for Canvas."
          >
            <ResultsFileExchange
              cfg={cfg}
              examResults={examResults}
              pdfSources={pdfSources}
              onRestoreDataset={restoreDataset}
              onDatasetImporting={setImportingResults}
              currentlyScanning={busy}
              importCsvPage={importCSVPage1}
              setImportCsvPage={setImportCSVPage1}
              onImportRawCsv={rawCsvImport}
              comparison={comparison}
            />
            <CanvasTransfer examResults={examResults} setExamResults={setExamResults} cfg={cfg} pdfSources={pdfSources}
              onViewPage={viewPage} canAnnotatePdf={canAnnotatePdf} createAnnotatedPdf={createAnnotatedPdf} />
          </WorkspaceSection>
        </main>
        <ViewerDialog viewer={viewer} pdf={viewer && pdfSourceForResult(pdfSources, viewer)?.pdf} onClose={() => setViewer(null)} />
      </div>
    </div>
  );
}
