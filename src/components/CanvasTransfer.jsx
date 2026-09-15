import { useState } from 'preact/hooks';
import { calculateScore, normaliseStudentNum } from '../examDomain.mjs';
import { matchExamResultsToCanvas } from '../services/canvasMatching.mjs';
import { examResultFilename, hashBlob } from '../services/examArtifacts.mjs';
import { updateExamResult } from '../services/resultState.mjs';
import { createCSV, loadCSV } from '../util/csv.mjs';
import { addBlobToZip, createZip, downloadFile, downloadZip } from '../util/downloads.mjs';
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

function MatchCard({ children, selected, onSelect, side }) {
  return (
    <button type="button" class={`canvas-match-card ${selected ? 'is-selected' : ''}`} onClick={onSelect}>
      <span class="canvas-match-card__side">{side}</span>{children}
    </button>
  );
}

function PerStudentPdfExport({ examResults, cfg, pdf, assignment, canvasCSV, matches, marksPerQuestion, marksAreValid, createAnnotatedPdf }) {
  const [apiKey, setApiKey] = useState('');
  const [courseCode, setCourseCode] = useState('');
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
        `${calculateScore(result.answers, cfg.answerKey, multiAnswerQuestionsFor(cfg)) * marksPerQuestion}`,
        await hashBlob(blob),
        filename
      ]);
    }

    const scriptHeading = `const GRADES = ${JSON.stringify(grades, null, 2)};\n`
      + `const COURSE_ID = ${JSON.stringify(courseCode)};\n`
      + `const ASSIGNMENT_ID = ${JSON.stringify(assignmentCode)};\n`
      + `const API_KEY = ${JSON.stringify(apiKey)};\n\n`;
    addBlobToZip(zip, 'UploadMarks.js', new Blob([scriptHeading, uploadMarks]));
    await downloadZip(zip);
  };

  return (
    <div class="canvas-pdf-export">
      <h4>Annotated student PDFs</h4>
      <p>Create a ZIP containing matched student PDFs and the optional Canvas upload script.</p>
      <div class="canvas-pdf-export__fields">
        <div class="field-group">
          <label htmlFor="apiKey">Canvas API key</label>
          <input type="password" id="apiKey" value={apiKey} onInput={event => setApiKey(event.target.value)} />
        </div>
        <div class="field-group">
          <label htmlFor="courseCode">Canvas course code</label>
          <input type="number" id="courseCode" value={courseCode} onInput={event => setCourseCode(event.target.value)} />
        </div>
      </div>
      <button type="button" class="btn btn-outline-primary"
        disabled={!marksAreValid}
        onClick={exportZip}>Export PDF ZIP</button>
    </div>
  );
}

