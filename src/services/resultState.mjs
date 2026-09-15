export function updateExamResult(setExamResults, index, fields) {
  setExamResults(previous => previous.map((result, resultIndex) => {
    if (resultIndex !== index) return result;
    const update = typeof fields === 'function' ? fields(result) : fields;
    return { ...result, ...update };
  }));
}
