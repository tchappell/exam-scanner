import { Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import 'pdfjs-dist/build/pdf.worker.mjs';
import { loadCSV, createCSV } from './util/csv.mjs';
import {
  ANSWER_OPTIONS,
  answerIncludes,
  calculateScore,
  createAnswerKey,
  fixAnswers,
  isAnswerCorrect,
  normaliseAnswer,
  normaliseStudentNum,
  updateAnswer
} from './examDomain.mjs';
import { createLazyScannerClient } from './scannerClient.mjs';
import { ScanIssues } from './components/ScanIssues.jsx';
import { ScannerConfig } from './components/ScannerConfig.jsx';
import { ComparisonConfig } from './components/ComparisonConfig.jsx';
import { AnswerKeyGrid } from './components/AnswerKeyGrid.jsx';
import { AppHeader, EmptyState, WorkspaceSection } from './components/WorkspaceSection.jsx';
import { PdfSetupPanel } from './components/PdfSetupPanel.jsx';
import { ScanProgress } from './components/ScanProgress.jsx';
import { matchExamResultsToCanvas } from './services/canvasMatching.mjs';
import { buildRawResultsCsvRows, buildResultsCsvRows } from './services/resultExports.mjs';
import uploadMarks from './uploadMarks.txt?raw';

const pdfjsWorker = new Worker(
  new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url), { type: 'module' }
);
GlobalWorkerOptions.workerPort = pdfjsWorker;
const scannerClient = createLazyScannerClient(() => new Worker(
  new URL('./scannerWorker.js', import.meta.url), { type: 'module' }
));
const invokeScanner = scannerClient.invoke;

const range = (st, ed = null) => ed === null ? [...Array(st).keys()] : [...(Array(ed - st).keys().map(v => v + st))];
const multiAnswerQuestionsFor = cfg => cfg.hasMultiAnswer ? (cfg.multiAnswerQuestions ?? {}) : {};
const ANSWER_COMBINATIONS = [
  ' ',
  ...Array.from({ length: 31 }, (_, mask) => ANSWER_OPTIONS
    .filter((_, option) => ((mask + 1) & (1 << option)) !== 0)
    .join(''))
    .sort((left, right) => left.length - right.length || left.localeCompare(right))
];

function AnswerKey({ cfg, setCfg, pdf, currentlyScanning }) {
  const [exportPdfOpen, setExportPdfOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [workPh, setWorkPh] = useState('');
  const [mobilePh, setMobilePh] = useState('');
  const [facultySchool, setFacultySchool] = useState('');
  const [unitCode, setUnitCode] = useState('');
  const [examType, setExamType] = useState('');
  const [year, setYear] = useState('');
  const [sem, setSem] = useState('');
  const [desc, setDesc] = useState('');
  const [num, setNum] = useState('');
  const [students, setStudents] = useState('');
  const [comments, setComments] = useState('');
  const [appendScans, setAppendScans] = useState(false);

  const options = ANSWER_OPTIONS;

  const exportPdf = async e => {
    const [{ PDFDocument, rgb, StandardFonts }, buffer] = await Promise.all([
      import('pdf-lib'),
      fetch('./TAS request form and marker-1.pdf').then(res => {
        if (!res.ok) throw new Error(`Could not load the TAS request form (${res.status}).`);
        return res.arrayBuffer();
      })
    ]);
    const pdfDoc = await PDFDocument.load(buffer);
    const form = pdfDoc.getForm();

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const pages = pdfDoc.getPages();
    const firstPage = pages[0];

    const size = 12;
    const color = rgb(0, 0, 0);

    // Name: 90,237
    firstPage.drawText(name, { x: 90, y: 841 - 236, size, font, color });
    firstPage.drawText(email, { x: 120, y: 841 - 256, size, font, color });
    firstPage.drawText(facultySchool, { x: 140, y: 841 - 277, size, font, color });
    firstPage.drawText(workPh, { x: 444, y: 841 - 236, size, font, color });
    firstPage.drawText(mobilePh, { x: 452, y: 841 - 256, size, font, color });
    firstPage.drawText(unitCode, { x: 110, y: 841 - 341, size, font, color });
    firstPage.drawText(examType, { x: 234, y: 841 - 341, size, font, color });
    firstPage.drawText(year, { x: 362, y: 841 - 341, size, font, color });
    firstPage.drawText(sem, { x: 468, y: 841 - 341, size, font, color });
    firstPage.drawText(desc, { x: 118, y: 841 - 362, size, font, color });
    firstPage.drawText(num, { x: 241, y: 841 - 404, size, font, color });
    firstPage.drawText(students, { x: 493, y: 841 - 404, size, font, color });

    const commentsField = form.getTextField("comments");
    const taIncludedField = form.getCheckBox("test_answer_included");
    const maIncludedField = form.getCheckBox("master_answer_included");
    const acknowledgeField = form.getCheckBox("acknowledgement");
    commentsField.setFontSize(size);
    commentsField.setText(comments);
    taIncludedField.check();
    maIncludedField.check();
    acknowledgeField.check();

    const { width, height } = pages[2].getSize();

    const scale = 16.667834;
    const xstarts = [768, 3134, 5497, 7859];
    const ystarts = [9449, 1225, 5361, 9496];
    const xstep = 377;
    const ystep = 378.555555;
    const rad = 88;
    for (let q = 0; q < 160; q++) {
      if (q in cfg.answerKey) {
        for (let opt = 0; opt < 5; opt++) {
          if (cfg.answerKey[q]?.[options[opt]]) {
            let pg, row, col, x, y;
            if (q < 40) { // First page
              pg = 2;
              row = q % 10;
              col = Math.floor(q / 10);
              x = xstarts[col] + xstep * opt;
              y = ystarts[0] + ystep * row;
            } else { // Second page
              pg = 3;
              row = (q - 40) % 30;
              col = Math.floor((q - 40) / 30);
              x = xstarts[col] + xstep * opt;
              y = ystarts[Math.floor(row / 10) + 1] + ystep * (row % 10);
            }
            pages[pg].drawCircle({ x: x / scale, y: height - y / scale, size: rad / scale, color });

          }
        }
      }

      //qnum in cfg.answerKey && opt in cfg.answerKey[qnum] && cfg.answerKey[qnum][opt]


    }

    if (appendScans && pdf) {
      const appendDoc = await PDFDocument.load(await pdf.getData());
      const pages = [];
      let startAt = cfg.startAt - 1;
      let endAt = cfg.endAt - 1;
      // Skip over marker sheet(s) if they exist
      if (cfg.hasMarker) startAt += cfg.twoSided ? 2 : 1;

      for (let i = startAt; i <= endAt; i++) {
        pages.push(i);
      }
      const copiedPages = await pdfDoc.copyPages(appendDoc, pages);
      for (const copiedPage of copiedPages) {
        pdfDoc.addPage(copiedPage);
      }
    }
    if (!cfg.twoSided) {
      pdfDoc.removePage(3); // Remove second answers page
      pdfDoc.removePage(1); // Remove intentionally blank page
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes]);
    download_file("out.pdf", blob);
  };

  return (<>
    <AnswerKeyGrid cfg={cfg} setCfg={setCfg} currentlyScanning={currentlyScanning} />
    <div class="row">
      <div class="col-12">
        <div class="card mb-4">
          <div class="card-header btn btn-outline-secondary" onClick={e => setExportPdfOpen(v => {
            if (v === false) {
              let num_questions = Math.max(...(Object.keys(cfg.answerKey).filter(k => Object.values(cfg.answerKey[k]).filter(v => v).length > 0).map(v => Number.parseInt(v)))) + 1;
              setYear(v => v || `${(new Date()).getFullYear()}`);
              setNum(v => v || `${num_questions}`);
              const pagesPerExam = cfg.twoSided ? 2 : 1;
              setStudents(v => v || `${(cfg.endAt - cfg.startAt + 1) / pagesPerExam - (cfg.hasMarker ? 1 : 0)}`);


              return true;
            } else {
              return false;
            }
          })}>
            Export PDF for Exam Scanning
          </div>
          {exportPdfOpen ?
            <div class="card-body container">
              <div class="row">
                <div class="col-6"><div class="form-floating mb-2">
                  <input type="text" class="form-control" id="name" value={name} placeholder="Your Name Here" onInput={e => setName(e.target.value)} />
                  <label for="name">Name</label>
                </div></div>
                <div class="col-3"><div class="form-floating mb-2">
                  <input type="text" class="form-control" id="workPh" value={workPh} placeholder="07 1234 5678" onInput={e => setWorkPh(e.target.value)} />
                  <label for="workPh">Work Ph</label>
                </div></div>
                <div class="col-3"><div class="form-floating mb-2">
                  <input type="text" class="form-control" id="mobilePh" value={mobilePh} placeholder="04 1234 5678" onInput={e => setMobilePh(e.target.value)} />
                  <label for="mobilePh">Mobile Ph</label>
                </div></div>
              </div>
              <div class="row">
                <div class="col-6"><div class="form-floating mb-2">
                  <input type="email" class="form-control" id="email" value={email} placeholder="email@example.com" onInput={e => setEmail(e.target.value)} />
                  <label for="email">QUT Email</label>
                </div></div>
                <div class="col-6"><div class="form-floating mb-2">
                  <input type="text" class="form-control" id="facultySchool" value={facultySchool} placeholder="Science/Computer Science" onInput={e => setFacultySchool(e.target.value)} />
                  <label for="facultySchool">Faculty/School</label>
                </div></div>
              </div>
              <div class="row">
                <div class="col-3"><div class="form-floating mb-2">
                  <input type="text" class="form-control" id="unitCode" value={unitCode} placeholder="QUT101" onInput={e => setUnitCode(e.target.value)} />
                  <label for="unitCode">Unit Code</label>
                </div></div>
                <div class="col-3"><div class="form-floating mb-2">
                  <input type="text" class="form-control" id="examType" value={examType} placeholder="Central Theory 1" onInput={e => setExamType(e.target.value)} />
                  <label for="examType">Exam Type</label>
                </div></div>
                <div class="col-3"><div class="form-floating mb-2">
                  <input type="text" class="form-control" id="year" value={year} placeholder="2025" onInput={e => setYear(e.target.value)} />
                  <label for="year">Year</label>
                </div></div>
                <div class="col-3"><div class="form-floating mb-2">
                  <input type="text" class="form-control" id="sem" value={sem} placeholder="Semester 1" onInput={e => setSem(e.target.value)} />
                  <label for="sem">Semester</label>
                </div></div>
              </div>
              <div class="row">
                <div class="col-6"><div class="form-floating mb-2">
                  <input type="text" class="form-control" id="desc" value={desc} placeholder="Programming Principles" onInput={e => setDesc(e.target.value)} />
                  <label for="desc">Description</label>
                </div></div>
                <div class="col-3"><div class="form-floating mb-2">
                  <input type="number" class="form-control" id="num" value={num} placeholder="20" onInput={e => setNum(e.target.value)} />
                  <label for="num"># of questions</label>
                </div></div>
                <div class="col-3"><div class="form-floating mb-2">
                  <input type="number" class="form-control" id="students" value={students} placeholder="Your Name Here" onInput={e => setStudents(e.target.value)} />
                  <label for="students"># of students</label>
                </div></div>
              </div>
              <div class="row">
                <div class="col-12"><div class="form-floating mb-2">
                  <input type="text" class="form-control" id="comments" value={comments} placeholder="Your Name Here" onInput={e => setComments(e.target.value)} />
                  <label for="comments">Comments</label>
                </div></div>
              </div>
              <div class="row">
                <div class="col-10">
                  <input class="form-check-input me-2" type="checkbox" checked={appendScans && !!pdf} disabled={pdf === null} id="appendScans" onChange={e => setAppendScans(e.target.checked)} />
                  <label class="form-check-label" for="appendScans">
                    Append scanned PDF
                  </label>
                </div>
                <div class="col-2">
                  <button class="btn btn-outline-primary" onClick={exportPdf}>Export PDF</button>
                </div>
              </div>
            </div>
            :
            <></>
          }
        </div>

      </div>
    </div>
  </>
  );
}

