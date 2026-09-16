import { Fragment } from 'preact';
import { ANSWER_OPTIONS, answerIncludes, calculateScore, isAnswerCorrect, marksForQuestion } from '../examDomain.mjs';

const multiAnswerQuestionsFor = cfg => cfg.hasMultiAnswer ? (cfg.multiAnswerQuestions ?? {}) : {};
const average = values => values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map(value => Math.pow(value - mean, 2))));
}

function discrimination(selectedScores, otherScores, deviation, total) {
  if (selectedScores.length === 0 || otherScores.length === 0 || deviation === 0) return 0;
  return (average(selectedScores) - average(otherScores)) / deviation
    * Math.sqrt((selectedScores.length * otherScores.length) / Math.pow(total, 2));
}

export function ExamAnalysis({ examResults, cfg }) {
  if (examResults.length === 0) return null;

  const multiAnswerQuestions = multiAnswerQuestionsFor(cfg);
  const questions = Object.keys(cfg.answerKey)
    .filter(question => Object.values(cfg.answerKey[question]).some(Boolean))
    .map(Number);
  const scores = examResults.map(result => calculateScore(
    result.answers, cfg.answerKey, multiAnswerQuestions, cfg.marking
  ));
  const sortedScores = [...scores].sort((left, right) => left - right);
  const median = sortedScores.length % 2 === 0
    ? average([sortedScores[sortedScores.length / 2 - 1], sortedScores[sortedScores.length / 2]])
    : sortedScores[Math.floor(sortedScores.length / 2)];

  const metrics = Object.fromEntries(questions.map(question => {
    const correct = examResults.map(result => isAnswerCorrect(
      result.answers[question], cfg.answerKey[question], Boolean(multiAnswerQuestions[question])
    ));
    const questionMarks = marksForQuestion(question, cfg.marking);
    const scoresWithoutQuestion = scores.map((score, index) => score - (correct[index] ? questionMarks : 0));
    const deviation = standardDeviation(scoresWithoutQuestion);
    const options = Object.fromEntries(ANSWER_OPTIONS.map(option => {
      const selected = examResults.map(result => answerIncludes(result.answers[question], option));
      return [option, {
        difficulty: selected.filter(Boolean).length / examResults.length,
        discrimination: discrimination(
          scoresWithoutQuestion.filter((_, index) => selected[index]),
          scoresWithoutQuestion.filter((_, index) => !selected[index]),
          deviation,
          examResults.length
        )
      }];
    }));
    return [question, {
      difficulty: correct.filter(Boolean).length / examResults.length,
      discrimination: discrimination(
        scoresWithoutQuestion.filter((_, index) => correct[index]),
        scoresWithoutQuestion.filter((_, index) => !correct[index]),
        deviation,
        examResults.length
      ),
      options
    }];
  }));

  const metricClass = value => value >= 0.3 ? 'table-success' : value >= 0.1 ? 'table-warning' : 'table-danger';

  return (
    <details class="exam-analysis">
      <summary>
        <span><small>Statistics</small>Exam analysis</span>
        <span>{examResults.length} {examResults.length === 1 ? 'student' : 'students'}</span>
      </summary>
      <div class="exam-analysis__body">
        <div class="analysis-summary">
          <div><strong>{Math.min(...scores)}</strong><span>minimum</span></div>
          <div><strong>{Math.max(...scores)}</strong><span>maximum</span></div>
          <div><strong>{average(scores).toFixed(2)}</strong><span>mean</span></div>
          <div><strong>{median.toFixed(2)}</strong><span>median</span></div>
        </div>
        <div class="analysis-table-wrap">
          <table class="table table-sm align-middle">
            <thead><tr><th>Question</th><th>Option</th><th>Difficulty</th><th>Discrimination</th></tr></thead>
            <tbody>
              {questions.map(question => <Fragment key={question}>
                <tr class={metricClass(metrics[question].discrimination)}>
                  <th>Q{question + 1} · {marksForQuestion(question, cfg.marking)} marks</th><td>Overall</td>
                  <td>{metrics[question].difficulty.toFixed(3)}</td>
                  <td>{metrics[question].discrimination.toFixed(3)}</td>
                </tr>
                {ANSWER_OPTIONS.map(option => <tr key={option}>
                  <td></td><td>{option} {cfg.answerKey[question]?.[option] ? '✓' : ''}</td>
                  <td>{metrics[question].options[option].difficulty.toFixed(3)}</td>
                  <td>{metrics[question].options[option].discrimination.toFixed(3)}</td>
                </tr>)}
              </Fragment>)}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}
