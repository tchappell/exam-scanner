import { isMultiAnswerQuestion, marksForQuestion, multiAnswerDefaultForQuestion } from '../examDomain.mjs';

const OPTIONS = ['A', 'B', 'C', 'D', 'E'];

export function AnswerKeyGrid({ cfg, setCfg, currentlyScanning, editIndividual }) {
  const questionCount = cfg.twoSided ? 160 : 40;
  const blocks = Array.from({ length: questionCount / 10 }, (_, block) =>
    Array.from({ length: 10 }, (_, row) => block * 10 + row)
  );

  const setMultiAnswer = (question, enabled) => {
    setCfg(previous => {
      const multiAnswerQuestions = { ...(previous.multiAnswerQuestions ?? {}) };
      if (enabled === multiAnswerDefaultForQuestion(previous, question)) delete multiAnswerQuestions[question];
      else multiAnswerQuestions[question] = enabled;
      return { ...previous, multiAnswerQuestions };
    });
  };

  const setCorrectOption = (question, option, enabled) => {
    setCfg(previous => {
      const answerKey = structuredClone(previous.answerKey);
      if (enabled) {
        answerKey[question] = { ...(answerKey[question] ?? {}), [option]: true };
      } else if (answerKey[question]) {
        delete answerKey[question][option];
        if (Object.keys(answerKey[question]).length === 0) delete answerKey[question];
      }
      return { ...previous, answerKey };
    });
  };

  const setQuestionMarks = (question, value) => {
    setCfg(previous => {
      const marking = previous.marking ?? { defaultMarks: 1, ranges: [], overrides: {} };
      const overrides = { ...(marking.overrides ?? {}) };
      if (`${value}`.trim() === '') delete overrides[question];
      else overrides[question] = value;
      return { ...previous, marking: { ...marking, overrides } };
    });
  };

  return (
    <div class={`answer-key-grid${cfg.twoSided ? ' is-two-sided' : ''}${editIndividual ? ' is-editing' : ''}`}>
      {blocks.map((questions, block) => (
        <fieldset class="answer-key-block" key={block}>
          <legend>Questions {questions[0] + 1}–{questions.at(-1) + 1}</legend>
          {questions.map(question => {
            const prefix = `ak_${question + 1}_`;
            return (
              <div class={`answer-key-row${editIndividual ? ' is-editing' : ''}`} key={question}>
                <span class="answer-key-row__number">{question + 1}</span>
                {editIndividual ? (
                  <label class="answer-key-row__marks" title={`Effective value: ${marksForQuestion(question, cfg.marking)} marks`}>
                    <span class="visually-hidden">Marks for question {question + 1}</span>
                    <input type="number" min="0" step="any" disabled={currentlyScanning}
                      placeholder={`${marksForQuestion(question, cfg.marking)}`}
                      value={cfg.marking?.overrides?.[question] ?? ''}
                      onInput={event => setQuestionMarks(question, event.target.value)} />
                  </label>
                ) : null}
                {editIndividual ? <div class="answer-key-toggle">
                  <input
                    type="checkbox"
                    class="btn-check"
                    autocomplete="off"
                    id={`${prefix}multi`}
                    aria-label={`Question ${question + 1} uses multiple answers`}
                    checked={isMultiAnswerQuestion(cfg, question)}
                    disabled={currentlyScanning}
                    onChange={event => setMultiAnswer(question, event.target.checked)}
                  />
                  <label
                    class="answer-key-row__multi"
                    htmlFor={`${prefix}multi`}
                    title={`Require an exact match to the key. Inherited setting is ${multiAnswerDefaultForQuestion(cfg, question) ? 'Multi' : 'Single'}.`}
                  >Multi</label>
                </div> : null}
                <div class="answer-key-row__options" role="group" aria-label={`Correct answer for question ${question + 1}`}>
                  {OPTIONS.map(option => <div class="answer-key-toggle" key={option}>
                    <input
                      type="checkbox"
                      class="btn-check"
                      autocomplete="off"
                      id={`${prefix}${option}`}
                      checked={Boolean(cfg.answerKey?.[question]?.[option])}
                      disabled={currentlyScanning}
                      onChange={event => setCorrectOption(question, option, event.target.checked)}
                    />
                    <label class="answer-option" htmlFor={`${prefix}${option}`}>{option}</label>
                  </div>)}
                </div>
              </div>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}
