export function updateExamResult(setExamResults, index, fields) {
  setExamResults(previous => previous.map((result, resultIndex) => {
    if (resultIndex !== index) return result;
    const update = typeof fields === 'function' ? fields(result) : fields;
    const numberChanged = 'student_number' in update && update.student_number !== result.student_number;
    return { ...result, ...update, ...(numberChanged && result.canvasMatch ? { canvasMatch: null } : {}) };
  }));
}

export function pairExamWithCanvas(setExamResults, examIndex, canvasRow) {
  const userId = `${canvasRow[1] ?? ''}`.trim();
  if (!userId) return;
  setExamResults(previous => previous.map((result, index) => {
    if (index === examIndex) return {
      ...result, canvasMatch: { userId, studentNumber: `${result.student_number ?? ''}` }
    };
    return `${result.canvasMatch?.userId ?? ''}` === userId ? { ...result, canvasMatch: null } : result;
  }));
}
