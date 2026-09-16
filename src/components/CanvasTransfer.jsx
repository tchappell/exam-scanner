import { useState } from 'preact/hooks';
import { calculateMaximumScore, calculateScore } from '../examDomain.mjs';
import { isDesktopApp } from '../services/canvasDesktop.mjs';
import { matchExamResultsToCanvas } from '../services/canvasMatching.mjs';
import { examResultFilename, hashBlob } from '../services/examArtifacts.mjs';
import { createCSV, loadCSV } from '../util/csv.mjs';
import { addBlobToZip, createZip, downloadFile, downloadZip } from '../util/downloads.mjs';
import { CanvasRosterMatch } from './CanvasRosterMatch.jsx';
import { DirectCanvasTransfer } from './DirectCanvasTransfer.jsx';
import uploadMarks from '../uploadMarks.txt?raw';

const multiAnswerQuestionsFor = cfg => cfg.hasMultiAnswer ? (cfg.multiAnswerQuestions ?? {}) : {};

function findAssignments(csv) {
  const assignments = [];
  for (let column = 6; column < csv[2].length; column++) {
    if (csv[2][column].trimEnd() !== '' && !Number.isNaN(Number(csv[2][column]))) {
      assignments.push({
        col: column,
        fullName: csv[0][column],
        name: csv[0][column].replace(/ \([0-9]+\)$/, ''),
        totalMarks: Number.parseInt(csv[2][column], 10)
      });
    }
  }
  return assignments;
}

function isCanvasGradebook(csv) {
  return ['Student', 'ID', 'SIS User ID', 'SIS Login ID', 'Integration ID', 'Section']
    .every((heading, index) => csv[0]?.[index] === heading);
}

const DEFAULT_COMMENT = 'Your marked test answer sheet is attached. Please contact the teaching team if you believe any response has been recorded incorrectly.';

function PerStudentPdfExport({ examResults, cfg, pdf, assignment, canvasCSV, matches, createAnnotatedPdf }) {
  const [apiKey, setApiKey] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [attachPdf, setAttachPdf] = useState(true);
  const [includeComment, setIncludeComment] = useState(true);
  const [comment, setComment] = useState(DEFAULT_COMMENT);
  const assignmentCodePart = assignment.fullName.split('(').at(-1);
  const assignmentCode = Number.parseInt(assignmentCodePart.slice(0, -1), 10);

  const exportZip = async () => {
    const { PDFDocument } = await import('pdf-lib');
    const filenames = new Set();
    const zip = await createZip('ExamPDFs.zip');
    const sourceDocument = await PDFDocument.load(await pdf.getData());
    const grades = [];

    for (let index = 0; index < examResults.length; index++) {
      const canvasIndex = matches.get(index);
      if (typeof canvasIndex === 'undefined') continue;
      const result = examResults[index];
      if (!('homographies' in result)) continue;

      const baseName = examResultFilename(result);
      let filename = baseName;
      for (let suffix = 2; filenames.has(filename); suffix++) filename = `${baseName}-${suffix}`;
      filenames.add(filename);
      filename += '.pdf';

      const blob = await createAnnotatedPdf(cfg, result, sourceDocument);
      addBlobToZip(zip, filename, blob);
      grades.push([
        canvasCSV[canvasIndex][1],
        `${calculateScore(result.answers, cfg.answerKey, multiAnswerQuestionsFor(cfg), cfg.marking)}`,
        (await hashBlob(blob)).slice(0, 8),
        filename
      ]);
    }

    const scriptHeading = `const GRADES = ${JSON.stringify(grades, null, 2)};\n`
      + `const COURSE_ID = ${JSON.stringify(courseCode)};\n`
      + `const ASSIGNMENT_ID = ${JSON.stringify(assignmentCode)};\n`
      + `const API_KEY = ${JSON.stringify(apiKey)};\n\n`;
    const scriptOptions = `const ATTACH_PDFS = ${JSON.stringify(attachPdf)};\n`
      + `const INCLUDE_COMMENT = ${JSON.stringify(includeComment)};\n`
      + `const COMMENT = ${JSON.stringify(comment)};\n\n`;
    addBlobToZip(zip, 'UploadMarks.js', new Blob([scriptHeading, scriptOptions, uploadMarks]));
    await downloadZip(zip);
  };

  return (
    <div class="canvas-pdf-export">
      <h4>Annotated student PDFs</h4>
      <p>Create a ZIP containing matched student PDFs and the optional Canvas upload script.</p>
      <div class="canvas-pdf-export__fields">
        <div class="field-group">
          <label htmlFor="apiKey">Canvas API key</label>
          <input type="password" id="apiKey" autocomplete="off" value={apiKey} onInput={event => setApiKey(event.target.value)} />
        </div>
        <div class="field-group">
          <label htmlFor="courseCode">Canvas course code</label>
          <input type="number" id="courseCode" value={courseCode} onInput={event => setCourseCode(event.target.value)} />
        </div>
      </div>
      <div class="canvas-upload-options">
        <label class="compact-check"><input type="checkbox" checked={attachPdf}
          onChange={event => setAttachPdf(event.target.checked)} />Attach marked PDF</label>
        <label class="compact-check"><input type="checkbox" checked={attachPdf && includeComment} disabled={!attachPdf}
          onChange={event => setIncludeComment(event.target.checked)} />Include message</label>
        {includeComment ? <div class="field-group canvas-comment-field">
          <label htmlFor="canvasComment">Message to student</label>
          <textarea id="canvasComment" rows="3" value={comment} onInput={event => setComment(event.target.value)} />
        </div> : null}
      </div>
      {!attachPdf ? <p class="form-text">The upload script will update grades only.</p> : null}
      <p class="form-text">The API key is written only into the downloaded script; this web app never stores it.</p>
      <button type="button" class="btn btn-outline-primary" onClick={exportZip}>Export upload ZIP</button>
    </div>
  );
}

