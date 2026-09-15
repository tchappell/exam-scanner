const RAW_RESULTS_COLUMN_COUNT = 167;

export function buildComparisonFromRows(rows, { filename, scannerConfig, previousComparison = {} }) {
  if (rows[0]?.length !== RAW_RESULTS_COLUMN_COUNT) {
    return { error: `This is not a valid ACSPRI raw results file (must have ${RAW_RESULTS_COLUMN_COUNT} columns)` };
  }

  const results = new Map();
  for (const row of rows.slice(1)) {
    const [, , studentNum, surname, initial, , pageInFile, ...q] = row;
    results.set(Number.parseInt(pageInFile, 10), { studentNum, surname, initial, q });
  }

  return {
    results,
    filename,
    cfg_checkNumbers: previousComparison.cfg_checkNumbers ?? true,
    cfg_checkName: previousComparison.cfg_checkName ?? false,
    cfg_checkInitials: previousComparison.cfg_checkInitials ?? false,
    cfg_checkAnswers: previousComparison.cfg_checkAnswers ?? true,
    cfg_firstPage: scannerConfig.startAt + (scannerConfig.hasMarker ? 1 : 0)
  };
}
