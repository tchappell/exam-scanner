import { useEffect, useRef, useState } from 'preact/hooks';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import 'pdfjs-dist/build/pdf.worker.mjs';
import { loadCSV } from './util/csv.mjs';
import {
  createAnswerKey,
  fixAnswers,
  normaliseAnswer
} from './examDomain.mjs';
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
import { examResultFilename } from './services/examArtifacts.mjs';
import { createAnnotatedExamPdf } from './services/pdfArtifacts.mjs';
import { downloadFile } from './util/downloads.mjs';

const pdfjsWorker = new Worker(
  new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url), { type: 'module' }
);
GlobalWorkerOptions.workerPort = pdfjsWorker;
const scannerClient = createLazyScannerClient(() => new Worker(
  new URL('./scannerWorker.js', import.meta.url), { type: 'module' }
));
const invokeScanner = scannerClient.invoke;

export function App() {
  const [pdf, setPdf] = useState(null);
  const [pdfName, setPdfName] = useState(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [progress, setProgress] = useState(null); // null means not running
  const [scanStage, setScanStage] = useState(null);
  const [examResults, setExamResults] = useState([]);
  const [previewURI, setPreviewURI] = useState(null);
  const [comparison, setComparison] = useState({});
  const [importCSVPage1, setImportCSVPage1] = useState(1);
  const [scanIssues, setScanIssues] = useState([]);

  //const [cv, setCv] = useState(null);
  //const [templateImages, setTemplateImages] = useState([]);
  const [cfg, setCfg] = useState({
    startAt: 1,
    endAt: 1,
    twoSided: false,
    hasMarker: false,
    hasMultiAnswer: false,
    multiAnswerQuestions: {},
    answerKey: {},
    showQuestionable: true,
    showQActioned: true,
    showActioned: true
  });
  const abortRef = useRef(null);

  const currentlyScanning = progress !== null;
  const activeMultiAnswerQuestions = cfg.hasMultiAnswer
    ? Object.keys(cfg.multiAnswerQuestions ?? {}).filter(question => cfg.multiAnswerQuestions[question]).map(Number)
    : [];

  const reportScanIssue = (stage, error, page = null) => {
    const message = error instanceof Error ? error.message : `${error}`;
    console.error(`${stage}${page === null ? '' : ` (page ${page})`}:`, error);
    setScanIssues(previous => [
      ...previous,
      { stage, page, message }
    ]);
  };

  useEffect(() => scannerClient.subscribeToDiagnostics(error => {
    reportScanIssue('Scanner worker', error);
  }), []);



  const getPdfPage = async (currentPage) => {
    const page = await pdf.getPage(currentPage);
    const viewport = page.getViewport({ scale: 4 });
    const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    let ctx = canvas.getContext('2d', { willReadFrequently: true });
    await page.render({ canvasContext: ctx, viewport }).promise;
    const bmp = createImageBitmap(canvas);
    page.cleanup();
    return bmp;
  };

  const matchLoadedExamsToPDF = async newResults => {
    if (abortRef.current !== null) {
      abortRef.current.abort();
      return;
    }

    const ac = new AbortController();
    abortRef.current = ac;
    let resultIdx = 0;

    setProgress([0, newResults.length + (cfg.hasMarker ? 1 : 0)]);
    setScanStage('Preparing recognition models');
    setExamResults([]);
    try {
      await invokeScanner('initialize');
    } catch (error) {
      reportScanIssue('Could not prepare scanner', error);
      abortRef.current = null;
      setProgress(null);
      setScanStage(null);
      return;
    }
    if (ac.signal.aborted) {
      abortRef.current = null;
      setProgress(null);
      setScanStage(null);
      return;
    }
    setScanStage('Matching loaded exams to the PDF');
    if (cfg.hasMarker) {
      const confirmation = window.confirm("Scan marker page?");
      if (confirmation) {
        let bmp = await getPdfPage(cfg.startAt);
        
        const data = await invokeScanner("scan", {
          bmp,
          page: 0,
          compare: {},
          multiAnswerQuestions: activeMultiAnswerQuestions
        }, [bmp]);
        let answers = data.answer_values ?? data.answers.split('');
        if (cfg.twoSided) {
          bmp = await getPdfPage(cfg.startAt + 1);
          const data = await invokeScanner("scan", {
            bmp,
            page: 1,
            compare: {},
            multiAnswerQuestions: activeMultiAnswerQuestions
          }, [bmp]);
          answers = answers.concat(data.answer_values2 ?? data.answers2.split(''));
        }
        const answerKey = createAnswerKey(answers);
        setCfg(cfg => ({ ...cfg, answerKey }));
      }
      setProgress([1, newResults.length + 1]);
    }
    while (!ac.signal.aborted) {
      let currentPage = newResults[resultIdx].page;
      let bmp = await getPdfPage(currentPage);
      const data = await invokeScanner("scan_matrix", { bmp, page: 0 }, [bmp]);
      let result = {...newResults[resultIdx], homographies: data.homographies};
      if (cfg.twoSided) {
        bmp = await getPdfPage(currentPage + 1);
        const data = await invokeScanner("scan_matrix", { bmp, page: 1 }, [bmp]);
        result.homographies2 = data.homographies;
      }
      setExamResults(examResults => [...examResults, result]);
      resultIdx++;
      setProgress([resultIdx + (cfg.hasMarker ? 1 : 0), newResults.length + (cfg.hasMarker ? 1 : 0)]);
      if (resultIdx === newResults.length) break;
    }
    abortRef.current = null;
    setProgress(null);
    setScanStage(null);
  };

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
        await matchLoadedExamsToPDF(newResults);
      }
    } else {
      window.alert("Invalid headings; this is not a raw_results format CSV.")
    }
  };

  const scanExams = async e => {
    if (abortRef.current !== null) {
      abortRef.current.abort();
      return;
    }
    if (cfg.endAt < cfg.startAt) return;
    if (examResults.length > 0) {
      const confirmation = window.confirm("This will erase current exam scans. Are you sure?");
      if (!confirmation) return;
    }

    const { startAt, endAt, twoSided } = cfg;

    const ac = new AbortController();
    abortRef.current = ac;
    let currentPage = startAt;

    const pagesPerExam = twoSided ? 2 : 1;
    const totalPages = endAt + 1 - startAt;
    const totalExams = Math.ceil(totalPages / pagesPerExam);
    setProgress([0, totalExams]);
    setScanStage('Preparing recognition models');
    setExamResults([]);
    setScanIssues([]);

    try {
      await invokeScanner('initialize');
    } catch (error) {
      reportScanIssue('Could not prepare scanner', error);
      abortRef.current = null;
      setProgress(null);
      setScanStage(null);
      return;
    }
    if (ac.signal.aborted) {
      abortRef.current = null;
      setProgress(null);
      setScanStage(null);
      return;
    }
    setScanStage('Scanning exams');

    let answerKey = cfg.answerKey;


    while (!ac.signal.aborted) {
      try {
        let bmp = await getPdfPage(currentPage);
        let compare = {};
        if ('results' in comparison) {
          const pageOffset = (1 - comparison.cfg_firstPage);
          const result = comparison.results.get(currentPage + pageOffset);
          if (result !== undefined) {
            if (comparison.cfg_checkNumbers) compare.studentNum = result.studentNum;
            if (comparison.cfg_checkName) compare.surname = result.surname;
            if (comparison.cfg_checkInitials) compare.initial = result.initial;
            if (comparison.cfg_checkAnswers) compare.q = result.q;
          }
        }

        const result = await invokeScanner("scan", {
          bmp,
          page: 0,
          compare,
          multiAnswerQuestions: activeMultiAnswerQuestions
        }, [bmp]);
        //console.log(result);

        let { raw_answers, student_number, raw_student_number, surname, raw_surname, initials, raw_initials, diffs, homographies } = result;
        let answers = result.answer_values ?? result.answers.split('');
        let homographies2 = [];

        if (cfg.twoSided && currentPage + 1 <= endAt) {
          bmp = await getPdfPage(currentPage + 1);
          const result = await invokeScanner("scan", {
            bmp,
            page: 1,
            compare,
            multiAnswerQuestions: activeMultiAnswerQuestions
          }, [bmp]);
          //console.log(result);
          let { raw_answers2 } = result;
          const answers2 = result.answer_values2 ?? result.answers2.split('');
          homographies2 = result.homographies;
          diffs = diffs.concat(result.diffs);
          answers = answers.concat(Array(40).fill(' ')).slice(0, 40);
          answers = answers.concat(answers2);
          raw_answers = raw_answers.concat(raw_answers2);
        }

        // Is this the marker page
        if (cfg.hasMarker && currentPage === startAt) {
          // Do not store, but instead make this the new answer key
          answerKey = createAnswerKey(answers);
          setCfg(cfg => ({ ...cfg, answerKey }));
        } else {
          const new_result = {
            page: currentPage,
            student_number,
            surname,
            initials,
            answers: fixAnswers(cfg, answers),
            raw_student_number, raw_surname, raw_initials, raw_answers: raw_answers.map((ra, i) => ({ ...ra, scanned_value: answers[i] })),
            diffs,
            homographies,
            homographies2
          };
          setExamResults(prev => [
            ...prev,
            new_result
          ]);
        }
      } catch (e) {
        reportScanIssue('Could not scan exam', e, currentPage);
        // Preserve the existing behaviour: report the failure and continue with
        // the next exam instead of discarding all successfully scanned pages.
      }

      // Onto next page
      currentPage += pagesPerExam;
      if (currentPage > endAt) break;

      setProgress([Math.ceil((currentPage - startAt) / pagesPerExam), totalExams]);
    }
    // After all pages done
    abortRef.current = null;
    setProgress(null);
    setScanStage(null);
  };

  const pdfSelected = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const pdf = await getDocument({ data }).promise;
      setPdfName(file.name);
      setPdf(pdf);
      setPdfPage(1);
      setCfg(cfg => ({ ...cfg, endAt: pdf.numPages }));
      setScanIssues([]);
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
    setPreviewURI(null);
    setPdfName(null);
    setPdf(null);
  };

  // Update preview URI
  useEffect(async () => {
    if (pdf === null) return;

    const page = await pdf.getPage(pdfPage);
    const viewport = page.getViewport({ scale: 1 });
    const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const url = URL.createObjectURL(blob);
    setPreviewURI(prev => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return url;
    });

  }, [pdf, pdfPage]);

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
        <AppHeader pdfName={pdfName} resultCount={examResults.length} currentlyScanning={currentlyScanning} />

        <main class="workspace">
          <WorkspaceSection
            id="setup"
            number="1"
            eyebrow="Document"
            title="Set up the scan"
            description="Load a PDF, choose its page range and describe the answer-sheet format."
          >
            <div class="setup-layout">
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
              <div class="setup-layout__options">
                <ScannerConfig config={cfg} setConfig={setCfg} pdf={pdf} currentlyScanning={currentlyScanning} />
                <ComparisonConfig comparison={comparison} setComparison={setComparison} scannerConfig={cfg} currentlyScanning={currentlyScanning} />
              </div>
            </div>
          </WorkspaceSection>

          <WorkspaceSection
            id="answer-key"
            number="2"
            eyebrow="Marking"
            title="Configure the answer key"
            description="Select every accepted answer. Enable Multi only where the complete selected set is required."
            actions={<span class="section-count">{keyedQuestionCount} keyed</span>}
          >
            <AnswerKeyPanel cfg={cfg} setCfg={setCfg} pdf={pdf} currentlyScanning={currentlyScanning} />
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
          <ScanIssues issues={scanIssues} onDismiss={() => setScanIssues([])} />

          <WorkspaceSection
            id="results"
            number="3"
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
              examResults={examResults} setExamResults={setExamResults} />
            <QuestionableReview cfg={cfg} setCfg={setCfg}
              examResults={examResults} setExamResults={setExamResults} />
            <ExamAnalysis examResults={examResults} cfg={cfg} />
          </WorkspaceSection>

          <WorkspaceSection
            id="exports"
            number="4"
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
      </div>
    </div>
  );
}
