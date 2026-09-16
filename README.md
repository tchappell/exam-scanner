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
installed Microsoft Edge browser to run the recognition fixtures; it takes a
few minutes on the current development machine.

## Desktop app

The Tauri desktop app is a thin Windows shell around the same Vite build. It
does not duplicate the interface or scanner implementation, so browser and
desktop behaviour stay aligned. The web app remains the primary version.

Desktop development additionally requires the current stable Rust toolchain,
the Microsoft C++ Build Tools, and the WebView2 runtime. On a Windows 10 or 11
development machine, run:

```text
npm ci
npm run desktop:dev
```

Create the optimized application and NSIS installer with:

```text
npm run desktop:build
```

The unpackaged executable is written to
`src-tauri/target/release/exam-scanner.exe`; the installer is written under
`src-tauri/target/release/bundle/nsis/`. These generated files are ignored by
Git. The Tauri source and configuration live in `src-tauri/`.

`.github/workflows/release-desktop.yml` performs the same build on GitHub's
Windows runner and creates a draft GitHub Release containing the installer. It
runs for a `v*` tag or can be started manually from **Actions**. The application
version is kept in `package.json`, `src-tauri/Cargo.toml`, and
`src-tauri/tauri.conf.json`.

The installer is currently unsigned. Windows may therefore show a SmartScreen
warning until a suitable code-signing certificate and CI secret are configured.

### Direct Canvas transfer

The desktop app adds a **Direct Canvas** tab to the existing Canvas transfer
section. The browser version retains the gradebook CSV and upload-ZIP workflows,
and those workflows also remain available in the desktop app.

The direct workflow connects to `https://canvas.qut.edu.au` by default, then:

1. loads the signed-in user's active courses;
2. loads the selected course's assignments and active student roster;
3. matches roster integration IDs to scanned student numbers, with manual
   name-based pairing for exceptions; and
4. uploads grades, with optional annotated answer-sheet PDFs and a configurable
   student comment.

The token is held by the native Rust process rather than browser storage. If
**Remember token** is selected, it is saved in the operating system credential
store; otherwise it is retained only for the current app session. The app asks
for confirmation before an upload and reports failures per student so a partial
upload can be safely retried. PDFs created by this app use the `exam_scan_`
filename prefix; a retry reuses an identical managed attachment or replaces the
app's earlier managed attachment and comment. It does not alter unrelated Canvas
attachments or comments.

Canvas API access depends on the token holder having permission to view the
course roster and manage grades. Because automated tests do not have access to
a QUT Canvas account, the native request/parsing code is tested locally but the
first end-to-end API check must be performed with a suitable test assignment.

## GitHub Pages

The web build is deployable as a static GitHub Pages site. The workflow in
`.github/workflows/deploy-pages.yml` installs the locked dependencies, runs the
unit tests, builds `dist`, and deploys it whenever `main` is pushed. It can also
be run manually from the repository's **Actions** tab.

After pushing the repository to GitHub, enable the workflow once under
**Settings → Pages → Build and deployment** by choosing **GitHub Actions** as
the source. Vite uses relative asset paths, so the application works both at a
repository URL such as `https://USERNAME.github.io/exam-scanner/` and at a
root/custom-domain URL without a repository-name setting in the source code.

## Characterization fixture

`tests/fixtures/scan_chappeta.pdf` is a synthetic, non-student, ten-page scan used
to preserve the current recognition behaviour. Its observed output is recorded in
`tests/fixtures/scan_chappeta.expected.json`.

`tests/fixtures/mcq_2sided.pdf` is a synthetic, non-student, two-page sheet that
covers the two-sided path and all 160 answer positions. Its reviewed output is
recorded in `tests/fixtures/mcq_2sided.expected.json`.

The fast automated tests check the fixture's presence and schema. The Playwright
test runs the actual OpenCV/TensorFlow pipeline and compares student details,
answers, and questionable flags with the reviewed output.

Baseline scan settings:

- one-sided batch: pages 1-10, one page per exam, 40 answer positions
- two-sided sheet: pages 1-2, one exam, 160 answer positions

## Multi-answer questions