export function CanvasTransfer({ examResults, setExamResults, cfg, pdf, createAnnotatedPdf }) {
  const desktopApp = isDesktopApp();
  const [mode, setMode] = useState(desktopApp ? 'direct' : 'csv');
  const [canvasCSV, setCanvasCSV] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [assignmentIndex, setAssignmentIndex] = useState('-1');
  const matchResult = matchExamResultsToCanvas(examResults, canvasCSV);
  const { examResultMatches } = matchResult;

  const loadGradebook = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const csv = await loadCSV(file);
    if (!isCanvasGradebook(csv)) {
      window.alert('Not a valid Canvas Gradebook CSV.');
      return;
    }
    setCanvasCSV(csv);
    setAssignments(findAssignments(csv));
    setAssignmentIndex('-1');
  };

  const clearGradebook = () => {
    setCanvasCSV(null);
    setAssignments([]);
    setAssignmentIndex('-1');
  };

  const selectedAssignment = assignmentIndex === '-1' ? null : assignments[Number(assignmentIndex)];
  const exportCanvasCsv = () => {
    const csv = structuredClone(canvasCSV);
    for (const [examIndex, canvasIndex] of examResultMatches) {
      csv[canvasIndex][selectedAssignment.col] = calculateScore(
        examResults[examIndex].answers,
        cfg.answerKey,
        multiAnswerQuestionsFor(cfg),
        cfg.marking
      );
    }
    downloadFile('canvas-export.csv', new Blob([createCSV(csv)], { type: 'text/csv' }));
  };

  return (
    <section class="canvas-transfer" aria-labelledby="canvas-transfer-title">
      <div class="subsection-header">
        <div><p class="subsection-header__eyebrow">Integration</p><h3 id="canvas-transfer-title">Canvas transfer</h3></div>
        {mode === 'csv' && canvasCSV ? <button type="button" class="btn btn-sm btn-outline-secondary" onClick={clearGradebook}>Remove gradebook</button> : null}
      </div>
      {desktopApp ? <div class="canvas-transfer-tabs" role="tablist" aria-label="Canvas transfer method">
        <button type="button" role="tab" aria-selected={mode === 'direct'} class={mode === 'direct' ? 'is-active' : ''}
          onClick={() => setMode('direct')}>Direct Canvas</button>
        <button type="button" role="tab" aria-selected={mode === 'csv'} class={mode === 'csv' ? 'is-active' : ''}
          onClick={() => setMode('csv')}>Gradebook CSV and upload ZIP</button>
      </div> : null}

      {mode === 'direct' ? <DirectCanvasTransfer examResults={examResults} setExamResults={setExamResults}
        cfg={cfg} pdf={pdf} createAnnotatedPdf={createAnnotatedPdf} /> : <>
      {!canvasCSV ? (
        <div class="canvas-upload">
          <div><strong>Load a Canvas Gradebook CSV</strong><p>Match scanned student numbers and select the assignment to update.</p></div>
          <input type="file" accept="text/csv" onChange={loadGradebook} class="form-control" id="canvasCsvUpload"
            aria-label="Submit Canvas Gradebook CSV" />
        </div>
      ) : <>
        <CanvasRosterMatch examResults={examResults} setExamResults={setExamResults} canvasCSV={canvasCSV} matchResult={matchResult} />
      </>}

      <div class="canvas-assignment">
        <div class="field-group">
          <label htmlFor="selectAssessmentItem">Assessment item</label>
          <select class={assignmentIndex === '-1' ? 'fst-italic' : ''} value={assignmentIndex}
            id="selectAssessmentItem" onChange={event => setAssignmentIndex(event.target.value)}>
            <option value="-1">(no assignment selected)</option>
            {assignments.map((assignment, index) => <option class="fst-normal" key={assignment.col} value={index}>{assignment.name}</option>)}
          </select>
        </div>
        {selectedAssignment ? <>
          <div class="canvas-assignment__summary">
            <span>{selectedAssignment.totalMarks} assignment points</span>
            <span>{calculateMaximumScore(cfg.answerKey, cfg.marking)} scanner points</span>
            <span>{examResultMatches.size} grades to export</span>
          </div>
          <button type="button" class="btn btn-primary" onClick={exportCanvasCsv}>Export Canvas CSV</button>
        </> : null}
      </div>

      {selectedAssignment && pdf && examResults.some(result => 'homographies' in result) ? (
        <PerStudentPdfExport examResults={examResults} cfg={cfg} pdf={pdf} assignment={selectedAssignment}
          canvasCSV={canvasCSV} matches={examResultMatches} createAnnotatedPdf={createAnnotatedPdf} />
      ) : null}
      </>}
    </section>
  );
}