const setResultFields = (setExamResults, i, fields) => {
  if (typeof fields === 'function') {
    setExamResults(prev => [
      ...prev.slice(0, i),
      {
        ...prev[i], ...(fields(prev[i]))
      },
      ...prev.slice(i + 1)
    ]);
  } else {
    setExamResults(prev => [
      ...prev.slice(0, i),
      {
        ...prev[i], ...fields
      },
      ...prev.slice(i + 1)
    ]);
  }
};

const DiffInputEntry = ({ diff, examResults, setExamResults, field, showActioned }) => {
  const [actioned, setActioned] = useState(false);
  if (actioned && !showActioned) return <></>;

  return (<div class={`row ${actioned ? 'bg-primary-subtle border border-primary-subtle border-2' : 'bg-light border border-light-subtle border-2'}`}>
    <div class="col-sm-3 p-0">
      <div class="w-100 overflow-auto" style={{ maxHeight: "150px" }}>
        <img src={diff.img} class="img-fluid w-100" style={{
        }} />
      </div>
    </div>
    <div class={`col-sm-9`}>
      <p>Page {examResults[diff.i].page}</p>
      <div class="container">
        <div class="row">
          <div class="col">
            <label class="me-1 btn btn-sm" htmlFor={`diff_${diff.i}_${field}_c`}>Use comparison value:</label>
          </div>
          <div class="col">
            <button id={`diff_${diff.i}_${field}_c`} onClick={
              e => {
                setResultFields(setExamResults, diff.i, { [field]: diff.origValue }, diff.j);
                setActioned(true);
              }
            } class="btn btn-sm btn-primary w-100">{diff.origValue === "" ? "(blank)" : diff.origValue}</button>
          </div>
        </div>

        <div class="row">
          <div class="col">
            <label class="me-1 btn btn-sm" htmlFor={`diff_${diff.i}_${field}_s`}>Use scanned value:</label>
          </div>
          <div class="col">
            <button id={`diff_${diff.i}_${field}_s`} onClick={
              e => {
                setResultFields(setExamResults, diff.i, { [field]: diff.scannedValue });
                setActioned(true);
              }
            } class="btn btn-sm btn-secondary w-100">{diff.scannedValue === "" ? "(blank)" : diff.scannedValue}</button>
          </div>
        </div>

        <div class="row">
          <div class="col">
            <label class="me-1 btn btn-sm" htmlFor={`diff_${diff.i}_${field}_e`}>Enter other value:</label>
          </div>
          <div class="col">
            <input
              autocomplete="off"
              type="text" id={`diff_${diff.i}_${field}_e`}
              value={examResults[diff.i][field]}
              class="form-control"
              style={{ textTransform: "uppercase" }}
              onInput={
                e => {
                  setResultFields(setExamResults, diff.i, { [field]: e.target.value });
                  setActioned(true);
                }
              }
              onChange={
                e => {
                  setActioned(true);
                }
              }
            />
          </div>
        </div>
      </div>
    </div>
  </div>);
};

const DiffInput = ({ diffNumbers, examResults, setExamResults, field, showActioned, children }) => (
  diffNumbers.length === 0 ? <></> :
    <>
      <div class="row">
        <p class="fw-bold">{children}</p>
      </div>
      {diffNumbers.map((diff) => <DiffInputEntry diff={diff} examResults={examResults} setExamResults={setExamResults} field={field} showActioned={showActioned} key={diff.i} />)}
    </>
);

const AnswerButtons = ({ answer, multiple, onChange }) => (
  <div class="btn-group btn-group-sm mt-1 mb-1 w-100" role="group">
    {['-', ...ANSWER_OPTIONS].map(option => {
      const selected = option === '-'
        ? normaliseAnswer(answer) === ' '
        : answerIncludes(answer, option);
      return <button
        key={option}
        class={`btn fw-bold btn-outline-primary${selected ? ' btn-dark text-light' : ''}`}
        onClick={() => onChange(updateAnswer(answer, option, multiple))}
      >{option}</button>;
    })}
  </div>
);

const DiffAnswerEntry = ({ cfg, diff, examResults, setExamResults, showActioned }) => {
  const [actioned, setActioned] = useState(false);
  if (actioned && !showActioned) return <></>;

  return (<div class={`row ${actioned ? 'bg-primary-subtle border border-primary-subtle border-2' : 'bg-light border border-light-subtle border-2'}`} key={`${diff.i} ${diff.j}`}>
    <div class="col-sm-3 p-0">
      <div class="w-100">
        <img src={diff.img} class="img-fluid w-100" style={{
        }} />
      </div>
    </div>
    <div class="col-sm-2 fw-bold d-flex align-items-center justify-content-center">
      Page&nbsp;{examResults[diff.i].page}, Q{diff.idx + 1}
    </div>
    <div class="col-sm-2 d-flex align-items-center justify-content-center">
      <AnswerButtons
        answer={examResults[diff.i].answers[diff.idx]}
        multiple={Boolean(multiAnswerQuestionsFor(cfg)[diff.idx])}
        onChange={answer => {
          setResultFields(setExamResults, diff.i, previous => ({
            answers: [
              ...previous.answers.slice(0, diff.idx),
              answer,
              ...previous.answers.slice(diff.idx + 1)
            ]
          }));
          setActioned(true);
        }}
      />
    </div>
    <div class="col sm-2 fw-bold d-flex align-items-center">
      Compare:&nbsp;<span class="fw-bold">{diff.origValue.replace(' ', '-')}</span>
    </div>
    <div class="col sm-2 fw-bold d-flex align-items-center">
      Scanned:&nbsp;<span class="fw-bold">{diff.scannedValue.replace(' ', '-')}</span>
    </div>
  </div>);
};

const DiffAnswers = ({ cfg, diffAnswers, examResults, setExamResults, showActioned }) => (
  diffAnswers.length === 0 ? <></> :
    <>
      <div class="row">
        <p class="fw-bold">Differences detected in answers:</p>
      </div>
      {diffAnswers.map(diff => <DiffAnswerEntry cfg={cfg} diff={diff} examResults={examResults} setExamResults={setExamResults} showActioned={showActioned} />)}
    </>
);

