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
    <div class="card px-2">
      <label htmlFor="comparisonFileUpload">Submit raw_results.csv for comparison</label>
      {'filename' in comparison ?
        <button class="btn btn-secondary" onClick={() => setComparison({})} disabled={currentlyScanning}>
          Remove {comparison.filename}
        </button>
        :
        <input type="file" accept="text/csv" onChange={csvSelected} disabled={currentlyScanning} class="btn" id="comparisonFileUpload" />
      }
      {'error' in comparison ? <p class="text-danger">{comparison.error}</p> : null}
      {'results' in comparison ? <>
        <div>
          <label htmlFor="cfg_checkNumbers" class="form-check-label">Check student numbers&nbsp;</label>
          <input autocomplete="off" id="cfg_checkNumbers" name="cfg_checkNumbers" type="checkbox"
            class="form-check-input" disabled={currentlyScanning} checked={comparison.cfg_checkNumbers}
            onChange={setFlag('cfg_checkNumbers')} />
        </div>
        <div>
          <label htmlFor="cfg_checkName" class="form-check-label">Check surnames&nbsp;</label>
          <input autocomplete="off" id="cfg_checkName" name="cfg_checkName" type="checkbox"
            class="form-check-input" disabled={currentlyScanning} checked={comparison.cfg_checkName}
            onChange={setFlag('cfg_checkName')} />
        </div>
        <div>
          <label htmlFor="cfg_checkInitials" class="form-check-label">Check initials&nbsp;</label>
          <input autocomplete="off" id="cfg_checkInitials" name="cfg_checkInitials" type="checkbox"
            class="form-check-input" disabled={currentlyScanning} checked={comparison.cfg_checkInitials}
            onChange={setFlag('cfg_checkInitials')} />
        </div>
        <div>
          <label htmlFor="cfg_checkAnswers" class="form-check-label">Check answers&nbsp;</label>
          <input autocomplete="off" id="cfg_checkAnswers" name="cfg_checkAnswers" type="checkbox"
            class="form-check-input" disabled={currentlyScanning} checked={comparison.cfg_checkAnswers}
            onChange={setFlag('cfg_checkAnswers')} />
        </div>
        <div>
          <label htmlFor="cfg_firstPage">PDF page corresponding to page 1 in CSV:&nbsp;</label>
          <input autocomplete="off" id="cfg_firstPage" name="cfg_firstPage" type="number"
            min={1} step={1} disabled={currentlyScanning} value={comparison.cfg_firstPage}
            onChange={event => {
              const value = Number.parseInt(event.target.value, 10);
              setComparison(previous => ({ ...previous, cfg_firstPage: value }));
            }} />
        </div>
      </> : null}
    </div>
  );
}
