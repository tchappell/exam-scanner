# Exam Scanner

A browser-based scanner for QUT Test Answer Sheets. It reads scanned PDF pages,
extracts student details and answers, supports review of uncertain marks, and can
export results for further processing or transfer to Canvas.

## Development

Requirements: a current Node.js LTS release and npm.

```text
npm ci
npm run dev
```

Vite prints the local address to open in a Chromium-based browser. Recognition is
performed locally in a web worker; PDFs and student data are not uploaded by the
application.

Useful checks:

```text
npm test
npm run build
npm run test:e2e
```

`npm test` runs the fast unit tests. `npm run test:e2e` starts Vite and uses the
installed Microsoft Edge browser to run the full ten-page recognition fixture;
it takes roughly 90 seconds on the current development machine.

## Characterization fixture

`tests/fixtures/scan_chappeta.pdf` is a synthetic, non-student, ten-page scan used
to preserve the current recognition behaviour. Its observed output is recorded in
`tests/fixtures/scan_chappeta.expected.json`.

The fast automated tests check the fixture's presence and schema. The Playwright
test runs the actual OpenCV/TensorFlow pipeline and compares student details,
answers, and questionable flags with the reviewed output.

Baseline scan settings:

- pages 1–10
- one page per exam (`twoSided: false`)
- no marker page
- 40 answer positions per exam

## Current architecture

- `src/app.jsx` contains the Preact interface and most import/export workflows.
- `src/components/` contains configuration and scanner-status UI components.
- `src/scannerWorker.js` contains the OpenCV/TensorFlow recognition pipeline.
- `src/scannerClient.mjs` owns the request/response boundary to that worker.
- `src/examDomain.mjs` contains small, testable scoring and normalization rules.
- `src/services/` contains CSV result formatting, comparison imports, and Canvas
  student matching.
- `src/util/csv.mjs` owns standards-compliant CSV parsing and generation.
- `tools/trainer-legacy/` preserves classifier-training experiments that are not
  part of the production application.

The large UI and worker files are intentionally being split gradually. Recognition
logic should not be reorganized until its fixture can be exercised automatically.

## Known limitations

- Student responses currently store one answer character per question. An answer
  key can accept alternatives, but true multiple-response answers are not yet
  represented or scanned.
- The recognition bundle is large and initial model loading may take noticeable
  time.
- The current fixture covers one-sided, 40-question sheets only.