const QuestionableEntry = ({ cfg, idx, q, img, examResults, setExamResults, showActioned }) => {
  const [actioned, setActioned] = useState(false);
  if (actioned && !showActioned) return <></>;

  return (<div
    class={`row ${actioned ? 'bg-primary-subtle border border-primary-subtle border-2' : 'bg-light border border-light-subtle border-2'}`}
    data-testid="questionable-result"
    data-page={examResults[idx].page}
    data-question={q + 1}
    data-scanned-answer={examResults[idx].raw_answers[q].scanned_value}
    key={`${idx} ${q}`}
  >
    <div class="col-sm-3 p-0">
      <div class="w-100">
        <img src={img} class="img-fluid w-100" style={{
        }} />
      </div>
    </div>
    <div class="col-sm-2 fw-bold d-flex align-items-center justify-content-center">
      Page&nbsp;{examResults[idx].page}, Q{q + 1}
    </div>
    <div class="col-sm-2 d-flex align-items-center justify-content-center">
      <AnswerButtons
        answer={examResults[idx].answers[q]}
        multiple={Boolean(multiAnswerQuestionsFor(cfg)[q])}
        onChange={answer => {
          setResultFields(setExamResults, idx, previous => ({
            answers: [
              ...previous.answers.slice(0, q),
              answer,
              ...previous.answers.slice(q + 1)
            ]
          }));
          setActioned(true);
        }}
      />
    </div>
    <div class="col sm-2 fw-bold d-flex align-items-center">
      Scanned:&nbsp;<span class="fw-bold">{examResults[idx].raw_answers[q].scanned_value.replace(' ', '-')}</span>
    </div>
  </div>);
};

const Questionable = ({ cfg, examResults, setExamResults, showActioned }) => {
  const [sorted, setSorted] = useState(['page', 'asc']);

  if (examResults === null) return (<></>);
  const questionables = [];
  examResults.forEach((examResult, erIdx) => (examResult?.raw_answers ?? []).forEach((raw, q) => {
    if ('questionable' in raw) questionables.push({ q, erIdx, img: raw.questionableImg });
  }));

  const sortDir = sorted?.[1] === 'desc' ? -1 : 1;
  const enCollator = new Intl.Collator('en');
  switch (sorted?.[0]) {
    case 'page':
      questionables.sort((a, b) => {
        const pgDiff = examResults[a.erIdx].page - examResults[b.erIdx].page;
        if (pgDiff !== 0) return pgDiff * sortDir;
        const qDiff = a.q - b.q;
        return qDiff * sortDir;
      });
      break;
    case 'ans':
      questionables.sort((a, b) => {
        const ans_a = examResults[a.erIdx].raw_answers[a.q].scanned_value;
        const ans_b = examResults[b.erIdx].raw_answers[b.q].scanned_value;
        return enCollator.compare(ans_a, ans_b) * sortDir;
      });
      break;
  }


  return (<div class="row">
    <div class="col-sm-3 user-select-none">Scanned Image</div>
    <div class="col-sm-2 user-select-none cursor-pointer" onClick={e => setSorted(sorted => {
      if (sorted?.[0] === 'page' && sorted[1] === 'asc') return ['page', 'desc'];
      return ['page', 'asc'];
    })}>Page and Question #{sorted?.[0] === 'page' ? (sorted[1] === 'asc' ? ' ▲' : ' ▼') : ''}</div>
    <div class="col-sm-2 user-select-none cursor-pointer" onClick={e => setSorted(sorted => {
      if (sorted?.[0] === 'ans' && sorted[1] === 'asc') return ['ans', 'desc'];
      return ['ans', 'asc'];
    })}>Scanned Response{sorted?.[0] === 'ans' ? (sorted[1] === 'asc' ? ' ▲' : ' ▼') : ''}</div>
    {questionables.map(
      questionable => <QuestionableEntry cfg={cfg} key={`${questionable.erIdx} ${questionable.q}`} idx={questionable.erIdx} q={questionable.q} img={questionable.img} examResults={examResults} setExamResults={setExamResults} showActioned={showActioned} />
    )}
  </div>);
};

const transformPoint = (pt, H) => {
  const [x, y] = pt;

  const xPrime = H[0] * x + H[1] * y + H[2];
  const yPrime = H[3] * x + H[4] * y + H[5];
  const wPrime = H[6] * x + H[7] * y + H[8];

  // Guard against division by zero (point mapped to infinity)
  if (wPrime === 0) {
    return [Infinity, Infinity];
  }

  return [xPrime / wPrime, yPrime / wPrime];
}

const trPoint = (x, y, height, homographies) => {
  // Find containing homography
  for (const H of homographies) {
    if (x >= H.rect_x && y >= H.rect_y && x < H.rect_x + H.rect_w && y < H.rect_y + H.rect_h) {
      const t = transformPoint([x - H.rect_x, y - H.rect_y], H.matrix);
      return [t[0] / 4, height - t[1] / 4];
    }
  }
}

const createExamImage = async (cfg, result, pdf) => {
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  let srcDoc;

  if (pdf instanceof PDFDocument) {
    srcDoc = pdf;
  } else {
    srcDoc = await PDFDocument.load(await pdf.getData());
  }
  const pageIndices = [result.page - 1];
  if (cfg.twoSided) pageIndices.push(result.page);
  const copiedPages = await pdfDoc.copyPages(srcDoc, pageIndices);
  const pages = [];
  for (const copiedPage of copiedPages) {
    pages.push(pdfDoc.addPage(copiedPage));
  }
  const font = await pdfDoc.embedFont(StandardFonts.ZapfDingbats, { subset: true });
  const size = 14;
  const squareCol = rgb(0.5, 0.5, 0.5);
  const tickCol = rgb(0, 0.5, 0);
  const crossCol = rgb(0.75, 0, 0);
  const { width, height } = pages[0].getSize();

  const scale = 4;
  const xstarts = [768, 3134, 5497, 7859];
  const ystarts = [9449, 1225, 5361, 9496];
  const xstep = 377;
  const ystep = 378.555555;
  const qs = cfg.twoSided ? 160 : 40;
  const OPTIONS = { ' ': -1, 'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4 };
  for (let q = 0; q < qs; q++) {
    const answer = normaliseAnswer(result.answers[q]);
    const selectedOptions = answer.trim().split('');
    let pg, row, col, y;
    if (q < 40) { // First page
      pg = 0;
      row = q % 10;
      col = Math.floor(q / 10);
      y = ystarts[0] + ystep * row;
    } else { // Second page
      pg = 1;
      row = (q - 40) % 30;
      col = Math.floor((q - 40) / 30);
      y = ystarts[Math.floor(row / 10) + 1] + ystep * (row % 10);
    }
    const responseCorrect = isAnswerCorrect(
      answer,
      cfg.answerKey?.[q],
      Boolean(multiAnswerQuestionsFor(cfg)[q])
    );
    for (const option of selectedOptions) {
      const x = xstarts[col] + xstep * OPTIONS[option];
      const [px, py] = trPoint(x / scale, y / scale, height, pg === 0 ? result.homographies : result.homographies2);
      pages[pg].drawSquare({ x: px - 10, y: py - 10, size: 20, borderColor: squareCol, borderWidth: 1 });
      if (responseCorrect) {
        pages[pg].drawText('✔', { x: px + 5, y: py - 10, font, size, color: tickCol });
      } else {
        pages[pg].drawText('✘', { x: px + 5, y: py - 10, font, size, color: crossCol });
        if (option === selectedOptions.at(-1)) {
          const missingAnswers = Object.keys(cfg.answerKey?.[q] ?? [])
            .filter(key => cfg.answerKey?.[q]?.[key] && !selectedOptions.includes(key));
          for (const o of missingAnswers) {
            const x = xstarts[col] + xstep * OPTIONS[o];
            const [px, py] = trPoint(x / scale, y / scale, height, pg === 0 ? result.homographies : result.homographies2);
            pages[pg].drawText('✔', { x: px + 3, y: py - 8, font, size, color: tickCol });
          }
        }
      }
    }
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes]);
  return blob;
}

const examResultFilename = result => {
  return `${result.student_number} ${result.surname} ${result.initials}`.trim().replaceAll("'", '').replaceAll(' ', '_');
};

const hashBlob = async (blob) => {
  const data = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return hashHex;
};

const DownloadPDFs = ({ examResults, cfg, pdf, assignment, canvasCSV, examResultMatches }) => {
  const [apiKey, setApiKey] = useState('');
  const [courseCode, setCourseCode] = useState('');
  let assignmentCode;
  {
    const asgn_name_parts = assignment.fullName.split('(');
    const code_part = asgn_name_parts[asgn_name_parts.length - 1];
    assignmentCode = Number.parseInt(code_part.slice(0, code_part.length - 1));
  }

  /*
    TODO: use canvasCSV and examResultMatches to get student canvas IDs, start working on upload script
  */

  return (<>
    <hr class="mt-2" />
    <div class="row fw-bold">
      <div class="col-12">
        <p>Download per-student PDFs and upload script:</p>
      </div>
    </div>
    <div class="row mb-3">
      <div class="col-8">
        <div class="form-floating">
          <input type="password" class="form-control" id="apiKey"
            placeholder="ajsdfkljsasdafjklldkfjafds" value={apiKey} onInput={e => setApiKey(e.target.value)} />
          <label for="apiKey">Canvas API key</label>
        </div>
      </div>
      <div class="col-4">
        <div class="form-floating">
          <input type="number" class="form-control" id="courseCode"
            placeholder="12345" value={courseCode} onInput={e => setCourseCode(e.target.value)} />
          <label for="courseCode">Canvas course code</label>
        </div>
      </div>
    </div>
    <div class="row mb-2">
      <div class="col-12">
        <button class="btn btn-outline-primary w-100" onClick={async e => {
          const { PDFDocument } = await import('pdf-lib');
          const seen_filenames = new Set();
          const zip = await create_zip('ExamPDFs.zip');
          const srcDoc = await PDFDocument.load(await pdf.getData());
          const grades = [];
          for (let i = 0; i < examResults.length; i++) {
            const j = examResultMatches.get(i);
            if (typeof j === 'undefined') continue;
            const er = examResults[i];
            if ('homographies' in er) {
              let fn = examResultFilename(er);
              if (seen_filenames.has(fn)) {
                let fn_count = 2;
                let new_fn = `${fn}-${fn_count}`;
                while (seen_filenames.has(new_fn)) {
                  fn_count++;
                  new_fn = `${fn}-${fn_count}`;
                }
                fn = new_fn;
              }
              seen_filenames.add(fn);
              fn += '.pdf';
              const blob = await createExamImage(cfg, er, srcDoc);
              add_blob_to_zip(zip, fn, blob);

              const canvasId = canvasCSV[j][1];

              grades.push([
                canvasId,
                `${calculateScore(er.answers, cfg.answerKey, multiAnswerQuestionsFor(cfg))}`,
                await hashBlob(blob),
                fn
              ]);
            }
          }

          { // Create upload marks script
            const script_heading = `const GRADES = ${JSON.stringify(grades, null, 2)};\n` +
              `const COURSE_ID = ${JSON.stringify(courseCode)};\n` +
              `const ASSIGNMENT_ID = ${JSON.stringify(assignmentCode)};\n` +
              `const API_KEY = ${JSON.stringify(apiKey)};\n\n`;
            const blob = new Blob([script_heading, uploadMarks]);
            add_blob_to_zip(zip, "UploadMarks.js", blob);
          }

          await download_zip(zip);
        }}>Export ZIP</button>
      </div>
    </div>
  </>);
};

