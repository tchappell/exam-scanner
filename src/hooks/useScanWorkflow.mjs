import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { createBrowserScannerAdapter } from '../services/browserScannerAdapter.mjs';
import { attachPdfMetadata, scanDocument } from '../services/scanWorkflow.mjs';

export function useScanWorkflow({ source, config, setConfig, scannerClient, onBatchReplaced }) {
  const [progress, setProgress] = useState(null);
  const [stage, setStage] = useState(null);
  const [results, setResults] = useState([]);
  const [issues, setIssues] = useState([]);
  const abortRef = useRef(null);

  const reportIssue = useCallback((issueStage, error, page = null, pdfName = null) => {
    const message = error instanceof Error ? error.message : `${error}`;
    console.error(`${issueStage}${page === null ? '' : ` (page ${page})`}:`, error);
    setIssues(previous => [...previous, { stage: issueStage, page, message, pdfName }]);
  }, []);

  useEffect(() => scannerClient.subscribeToDiagnostics(error => {
    reportIssue('Scanner worker', error);
  }), [reportIssue, scannerClient]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const createCallbacks = useCallback(({ useMarkerKey }) => ({
    onStage: setStage,
    onProgress: ({ completed, total }) => setProgress([completed, total]),
    onResult: result => setResults(previous => [...previous, { ...result, sourceId: source.id }]),
    onAnswerKey: useMarkerKey ? answerKey => setConfig(previous => ({ ...previous, answerKey })) : undefined,
    onIssue: issue => reportIssue(issue.stage, issue.error, issue.error?.pageNumber ?? issue.page, source.name)
  }), [reportIssue, setConfig, source]);

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
    if (!source?.pdf) return;
    const { startAt, endAt } = config;
    if (!Number.isInteger(startAt) || !Number.isInteger(endAt) || startAt < 1 || endAt < startAt || endAt > source.numPages) {
      reportIssue('Could not start scan', new Error(`Enter a page range from 1 to ${source.numPages}.`), null, source.name);
      return;
    }
    const hasBatchResults = results.some(result => result.sourceId === source.id);
    const hasOtherResults = results.some(result => result.sourceId !== source.id);
    if (hasBatchResults && !window.confirm(`Rescan ${source.name}? This replaces the reviewed results for this PDF.`)) return;

    setIssues([]);
    await run(async signal => {
      const callbacks = createCallbacks({ useMarkerKey: !hasOtherResults });
      const scanned = await scanDocument({
        scanner: createBrowserScannerAdapter({ pdf: source.pdf, scannerClient }),
        config,
        signal,
        callbacks: hasBatchResults ? { ...callbacks, onResult: undefined, onAnswerKey: undefined } : callbacks
      });
      if (hasBatchResults && !scanned.cancelled && scanned.results.length > 0) {
        const replacement = scanned.results.map(result => ({ ...result, sourceId: source.id }));
        setResults(previous => {
          const start = previous.findIndex(result => result.sourceId === source.id);
          if (start < 0) return [...previous, ...replacement];
          return [...previous.slice(0, start), ...replacement,
            ...previous.slice(start).filter(result => result.sourceId !== source.id)];
        });
        if (scanned.answerKey) callbacks.onAnswerKey?.(scanned.answerKey);
        onBatchReplaced();
      }
    });
  }, [config, createCallbacks, onBatchReplaced, reportIssue, results, run, scannerClient, source]);

  const matchLoadedExamsToPdf = useCallback(async loadedResults => {
    if (abortRef.current !== null) {
      abortRef.current.abort();
      return;
    }
    if (!source?.pdf) return;

    const scanMarker = config.hasMarker && window.confirm('Scan marker page?');
    setResults([]);
    await run(signal => attachPdfMetadata({
      scanner: createBrowserScannerAdapter({ pdf: source.pdf, scannerClient }),
      config,
      results: loadedResults,
      scanMarker,
      signal,
      callbacks: createCallbacks({ useMarkerKey: scanMarker })
    }));
  }, [config, createCallbacks, run, scannerClient, source]);

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