Enable **Contains multi-answer questions?**, then use the per-question **Multi**
button in the answer key. Single-answer and multi-answer questions can be mixed
on the same exam. A multi-answer response earns the question's mark only when
its selected set exactly matches the keyed set; incomplete answers and answers
with extra selections score zero.

Internally and in `raw_results.csv`, a selected set is stored in A-E order in
the existing question column: for example, selecting D and B is exported as
`BD` in `Q1`. This is a provisional application format because the public QUT
ACSPRI documentation does not specify the multi-response encoding used by its
`raw_results.csv`. Generic queXF multiple-choice exports use one column per
choice, so the CSV formatting remains isolated in `src/services/resultExports.mjs`
for adjustment when a real ACSPRI multi-answer export becomes available.

## Current architecture

- `src/app.jsx` coordinates scanner state and the three-step workflow without
  owning the presentation details of results, review, analysis, or exports.
- `src/components/WorkspaceSection.jsx` provides the application shell, workflow
  navigation, numbered sections, and empty states.
- `src/components/PdfSetupPanel.jsx`, `ScannerConfig.jsx`, and
  `ComparisonConfig.jsx` own the document-setup experience.
- `src/components/AnswerKeyGrid.jsx` owns the responsive 40/160-question key,
  including per-question multi-answer controls; `AnswerKeyPanel.jsx` owns the
  request-form fields and export interaction.
- `src/components/ScanProgress.jsx` and `ScanIssues.jsx` present scanner status
  without owning scanner state.
- `src/components/ExamResultsTable.jsx` owns result searching, paging, editing,
  and annotated-PDF actions; `ReviewPanels.jsx` owns comparison and uncertain-mark
  review queues.
- `src/components/ResultsFileExchange.jsx` owns CSV/JSON import and export;
  `CanvasTransfer.jsx`, `DirectCanvasTransfer.jsx`, and `CanvasRosterMatch.jsx`
  own the two Canvas workflows and their shared roster matching; and
  `ExamAnalysis.jsx` owns item statistics.
- `src/scannerWorker.js` contains the OpenCV/TensorFlow recognition pipeline.
- `src/scannerClient.mjs` owns the request/response boundary to that worker.
- `src/services/scanWorkflow.mjs` owns platform-neutral page sequencing, marker
  handling, two-sided result assembly, cancellation, and progress events.
- `src/services/browserScannerAdapter.mjs` and `browserPdfAdapter.mjs` translate
  that workflow into PDF.js, `ImageBitmap`, and Web Worker operations. A future
  Node or Tauri-native adapter can implement the same scanner operations.
- `src/hooks/useScanWorkflow.mjs` connects the neutral workflow to Preact state
  without putting recognition loops back into `app.jsx`.
- `src/examDomain.mjs` contains small, testable scoring and normalization rules.
- `src/services/` contains result-state updates, artifact naming, CSV result
  formatting, comparison imports, Canvas student matching, and PDF artifact
  generation. `pdfArtifacts.mjs` is the single boundary for request/marker PDFs
  and annotated student exams.
- `src-tauri/src/canvas.rs` is the privileged native Canvas boundary. It owns
  authenticated HTTPS requests, pagination, credential storage, comment-file
  uploads, and idempotent grade updates; the web interface cannot invoke an
  arbitrary authenticated URL.
- `src/util/csv.mjs` owns standards-compliant CSV parsing and generation;
  `src/util/downloads.mjs` centralizes browser file and ZIP downloads.
- `tools/trainer-legacy/` preserves classifier-training experiments that are not
  part of the production application.

The large UI and worker files are intentionally being split gradually. Recognition
logic should not be reorganized until its fixture can be exercised automatically.

The interface is arranged as a three-step workspace: set up the document and
key, review scans, then export or transfer results. Keep new UI
features within the component that owns their workflow step rather than adding
more presentation logic directly to `App`.

## Known limitations

- The recognition bundle is large and initial model loading may take noticeable
  time.
- The exact QUT ACSPRI CSV representation for multiple-response questions still
  needs validation against a real service export.
- Multi-answer questions currently use all-or-nothing exact-set scoring; partial
  credit policies are not implemented.
