import { useEffect, useState } from 'preact/hooks';
import { AnswerKeyGrid } from './AnswerKeyGrid.jsx';
import { MarkAllocation } from './MarkAllocation.jsx';
import { ModalDialog } from './ModalDialog.jsx';
import { configuredQuestionCount, createAnswerSheetRequestPdf, scannedStudentCount } from '../services/pdfArtifacts.mjs';
import { downloadFile } from '../util/downloads.mjs';

const EMPTY_DETAILS = {
  name: '', email: '', workPh: '', mobilePh: '', facultySchool: '', unitCode: '', examType: '',
  year: '', semester: '', description: '', questionCount: '', studentCount: '', comments: ''
};
const REMEMBERED_FIELDS = ['name', 'email', 'workPh', 'mobilePh', 'facultySchool'];
const STORAGE_KEY = 'exam-scanner.request-details.v1';
const AUTO_COMPLETE = {
  name: 'name', email: 'email', workPh: 'tel', mobilePh: 'tel', facultySchool: 'organization'
};
const FIELD_ROWS = [
  [['name', 'Name', 'text', 'Your name', 6], ['workPh', 'Work phone', 'text', '07 1234 5678', 3], ['mobilePh', 'Mobile phone', 'text', '04 1234 5678', 3]],
  [['email', 'QUT email', 'email', 'name@qut.edu.au', 6], ['facultySchool', 'Faculty/School', 'text', 'Science/Computer Science', 6]],
  [['unitCode', 'Unit code', 'text', 'QUT101', 3], ['examType', 'Exam type', 'text', 'Central Theory 1', 3], ['year', 'Year', 'text', '2026', 3], ['semester', 'Semester', 'text', 'Semester 1', 3]],
  [['description', 'Description', 'text', 'Programming Principles', 6], ['questionCount', 'Number of questions', 'number', '20', 3], ['studentCount', 'Number of students', 'number', '100', 3]],
  [['comments', 'Comments', 'text', 'Optional notes', 12]]
];

function loadRememberedDetails() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return Object.fromEntries(REMEMBERED_FIELDS.map(field => [field, saved[field] ?? '']));
  } catch {
    return {};
  }
}

function RequestField({ field, label, type, placeholder, width, value, onChange }) {
  return (
    <div class={`col-12 col-md-${width}`}>
      <div class="form-floating mb-2">
        <input type={type} class="form-control" id={field} value={value} autocomplete={AUTO_COMPLETE[field] ?? 'off'}
          placeholder={placeholder} onInput={event => onChange(event.target.value)} />
        <label htmlFor={field}>{label}</label>
      </div>
    </div>
  );
}

export function AnswerKeyPanel({ cfg, setCfg, pdf, currentlyScanning }) {
  const [requestOpen, setRequestOpen] = useState(false);
  const [details, setDetails] = useState(() => ({ ...EMPTY_DETAILS, ...loadRememberedDetails() }));
  const [rememberDetails, setRememberDetails] = useState(() => localStorage.getItem(STORAGE_KEY) !== null);
  const [manualMarks, setManualMarks] = useState(false);
  const [appendScans, setAppendScans] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  useEffect(() => {
    if (!rememberDetails) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(
      REMEMBERED_FIELDS.map(field => [field, details[field]])
    )));
  }, [details, rememberDetails]);

  const setField = (field, value) => setDetails(previous => ({ ...previous, [field]: value }));
  const openRequest = () => {
    setDetails(previous => ({
      ...previous,
      year: previous.year || `${new Date().getFullYear()}`,
      questionCount: previous.questionCount || `${configuredQuestionCount(cfg.answerKey)}`,
      studentCount: previous.studentCount || `${scannedStudentCount(cfg)}`
    }));
    setRequestOpen(true);
  };

  const exportRequest = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const response = await fetch('./TAS request form and marker-1.pdf');
      if (!response.ok) throw new Error(`Could not load the TAS request form (${response.status}).`);
      const appendedPdfBytes = appendScans && pdf ? await pdf.getData() : null;
      const blob = await createAnswerSheetRequestPdf({
        config: cfg, details, templateBytes: await response.arrayBuffer(), appendedPdfBytes
      });
      downloadFile('TAS-request.pdf', blob);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : `${error}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <MarkAllocation cfg={cfg} setCfg={setCfg} currentlyScanning={currentlyScanning}
        manualMarks={manualMarks} setManualMarks={setManualMarks} />
      <AnswerKeyGrid cfg={cfg} setCfg={setCfg} currentlyScanning={currentlyScanning} manualMarks={manualMarks} />
      <div class="answer-key-tools">
        <button type="button" class="btn btn-sm btn-link" onClick={openRequest}>Create TAS request PDF...</button>
      </div>
      <ModalDialog open={requestOpen} title="Create TAS request PDF" onClose={() => setRequestOpen(false)} size="wide">
        <div class="container-fluid" id="answer-key-request-form">
          {FIELD_ROWS.map((row, rowIndex) => (
            <div class="row" key={rowIndex}>
              {row.map(([field, label, type, placeholder, width]) => (
                <RequestField key={field} field={field} label={label} type={type} placeholder={placeholder}
                  width={width} value={details[field]} onChange={value => setField(field, value)} />
              ))}
            </div>
          ))}
          <div class="request-dialog__footer">
            <div class="request-dialog__options">
              <label class="compact-check" htmlFor="appendScans">
                <input type="checkbox" checked={appendScans && Boolean(pdf)} disabled={pdf === null} id="appendScans"
                  onChange={event => setAppendScans(event.target.checked)} />
                Append scanned PDF
              </label>
              <label class="compact-check" htmlFor="rememberRequestDetails">
                <input type="checkbox" id="rememberRequestDetails" checked={rememberDetails}
                  onChange={event => {
                    setRememberDetails(event.target.checked);
                    if (!event.target.checked) localStorage.removeItem(STORAGE_KEY);
                  }} />
                Remember contact details on this device
              </label>
            </div>
            <div class="d-flex gap-2">
              <button type="button" class="btn btn-outline-secondary" onClick={() => setRequestOpen(false)}>Cancel</button>
              <button type="button" class="btn btn-primary" disabled={exporting} onClick={exportRequest}>
                {exporting ? 'Exporting...' : 'Export PDF'}
              </button>
            </div>
          </div>
          {exportError ? <div class="alert alert-danger mt-3 mb-0" role="alert">{exportError}</div> : null}
        </div>
      </ModalDialog>
    </>
  );
}
