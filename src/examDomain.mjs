export const ANSWER_OPTIONS = Object.freeze(['A', 'B', 'C', 'D', 'E']);

export function normaliseAnswer(answer) {
  const value = Array.isArray(answer) ? answer.join('') : `${answer ?? ''}`;
  const selected = new Set(value.toUpperCase().match(/[A-E]/g) ?? []);
  return ANSWER_OPTIONS.filter(option => selected.has(option)).join('') || ' ';
}

export function answerIncludes(answer, option) {
  return normaliseAnswer(answer).includes(option);
}

export function updateAnswer(answer, option, multiple = false) {
  if (option === ' ' || option === '-') return ' ';
  if (!multiple) return option;

  const selected = new Set(normaliseAnswer(answer).trim().split(''));
  if (selected.has(option)) selected.delete(option);
  else selected.add(option);
  return normaliseAnswer([...selected]);
}

export function isAnswerCorrect(answer, answerKeyEntry, multiple = false) {
  const expected = normaliseAnswer(
    Object.entries(answerKeyEntry ?? {})
      .filter(([, enabled]) => enabled)
      .map(([option]) => option)
  );
  if (expected === ' ') return false;

  const response = normaliseAnswer(answer);
  if (multiple) return response === expected;
  return response.length === 1 && Boolean(answerKeyEntry?.[response]);
}

export function createAnswerKey(answers) {
  return Object.fromEntries(answers.flatMap((answer, question) => {
    const selected = normaliseAnswer(answer).trim().split('');
    return selected.length > 0
      ? [[question, Object.fromEntries(selected.map(option => [option, true]))]]
      : [];
  }));
}

export function calculateScore(answers, answerKey, multiAnswerQuestions = {}) {
  let score = 0;

  for (let i = 0; i < answers.length; i++) {
    if (isAnswerCorrect(answers[i], answerKey[i], Boolean(multiAnswerQuestions[i]))) score++;
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
  return answers.map(normaliseAnswer).concat(ANSWER_PADDING).slice(0, count);
}
