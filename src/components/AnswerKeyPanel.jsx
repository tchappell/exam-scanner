import { useState } from 'preact/hooks';
import { AnswerKeyGrid } from './AnswerKeyGrid.jsx';
import {
  configuredQuestionCount,
  createAnswerSheetRequestPdf,
  scannedStudentCount
} from '../services/pdfArtifacts.mjs';
import { downloadFile } from '../util/downloads.mjs';

const EMPTY_DETAILS = {
  name: '',
  email: '',
  workPh: '',
  mobilePh: '',
  facultySchool: '',
  unitCode: '',
  examType: '',
  year: '',
  semester: '',
  description: '',
  questionCount: '',
  studentCount: '',
  comments: ''
};

const FIELD_ROWS = [
  [
    ['name', 'Name', 'text', 'Your name', 6],
    ['workPh', 'Work phone', 'text', '07 1234 5678', 3],
    ['mobilePh', 'Mobile phone', 'text', '04 1234 5678', 3]
  ],
  [
    ['email', 'QUT email', 'email', 'name@qut.edu.au', 6],
    ['facultySchool', 'Faculty/School', 'text', 'Science/Computer Science', 6]
  ],
  [
    ['unitCode', 'Unit code', 'text', 'QUT101', 3],
    ['examType', 'Exam type', 'text', 'Central Theory 1', 3],
    ['year', 'Year', 'text', '2026', 3],
    ['semester', 'Semester', 'text', 'Semester 1', 3]
  ],
  [
    ['description', 'Description', 'text', 'Programming Principles', 6],
    ['questionCount', 'Number of questions', 'number', '20', 3],
    ['studentCount', 'Number of students', 'number', '100', 3]
  ],
  [
    ['comments', 'Comments', 'text', 'Optional notes', 12]
  ]
];

function RequestField({ field, label, type, placeholder, width, value, onChange }) {
  return (
    <div class={`col-12 col-md-${width}`}>
      <div class="form-floating mb-2">
        <input type={type} class="form-control" id={field} value={value}
          placeholder={placeholder} onInput={event => onChange(event.target.value)} />
        <label htmlFor={field}>{label}</label>
      </div>
    </div>
  );
}

export function AnswerKeyPanel({ cfg, setCfg, pdf, currentlyScanning }) {
  const [requestOpen, setRequestOpen] = useState(false);
  const [details, setDetails] = useState(EMPTY_DETAILS);
  const [appendScans, setAppendScans] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  const setField = (field, value) => setDetails(previous => ({ ...previous, [field]: value }));
  const toggleRequest = () => {
    if (!requestOpen) {
      setDetails(previous => ({
        ...previous,
        year: previous.year || `${new Date().getFullYear()}`,
        questionCount: previous.questionCount || `${configuredQuestionCount(cfg.answerKey)}`,
        studentCount: previous.studentCount || `${scannedStudentCount(cfg)}`
      }));
    }
    setRequestOpen(!requestOpen);
  };

  const exportRequest = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const response = await fetch('./TAS request form and marker-1.pdf');
      if (!response.ok) throw new Error(`Could not load the TAS request form (${response.status}).`);
      const appendedPdfBytes = appendScans && pdf ? await pdf.getData() : null;
      const blob = await createAnswerSheetRequestPdf({
        config: cfg,
        details,
        templateBytes: await response.arrayBuffer(),
        appendedPdfBytes
      });
      downloadFile('out.pdf', blob);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : `${error}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <AnswerKeyGrid cfg={cfg} setCfg={setCfg} currentlyScanning={currentlyScanning} />
      <div class="card mb-4 answer-key-export">
        <button type="button" class="card-header btn btn-outline-secondary" aria-expanded={requestOpen}
          aria-controls="answer-key-request-form" onClick={toggleRequest}>
          Export PDF for exam scanning
        </button>
        {requestOpen ? (
          <div class="card-body container" id="answer-key-request-form">
            {FIELD_ROWS.map((row, rowIndex) => (
              <div class="row" key={rowIndex}>
                {row.map(([field, label, type, placeholder, width]) => (
                  <RequestField key={field} field={field} label={label} type={type}
                    placeholder={placeholder} width={width} value={details[field]}
                    onChange={value => setField(field, value)} />
                ))}
              </div>
            ))}
            <div class="row align-items-center">
              <div class="col-12 col-md-10 mb-2 mb-md-0">
                <input class="form-check-input me-2" type="checkbox" checked={appendScans && Boolean(pdf)}
                  disabled={pdf === null} id="appendScans" onChange={event => setAppendScans(event.target.checked)} />
                <label class="form-check-label" htmlFor="appendScans">Append scanned PDF</label>
              </div>
              <div class="col-12 col-md-2">
                <button type="button" class="btn btn-outline-primary w-100" disabled={exporting}
                  onClick={exportRequest}>{exporting ? 'Exporting…' : 'Export PDF'}</button>
              </div>
            </div>
            {exportError ? <div class="alert alert-danger mt-3 mb-0" role="alert">{exportError}</div> : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
