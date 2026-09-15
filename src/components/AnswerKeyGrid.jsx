import { Fragment } from 'preact';

const OPTIONS = ['A', 'B', 'C', 'D', 'E'];

export function AnswerKeyGrid({ cfg, setCfg, currentlyScanning }) {
  const questionCount = cfg.twoSided ? 160 : 40;
  const blocks = Array.from({ length: questionCount / 10 }, (_, block) =>
    Array.from({ length: 10 }, (_, row) => block * 10 + row)
  );

  const setMultiAnswer = (question, enabled) => {
    setCfg(previous => {
      const multiAnswerQuestions = { ...(previous.multiAnswerQuestions ?? {}) };
      if (enabled) multiAnswerQuestions[question] = true;
      else delete multiAnswerQuestions[question];
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

  return (
    <div class="answer-key-grid">
      {blocks.map((questions, block) => (
        <fieldset class="answer-key-block" key={block}>
          <legend>Questions {questions[0] + 1}–{questions.at(-1) + 1}</legend>
          {questions.map(question => {
            const prefix = `ak_${question + 1}_`;
            const multiAnswer = Boolean(cfg.hasMultiAnswer && cfg.multiAnswerQuestions?.[question]);
            return (
              <div class="answer-key-row" key={question}>
                <span class="answer-key-row__number">{question + 1}</span>
                {cfg.hasMultiAnswer ? <>
                  <input
                    type="checkbox"
                    class="btn-check"
                    autocomplete="off"
                    id={`${prefix}multi`}
                    checked={multiAnswer}
                    disabled={currentlyScanning}
                    onChange={event => setMultiAnswer(question, event.target.checked)}
                  />
                  <label
                    class="answer-key-row__multi"
                    htmlFor={`${prefix}multi`}
                    aria-label={`Question ${question + 1} uses multiple answers`}
                    title="Require the selected set to exactly match every keyed answer"
                  >Multi</label>
                </> : null}
                <div class="answer-key-row__options" role="group" aria-label={`Correct answer for question ${question + 1}`}>
                  {OPTIONS.map(option => <Fragment key={option}>
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
                  </Fragment>)}
                </div>
              </div>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}
