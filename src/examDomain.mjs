export function calculateScore(answers, answerKey) {
  let score = 0;

  for (let i = 0; i < answers.length; i++) {
    if (answerKey[i]?.[answers[i]]) score++;
  }

  return score;
}

export function normaliseStudentNum(studentNumber) {
  const value = `${studentNumber}`.trim();
  if (value === '' || Number.isNaN(Number(value))) return null;
  return Number.parseInt(value, 10);
}

const ANSWER_PADDING = Array(160).fill(' ');

export function fixAnswers(config, answers) {
  const count = config.twoSided ? 160 : 40;
  return answers.concat(ANSWER_PADDING).slice(0, count);
}
