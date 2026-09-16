import { useEffect, useState } from 'preact/hooks';
import { loadCSV } from './util/csv.mjs';
import { normaliseAnswer } from './examDomain.mjs';
import { createLazyScannerClient } from './scannerClient.mjs';
import { ScanIssues } from './components/ScanIssues.jsx';
import { ScannerConfig } from './components/ScannerConfig.jsx';
import { ComparisonConfig } from './components/ComparisonConfig.jsx';
import { AnswerKeyPanel } from './components/AnswerKeyPanel.jsx';
import { AppHeader, WorkspaceSection } from './components/WorkspaceSection.jsx';
import { PdfSetupPanel } from './components/PdfSetupPanel.jsx';
import { ScanProgress } from './components/ScanProgress.jsx';
import { ComparisonReview, QuestionableReview } from './components/ReviewPanels.jsx';
import { ExamResultsTable } from './components/ExamResultsTable.jsx';
import { ResultsFileExchange } from './components/ResultsFileExchange.jsx';
import { CanvasTransfer } from './components/CanvasTransfer.jsx';
import { ExamAnalysis } from './components/ExamAnalysis.jsx';
import { ViewerDialog } from './components/ViewerDialog.jsx';
import { examResultFilename } from './services/examArtifacts.mjs';
import { createAnnotatedExamPdf } from './services/pdfArtifacts.mjs';
import { loadBrowserPdf, renderPdfPagePreview } from './services/browserPdfAdapter.mjs';
import { useScanWorkflow } from './hooks/useScanWorkflow.mjs';
import { downloadFile } from './util/downloads.mjs';

const scannerClient = createLazyScannerClient(() => new Worker(
  new URL('./scannerWorker.js', import.meta.url), { type: 'module' }
));

