import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { calculateMaximumScore, calculateScore, normaliseStudentNum } from '../examDomain.mjs';
import {
  canvasStudentsToGradebookRows,
  connectCanvas,
  disconnectCanvas,
  hasSavedCanvasToken,
  listCanvasAssignments,
  listCanvasCourses,
  listCanvasStudents,
  uploadCanvasResult
} from '../services/canvasDesktop.mjs';
import { hashBlob } from '../services/examArtifacts.mjs';
import { applyManualCanvasMatches, matchExamResultsToCanvas } from '../services/canvasMatching.mjs';
import { CanvasRosterMatch } from './CanvasRosterMatch.jsx';

const DEFAULT_CANVAS_URL = 'https://canvas.qut.edu.au';
const DEFAULT_COMMENT = 'Your marked test answer sheet is attached. Please contact the teaching team if you believe any response has been recorded incorrectly.';
const multiAnswerQuestionsFor = cfg => cfg.hasMultiAnswer ? (cfg.multiAnswerQuestions ?? {}) : {};

function errorMessage(error) {
  return error instanceof Error ? error.message : `${error}`;
}

export function DirectCanvasTransfer({ examResults, setExamResults, cfg, pdf, createAnnotatedPdf }) {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_CANVAS_URL);
  const [accessToken, setAccessToken] = useState('');
  const [rememberToken, setRememberToken] = useState(false);
  const [savedToken, setSavedToken] = useState(false);
  const [profile, setProfile] = useState(null);
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [assignments, setAssignments] = useState([]);
  const [assignmentId, setAssignmentId] = useState('');
  const [students, setStudents] = useState([]);
  const [manualMatches, setManualMatches] = useState(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [includeComment, setIncludeComment] = useState(true);
  const [comment, setComment] = useState(DEFAULT_COMMENT);
  const [upload, setUpload] = useState(null);
  const cancelUpload = useRef(false);

  const canvasCSV = useMemo(() => canvasStudentsToGradebookRows(students), [students]);
  const automaticMatches = matchExamResultsToCanvas(examResults, students.length > 0 ? canvasCSV : null);
  const matchResult = applyManualCanvasMatches(automaticMatches, manualMatches);
  const selectedCourse = courses.find(course => course.id === courseId) ?? null;
  const selectedAssignment = assignments.find(assignment => assignment.id === assignmentId) ?? null;
  const missingIdentifiers = students.filter(student => normaliseStudentNum(
    student.integrationId || student.sisUserId || student.loginId || ''
  ) === null).length;
  const canAttachAll = Boolean(pdf) && [...matchResult.examResultMatches.keys()]
    .every(index => 'homographies' in examResults[index]);

  useEffect(() => {
    let active = true;
    hasSavedCanvasToken(DEFAULT_CANVAS_URL)
      .then(value => {
        if (active) {
          setSavedToken(value);
          setRememberToken(value);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const refreshSavedToken = async () => {
    try {
      const value = await hasSavedCanvasToken(baseUrl);
      setSavedToken(value);
      if (value) setRememberToken(true);
    } catch (caught) {
      setSavedToken(false);
      setError(errorMessage(caught));
    }
  };

  const connect = async event => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const connectedProfile = await connectCanvas({ baseUrl, accessToken, rememberToken });
      const loadedCourses = await listCanvasCourses();
      loadedCourses.sort((left, right) => `${right.termName ?? ''} ${right.courseCode}`.localeCompare(`${left.termName ?? ''} ${left.courseCode}`));
      setProfile(connectedProfile);
      setCourses(loadedCourses);
      setAccessToken('');
      setSavedToken(rememberToken);
      setCourseId('');
      setAssignments([]);
      setStudents([]);
      setManualMatches(new Map());
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  };

  const disconnect = async forgetToken => {
    setLoading(true);
    setError(null);
    try {
      await disconnectCanvas(forgetToken);
      setProfile(null);
      setCourses([]);
      setCourseId('');
      setAssignments([]);
      setStudents([]);
      setManualMatches(new Map());
      setAssignmentId('');
      if (forgetToken) {
        setSavedToken(false);
        setRememberToken(false);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  };

  const selectCourse = async event => {
    const value = event.target.value;
    setCourseId(value);
    setAssignmentId('');
    setAssignments([]);
    setStudents([]);
    setManualMatches(new Map());
    setUpload(null);
    if (!value) return;
    setLoading(true);
    setError(null);
    try {
      const [loadedAssignments, loadedStudents] = await Promise.all([
        listCanvasAssignments(value),
        listCanvasStudents(value)
      ]);
      setAssignments(loadedAssignments);
      setStudents(loadedStudents);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  };

  const uploadResults = async ({ updateGrades, includePdfs }) => {
    if (!selectedCourse || !selectedAssignment) return;
    const matched = [...matchResult.examResultMatches];
    if (matched.length === 0) return;
    if (includePdfs && !canAttachAll) return;
    const action = updateGrades
      ? (includePdfs ? 'grades and exam PDFs' : 'grades')
      : 'exam PDFs';
    const confirmation = window.confirm(
      `Upload ${action} for ${matched.length} student${matched.length === 1 ? '' : 's'} to "${selectedAssignment.name}" in "${selectedCourse.courseCode}"?`
      + (includePdfs
        ? '\n\nAny earlier PDF and comment managed by Exam Scanner for these submissions will be replaced if the result has changed.'
        : '\n\nExisting exam PDFs and comments will be left unchanged.')
    );
    if (!confirmation) return;

    cancelUpload.current = false;
    setError(null);
    setUpload({ running: true, completed: 0, total: matched.length, updated: 0, unchanged: 0, failed: [] });
    let sourceDocument = null;
    try {
      if (includePdfs) {
        const { PDFDocument } = await import('pdf-lib');
        sourceDocument = await PDFDocument.load(await pdf.getData());
      }
    } catch (caught) {
      const message = errorMessage(caught);
      setError(`Could not prepare the source PDF: ${message}`);
      setUpload({ running: false, completed: 0, total: matched.length, updated: 0, unchanged: 0, failed: [] });
      return;
    }

    let completed = 0;
    let updated = 0;
    let unchanged = 0;
    const failed = [];
    for (const [examIndex, canvasIndex] of matched) {
      if (cancelUpload.current) break;
      const result = examResults[examIndex];
      const student = canvasCSV[canvasIndex];
      try {
        let pdfBytes = null;
        let hash = '00000000';
        if (includePdfs) {
          const blob = await createAnnotatedPdf(cfg, result, sourceDocument);
          hash = (await hashBlob(blob)).slice(0, 8);
          pdfBytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
        }
        const response = await uploadCanvasResult({
          courseId,
          assignmentId,
          userId: student[1],
          score: updateGrades
            ? calculateScore(result.answers, cfg.answerKey, multiAnswerQuestionsFor(cfg), cfg.marking)
            : null,
          hash,
          pdfBytes,
          includeComment: includePdfs && includeComment,
          comment
        });
        if (response.status === 'unchanged') unchanged++;
        else updated++;
      } catch (caught) {
        failed.push({ name: student[0], studentNumber: student[4], message: errorMessage(caught) });
      }
      completed++;
      setUpload({ running: true, completed, total: matched.length, updated, unchanged, failed: [...failed] });
    }
    setUpload({
      running: false,
      cancelled: cancelUpload.current,
      completed,
      total: matched.length,
      updated,
      unchanged,
      failed
    });
  };

  if (!profile) {
    return <div class="canvas-direct-connect">
      <div class="canvas-direct-intro">
        <strong>Connect the desktop app directly to Canvas</strong>
        <p>Select a course and assignment, match the roster, then upload grades and marked answer sheets without an intermediate CSV.</p>
      </div>
      <form class="canvas-connect-form" onSubmit={connect}>
        <div class="field-group">
          <label htmlFor="canvasBaseUrl">Canvas address</label>
          <input id="canvasBaseUrl" type="url" value={baseUrl} required onBlur={refreshSavedToken}
            onInput={event => setBaseUrl(event.target.value)} />
        </div>
        <div class="field-group">
          <label htmlFor="desktopCanvasToken">Access token</label>
          <input id="desktopCanvasToken" type="password" value={accessToken} autocomplete="off"
            placeholder={savedToken ? 'Saved token will be used' : 'Paste a Canvas access token'}
            required={!savedToken} onInput={event => setAccessToken(event.target.value)} />
        </div>
        <label class="compact-check canvas-remember-token">
          <input type="checkbox" checked={rememberToken} onChange={event => setRememberToken(event.target.checked)} />
          Remember token in the operating system credential store
        </label>
        {savedToken ? <p class="canvas-saved-token">A saved token is available for this Canvas site.</p> : null}
        {error ? <div class="alert alert-danger mb-0" role="alert">{error}</div> : null}
        <button type="submit" class="btn btn-primary" disabled={loading}>{loading ? 'Connecting…' : 'Connect to Canvas'}</button>
      </form>
    </div>;
  }

  return <div class="canvas-direct">
    <div class="canvas-connection-bar">
      <div><strong>Connected as {profile.name}</strong><span>{profile.primaryEmail || baseUrl}</span></div>
      <div>
        <button type="button" class="btn btn-sm btn-outline-secondary" disabled={loading} onClick={() => disconnect(false)}>Disconnect</button>
        {savedToken ? <button type="button" class="btn btn-sm btn-outline-danger" disabled={loading}
          onClick={() => disconnect(true)}>Disconnect and forget token</button> : null}
      </div>
    </div>

    {error ? <div class="alert alert-danger" role="alert">{error}</div> : null}
    <div class="canvas-direct-selectors">
      <div class="field-group">
        <label htmlFor="canvasCourse">Course</label>
        <select id="canvasCourse" value={courseId} disabled={loading} onChange={selectCourse}>
          <option value="">(select a course)</option>
          {courses.map(course => <option key={course.id} value={course.id}>
            {course.courseCode} — {course.name}{course.termName ? ` (${course.termName})` : ''}
          </option>)}
        </select>
      </div>
      <div class="field-group">
        <label htmlFor="canvasDirectAssignment">Assessment item</label>
        <select id="canvasDirectAssignment" value={assignmentId} disabled={loading || !courseId}
          onChange={event => { setAssignmentId(event.target.value); setUpload(null); }}>
          <option value="">(select an assessment item)</option>
          {assignments.map(assignment => <option key={assignment.id} value={assignment.id}>
            {assignment.name}{assignment.pointsPossible !== null ? ` — ${assignment.pointsPossible} points` : ''}
            {assignment.published ? '' : ' (unpublished)'}
          </option>)}
        </select>
      </div>
    </div>
    {loading ? <p class="canvas-loading">Loading Canvas data…</p> : null}

    {students.length > 0 ? <>
      {missingIdentifiers > 0 ? <div class="alert alert-warning">
        Canvas did not return a numeric student identifier for {missingIdentifiers} roster {missingIdentifiers === 1 ? 'entry' : 'entries'}.
        Those students can still be paired manually by name.
      </div> : null}
      <CanvasRosterMatch examResults={examResults} setExamResults={setExamResults} canvasCSV={canvasCSV} matchResult={matchResult}
        onMatch={(examIndex, canvasIndex) => setManualMatches(previous => new Map(previous).set(examIndex, canvasIndex))} />
    </> : null}

    {selectedAssignment ? <div class="canvas-direct-upload">
      <div class="canvas-assignment__summary canvas-direct-upload__summary">
        <span>{selectedAssignment.pointsPossible ?? 'Unknown'} assignment points</span>
        <span>{calculateMaximumScore(cfg.answerKey, cfg.marking)} scanner points</span>
        <span>{matchResult.examResultMatches.size} matched grades</span>
      </div>
      <div class="canvas-upload-options">
        <label class="compact-check"><input type="checkbox" checked={includeComment}
          disabled={!canAttachAll || upload?.running} onChange={event => setIncludeComment(event.target.checked)} />Include message with PDF uploads</label>
        {canAttachAll && includeComment ? <div class="field-group canvas-comment-field">
          <label htmlFor="directCanvasComment">Message to student</label>
          <textarea id="directCanvasComment" rows="3" value={comment} disabled={upload?.running}
            onInput={event => setComment(event.target.value)} />
        </div> : null}
      </div>
      {!canAttachAll ? <p class="form-text">Marked PDFs require the source PDF and scan registration data. Grade-only upload remains available.</p> : null}
      <div class="canvas-direct-upload__actions">
        <button type="button" class="btn btn-outline-primary" disabled={upload?.running || matchResult.examResultMatches.size === 0}
          onClick={() => uploadResults({ updateGrades: true, includePdfs: false })}>Upload grades</button>
        <button type="button" class="btn btn-outline-primary"
          disabled={upload?.running || matchResult.examResultMatches.size === 0 || !canAttachAll}
          onClick={() => uploadResults({ updateGrades: false, includePdfs: true })}>Upload exam PDFs</button>
        <button type="button" class="btn btn-primary"
          disabled={upload?.running || matchResult.examResultMatches.size === 0 || !canAttachAll}
          onClick={() => uploadResults({ updateGrades: true, includePdfs: true })}>Upload grades and PDFs</button>
        {upload?.running ? <button type="button" class="btn btn-outline-secondary"
          onClick={() => { cancelUpload.current = true; }}>Stop after current student</button> : null}
      </div>
      {upload ? <div class={`canvas-upload-status ${upload.failed.length > 0 ? 'has-errors' : ''}`} aria-live="polite">
        <strong>{upload.running ? `Uploading ${upload.completed + 1} of ${upload.total}…` : upload.cancelled ? 'Upload stopped' : 'Upload complete'}</strong>
        <span>{upload.updated} updated · {upload.unchanged} already current · {upload.failed.length} failed</span>
        <progress max={upload.total} value={upload.completed}></progress>
        {upload.failed.length > 0 ? <details>
          <summary>Show failed students</summary>
          <ul>{upload.failed.map(item => <li key={`${item.studentNumber}-${item.name}`}><strong>{item.name}</strong> ({item.studentNumber}): {item.message}</li>)}</ul>
        </details> : null}
      </div> : null}
    </div> : null}
  </div>;
}
