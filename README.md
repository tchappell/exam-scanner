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
```

## Characterization fixture

`tests/fixtures/scan_chappeta.pdf` is a synthetic, non-student, ten-page scan used
to preserve the current recognition behaviour. Its observed output is recorded in
`tests/fixtures/scan_chappeta.expected.json`.

The fixture currently acts as a reviewed baseline. The fast automated tests check
its presence and schema; a future browser integration test should run the actual
OpenCV/TensorFlow pipeline and compare the stable fields with this file.

Baseline scan settings:

- pages 1–10
- one page per exam (`twoSided: false`)
- no marker page
- 40 answer positions per exam

## Current architecture

- `src/app.jsx` contains the Preact interface and most import/export workflows.
- `src/scannerWorker.js` contains the OpenCV/TensorFlow recognition pipeline.
- `src/scannerClient.mjs` owns the request/response boundary to that worker.
- `src/examDomain.mjs` contains small, testable scoring and normalization rules.
- `src/util/csv.mjs` owns standards-compliant CSV parsing and generation.

The large UI and worker files are intentionally being split gradually. Recognition
logic should not be reorganized until its fixture can be exercised automatically.

## Known limitations

- Student responses currently store one answer character per question. An answer
  key can accept alternatives, but true multiple-response answers are not yet
  represented or scanned.
- The recognition bundle is large and initial model loading may take noticeable
  time.
- The current fixture covers one-sided, 40-question sheets only.
