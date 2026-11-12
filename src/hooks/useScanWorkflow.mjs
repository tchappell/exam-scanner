import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createBrowserScannerAdapter } from '../services/browserScannerAdapter.mjs';
import {
  attachPdfMetadata, createScanRun, inferScanRun, missingScanPages, recordScanAttempt,
  scanDocument, summarizeMissingScan, validScanRange
} from '../services/scanWorkflow.mjs';

export function useScanWorkflow({ source, pdfSources = source ? [source] : [], config, setConfig, scannerClient, onBatchReplaced }) {
  const [progress, setProgress] = useState(null);
  const [stage, setStage] = useState(null);
  const [results, setResults] = useState([]);
  const [scanRuns, setScanRuns] = useState({});
  const [issues, setIssues] = useState([]);
  const abortRef = useRef(null);
  const resultsBySource = useMemo(() => {
    const grouped = new Map();
    for (const result of results) {
      if (!grouped.has(result.sourceId)) grouped.set(result.sourceId, []);
      grouped.get(result.sourceId).push(result);
    }
    return grouped;
  }, [results]);
  const getScanRun = item => Object.hasOwn(scanRuns, item.id) ? scanRuns[item.id]
    : inferScanRun(item, config, resultsBySource.get(item.id) ?? []);
  const missingScans = Object.fromEntries(pdfSources.flatMap(item => {
    const scanRun = getScanRun(item);
    if (!scanRun) return [];
    const summary = summarizeMissingScan(scanRun, resultsBySource.get(item.id) ?? []);
    if (!(summary.pendingCount || summary.failedCount || summary.markerPending || summary.markerFailed)) return [];
    const requiresSidedness = scanRun.config.twoSided !== Boolean(config.twoSided);
    return [[item.id, {
      ...summary, requiresSidedness,
      canRecover: Boolean(item.pdf) && !requiresSidedness && validScanRange(scanRun.config, item.numPages)
    }]];
  }));
  const missingScan = source && Object.hasOwn(missingScans, source.id) ? missingScans[source.id] : null;

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
    onResult: result => setResults(previous => previous.some(item => item.sourceId === source.id && Number(item.page) === result.page)
      ? previous : [...previous, { ...result, sourceId: source.id }]),
    onAnswerKey: useMarkerKey ? answerKey => setConfig(previous => ({ ...previous, answerKey })) : undefined,
    onIssue: issue => reportIssue(issue.stage, issue.error, issue.error?.pageNumber ?? issue.page, source.name)
  }), [reportIssue, setConfig, source]);

  const saveRun = useCallback(scanRun => {
    setScanRuns(previous => previous[source.id] === scanRun ? previous : { ...previous, [source.id]: scanRun });
  }, [source]);

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
    if (!validScanRange(config, source.numPages)) {
      reportIssue('Could not start scan', new Error(`Enter a page range from 1 to ${source.numPages}.`), null, source.name);
      return;
    }
    const hasBatchResults = results.some(result => result.sourceId === source.id);
    const hasOtherResults = results.some(result => result.sourceId !== source.id);
    if (hasBatchResults && !window.confirm(`Rescan ${source.name}? This replaces the reviewed results for this PDF.`)) return;

    setIssues([]);
    await run(async signal => {
      const callbacks = createCallbacks({ useMarkerKey: !hasOtherResults });
      let nextRun = createScanRun(config);
      if (!hasBatchResults) saveRun(nextRun);
      const onAttempt = attempt => {
        nextRun = recordScanAttempt(nextRun, attempt);
        if (!hasBatchResults) saveRun(nextRun);
      };
      const scanned = await scanDocument({
        scanner: createBrowserScannerAdapter({ pdf: source.pdf, scannerClient }),
        config: nextRun.config,
        signal,
        callbacks: hasBatchResults
          ? { ...callbacks, onAttempt, onResult: undefined, onAnswerKey: undefined }
          : { ...callbacks, onAttempt }
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
        saveRun(nextRun);
        onBatchReplaced?.();
      }
    });
  }, [config, createCallbacks, onBatchReplaced, reportIssue, results, run, saveRun, scannerClient, source]);

  const scanMissingPapers = async () => {
    if (abortRef.current !== null || !missingScan?.canRecover) return;

    let nextRun = getScanRun(source);
    const hasKey = Object.keys(config.answerKey ?? {}).length > 0;
    const useMarkerKey = !hasKey && !results.some(result => result.sourceId !== source.id);
    if (!useMarkerKey && (missingScan.markerPending || missingScan.markerFailed)) {
      nextRun = recordScanAttempt(nextRun, { frontPage: nextRun.config.startAt, status: 'skipped' });
    }
    saveRun(nextRun);
    const pages = missingScanPages(nextRun, resultsBySource.get(source.id) ?? []);
    setIssues([]);
    if (!pages.length) return;

    await run(signal => scanDocument({
      scanner: createBrowserScannerAdapter({ pdf: source.pdf, scannerClient }),
      config: nextRun.config,
      pages,
      signal,
      callbacks: {
        ...createCallbacks({ useMarkerKey }),
        onAttempt: attempt => {
          nextRun = recordScanAttempt(nextRun, attempt);
          saveRun(nextRun);
        }
      }
    }));
  };

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
    scanRuns,
    setScanRuns,
    missingScans,
    missingScan,
    issues,
    clearIssues: () => setIssues([]),
    reportIssue,
    currentlyScanning: progress !== null,
    scanExams,
    scanMissingPapers,
    matchLoadedExamsToPdf
  };
}