export function App() {
  const [pdf, setPdf] = useState(null);
  const [pdfName, setPdfName] = useState(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [previewURI, setPreviewURI] = useState(null);
  const [comparison, setComparison] = useState({});
  const [viewer, setViewer] = useState(null);
  const [importCSVPage1, setImportCSVPage1] = useState(1);
  const [cfg, setCfg] = useState({
    startAt: 1,
    endAt: 1,
    twoSided: false,
    hasMarker: false,
    hasMultiAnswer: false,
    multiAnswerQuestions: {},
    answerKey: {},
    marking: { defaultMarks: 1, ranges: [], overrides: {} },
    showQuestionable: true,
    showQActioned: true,
    showActioned: true
  });
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
    pdf,
    config: cfg,
    setConfig: setCfg,
    comparison,
    scannerClient
  });

  const rawCsvImport = async files => {
    if (examResults.length > 0) {
      const confirmation = window.confirm("This will erase current exam scans. Are you sure?");
      if (!confirmation) return;
    }
    const file = files?.[0];
    if (!file) return;
    const csv = await loadCSV(file);

    if (csv[0]?.[0] === 'Unit' && csv[0]?.[1] === 'Exam date' && csv[0]?.[2] === 'Student number' && csv[0]?.[3] === 'Surname' && csv[0]?.[4] === 'Initial' && csv[0]?.[7] === 'Q1' && csv[0]?.[7 + 159] === 'Q160') {
      const newResults = [];
      for (const row of csv.slice(1)) {
        const [unit, examDate, student_number, surname, initials, scannedFile, pageInFile, ...q] = row;
        let pageNum = Number.parseInt(pageInFile);
        pageNum += (Number.parseInt(importCSVPage1) - 1);
        newResults.push({
          page: pageNum,
          student_number,
          surname,
          initials,
          answers: q.map(v => normaliseAnswer(v || ' ')).slice(0, cfg.twoSided ? 160 : 40),
          diffs: []
        });
      }

      // Check if we can scan in page transforms
      let doScan = false;
      const pagesPerExam = cfg.twoSided ? 2 : 1;
      const markerPages = cfg.hasMarker ? pagesPerExam : 0;

      if ((cfg.endAt + 1 - cfg.startAt - markerPages) / pagesPerExam === newResults.length) {  
        // Ensure every exam has a page number within this range
        let canScan = true;
        for (const res of newResults) {
          if (!(res.page >= cfg.startAt + markerPages && res.page <= cfg.endAt)) {
            canScan = false;
            break;
          }
        }
        if (canScan) {
          const confirmation = window.confirm("Match loaded exams against the current PDF? (This will take some time, but will enable exporting of marked PDFs.)");
          if (confirmation) doScan = true;
        }
      }

      if (!doScan) {
        setExamResults(newResults);
      } else {
        await matchLoadedExamsToPdf(newResults);
      }
    } else {
      window.alert("Invalid headings; this is not a raw_results format CSV.")
    }
  };

  const pdfSelected = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const pdf = await loadBrowserPdf(file);
      setPdfName(file.name);
      setPdf(pdf);
      setPdfPage(1);
      setCfg(cfg => ({ ...cfg, endAt: pdf.numPages }));
      clearScanIssues();
    } catch (error) {
      reportScanIssue('Could not open PDF', error);
    }
  };
  const pdfDeselected = e => {
    if (currentlyScanning) return;
    let mustConfirm = false;
    examResults.forEach(er => {
      if ('homographies' in er) mustConfirm = true;
    });
    if (mustConfirm) {
      if (!window.confirm("This will break the connection between current scanned results and the provided PDF, disabling PDF export. Are you sure?")) return;
      setExamResults(examResults => {
        const examResultsCopy = JSON.parse(JSON.stringify(examResults));
        examResultsCopy.forEach(er => {
          delete er.homographies;
          delete er.homographies2;
        });
        return examResultsCopy;
      });
    }
    setPdfName(null);
    setPdf(null);
  };

  // Update preview URI
  useEffect(() => {
    let cancelled = false;
    let previewUrl = null;

    if (pdf === null) {
      setPreviewURI(null);
      return undefined;
    }

    setPreviewURI(null);
    renderPdfPagePreview(pdf, pdfPage)
      .then(blob => {
        if (cancelled) return;
        previewUrl = URL.createObjectURL(blob);
        setPreviewURI(previewUrl);
      })
      .catch(error => {
        if (!cancelled) reportScanIssue('Could not render PDF preview', error, pdfPage);
      });

    return () => {
      cancelled = true;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [pdf, pdfPage, reportScanIssue]);

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

  return (
    <div class="exam-scanner-app">
      <div class="app-backdrop" aria-hidden="true"></div>
      <div class="app-container">
        <AppHeader pdfName={pdfName} resultCount={examResults.length} />

        <main class="workspace">
          <WorkspaceSection
            id="setup"
            number="1"
            eyebrow="Document"
            title="Set up the scan"
            description="Load a PDF, configure the scan and set the answer key."
            actions={<span class="section-count">{keyedQuestionCount} keyed</span>}
          >
            <div class="setup-layout">
              <div class="setup-column">
                <h3>PDF</h3>
                <PdfSetupPanel
                  pdf={pdf}
                  pdfName={pdfName}
                  previewURI={previewURI}
                  currentPage={pdfPage}
                  currentlyScanning={currentlyScanning}
                  onSelect={pdfSelected}
                  onRemove={pdfDeselected}
                  onPrevious={prevPage}
                  onNext={nextPage}
                />
              </div>
              <div class="setup-column setup-layout__options">
                <h3>Scan configuration</h3>
                <ScannerConfig config={cfg} setConfig={setCfg} pdf={pdf} currentlyScanning={currentlyScanning} />
                <ComparisonConfig comparison={comparison} setComparison={setComparison} scannerConfig={cfg} currentlyScanning={currentlyScanning} />
              </div>
              <div class="setup-column setup-column--answer" id="answer-key">
                <h3>Answer key</h3>
                <p class="setup-column__description">Select every accepted answer. Enable Multi only where the complete set is required.</p>
                <AnswerKeyPanel cfg={cfg} setCfg={setCfg} pdf={pdf} currentlyScanning={currentlyScanning} />
              </div>
            </div>
          </WorkspaceSection>

          <div class="scan-action-panel">
            <div>
              <p class="scan-action-panel__eyebrow">Ready to process</p>
              <h2>{pdf ? `${pdf.numPages} page PDF loaded` : 'Load a PDF to begin'}</h2>
              <p>Recognition runs locally. Review uncertain marks before exporting final grades.</p>
            </div>
            <button
              disabled={pdf === null}
              onClick={scanExams}
              class={`btn btn-lg ${currentlyScanning ? 'btn-danger' : 'btn-primary'} scan-action-panel__button`}
            >
              {currentlyScanning ? 'Stop scanning' : 'Scan Exams'}
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
            <ExamResultsTable cfg={cfg} examResults={examResults} setExamResults={setExamResults}
              onDownloadAnnotatedPdf={async result => {
                try {
                  const blob = await createAnnotatedExamPdf(cfg, result, pdf);
                  downloadFile(examResultFilename(result) + '.pdf', blob);
                } catch (error) {
                  reportScanIssue('Could not create annotated PDF', error, result.page);
                }
              }} />
            <ComparisonReview cfg={cfg} setCfg={setCfg} comparison={comparison}
              examResults={examResults} setExamResults={setExamResults}
              onViewPage={pdf ? ((page, title) => setViewer({ type: 'pdf', page, title })) : null}
              onViewImage={(src, title) => setViewer({ type: 'image', src, title })} />
            <QuestionableReview cfg={cfg} setCfg={setCfg}
              examResults={examResults} setExamResults={setExamResults}
              onViewPage={pdf ? ((page, title) => setViewer({ type: 'pdf', page, title })) : null}
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
              setCfg={setCfg}
              examResults={examResults}
              setExamResults={setExamResults}
              pdf={pdf}
              pdfName={pdfName}
              currentlyScanning={currentlyScanning}
              importCsvPage={importCSVPage1}
              setImportCsvPage={setImportCSVPage1}
              onImportRawCsv={rawCsvImport}
            />
            <CanvasTransfer examResults={examResults} setExamResults={setExamResults} cfg={cfg} pdf={pdf}
              createAnnotatedPdf={createAnnotatedExamPdf} />
          </WorkspaceSection>
        </main>
        <ViewerDialog viewer={viewer} pdf={pdf} onClose={() => setViewer(null)} />
      </div>
    </div>
  );
}
