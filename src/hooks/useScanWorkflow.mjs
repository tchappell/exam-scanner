import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { createBrowserScannerAdapter } from '../services/browserScannerAdapter.mjs';
import { attachPdfMetadata, scanDocument } from '../services/scanWorkflow.mjs';

export function useScanWorkflow({ pdf, config, setConfig, comparison, scannerClient }) {
  const [progress, setProgress] = useState(null);
  const [stage, setStage] = useState(null);
  const [results, setResults] = useState([]);
  const [issues, setIssues] = useState([]);
  const abortRef = useRef(null);

  const reportIssue = useCallback((issueStage, error, page = null) => {
    const message = error instanceof Error ? error.message : `${error}`;
    console.error(`${issueStage}${page === null ? '' : ` (page ${page})`}:`, error);
    setIssues(previous => [...previous, { stage: issueStage, page, message }]);
  }, []);

  useEffect(() => scannerClient.subscribeToDiagnostics(error => {
    reportIssue('Scanner worker', error);
  }), [reportIssue, scannerClient]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const createCallbacks = useCallback(() => ({
    onStage: setStage,
    onProgress: ({ completed, total }) => setProgress([completed, total]),
    onResult: result => setResults(previous => [...previous, result]),
    onAnswerKey: answerKey => setConfig(previous => ({ ...previous, answerKey })),
    onIssue: issue => reportIssue(issue.stage, issue.error, issue.error?.pageNumber ?? issue.page)
  }), [reportIssue, setConfig]);

  const run = useCallback(async operation => {
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await operation(controller.signal);
    } catch (error) {
      reportIssue('Scanner workflow failed', error);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setProgress(null);
        setStage(null);
      }
    }
  }, [reportIssue]);

  const scanExams = useCallback(async () => {
    if (abortRef.current !== null) {
      abortRef.current.abort();
      return;
    }
    if (!pdf || config.endAt < config.startAt) return;
    if (results.length > 0 && !window.confirm('This will erase current exam scans. Are you sure?')) return;

    setResults([]);
    setIssues([]);
    await run(signal => scanDocument({
      scanner: createBrowserScannerAdapter({ pdf, scannerClient }),
      config,
      comparison,
      signal,
      callbacks: createCallbacks()
    }));
  }, [comparison, config, createCallbacks, pdf, results.length, run, scannerClient]);

  const matchLoadedExamsToPdf = useCallback(async loadedResults => {
    if (abortRef.current !== null) {
      abortRef.current.abort();
      return;
    }
    if (!pdf) return;

    const scanMarker = config.hasMarker && window.confirm('Scan marker page?');
    setResults([]);
    await run(signal => attachPdfMetadata({
      scanner: createBrowserScannerAdapter({ pdf, scannerClient }),
      config,
      results: loadedResults,
      scanMarker,
      signal,
      callbacks: createCallbacks()
    }));
  }, [config, createCallbacks, pdf, run, scannerClient]);

  return {
    progress,
    stage,
    results,
    setResults,
    issues,
    clearIssues: () => setIssues([]),
    reportIssue,
    currentlyScanning: progress !== null,
    scanExams,
    matchLoadedExamsToPdf
  };
}
