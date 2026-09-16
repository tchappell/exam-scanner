import { buildComparisonFromRows } from '../services/comparisonImport.mjs';
import { loadCSV } from '../util/csv.mjs';

export function ComparisonConfig({ comparison, setComparison, scannerConfig, currentlyScanning }) {
  const csvSelected = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const rows = await loadCSV(file);
    setComparison(buildComparisonFromRows(rows, {
      filename: file.name,
      scannerConfig,
      previousComparison: comparison
    }));
  };

  const setFlag = field => event => {
    setComparison(previous => ({ ...previous, [field]: event.target.checked }));
  };

  return (
    <div class="comparison-config">
      <div>
        <p class="comparison-config__title">Compare with existing results</p>
        <p class="comparison-config__description">Load a raw results CSV to highlight differences while scanning.</p>
      </div>
      {'filename' in comparison ? (
        <div class="comparison-config__loaded">
          <span>{comparison.filename}</span>
          <button class="btn btn-sm btn-outline-secondary" onClick={() => setComparison({})} disabled={currentlyScanning}>Remove</button>
        </div>
      ) : (
        <input type="file" accept="text/csv" onChange={csvSelected} disabled={currentlyScanning}
          class="form-control" id="comparisonFileUpload" aria-label="Submit raw_results.csv for comparison" />
      )}
      {'error' in comparison ? <p class="text-danger mb-0">{comparison.error}</p> : null}
      {'results' in comparison ? (
        <div class="comparison-options">
          {[
            ['cfg_checkNumbers', 'Student numbers'],
            ['cfg_checkName', 'Surnames'],
            ['cfg_checkInitials', 'Initials'],
            ['cfg_checkAnswers', 'Answers']
          ].map(([field, label]) => (
            <label class="compact-check compact-check--pill" key={field} htmlFor={field}>
              <input autocomplete="off" id={field} name={field} type="checkbox"
                disabled={currentlyScanning} checked={comparison[field]}
                onChange={setFlag(field)} />
              {label}
            </label>
          ))}
          <div class="field-group comparison-options__page">
            <label htmlFor="cfg_firstPage">CSV page 1 starts at PDF page</label>
            <input autocomplete="off" id="cfg_firstPage" name="cfg_firstPage" type="number"
              min={1} step={1} disabled={currentlyScanning} value={comparison.cfg_firstPage}
              onChange={event => {
                const value = Number.parseInt(event.target.value, 10);
                setComparison(previous => ({ ...previous, cfg_firstPage: value }));
              }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
