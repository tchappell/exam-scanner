import { calculateMaximumScore } from '../examDomain.mjs';

const createRange = (questionCount, settings) => ({
  id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
  from: 0,
  to: Math.max(0, questionCount - 1),
  ...settings
});

export function MarkAllocation({ cfg, setCfg, currentlyScanning, editIndividual, setEditIndividual }) {
  const questionCount = cfg.twoSided ? 160 : 40;
  const marking = cfg.marking ?? { defaultMarks: 1, ranges: [], overrides: {} };

  const updateMarking = change => setCfg(previous => ({
    ...previous,
    marking: change(previous.marking ?? { defaultMarks: 1, ranges: [], overrides: {} })
  }));
  const addRange = settings => updateMarking(previous => ({
    ...previous,
    ranges: [...(previous.ranges ?? []), createRange(questionCount, settings)]
  }));
  const updateRange = (index, change) => updateMarking(previous => ({
    ...previous,
    ranges: (previous.ranges ?? []).map((range, rangeIndex) => rangeIndex === index ? change(range) : range)
  }));
  const setRangeBoundary = (index, field, value) => updateRange(index, range => ({
    ...range, [field]: Math.max(0, Number(value) - 1)
  }));
  const removeRange = index => updateMarking(previous => ({
    ...previous,
    ranges: (previous.ranges ?? []).filter((_, rangeIndex) => rangeIndex !== index)
  }));

  return (
    <section class="mark-allocation" aria-labelledby="mark-allocation-title">
      <div class="mark-allocation__header">
        <div>
          <h3 id="mark-allocation-title">Question settings</h3>
          <p>Add ranges or individual exceptions for marks and answer types.</p>
        </div>
        <strong>{calculateMaximumScore(cfg.answerKey, marking)} marks available</strong>
      </div>
      <div class="mark-allocation__default">
        <label htmlFor="defaultQuestionMarks">Default per keyed question</label>
        <input id="defaultQuestionMarks" type="number" min="0" step="any"
          disabled={currentlyScanning} value={marking.defaultMarks}
          onInput={event => updateMarking(previous => ({ ...previous, defaultMarks: event.target.value }))} />
        <button type="button" class="btn btn-sm btn-outline-primary" disabled={currentlyScanning} onClick={() => addRange({ marks: 1 })}>
          Add mark range
        </button>
        <button type="button" class="btn btn-sm btn-outline-primary" disabled={currentlyScanning}
          onClick={() => addRange({ multiAnswer: !cfg.hasMultiAnswer })}>
          Add answer type range
        </button>
        <label class="compact-check" htmlFor="manualQuestionMarks">
          <input id="manualQuestionMarks" type="checkbox" checked={editIndividual}
            disabled={currentlyScanning} onChange={event => setEditIndividual(event.target.checked)} />
          Edit individual questions
        </label>
      </div>
      {(marking.ranges ?? []).length > 0 ? (
        <div class="mark-ranges" aria-label="Question ranges">
          {(marking.ranges ?? []).map((range, index) => (
            <div class="mark-range" key={range.id ?? index}>
              <div class="mark-range__questions">
                <label>Questions <input type="number" min="1" max={questionCount} value={Number(range.from) + 1}
                  disabled={currentlyScanning} aria-label={`Range ${index + 1} first question`}
                  onInput={event => setRangeBoundary(index, 'from', event.target.value)} /></label>
                <span>to</span>
                <input type="number" min="1" max={questionCount} value={Number(range.to) + 1}
                  disabled={currentlyScanning} aria-label={`Range ${index + 1} last question`}
                  onInput={event => setRangeBoundary(index, 'to', event.target.value)} />
              </div>
              <label>Marks each <input type="number" min="0" step="any" value={range.marks ?? ''} placeholder="—"
                disabled={currentlyScanning} aria-label={`Range ${index + 1} marks per question`}
                onInput={event => {
                  const value = event.target.value;
                  updateRange(index, ({ marks, ...other }) => value === '' ? other : { ...other, marks: value });
                }} /></label>
              <label>Answer type <select value={typeof range.multiAnswer === 'boolean' ? (range.multiAnswer ? 'multi' : 'single') : ''}
                disabled={currentlyScanning} aria-label={`Range ${index + 1} answer type`}
                onChange={event => {
                  const value = event.target.value;
                  updateRange(index, ({ multiAnswer, ...other }) => value === '' ? other : { ...other, multiAnswer: value === 'multi' });
                }}>
                <option value="">Inherit</option>
                <option value="single">Single</option>
                <option value="multi">Multi</option>
              </select></label>
              <button type="button" class="btn btn-sm btn-link text-danger" disabled={currentlyScanning}
                onClick={() => removeRange(index)}>Remove</button>
            </div>
          ))}
          <p>Blank marks and inherited answer types use the default or an earlier range.</p>
        </div>
      ) : null}
      {editIndividual ? <p class="mark-allocation__hint">
        Individual settings override ranges and defaults. Leave marks blank or toggle Multi back to its inherited setting to use that setting.
      </p> : null}
    </section>
  );
}
