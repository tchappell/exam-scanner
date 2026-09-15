import assert from 'node:assert/strict';
import test from 'node:test';

import { buildComparisonFromRows } from '../src/services/comparisonImport.mjs';
import { loadCSV } from '../src/util/csv.mjs';

test('comparison import handles quoted CSV fields and preserves settings', async () => {
  const headings = Array.from({ length: 167 }, (_, index) => `Column ${index + 1}`);
  const values = Array(167).fill('');
  values[2] = '00123456';
  values[3] = 'O\'MALLEY, JR';
  values[4] = 'AB';
  values[6] = '7';
  values[7] = 'A';

  const quote = value => value.includes(',') ? `"${value}"` : value;
  const rows = await loadCSV(`${headings.join(',')}\n${values.map(quote).join(',')}\n`);
  const comparison = buildComparisonFromRows(rows, {
    filename: 'raw_results.csv',
    scannerConfig: { startAt: 4, hasMarker: true },
    previousComparison: { cfg_checkName: true }
  });

  assert.equal(comparison.results.get(7).surname, "O'MALLEY, JR");
  assert.equal(comparison.cfg_checkName, true);
  assert.equal(comparison.cfg_firstPage, 5);
});

test('comparison import rejects the wrong number of columns', () => {
  assert.deepEqual(
    buildComparisonFromRows([['too', 'short']], {
      filename: 'bad.csv',
      scannerConfig: { startAt: 1, hasMarker: false }
    }),
    { error: 'This is not a valid ACSPRI raw results file (must have 167 columns)' }
  );
});
