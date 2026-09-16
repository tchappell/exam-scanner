import { calculateMaximumScore } from '../examDomain.mjs';

const createRange = questionCount => ({
  id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
  from: 0,
  to: Math.max(0, questionCount - 1),
  marks: 1
});

export function MarkAllocation({ cfg, setCfg, currentlyScanning, manualMarks, setManualMarks }) {
  const questionCount = cfg.twoSided ? 160 : 40;
  const marking = cfg.marking ?? { defaultMarks: 1, ranges: [], overrides: {} };

  const updateMarking = change => setCfg(previous => ({
    ...previous,
    marking: change(previous.marking ?? { defaultMarks: 1, ranges: [], overrides: {} })
  }));
  const addRange = () => updateMarking(previous => ({
    ...previous,
    ranges: [...(previous.ranges ?? []), createRange(questionCount)]
  }));
  const updateRange = (index, field, value) => updateMarking(previous => ({
    ...previous,
    ranges: (previous.ranges ?? []).map((range, rangeIndex) => rangeIndex === index
      ? { ...range, [field]: field === 'marks' ? value : Math.max(0, Number(value) - 1) }
      : range)
  }));
  const removeRange = index => updateMarking(previous => ({
    ...previous,
    ranges: (previous.ranges ?? []).filter((_, rangeIndex) => rangeIndex !== index)
  }));

  return (
    <section class="mark-allocation" aria-labelledby="mark-allocation-title">
      <div class="mark-allocation__header">
        <div>
          <h3 id="mark-allocation-title">Question marks</h3>
          <p>Use one default, then add only the ranges or individual exceptions you need.</p>
        </div>
        <strong>{calculateMaximumScore(cfg.answerKey, marking)} marks available</strong>
      </div>
      <div class="mark-allocation__default">
        <label htmlFor="defaultQuestionMarks">Default per keyed question</label>
        <input id="defaultQuestionMarks" type="number" min="0" step="any"
          disabled={currentlyScanning} value={marking.defaultMarks}
          onInput={event => updateMarking(previous => ({ ...previous, defaultMarks: event.target.value }))} />
        <button type="button" class="btn btn-sm btn-outline-primary" disabled={currentlyScanning} onClick={addRange}>
          Add mark range
        </button>
        <label class="compact-check" htmlFor="manualQuestionMarks">
          <input id="manualQuestionMarks" type="checkbox" checked={manualMarks}
            disabled={currentlyScanning} onChange={event => setManualMarks(event.target.checked)} />
          Edit individual questions
        </label>
      </div>
      {(marking.ranges ?? []).length > 0 ? (
        <div class="mark-ranges" aria-label="Question mark ranges">
          {(marking.ranges ?? []).map((range, index) => (
            <div class="mark-range" key={range.id ?? index}>
              <label>Questions <input type="number" min="1" max={questionCount} value={Number(range.from) + 1}
                disabled={currentlyScanning} aria-label={`Range ${index + 1} first question`}
                onInput={event => updateRange(index, 'from', event.target.value)} /></label>
              <span>to</span>
              <input type="number" min="1" max={questionCount} value={Number(range.to) + 1}
                disabled={currentlyScanning} aria-label={`Range ${index + 1} last question`}
                onInput={event => updateRange(index, 'to', event.target.value)} />
              <label>worth <input type="number" min="0" step="any" value={range.marks}
                disabled={currentlyScanning} aria-label={`Range ${index + 1} marks per question`}
                onInput={event => updateRange(index, 'marks', event.target.value)} /></label>
              <span>each</span>
              <button type="button" class="btn btn-sm btn-link text-danger" disabled={currentlyScanning}
                onClick={() => removeRange(index)}>Remove</button>
            </div>
          ))}
        </div>
      ) : null}
      {manualMarks ? <p class="mark-allocation__hint">
        Individual values shown below override both the default and ranges. Leave a value blank to use the applicable default or range.
      </p> : null}
    </section>
  );
}
