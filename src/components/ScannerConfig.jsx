function ToggleOption({ id, label, description, ariaLabel, checked, disabled, onChange }) {
  return (
    <label class={`setup-toggle ${checked ? 'is-selected' : ''}`} htmlFor={id}>
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input
        autocomplete="off"
        id={id}
        name={id}
        type="checkbox"
        class="form-check-input"
        aria-label={ariaLabel ?? label}
        disabled={disabled}
        checked={checked}
        onChange={onChange}
      />
    </label>
  );
}

export function ScannerConfig({ config, setConfig, pdf, currentlyScanning }) {
  const setNumber = field => event => {
    const value = Number.parseInt(event.target.value, 10);
    setConfig(previous => ({ ...previous, [field]: value }));
  };

  const setBoolean = field => event => {
    setConfig(previous => ({ ...previous, [field]: event.target.checked }));
  };

  return (
    <div class="scanner-config">
      <div class="page-range" aria-label="Pages to scan">
        <div class="field-group">
          <label htmlFor="startAt">Start page</label>
          <input autocomplete="off" id="startAt" name="startAt" type="number" min={1}
            max={pdf ? pdf.numPages : undefined} step={1} disabled={currentlyScanning}
            value={config.startAt} onChange={setNumber('startAt')} />
        </div>
        <span class="page-range__divider" aria-hidden="true">to</span>
        <div class="field-group">
          <label htmlFor="endAt">End page</label>
          <input autocomplete="off" id="endAt" name="endAt" type="number" min={1}
            max={pdf ? pdf.numPages : undefined} step={1} disabled={currentlyScanning}
            value={config.endAt} onChange={setNumber('endAt')} />
        </div>
      </div>
      <div class="setup-toggle-grid">
        <ToggleOption id="twoSided" label="Two-sided sheets" ariaLabel="Two-sided?"
          description="Read questions 1–160 across paired pages."
          checked={config.twoSided} disabled={currentlyScanning} onChange={setBoolean('twoSided')} />
        <ToggleOption id="hasMarker" label="Marker sheet included" ariaLabel="Has marker sheet?"
          description="Use the first sheet as the answer key."
          checked={config.hasMarker} disabled={currentlyScanning} onChange={setBoolean('hasMarker')} />
        <ToggleOption id="hasMultiAnswer" label="Multi-answer questions" ariaLabel="Contains multi-answer questions?"
          description="Choose exact-set questions individually below."
          checked={config.hasMultiAnswer} disabled={currentlyScanning} onChange={setBoolean('hasMultiAnswer')} />
        <ToggleOption id="showQuestionable" label="Review uncertain marks" ariaLabel="List questionable scans?"
          description="Keep questionable responses in a review queue."
          checked={config.showQuestionable} disabled={currentlyScanning} onChange={setBoolean('showQuestionable')} />
      </div>
    </div>
  );
}