export function CanvasTransfer({ examResults, setExamResults, cfg, pdf, createAnnotatedPdf }) {
  const [canvasCSV, setCanvasCSV] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [assignmentIndex, setAssignmentIndex] = useState('-1');
  const [matchSelection, setMatchSelection] = useState(null);
  const [marksPerQuestion, setMarksPerQuestion] = useState(1);
  const { examResultMatches, unmatchedExamResults, unmatchedStudents } = matchExamResultsToCanvas(examResults, canvasCSV);

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
    setMatchSelection(null);
  };

  const clearGradebook = () => {
    setCanvasCSV(null);
    setAssignments([]);
    setAssignmentIndex('-1');
    setMatchSelection(null);
  };

  const match = (examIndex, studentIndex) => {
    updateExamResult(setExamResults, unmatchedExamResults[examIndex], {
      student_number: `${normaliseStudentNum(canvasCSV[unmatchedStudents[studentIndex]][4])}`
    });
  };

  const chooseMatch = (side, index) => {
    setMatchSelection(previous => {
      if (previous === null) return [side, index];
      if (previous[0] !== side) {
        const examIndex = side === 'exam' ? index : previous[1];
        const studentIndex = side === 'student' ? index : previous[1];
        match(examIndex, studentIndex);
      }
      return null;
    });
  };

  const selectedAssignment = assignmentIndex === '-1' ? null : assignments[Number(assignmentIndex)];
  const markValue = Number(marksPerQuestion);
  const marksAreValid = `${marksPerQuestion}`.trim() !== '' && Number.isFinite(markValue) && markValue >= 0;
  const exportCanvasCsv = () => {
    const csv = structuredClone(canvasCSV);
    for (const [examIndex, canvasIndex] of examResultMatches) {
      csv[canvasIndex][selectedAssignment.col] = calculateScore(
        examResults[examIndex].answers,
        cfg.answerKey,
        multiAnswerQuestionsFor(cfg)
      ) * markValue;
    }
    downloadFile('canvas-export.csv', new Blob([createCSV(csv)], { type: 'text/csv' }));
  };

  return (
    <section class="canvas-transfer" aria-labelledby="canvas-transfer-title">
      <div class="subsection-header">
        <div><p class="subsection-header__eyebrow">Integration</p><h3 id="canvas-transfer-title">Canvas transfer</h3></div>
        {canvasCSV ? <button type="button" class="btn btn-sm btn-outline-secondary" onClick={clearGradebook}>Remove gradebook</button> : null}
      </div>
      {!canvasCSV ? (
        <div class="canvas-upload">
          <div><strong>Load a Canvas Gradebook CSV</strong><p>Match scanned student numbers and select the assignment to update.</p></div>
          <input type="file" accept="text/csv" onChange={loadGradebook} class="form-control" id="canvasCsvUpload"
            aria-label="Submit Canvas Gradebook CSV" />
        </div>
      ) : <>
        <div class="canvas-summary">
          <div><strong>{examResults.length - unmatchedExamResults.length}</strong><span>matched exams</span></div>
          <div><strong>{unmatchedExamResults.length}</strong><span>unmatched exams</span></div>
          <div><strong>{canvasCSV.length - 3 - (examResults.length - unmatchedExamResults.length)}</strong><span>students without scans</span></div>
        </div>
        {(unmatchedExamResults.length > 0 || unmatchedStudents.length > 0) ? (
          <div class="canvas-matches">
            <p>Select one exam and one Canvas student to match them.</p>
            <div class="canvas-matches__columns">
              <div>
                <h4>Unmatched exams</h4>
                {unmatchedExamResults.map((resultIndex, index) => <MatchCard key={resultIndex} side="Exam"
                  selected={matchSelection?.[0] === 'exam' && matchSelection[1] === index}
                  onSelect={() => chooseMatch('exam', index)}>
                  Page {examResults[resultIndex].page}: {examResults[resultIndex].surname}, {examResults[resultIndex].initials}
                  <small>{examResults[resultIndex].student_number}</small>
                </MatchCard>)}
              </div>
              <div>
                <h4>Canvas students</h4>
                {unmatchedStudents.map((studentIndex, index) => <MatchCard key={studentIndex} side="Student"
                  selected={matchSelection?.[0] === 'student' && matchSelection[1] === index}
                  onSelect={() => chooseMatch('student', index)}>
                  {canvasCSV[studentIndex][0]}<small>{canvasCSV[studentIndex][4]}</small>
                </MatchCard>)}
              </div>
            </div>
          </div>
        ) : null}
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
          <div class="field-group">
            <label htmlFor="marksPerQuestion">Points per question</label>
            <input id="marksPerQuestion" type="number" min="0" step="any" value={marksPerQuestion}
              onInput={event => setMarksPerQuestion(event.target.value)} />
          </div>
          <div class="canvas-assignment__summary">
            <span>{selectedAssignment.totalMarks} assignment points</span>
            <span>{marksAreValid
              ? Object.values(cfg.answerKey).filter(answer => Object.keys(answer).length > 0).length * markValue
              : 'Invalid'} scanner points</span>
            <span>{examResultMatches.size} grades to export</span>
          </div>
          <button type="button" class="btn btn-primary" disabled={!marksAreValid} onClick={exportCanvasCsv}>Export Canvas CSV</button>
        </> : null}
      </div>

      {selectedAssignment && pdf && examResults.some(result => 'homographies' in result) ? (
        <PerStudentPdfExport examResults={examResults} cfg={cfg} pdf={pdf} assignment={selectedAssignment}
          canvasCSV={canvasCSV} matches={examResultMatches} marksPerQuestion={markValue} marksAreValid={marksAreValid}
          createAnnotatedPdf={createAnnotatedPdf} />
      ) : null}
    </section>
  );
}
