import { FiShield, FiUnlock, FiX } from 'react-icons/fi';
import type { ConnectionState } from '../types';

type AccessMode = 'default' | 'full-access';
type ResumeBehavior = 'ask' | 'last' | 'new';

type ConfigPanelProps = {
  connectionState: ConnectionState;
  sessionId: string | null;
  error: string | null;
  cwd: string;
  recentPaths: string[];
  onCwdChange: (value: string) => void;
  onConvertWindowsPath: () => void;
  onRecentPathSelect: (value: string) => void;
  onRecentPathRemove: (value: string) => void;
  accessMode: AccessMode;
  onAccessModeChange: (value: AccessMode) => void;
  multiAgentEnabled: boolean;
  onMultiAgentChange: (checked: boolean) => void;
  autoOpenChanges: boolean;
  onAutoOpenChangesChange: (checked: boolean) => void;
  resumeBehavior: ResumeBehavior;
  onResumeBehaviorChange: (value: ResumeBehavior) => void;
  onStart: () => void;
  onStop: () => void;
  showThreadStatus: boolean;
  onToggleThreadStatus: (checked: boolean) => void;
};

export function ConfigPanel(props: ConfigPanelProps) {
  const {
    connectionState,
    sessionId,
    error,
    cwd,
    recentPaths,
    onCwdChange,
    onConvertWindowsPath,
    onRecentPathSelect,
    onRecentPathRemove,
    accessMode,
    onAccessModeChange,
    multiAgentEnabled,
    onMultiAgentChange,
    autoOpenChanges,
    onAutoOpenChangesChange,
    resumeBehavior,
    onResumeBehaviorChange,
    onStart,
    onStop,
    showThreadStatus,
    onToggleThreadStatus,
  } = props;

  return (
    <section className="config-shell">
      <div className="config-header">
        <div>
          <p className="eyebrow">Session Config</p>
          <h2>Codex Session Console</h2>
        </div>
        <span className={`connection-pill connection-pill--${connectionState}`}>
          <span className="connection-pill__dot" />
          {connectionState}
        </span>
      </div>

      <div className="config-grid">
        <div className="config-card">
          <span className="status-label">WebSocket</span>
          <strong>ws://localhost:3001/ws</strong>
        </div>
        <div className="config-card">
          <span className="status-label">Session</span>
          <strong>{sessionId ?? 'waiting...'}</strong>
        </div>
        <div className="config-card config-card--actions">
          <button
            type="button"
            className="start-button"
            onClick={onStart}
            disabled={connectionState === 'connected' || connectionState === 'connecting'}
          >
            Start session
          </button>
          <button
            type="button"
            className="terminate-button"
            onClick={onStop}
            disabled={connectionState !== 'connected'}
          >
            Stop session
          </button>
        </div>
      </div>

      <div className="config-form">
        <section className="field-block field-block--spaced">
          <span className="status-label">Working directory</span>
          <input className="control-input" value={cwd} onChange={(event) => onCwdChange(event.target.value)} />
          <div className="cwd-helper">
            <div className="cwd-helper__copy">
              <strong>Windows path support</strong>
              <p>Paste a Windows path like <code>C:\Users\YourName\Desktop</code> and it will be converted for WSL.</p>
              <p>WSL format example: <code>/mnt/c/Users/YourName/Desktop</code></p>
            </div>
            <div className="cwd-helper__actions">
              <button type="button" className="helper-button" onClick={onConvertWindowsPath}>
                Convert current path
              </button>
              <button
                type="button"
                className="helper-button helper-button--ghost"
                onClick={() => onCwdChange('/mnt/c/Users')}
              >
                Start from C drive
              </button>
            </div>
          </div>
        </section>

        <div className="config-row field-block--spaced">
          <section className="field-block">
            <span className="status-label">Recent paths</span>
            <p className="config-note">Up to 10 items. New paths go to the top, older ones drop off automatically.</p>
            <div className="path-list">
              {recentPaths.length === 0 ? <p className="config-note">No recent paths yet.</p> : null}
              {recentPaths.map((path) => (
                <div key={path} className={`path-row ${path === cwd ? 'path-row--active' : ''}`} title={path}>
                  <button type="button" className="path-row__main" onClick={() => onRecentPathSelect(path)}>
                    <span className="path-row__label">{path}</span>
                  </button>
                  <button
                    type="button"
                    className="path-row__remove"
                    onClick={() => onRecentPathRemove(path)}
                    aria-label={`Remove ${path} from recent paths`}
                  >
                    <FiX size={14} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="field-block field-block--spaced">
          <div className="segmented-header">
            <span className="status-label">Approvals</span>
            <span className="config-note">Matches the CLI-style access preset. Applied to the next turn and next session start.</span>
          </div>
          <div className="segmented-control segmented-control--two" role="radiogroup" aria-label="Access mode">
            {[
              {
                value: 'default',
                title: 'Default',
                description: 'Workspace edits and commands are allowed. Internet and external writes require approval.',
                icon: <FiShield size={16} />,
              },
              {
                value: 'full-access',
                title: 'Full Access',
                description: 'Codex can use broader access without asking first. Use carefully.',
                icon: <FiUnlock size={16} />,
              },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={accessMode === option.value}
                className={`segment ${accessMode === option.value ? 'segment--active' : ''}`}
                onClick={() => onAccessModeChange(option.value as AccessMode)}
              >
                <strong className="segment__title">{option.icon}{option.title}</strong>
                <span>{option.description}</span>
              </button>
            ))}
          </div>
        </section>

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
              checked={multiAgentEnabled}
              onChange={(event) => onMultiAgentChange(event.target.checked)}
            />
            <div>
              <strong>Multi-agent mode</strong>
              <p>Experimental. Falls back automatically if unsupported by the current app-server build.</p>
            </div>
          </label>

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

      {error ? <p className="error-banner">{error}</p> : null}
    </section>
  );
}
