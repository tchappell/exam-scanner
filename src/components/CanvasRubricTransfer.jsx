import { useMemo, useState } from 'preact/hooks';

import { calculateScore } from '../examDomain.mjs';
import {
  countExistingRubricPoints,
  findRubricCriteria,
  isCanvasRubricAssessment,
  matchExamResultsToRubric,
  writeRubricPoints
} from '../services/canvasRubricAssessment.mjs';
import { createCSV, loadCSV } from '../util/csv.mjs';
import { downloadFile } from '../util/downloads.mjs';

const multiAnswerQuestionsFor = cfg => cfg.hasMultiAnswer ? (cfg.multiAnswerQuestions ?? {}) : {};

function exportFilename(filename) {
  const stem = filename.replace(/\.csv$/i, '') || 'rubric-assessments';
  return `${stem}-with-mcq-scores.csv`;
}

export function CanvasRubricTransfer({ examResults, cfg, gradebookCsv, gradebookMatches }) {
  const [rubricCsv, setRubricCsv] = useState(null);
  const [rubricFilename, setRubricFilename] = useState('');
  const [criterionColumn, setCriterionColumn] = useState('-1');

  const criteria = rubricCsv ? findRubricCriteria(rubricCsv) : [];
  const matchResult = useMemo(() => rubricCsv
    ? matchExamResultsToRubric({ gradebookCsv, rubricCsv, examResultMatches: gradebookMatches })
    : { examResultMatches: new Map(), missingExamResults: [], duplicateStudentIds: [] },
  [gradebookCsv, gradebookMatches, rubricCsv]);
  const rubricMatches = matchResult.examResultMatches;
  const selectedColumn = criterionColumn === '-1' ? null : Number(criterionColumn);
  const existingValues = selectedColumn === null
    ? 0
    : countExistingRubricPoints(rubricCsv, selectedColumn, rubricMatches);

  const loadRubric = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const csv = await loadCSV(file);
    if (!isCanvasRubricAssessment(csv)) {
      window.alert('Not a valid Canvas rubric-assessment CSV. The file must contain Student Id and at least one criterion Points column.');
      event.target.value = '';
      return;
    }
    const loadedCriteria = findRubricCriteria(csv);
    setRubricCsv(csv);
    setRubricFilename(file.name);
    setCriterionColumn(loadedCriteria.length === 1 ? `${loadedCriteria[0].pointsColumn}` : '-1');
  };

  const clearRubric = () => {
    setRubricCsv(null);
    setRubricFilename('');
    setCriterionColumn('-1');
  };

  const exportRubric = () => {
    if (selectedColumn === null) return;
    const pointsByExam = new Map();
    for (const examIndex of rubricMatches.keys()) {
      pointsByExam.set(examIndex, calculateScore(
        examResults[examIndex].answers,
        cfg.answerKey,
        multiAnswerQuestionsFor(cfg),
        cfg.marking
      ));
    }
    const output = writeRubricPoints(rubricCsv, selectedColumn, rubricMatches, pointsByExam);
    downloadFile(exportFilename(rubricFilename), new Blob([createCSV(output)], { type: 'text/csv' }));
  };

  return <div class="canvas-rubric-export">
    <div class="canvas-rubric-export__header">
      <div>
        <span class="canvas-rubric-export__badge">Recommended for mixed-format exams</span>
        <h4>Enhanced Rubrics assessment CSV</h4>
        <p>Write MCQ scores into one rubric criterion. The Gradebook above supplies the QUT-to-Canvas student matching.</p>
      </div>
      {rubricCsv ? <button type="button" class="btn btn-sm btn-outline-secondary" onClick={clearRubric}>Remove rubric CSV</button> : null}
    </div>

    {!rubricCsv ? <input type="file" accept="text/csv" onChange={loadRubric} class="form-control"
      id="canvasRubricCsvUpload" aria-label="Submit Canvas rubric-assessment CSV" /> : <>
      <div class="canvas-rubric-export__file"><strong>{rubricFilename}</strong><span>{criteria.length} scored {criteria.length === 1 ? 'criterion' : 'criteria'} found</span></div>
      <div class="canvas-rubric-export__controls">
        <div class="field-group">
          <label htmlFor="selectRubricCriterion">MCQ rubric criterion</label>
          <select id="selectRubricCriterion" class={criterionColumn === '-1' ? 'fst-italic' : ''}
            value={criterionColumn} onChange={event => setCriterionColumn(event.target.value)}>
            <option value="-1">(select a criterion)</option>
            {criteria.map(criterion => <option class="fst-normal" key={criterion.pointsColumn}
              value={criterion.pointsColumn}>{criterion.name}</option>)}
          </select>
        </div>
        <div class="canvas-assignment__summary">
          <span>{rubricMatches.size} scores to export</span>
          <span>{existingValues} existing {existingValues === 1 ? 'score' : 'scores'} replaced</span>
          {matchResult.missingExamResults.length > 0
            ? <span>{matchResult.missingExamResults.length} matched {matchResult.missingExamResults.length === 1 ? 'exam is' : 'exams are'} absent from this rubric CSV</span>
            : null}
          {matchResult.duplicateStudentIds.length > 0
            ? <span>{matchResult.duplicateStudentIds.length} duplicate Canvas {matchResult.duplicateStudentIds.length === 1 ? 'ID was' : 'IDs were'} skipped</span>
            : null}
        </div>
        <button type="button" class="btn btn-primary" disabled={selectedColumn === null || rubricMatches.size === 0}
          onClick={exportRubric}>Export rubric assessment CSV</button>
      </div>
      <p class="form-text">Only the selected Points column is changed. Canvas recalculates Scale ratings when the file is imported.</p>
    </>}
  </div>;
}
