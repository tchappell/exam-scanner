export function ScannerConfig({ config, setConfig, pdf, currentlyScanning }) {
  const setNumber = field => event => {
    const value = Number.parseInt(event.target.value, 10);
    setConfig(previous => ({ ...previous, [field]: value }));
  };

  const setBoolean = field => event => {
    setConfig(previous => ({ ...previous, [field]: event.target.checked }));
  };

  return (
    <>
      <div><p class="text-center fw-bold">Configuration</p></div>
      <div class="text-start">
        <div>
          <label htmlFor="startAt">Start at page:&nbsp;</label>
          <input autocomplete="off" id="startAt" name="startAt" type="number" min={1}
            max={pdf ? pdf.numPages : undefined} step={1} disabled={currentlyScanning}
            value={config.startAt} onChange={setNumber('startAt')} />
        </div>
        <div>
          <label htmlFor="endAt">End at page:&nbsp;</label>
          <input autocomplete="off" id="endAt" name="endAt" type="number" min={1}
            max={pdf ? pdf.numPages : undefined} step={1} disabled={currentlyScanning}
            value={config.endAt} onChange={setNumber('endAt')} />
        </div>
        <div>
          <label htmlFor="twoSided" class="form-check-label">Two-sided?&nbsp;</label>
          <input autocomplete="off" id="twoSided" name="twoSided" type="checkbox"
            class="form-check-input" disabled={currentlyScanning} checked={config.twoSided}
            onChange={setBoolean('twoSided')} />
        </div>
        <div>
          <label htmlFor="hasMarker" class="form-check-label">Has marker sheet?&nbsp;</label>
          <input autocomplete="off" id="hasMarker" name="hasMarker" type="checkbox"
            class="form-check-input" disabled={currentlyScanning} checked={config.hasMarker}
            onChange={setBoolean('hasMarker')} />
        </div>
        <div>
          <label htmlFor="showQuestionable" class="form-check-label">List questionable scans?&nbsp;</label>
          <input autocomplete="off" id="showQuestionable" name="showQuestionable" type="checkbox"
            class="form-check-input" disabled={currentlyScanning} checked={config.showQuestionable}
            onChange={setBoolean('showQuestionable')} />
        </div>
      </div>
    </>
  );
}