//https://stackoverflow.com/a/53577159
function getStandardDeviation(array) {
  const n = array.length;
  if (n < 2) return NaN;
  const mean = array.reduce((a, b) => a + b) / n;
  return Math.sqrt(array.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n);
}

const ExamAnalysis = ({ examResults, cfg }) => {
  const [open, setOpen] = useState(false);

  if (examResults.length === 0) return (<></>);
  if (!open) {
    return (<>
      <div class="">
        <div class="card">
          <div class="card-header btn btn-outline-secondary" onClick={e => setOpen(v => !v)}>
            Exam Analysis
          </div>
        </div>
      </div>
    </>);
  }

  const OPTIONS = ["A", "B", "C", "D", "E"];
  const multiAnswerQuestions = multiAnswerQuestionsFor(cfg);

  let examQuestions = Object.keys(cfg.answerKey).filter(k => Object.values(cfg.answerKey[k]).filter(v => v).length > 0).map(i => Number.parseInt(i));
  const studentScores = examResults.map(er => calculateScore(er.answers, cfg.answerKey, multiAnswerQuestionsFor(cfg)));
  const sortedScores = [...studentScores];
  sortedScores.sort((a, b) => Number.parseFloat(a) - Number.parseFloat(b))
  let totalScore = 0;
  for (const score of studentScores) {
    totalScore += score;
  }
  const meanScore = totalScore / examResults.length;
  const medianScore = sortedScores[Math.floor((sortedScores.length - 1) / 2)] * 0.5 + sortedScores[Math.floor((sortedScores.length) / 2)] * 0.5;

  const difficulty = {};
  const discrim = {};
  // Compute difficulty and discrimination
  for (const q of examQuestions) {
    difficulty[q] = {};
    discrim[q] = {};
    // Get scores without this question
    const scores_without = [];
    for (let i = 0; i < examResults.length; i++) {
      let score_without_question = studentScores[i];
      if (isAnswerCorrect(
        examResults[i].answers[q],
        cfg.answerKey?.[q],
        Boolean(multiAnswerQuestions[q])
      )) score_without_question--;
      scores_without.push(score_without_question);
    }
    const stdev = getStandardDeviation(scores_without);

    for (const opt of OPTIONS) {
      let sum_correct = 0;
      let sum_incorrect = 0;
      let num_correct = 0, num_incorrect = 0;
      for (let i = 0; i < examResults.length; i++) {
        if (answerIncludes(examResults[i].answers[q], opt)) {
          num_correct++;
          sum_correct += scores_without[i];
        } else {
          num_incorrect++;
          sum_incorrect += scores_without[i];
        }
      }

      const diff = num_correct / examResults.length;
      const avg_correct = sum_correct / num_correct;
      const avg_incorrect = sum_incorrect / num_incorrect;
      difficulty[q][opt] = diff;
      //discrim[q][opt] = ((avg_correct - avg_incorrect) / stdev) * Math.sqrt(diff / (1 - diff));
      discrim[q][opt] = ((avg_correct - avg_incorrect) / stdev) * Math.sqrt((num_correct * num_incorrect) / Math.pow(examResults.length, 2));
    }
    const correctResponses = examResults.map(result => isAnswerCorrect(
      result.answers[q],
      cfg.answerKey?.[q],
      Boolean(multiAnswerQuestions[q])
    ));
    difficulty[q].overall = correctResponses.filter(Boolean).length / examResults.length;
    const correctScores = scores_without.filter((_, index) => correctResponses[index]);
    const incorrectScores = scores_without.filter((_, index) => !correctResponses[index]);
    const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;
    discrim[q].overall = correctScores.length > 0 && incorrectScores.length > 0 && stdev > 0
      ? (average(correctScores) - average(incorrectScores)) / stdev
        * Math.sqrt((correctScores.length * incorrectScores.length) / Math.pow(examResults.length, 2))
      : 0;
  }

  return (<>
    <div class="">
      <div class="card">
        <div class="card-header btn btn-outline-secondary" onClick={e => setOpen(v => !v)}>
          Exam Analysis
        </div>
        <div class="card-body">
          <table class="table">
            <tbody>
              <tr><th scope="row">Number of students</th><td>{examResults.length}</td></tr>
              <tr><th scope="row">Minimum number of questions correct</th><td>{Math.min(...studentScores)}</td></tr>
              <tr><th scope="row">Maximum number of questions correct</th><td>{Math.max(...studentScores)}</td></tr>
              <tr><th scope="row">Mean number of questions correct</th><td>{meanScore.toFixed(2)}</td></tr>
              <tr><th scope="row">Median number of questions correct</th><td>{medianScore.toFixed(2)}</td></tr>
            </tbody>
          </table>
          <table class="table">
            <thead>
              <tr>
                <th scope="col">Question</th>
                <th scope="col">Option</th>
                <th scope="col">Average score (difficulty)</th>
                <th scope="col">Discrimination</th>
              </tr>
            </thead>
            <tbody>
              {
                examQuestions.map(q => <Fragment key={q}>
                  <tr class={discrim[q].overall >= 0.30 ? "table-success" : (discrim[q].overall >= 0.10 ? "table-warning" : "table-danger")}>
                    <td>Q{q + 1}</td>
                    <td>Overall</td>
                    <td>{difficulty[q].overall.toFixed(6)}</td>
                    <td>{discrim[q].overall.toFixed(6)}</td>
                  </tr>
                  {OPTIONS.map(o => <tr>
                    <td>&nbsp;</td>
                    <td>{o}&nbsp;{cfg.answerKey?.[q]?.[o] ? '✔' : '✘'}</td>
                    <td>{difficulty[q][o].toFixed(6)}</td>
                    <td>{discrim[q][o].toFixed(6)}</td>
                  </tr>)}
                </Fragment>)
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </>);
};

const examResultsRow = (cfg, setExamResults, pdf) => ((result, i) => (
  <div class="exam-row" data-testid="exam-result" data-page={result.page} style={{ "--qcount": cfg.twoSided ? 160 : 40 }} key={result.page}>
    {'homographies' in result ? (<div class="fs-5 text-success btn btn-sm p-0" onClick={async e => {
      const blob = await createExamImage(cfg, result, pdf);
      download_file(examResultFilename(result) + '.pdf', blob);
    }}>🗎</div>) : <div>&nbsp;</div>}
    <div class="text-end pe-1">{result.page}</div>
    <div><input autocomplete="off" type="text" data-field="student-number" value={result.student_number} class="w-100" onChange={
      e => setResultFields(setExamResults, i, { student_number: e.target.value })
    } /></div>
    <div><input autocomplete="off" type="text" data-field="surname" value={result.surname} class="w-100" style={{ textTransform: "uppercase" }} onChange={
      e => setResultFields(setExamResults, i, { surname: e.target.value })
    } /></div>
    <div><input autocomplete="off" type="text" data-field="initials" value={result.initials} class="w-100" style={{ textTransform: "uppercase" }} onChange={
      e => setResultFields(setExamResults, i, { initials: e.target.value })
    } /></div>
    <div class="ps-2" data-field="score">{calculateScore(result.answers, cfg.answerKey, multiAnswerQuestionsFor(cfg))}</div>
    {fixAnswers(cfg, result.answers).map(
      (ans, j) => {
        const multiple = Boolean(multiAnswerQuestionsFor(cfg)[j]);
        const choices = multiple ? ANSWER_COMBINATIONS : [' ', ...ANSWER_OPTIONS];
        return <div key={j}><select class="w-100" data-question={j + 1}
        aria-label={`Question ${j + 1}${multiple ? ' multi-answer response' : ' response'}`}
        value={ans}
        onChange={
          e => setResultFields(setExamResults, i, prev => ({
            answers: [
              ...prev.answers.slice(0, j),
              e.target.value,
              ...prev.answers.slice(j + 1)
            ]
          }))
        }
      >
        {choices.map(choice => <option value={choice}>{choice}</option>)}
      </select></div>
      }
    )}
  </div>));

const ExamResultsSearch = ({ setSearch }) => {
  const [contents, setContents] = useState('');
  return (<>
    <input type="search" value={contents} onInput={e => setContents(e.target.value)} />
    <button class="btn btn-sm" onClick={e => {
      setSearch(contents);
    }}>Search</button>
  </>);
}

const ExamResultsDisplay = ({ cfg, examResults, setExamResults, pdf }) => {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState(null);

  if (examResults.length === 0) {
    return <EmptyState
      title="No exams scanned yet"
      description="Your scanned exams will appear here with editable student details, answers and scores."
    />;
  }

  const examResultsRowInstance = examResultsRow(cfg, setExamResults, pdf);

  const shownExams = search === '' ? range(examResults.length) : range(examResults.length).filter(i => {
    const s = search.toUpperCase();
    return ((examResults[i].student_number.toUpperCase().indexOf(s) !== -1) ||
      (examResults[i].surname.toUpperCase().indexOf(s) !== -1) ||
      (examResults[i].initials.toUpperCase().indexOf(s) !== -1));
  });
  if (sorting !== null) {
    const enCollator = new Intl.Collator("en");
    const sortCol = sorting[0];
    const sortDir = sorting[1] === "asc" ? 1 : -1;
    let sortFunc;
    if (sortCol[0] === 'q') {
      const q = Number.parseInt(sortCol.slice(1));
      sortFunc = (a, b) => (enCollator.compare(examResults[a].answers[q], examResults[b].answers[q]) * sortDir);
    } else {
      if (sortCol === 'page') {
        sortFunc = (a, b) => ((examResults[a][sortCol] - examResults[b][sortCol]) * sortDir);
      } else if (sortCol === 'score') {
        sortFunc = (a, b) => ((
          calculateScore(examResults[a].answers, cfg.answerKey, multiAnswerQuestionsFor(cfg))
          - calculateScore(examResults[b].answers, cfg.answerKey, multiAnswerQuestionsFor(cfg))
        ) * sortDir);
      } else {
        sortFunc = (a, b) => (enCollator.compare(examResults[a][sortCol], examResults[b][sortCol]) * sortDir);
      }

    }
    shownExams.sort(sortFunc);
  }

  const firstResultIdx = page * pageSize;
  const lastResultIdx = Math.min((page + 1) * pageSize - 1, shownExams.length - 1);

  const lastPage = Math.floor((shownExams.length - 1) / pageSize);

  const pageAbs = (e, pg) => {
    setPage(pg);
    e.preventDefault();
  };
  const pageRel = (e, pgOffset) => {
    setPage(pg => Math.max(0, Math.min(lastPage, pg + pgOffset)));
    e.preventDefault();
  };

  const PAGES = 5;
  const pageDiff = Math.floor(PAGES / 2);
  let lowPage = page - pageDiff;
  let highPage = page + pageDiff;
  if (highPage > lastPage) {
    lowPage -= (highPage - lastPage);
    highPage -= (highPage - lastPage);
  }
  if (lowPage < 0) {
    highPage += -lowPage;
    lowPage += -lowPage;
  }
  highPage = Math.min(highPage, lastPage);

  const sortGfx = (col) => (sorting?.[0] === col ? (sorting[1] === 'asc' ? ' ▲' : ' ▼') : '');
  const sortClick = (col) => setSorting(oldSort => {
    if (oldSort?.[0] === col && oldSort[1] === 'asc') return [col, 'desc'];
    else return [col, 'asc'];
  });

  return (
    <div class="border border-secondary container">
      <div class="row">
        <div class="col-6">
          Show <select value={pageSize} onChange={e => setPageSize(e.target.value)}>
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select> exams
        </div>
        <div class="col-6 text-end">
          <ExamResultsSearch setSearch={c => {
            setPage(0);
            setSearch(c);
          }} />
        </div>
      </div>
      <div style={{
        minHeight: `${pageSize * 2 + 3.5}rem`,
        overflowX: "scroll",
        padding: "8px"
      }}>
        <div class="exam-row" style={{ '--qcount': cfg.twoSided ? 160 : 40 }}>
          <div class="user-select-none cursor-pointer" onClick={e => sortClick('page')} style={{ gridColumn: 'span 2' }}>Page{sortGfx('page')}</div>
          <div class="user-select-none cursor-pointer" onClick={e => sortClick('student_number')}>Student #{sortGfx('student_number')}</div>
          <div class="user-select-none cursor-pointer" onClick={e => sortClick('surname')}>Surname{sortGfx('surname')}</div>
          <div class="user-select-none cursor-pointer" onClick={e => sortClick('initials')}>Initial{sortGfx('initials')}</div>
          <div class="user-select-none cursor-pointer" onClick={e => sortClick('score')}>Score{sortGfx('score')}</div>
          {range(cfg.twoSided ? 160 : 40).map(
            n => <div class="user-select-none cursor-pointer" onClick={e => sortClick(`q${n}`)}>Q{n + 1}{sortGfx(`q${n}`)}</div>
          )}
        </div>
        {
          range(page * pageSize, (page + 1) * pageSize).map(i => i < shownExams.length ? examResultsRowInstance(examResults[shownExams[i]], shownExams[i]) : null)
        }
      </div>
      <div class="row">
        <div class="col-6 d-flex align-items-end">
          Showing {firstResultIdx + 1} to {lastResultIdx + 1} of {shownExams.length} exams {search !== '' ? `(out of ${examResults.length} total exams)` : null}
        </div>
        <div class="col-6 text-end fw-bold fs-3 text-primary pagination-row">
          <span class="me-1 user-select-none cursor-pointer" onClick={e => pageAbs(e, 0)}>«</span>
          <span class="me-1 user-select-none cursor-pointer" onClick={e => pageRel(e, -1)}>‹</span>
          {
            range(lowPage, highPage + 1)
              .map(pg => <span class={pg === page ? "me-1 fs-5 user-select-none text-dark" : "me-1 fs-5 user-select-none cursor-pointer text-center"} onClick={e => pageAbs(e, pg)}>{pg + 1}</span>)
          }
          <span class="me-1 user-select-none cursor-pointer" onClick={e => pageRel(e, 1)}>›</span>
          <span class="user-select-none cursor-pointer" onClick={e => pageAbs(e, lastPage)}>»</span>
        </div>
      </div>
    </div>
  );
};

const create_zip = async (filename) => {
  const { default: JSZip } = await import('jszip');
  return {
    jszip: new JSZip(),
    count: 0,
    filename
  };
};
const add_blob_to_zip = (zip, filename, blob) => {
  zip.jszip.file(filename, blob);
  zip.count++;
};
const download_file = (filename, blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
const download_zip = async (zip) => {
  if (zip.count === 0) return;
  // Write zip
  // build zip
  const content = await zip.jszip.generateAsync({ type: "blob" });

  // trigger download
  download_file(zip.filename, content);
};;

export function App() {
  const [pdf, setPdf] = useState(null);
  const [pdfName, setPdfName] = useState(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [progress, setProgress] = useState(null); // null means not running
  const [scanStage, setScanStage] = useState(null);
  const [examResults, setExamResults] = useState([]);
  const [previewURI, setPreviewURI] = useState(null);
  const [comparison, setComparison] = useState({});
  const [canvasCSV, setCanvasCSV] = useState(null);
  const [canvasAssignment, setCanvasAssignment] = useState('-1');
  const [canvasAssignments, setCanvasAssignments] = useState([]);
  const [matchSelect, setMatchSelect] = useState(null);
  const [marksPerQuestion, setMarksPerQuestion] = useState(1);
  const [importCSVPage1, setImportCSVPage1] = useState(1);
  const [scanIssues, setScanIssues] = useState([]);

  //const [cv, setCv] = useState(null);
  //const [templateImages, setTemplateImages] = useState([]);
  const [cfg, setCfg] = useState({
    startAt: 1,
    endAt: 1,
    twoSided: false,
    hasMarker: false,
    hasMultiAnswer: false,
    multiAnswerQuestions: {},
    answerKey: {},
    showQuestionable: true,
    showQActioned: true,
    showActioned: true
  });
  const abortRef = useRef(null);

  const diffs = examResults.map((row, i) => row.diffs.map((diff, j) => ({ ...diff, i, j }))).flat();
  const diffAnswers = diffs.filter(diff => diff.field === "answers");
  const diffNumbers = diffs.filter(diff => diff.field === "studentNum");
  const diffSurnames = diffs.filter(diff => diff.field === "surname");
  const diffInitials = diffs.filter(diff => diff.field === "initials");

  const currentlyScanning = progress !== null;
  const activeMultiAnswerQuestions = cfg.hasMultiAnswer
    ? Object.keys(cfg.multiAnswerQuestions ?? {}).filter(question => cfg.multiAnswerQuestions[question]).map(Number)
    : [];

  const reportScanIssue = (stage, error, page = null) => {
    const message = error instanceof Error ? error.message : `${error}`;
    console.error(`${stage}${page === null ? '' : ` (page ${page})`}:`, error);
    setScanIssues(previous => [
      ...previous,
      { stage, page, message }
    ]);
  };

  useEffect(() => scannerClient.subscribeToDiagnostics(error => {
    reportScanIssue('Scanner worker', error);
  }), []);

  const {
    examResultMatches,
    unmatchedExamResults,
    unmatchedStudents
  } = matchExamResultsToCanvas(examResults, canvasCSV);

  const getPdfPage = async (currentPage) => {
    const page = await pdf.getPage(currentPage);
    const viewport = page.getViewport({ scale: 4 });
    const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    let ctx = canvas.getContext('2d', { willReadFrequently: true });
    await page.render({ canvasContext: ctx, viewport }).promise;
    const bmp = createImageBitmap(canvas);
    page.cleanup();
    return bmp;
  };

  const matchLoadedExamsToPDF = async newResults => {
    if (abortRef.current !== null) {
      abortRef.current.abort();
      return;
    }

    const ac = new AbortController();
    abortRef.current = ac;
    let resultIdx = 0;

    setProgress([0, newResults.length + (cfg.hasMarker ? 1 : 0)]);
    setScanStage('Preparing recognition models');
    setExamResults([]);
    try {
      await invokeScanner('initialize');
    } catch (error) {
      reportScanIssue('Could not prepare scanner', error);
      abortRef.current = null;
      setProgress(null);
      setScanStage(null);
      return;
    }
    if (ac.signal.aborted) {
      abortRef.current = null;
      setProgress(null);
      setScanStage(null);
      return;
    }
    setScanStage('Matching loaded exams to the PDF');
    if (cfg.hasMarker) {
      const confirmation = window.confirm("Scan marker page?");
      if (confirmation) {
        let bmp = await getPdfPage(cfg.startAt);
        
        const data = await invokeScanner("scan", {
          bmp,
          page: 0,
          compare: {},
          multiAnswerQuestions: activeMultiAnswerQuestions
        }, [bmp]);
        let answers = data.answer_values ?? data.answers.split('');
        if (cfg.twoSided) {
          bmp = await getPdfPage(cfg.startAt + 1);
          const data = await invokeScanner("scan", {
            bmp,
            page: 1,
            compare: {},
            multiAnswerQuestions: activeMultiAnswerQuestions
          }, [bmp]);
          answers = answers.concat(data.answer_values2 ?? data.answers2.split(''));
        }
        const answerKey = createAnswerKey(answers);
        setCfg(cfg => ({ ...cfg, answerKey }));
      }
      setProgress([1, newResults.length + 1]);
    }
    while (!ac.signal.aborted) {
      let currentPage = newResults[resultIdx].page;
      let bmp = await getPdfPage(currentPage);
      const data = await invokeScanner("scan_matrix", { bmp, page: 0 }, [bmp]);
      let result = {...newResults[resultIdx], homographies: data.homographies};
      if (cfg.twoSided) {
        bmp = await getPdfPage(currentPage + 1);
        const data = await invokeScanner("scan_matrix", { bmp, page: 1 }, [bmp]);
        result.homographies2 = data.homographies;
      }
      setExamResults(examResults => [...examResults, result]);
      resultIdx++;
      setProgress([resultIdx + (cfg.hasMarker ? 1 : 0), newResults.length + (cfg.hasMarker ? 1 : 0)]);
      if (resultIdx === newResults.length) break;
    }
    abortRef.current = null;
    setProgress(null);
    setScanStage(null);
  };

  const rawCsvImport = async files => {
    if (examResults.length > 0) {
      const confirmation = window.confirm("This will erase current exam scans. Are you sure?");
      if (!confirmation) return;
    }
    const file = files?.[0];
    if (!file) return;
    const csv = await loadCSV(file);

    if (csv[0]?.[0] === 'Unit' && csv[0]?.[1] === 'Exam date' && csv[0]?.[2] === 'Student number' && csv[0]?.[3] === 'Surname' && csv[0]?.[4] === 'Initial' && csv[0]?.[7] === 'Q1' && csv[0]?.[7 + 159] === 'Q160') {
      const newResults = [];
      for (const row of csv.slice(1)) {
        const [unit, examDate, student_number, surname, initials, scannedFile, pageInFile, ...q] = row;
        let pageNum = Number.parseInt(pageInFile);
        pageNum += (Number.parseInt(importCSVPage1) - 1);
        newResults.push({
          page: pageNum,
          student_number,
          surname,
          initials,
          answers: q.map(v => normaliseAnswer(v || ' ')).slice(0, cfg.twoSided ? 160 : 40),
          diffs: []
        });
      }

      // Check if we can scan in page transforms
      let doScan = false;
      const pagesPerExam = cfg.twoSided ? 2 : 1;
      const markerPages = cfg.hasMarker ? pagesPerExam : 0;

      if ((cfg.endAt + 1 - cfg.startAt - markerPages) / pagesPerExam === newResults.length) {  
        // Ensure every exam has a page number within this range
        let canScan = true;
        for (const res of newResults) {
          if (!(res.page >= cfg.startAt + markerPages && res.page <= cfg.endAt)) {
            canScan = false;
            break;
          }
        }
        if (canScan) {
          const confirmation = window.confirm("Match loaded exams against the current PDF? (This will take some time, but will enable exporting of marked PDFs.)");
          if (confirmation) doScan = true;
        }
      }

      if (!doScan) {
        setExamResults(newResults);
      } else {
        await matchLoadedExamsToPDF(newResults);
      }
    } else {
      window.alert("Invalid headings; this is not a raw_results format CSV.")
    }
  };

  const scanExams = async e => {
    if (abortRef.current !== null) {
      abortRef.current.abort();
      return;
    }
    if (cfg.endAt < cfg.startAt) return;
    if (examResults.length > 0) {
      const confirmation = window.confirm("This will erase current exam scans. Are you sure?");
      if (!confirmation) return;
    }

    const { startAt, endAt, twoSided } = cfg;

    const ac = new AbortController();
    abortRef.current = ac;
    let currentPage = startAt;

    const pagesPerExam = twoSided ? 2 : 1;
    const totalPages = endAt + 1 - startAt;
    const totalExams = Math.ceil(totalPages / pagesPerExam);
    setProgress([0, totalExams]);
    setScanStage('Preparing recognition models');
    setExamResults([]);
    setScanIssues([]);

    try {
      await invokeScanner('initialize');
    } catch (error) {
      reportScanIssue('Could not prepare scanner', error);
      abortRef.current = null;
      setProgress(null);
      setScanStage(null);
      return;
    }
    if (ac.signal.aborted) {
      abortRef.current = null;
      setProgress(null);
      setScanStage(null);
      return;
    }
    setScanStage('Scanning exams');

    let answerKey = cfg.answerKey;


    while (!ac.signal.aborted) {
      try {
        let bmp = await getPdfPage(currentPage);
        let compare = {};
        if ('results' in comparison) {
          const pageOffset = (1 - comparison.cfg_firstPage);
          const result = comparison.results.get(currentPage + pageOffset);
          if (result !== undefined) {
            if (comparison.cfg_checkNumbers) compare.studentNum = result.studentNum;
            if (comparison.cfg_checkName) compare.surname = result.surname;
            if (comparison.cfg_checkInitials) compare.initial = result.initial;
            if (comparison.cfg_checkAnswers) compare.q = result.q;
          }
        }

        const result = await invokeScanner("scan", {
          bmp,
          page: 0,
          compare,
          multiAnswerQuestions: activeMultiAnswerQuestions
        }, [bmp]);
        //console.log(result);

        let { raw_answers, student_number, raw_student_number, surname, raw_surname, initials, raw_initials, diffs, homographies } = result;
        let answers = result.answer_values ?? result.answers.split('');
        let homographies2 = [];

        if (cfg.twoSided && currentPage + 1 <= endAt) {
          bmp = await getPdfPage(currentPage + 1);
          const result = await invokeScanner("scan", {
            bmp,
            page: 1,
            compare,
            multiAnswerQuestions: activeMultiAnswerQuestions
          }, [bmp]);
          //console.log(result);
          let { raw_answers2 } = result;
          const answers2 = result.answer_values2 ?? result.answers2.split('');
          homographies2 = result.homographies;
          diffs = diffs.concat(result.diffs);
          answers = answers.concat(Array(40).fill(' ')).slice(0, 40);
          answers = answers.concat(answers2);
          raw_answers = raw_answers.concat(raw_answers2);
        }

        // Is this the marker page
        if (cfg.hasMarker && currentPage === startAt) {
          // Do not store, but instead make this the new answer key
          answerKey = createAnswerKey(answers);
          setCfg(cfg => ({ ...cfg, answerKey }));
        } else {
          const new_result = {
            page: currentPage,
            student_number,
            surname,
            initials,
            answers: fixAnswers(cfg, answers),
            raw_student_number, raw_surname, raw_initials, raw_answers: raw_answers.map((ra, i) => ({ ...ra, scanned_value: answers[i] })),
            diffs,
            homographies,
            homographies2
          };
          setExamResults(prev => [
            ...prev,
            new_result
          ]);
        }
      } catch (e) {
        reportScanIssue('Could not scan exam', e, currentPage);
        // Preserve the existing behaviour: report the failure and continue with
        // the next exam instead of discarding all successfully scanned pages.
      }

      // Onto next page
      currentPage += pagesPerExam;
      if (currentPage > endAt) break;

      setProgress([Math.ceil((currentPage - startAt) / pagesPerExam), totalExams]);
    }
    // After all pages done
    abortRef.current = null;
    setProgress(null);
    setScanStage(null);
  };

  const pdfSelected = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const pdf = await getDocument({ data }).promise;
      setPdfName(file.name);
      setPdf(pdf);
      setPdfPage(1);
      setCfg(cfg => ({ ...cfg, endAt: pdf.numPages }));
      setScanIssues([]);
    } catch (error) {
      reportScanIssue('Could not open PDF', error);
    }
  };
  const pdfDeselected = e => {
    if (currentlyScanning) return;
    let mustConfirm = false;
    examResults.forEach(er => {
      if ('homographies' in er) mustConfirm = true;
    });
    if (mustConfirm) {
      if (!window.confirm("This will break the connection between current scanned results and the provided PDF, disabling PDF export. Are you sure?")) return;
      setExamResults(examResults => {
        const examResultsCopy = JSON.parse(JSON.stringify(examResults));
        examResultsCopy.forEach(er => {
          delete er.homographies;
          delete er.homographies2;
        });
        return examResultsCopy;
      });
    }
    setPreviewURI(null);
    setPdfName(null);
    setPdf(null);
  };

  // Update preview URI
  useEffect(async () => {
    if (pdf === null) return;

    const page = await pdf.getPage(pdfPage);
    const viewport = page.getViewport({ scale: 1 });
    const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const url = URL.createObjectURL(blob);
    setPreviewURI(prev => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return url;
    });

  }, [pdf, pdfPage]);

  const prevPage = () => {
    if (pdfPage === 1) setPdfPage(pdf.numPages);
    else setPdfPage(pdfPage - 1);
  };
  const nextPage = () => {
    if (pdfPage >= pdf.numPages) setPdfPage(1);
    else setPdfPage(pdfPage + 1);
  };

  const keyedQuestionCount = Object.values(cfg.answerKey)
    .filter(answer => Object.values(answer).some(Boolean)).length;

  return (
    <div class="exam-scanner-app">
      <div class="app-backdrop" aria-hidden="true"></div>
      <div class="app-container">
        <AppHeader pdfName={pdfName} resultCount={examResults.length} currentlyScanning={currentlyScanning} />

        <main class="workspace">
          <WorkspaceSection
            id="setup"
            number="1"
            eyebrow="Document"
            title="Set up the scan"
            description="Load a PDF, choose its page range and describe the answer-sheet format."
          >
            <div class="setup-layout">
              <PdfSetupPanel
                pdf={pdf}
                pdfName={pdfName}
                previewURI={previewURI}
                currentPage={pdfPage}
                currentlyScanning={currentlyScanning}
                onSelect={pdfSelected}
                onRemove={pdfDeselected}
                onPrevious={prevPage}
                onNext={nextPage}
              />
              <div class="setup-layout__options">
                <ScannerConfig config={cfg} setConfig={setCfg} pdf={pdf} currentlyScanning={currentlyScanning} />
                <ComparisonConfig comparison={comparison} setComparison={setComparison} scannerConfig={cfg} currentlyScanning={currentlyScanning} />
              </div>
            </div>
          </WorkspaceSection>

          <WorkspaceSection
            id="answer-key"
            number="2"
            eyebrow="Marking"
            title="Configure the answer key"
            description="Select every accepted answer. Enable Multi only where the complete selected set is required."
            actions={<span class="section-count">{keyedQuestionCount} keyed</span>}
          >
            <AnswerKey cfg={cfg} setCfg={setCfg} pdf={pdf} currentlyScanning={currentlyScanning} />
          </WorkspaceSection>

          <div class="scan-action-panel">
            <div>
              <p class="scan-action-panel__eyebrow">Ready to process</p>
              <h2>{pdf ? `${pdf.numPages} page PDF loaded` : 'Load a PDF to begin'}</h2>
              <p>Recognition runs locally. Review uncertain marks before exporting final grades.</p>
            </div>
            <button
              disabled={pdf === null}
              onClick={scanExams}
              class={`btn btn-lg ${currentlyScanning ? 'btn-danger' : 'btn-primary'} scan-action-panel__button`}
            >
              {currentlyScanning ? 'Stop scanning' : 'Scan Exams'}
            </button>
          </div>

          <ScanProgress progress={progress} stage={scanStage} />
          <ScanIssues issues={scanIssues} onDismiss={() => setScanIssues([])} />

          <WorkspaceSection
            id="results"
            number="3"
            eyebrow="Verification"
            title="Review scanned exams"
            description="Confirm student details, answers and scores. Question columns scroll horizontally."
            actions={<span class="section-count">{examResults.length} scanned</span>}
          >
            <ExamResultsDisplay cfg={cfg} examResults={examResults} setExamResults={setExamResults} pdf={pdf} />
          </WorkspaceSection>

          <WorkspaceSection
            id="exports"
            number="4"
            eyebrow="Output"
            title="Export and continue"
            description="Download results, resume previous work, or prepare grades for Canvas."
          >
      <div class="export-grid">
        <div>
          <button class="export-card" disabled={examResults.length === 0} onClick={e => {
            const csv = buildResultsCsvRows({
              examResults,
              answerKey: cfg.answerKey,
              multiAnswerQuestions: multiAnswerQuestionsFor(cfg),
              pdfName
            });
            const blob = new Blob([createCSV(csv)], { type: 'text/csv' });
            download_file("results.csv", blob);
          }}>
            <strong>Grade summary</strong>
            <span>results.csv · scores and student details</span>
          </button>
        </div>
        <div>
          <button class="export-card" disabled={examResults.length === 0} onClick={e => {
            const csv = buildRawResultsCsvRows({ examResults, pdfName });

            const blob = new Blob([createCSV(csv)], { type: 'text/csv' });
            download_file("raw_results.csv", blob);
          }}>
            <strong>Detailed responses</strong>
            <span>raw_results.csv · every answer position</span>
          </button>
        </div>
        <div>

          <button class="export-card" disabled={examResults.length === 0} onClick={async e => {
            let pdfHash = null;
            if (pdf) {
              pdfHash = await hashBlob(new Blob([await pdf.getData()], { type: 'application/pdf' }));
            }
            const dataset = {
              pdfHash,
              twoSided: cfg.twoSided,
              hasMultiAnswer: cfg.hasMultiAnswer,
              multiAnswerQuestions: multiAnswerQuestionsFor(cfg),
              examResults: JSON.parse(JSON.stringify(examResults)),
              answerKey: cfg.answerKey
            };

            // Erase diffs and questionable flags
            dataset.examResults = dataset.examResults.map(er => ({ ...er, diffs: [] }));
            dataset.examResults.forEach(er => er.raw_answers.forEach(ra => delete ra.questionable));

            const blob = new Blob([JSON.stringify(dataset)], { type: 'application/json' });
            download_file("results.json", blob);
          }}>
            <strong>Working dataset</strong>
            <span>results.json · resume this scan later</span>
          </button>
        </div>
      </div>
      <div class="row">
        <hr class="mt-2" />
      </div>
      <div class="row mb-2">
        <div class="col-3"><p class="fw-bold btn">Import results from raw_results.csv:</p></div>
        <div class="col-5"><div class="form-floating">
          <input disabled={currentlyScanning} type="number" class="form-control" id="resultsCsvImportPage" placeholder="1" value={importCSVPage1} onInput={e => setImportCSVPage1(e.target.value)} />
          <label for="resultsCsvImportPage">PDF page # corresponding to Page 1 in CSV</label>
        </div></div>
        <div class="col-4"><input type="file" disabled={currentlyScanning} id="resultsCsvImport" class="btn btn-outline-danger w-100" accept="text/csv" onChange={async e => await rawCsvImport(e.target.files)} /></div>
      </div>
      <div class="row">
        <hr class="mt-2" />
      </div>
      <div class="row mb-2">
        <div class="col-6"><label class="fw-bold btn" htmlFor="resultsJsonImport">Import results from results.json:</label></div>
        <div class="col-6"><input type="file" disabled={currentlyScanning} id="resultsJsonImport" class="btn btn-outline-danger w-100" accept="application/json" onChange={async e => {
          if (examResults.length > 0) {
            const confirmation = window.confirm("This will erase current exam scans. Are you sure?");
            if (!confirmation) return;
          }
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const dataset = JSON.parse(await file.text());
            const pdfHash = pdf === null ? null : (await hashBlob(new Blob([await pdf.getData()], { type: 'application/pdf' })));
            if (dataset.pdfHash !== null) {
              if (dataset.pdfHash !== pdfHash) {
                if (pdfHash === null) {
                  if (!window.confirm("There is no PDF loaded; PDF export will be disabled. Are you sure?")) return;
                } else {
                  if (!window.confirm("The current PDF loaded is different from the one used to generate these results; PDF export will be disabled. Are you sure?")) return;
                }
              }
            }

            if (dataset.pdfHash !== pdfHash) {
              // Wipe out homographies
              dataset.examResults.forEach(er => {
                if ('homographies' in er) delete er.homographies;
                if ('homographies2' in er) delete er.homographies2;
              })
            }
            setCfg({
              ...cfg,
              twoSided: dataset.twoSided,
              answerKey: dataset.answerKey,
              hasMultiAnswer: Boolean(dataset.hasMultiAnswer),
              multiAnswerQuestions: dataset.multiAnswerQuestions ?? {}
            });
            setExamResults(dataset.examResults.map(result => ({
              ...result,
              answers: fixAnswers(
                { twoSided: dataset.twoSided },
                result.answers ?? []
              )
            })));
          } catch (e) {
            window.alert("Invalid JSON file: " + e.message);
          }
        }} /></div>
      </div>

      {'results' in comparison ?
        <div class="row">
          <hr />
          <p class="display-6">
            Differences:
          </p>
          <input id="showActioned" type="checkbox" class="btn-check" autocomplete="off" checked={cfg.showActioned} onChange={
            e => setCfg(cfg => ({ ...cfg, showActioned: e.target.checked }))
          } />
          <label class="btn btn-outline-primary" htmlFor="showActioned">Show differences that have been actioned</label>
        </div>
        : <></>}
      {('results' in comparison && diffs.length === 0) ?
        <div class="row">
          <p class="fw-bold">
            No differences detected.
          </p>
        </div>
        : <></>}
      <DiffInput diffNumbers={diffNumbers} field="student_number" examResults={examResults} setExamResults={setExamResults} showActioned={cfg.showActioned}>
        Differences detected in student numbers:
      </DiffInput>
      <DiffInput diffNumbers={diffSurnames} field="surname" examResults={examResults} setExamResults={setExamResults} showActioned={cfg.showActioned}>
        Differences detected in student surnames:
      </DiffInput>
      <DiffInput diffNumbers={diffInitials} field="initials" examResults={examResults} setExamResults={setExamResults} showActioned={cfg.showActioned}>
        Differences detected in student initials:
      </DiffInput>
      <DiffAnswers cfg={cfg} diffAnswers={diffAnswers} examResults={examResults} setExamResults={setExamResults} showActioned={cfg.showActioned} />
      {'results' in comparison ? <hr /> : <></>}
      {cfg.showQuestionable && examResults.length > 0 ? <>
        <div class="row">
          <hr />
          <p class="display-6">
            Questionable scans:
          </p>
          <input id="showQActioned" type="checkbox" class="btn-check" autocomplete="off" checked={cfg.showQActioned} onChange={
            e => setCfg(cfg => ({ ...cfg, showQActioned: e.target.checked }))
          } />
          <label class="btn btn-outline-primary" htmlFor="showQActioned">Show questionable scans that have been actioned</label>
        </div>
        <Questionable cfg={cfg} examResults={examResults} setExamResults={setExamResults} showActioned={cfg.showQActioned} />
      </>
        : <></>}
      <div>
        <div class="row">
          <div class="col-12">
            <hr />
            <p class="display-6">Canvas Transfer</p>
          </div>
        </div>
        {canvasCSV === null ? <>
          <div class="row">
            <div class="col-6">
              <label htmlFor="canvasCsvUpload">Submit Canvas Gradebook CSV</label>
            </div>
            <div class="col-6">
              <input type="file" accept="text/csv" onChange={async e => {
                const file = e.target.files?.[0];
                if (!file) return;
                const csv = await loadCSV(file);
                if (csv[0][0] === 'Student' && csv[0][1] === 'ID' && csv[0][2] === 'SIS User ID' && csv[0][3] === 'SIS Login ID' && csv[0][4] === 'Integration ID' && csv[0][5] === 'Section') {
                  setCanvasCSV(csv);
                  // Find assignments
                  const assignments = [];
                  for (let x = 6; x < csv[2].length; x++) {
                    if (csv[2][x].trimEnd() !== "" && !isNaN(csv[2][x])) {
                      assignments.push({ col: x, fullName: csv[0][x], name: csv[0][x].replace(/ \([0-9][0-9]*\)$/, ''), totalMarks: Number.parseInt(csv[2][x]) });
                    }
                  }
                  setCanvasAssignments(assignments);
                  setCanvasAssignment('-1');
                } else {
                  window.alert("Not a valid Canvas Gradebook CSV.");
                }
              }} class="btn" id="canvasCsvUpload" />
            </div>
          </div>
        </> : <><div class="row">
          <button class="btn btn-outline-info" onClick={e => {
            setCanvasCSV(null);
            setCanvasAssignments([]);
            setCanvasAssignment('-1');
          }}>Remove Canvas Gradebook CSV</button>
        </div></>}

        {canvasCSV === null ? <></> : <div class="row">
          <div class="row">
            <p>Matched exams: {examResults.length - unmatchedExamResults.length} / {examResults.length}</p>
            <p>Unmatched exams: {unmatchedExamResults.length}</p>
            <p>Canvas students without matched exams: {canvasCSV.length - 3 - (examResults.length - unmatchedExamResults.length)}</p>
          </div>
          <div class="row">
            <div class="container mb-2" style={{ maxHeight: "300px", overflow: "auto" }}>
              {
                range(Math.max(unmatchedExamResults.length, unmatchedStudents.length)).map(i => <div class="row mb-1">
                  <div class="col-5">
                    {i >= unmatchedExamResults.length ? <></> : <div class="card">
                      <div class="card-body d-flex justify-content-between align-items-center">
                        <div class="card-text">
                          <p>Page {examResults[unmatchedExamResults[i]].page}: {examResults[unmatchedExamResults[i]].surname}, {examResults[unmatchedExamResults[i]].initials} ({examResults[unmatchedExamResults[i]].student_number})</p>
                        </div>
                        <div>
                          {matchSelect === null || matchSelect[0] === 'R' || matchSelect[1] === i ?
                            <button class={`btn btn-${matchSelect?.[1] !== i || matchSelect[0] === 'R' ? 'outline-' : ''}secondary`} onClick={
                              e => setMatchSelect(prev => {
                                if (prev === null) {
                                  return ['L', i];
                                }
                                if (prev[0] === 'R') {
                                  setResultFields(
                                    setExamResults,
                                    unmatchedExamResults[i],
                                    { student_number: `${normaliseStudentNum(canvasCSV[unmatchedStudents[prev[1]]][4])}` }
                                  );
                                }
                                return null;
                              })
                            }>Match</button> : <></>}
                        </div>
                      </div>
                    </div>}
                  </div>
                  <div class="col-2">
                    {matchSelect !== null || i >= Math.min(unmatchedExamResults.length, unmatchedStudents.length) ? <></> :
                      <button class="btn btn-outline-primary position-relative top-50 start-50 translate-middle" onClick={
                        e => setResultFields(
                          setExamResults,
                          unmatchedExamResults[i],
                          { student_number: `${normaliseStudentNum(canvasCSV[unmatchedStudents[i]][4])}` }
                        )
                      }>←&nbsp;Match&nbsp;→</button>}
                  </div>
                  <div class="col-5">
                    {i >= unmatchedStudents.length ? <></> : <div class="card">
                      <div class="card-body d-flex justify-content-between align-items-center">
                        <div>
                          {matchSelect === null || matchSelect[0] === 'L' || matchSelect[1] === i ?
                            <button class={`btn btn-${matchSelect?.[1] !== i || matchSelect[0] === 'L' ? 'outline-' : ''}secondary`} onClick={
                              e => setMatchSelect(prev => {
                                if (prev === null) {
                                  return ['R', i];
                                }
                                if (prev[0] === 'L') {
                                  setResultFields(
                                    setExamResults,
                                    unmatchedExamResults[prev[1]],
                                    { student_number: `${normaliseStudentNum(canvasCSV[unmatchedStudents[i]][4])}` }
                                  );
                                }
                                return null;
                              })
                            }>Match</button> : <></>}
                        </div>
                        <div class="card-text">
                          <p>{canvasCSV[unmatchedStudents[i]][0]} ({canvasCSV[unmatchedStudents[i]][4]})</p>
                        </div>
                      </div>
                    </div>}
                  </div>
                </div>)
              }
            </div>
            <hr />
          </div>
        </div>}

        <div class="row">
          <div class="col-6">
            <label htmlFor="selectAssessmentItem" class="fw-bold">Select assessment item:</label>
          </div>
          <div class="col-6">
            <select
              class={`form-select${canvasAssignment === '-1' ? ' fst-italic' : ''}`}
              value={canvasAssignment}
              id="selectAssessmentItem"
              onChange={e => setCanvasAssignment(e.target.value)}
            >
              <option class="fst-italic" value="-1">(no assignment selected)</option>
              {canvasAssignments.map((a, i) => <option class="fst-normal" key={i} value={i}>{a.name}</option>)}
            </select>
          </div>
        </div>
        {canvasAssignment === '-1' ? <></> : <><div class="row mt-2 mb-2">
          <div class="col-4">Assignment points possible: <span class="fw-bold">{canvasAssignments[canvasAssignment].totalMarks}</span></div>
          <div class="col-4">Points per question: <input type="number" value={marksPerQuestion} onInput={
            e => setMarksPerQuestion(e.target.value)
          } /></div>
          <div class="col-4">Points possible: <span class="fw-bold">{Object.values(cfg.answerKey).filter(a => Object.keys(a).length > 0).length * marksPerQuestion}</span></div>
          <div class="col-12"><hr class="mt-2" /></div>
        </div>
          <div class="row w-100">
            <div class="col-12 fw-bold"><p>Export grades:</p></div>
            <div class="col-12">
              <p>{examResultMatches.size} grade(s) will be exported</p>
              <p>{[...(examResultMatches.values().map(y => canvasCSV[y][canvasAssignments[canvasAssignment].col]).filter(v => v !== ''))].length} grade(s) will be overwritten</p>
            </div>
            <div class="col-12">
              <button class="btn btn-outline-primary" onClick={e => {
                const csv = JSON.parse(JSON.stringify(canvasCSV));
                for (const i of examResultMatches.keys()) {
                  const j = examResultMatches.get(i);
                  const col = canvasAssignments[canvasAssignment].col;
                  csv[j][col] = calculateScore(
                    examResults[i].answers,
                    cfg.answerKey,
                    multiAnswerQuestionsFor(cfg)
                  );
                }
                const blob = new Blob([createCSV(csv)]);
                download_file("canvas-export.csv", blob);
              }}>Export Canvas CSV</button>
            </div>
          </div>
          {examResults.filter(r => 'homographies' in r).length === 0 ? <></> : <>
            <DownloadPDFs examResults={examResults} pdf={pdf} cfg={cfg} assignment={canvasAssignments[canvasAssignment]} canvasCSV={canvasCSV} examResultMatches={examResultMatches} />
          </>}
        </>
        }

      </div>
      <div class="row">
        <div class="col-12">
          <hr />
        </div>
      </div>
      <div class="row mb-4">
        <ExamAnalysis examResults={examResults} cfg={cfg} />
      </div>

          </WorkspaceSection>
        </main>
      </div>
    </div>
  );
}
