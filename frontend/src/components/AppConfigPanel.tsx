type ResumeBehavior = 'ask' | 'last' | 'new';

type AppConfigPanelProps = {
  resumeBehavior: ResumeBehavior;
  onResumeBehaviorChange: (value: ResumeBehavior) => void;
  autoOpenChanges: boolean;
  onAutoOpenChangesChange: (checked: boolean) => void;
  showThreadStatus: boolean;
  onToggleThreadStatus: (checked: boolean) => void;
};

export function AppConfigPanel(props: AppConfigPanelProps) {
  const {
    resumeBehavior,
    onResumeBehaviorChange,
    autoOpenChanges,
    onAutoOpenChangesChange,
    showThreadStatus,
    onToggleThreadStatus,
  } = props;

  return (
    <section className="config-shell">
      <div className="config-header">
        <div>
          <p className="eyebrow">App Settings</p>
          <h2>Global Preferences</h2>
        </div>
      </div>

      <div className="config-form">
        <section className="field-block field-block--spaced">
          <div className="segmented-header">
            <span className="status-label">Startup Resume</span>
            <span className="config-note">Choose what happens when the UI restarts: ask, reopen the last chat, or always start a new one.</span>
          </div>
          <div className="segmented-control segmented-control--three" role="radiogroup" aria-label="Startup resume behavior">
            {[
              { value: 'ask', title: 'Ask', description: 'Show a startup dialog so you can choose what to resume.' },
              { value: 'last', title: 'Resume Last', description: 'Automatically reopen the most recent conversation.' },
              { value: 'new', title: 'Always New', description: 'Always start a fresh conversation on startup.' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={resumeBehavior === option.value}
                className={`segment ${resumeBehavior === option.value ? 'segment--active' : ''}`}
                onClick={() => onResumeBehaviorChange(option.value as ResumeBehavior)}
              >
                <strong className="segment__title">{option.title}</strong>
                <span>{option.description}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="config-toggles">
          <label className="toggle-card">
            <input
              type="checkbox"
              checked={autoOpenChanges}
              onChange={(event) => onAutoOpenChangesChange(event.target.checked)}
            />
            <div>
              <strong>Auto-open Files Modified</strong>
              <p>When enabled, the changes drawer opens automatically only if a turn produced actual file changes.</p>
            </div>
          </label>

          <label className="toggle-card">
            <input
              type="checkbox"
              checked={showThreadStatus}
              onChange={(event) => onToggleThreadStatus(event.target.checked)}
            />
            <div>
              <strong>Thread status logs</strong>
              <p>Show internal status transitions like active and idle inside the chat feed.</p>
            </div>
          </label>
        </div>
      </div>
    </section>
  );
}
