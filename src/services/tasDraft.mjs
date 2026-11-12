const EXAM_FIELDS = ['unitCode', 'examType', 'year', 'semester', 'description', 'questionCount', 'studentCount', 'comments'];
const DEFAULTED_FIELDS = new Set(['year', 'questionCount', 'studentCount']);

export function normaliseTasDraft(draft) {
  const result = {};
  for (const field of EXAM_FIELDS) {
    const value = draft?.[field];
    if (typeof value === 'string' && (value || DEFAULTED_FIELDS.has(field))) result[field] = value;
  }
  if (draft?.appendScans === true) result.appendScans = true;
  return result;
}
