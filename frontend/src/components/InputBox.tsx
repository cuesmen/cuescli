import { useEffect, useRef, useState } from 'react';

type InputBoxProps = {
  disabled: boolean;
  value: string;
  onChange: (value: string) => void;
  isRunning: boolean;
  queuedCount: number;
  promptHistory: string[];
  onSend: (message: string) => boolean;
};

export function InputBox({ disabled, value, onChange, isRunning, queuedCount, promptHistory, onSend }: InputBoxProps) {
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const draftBeforeHistoryRef = useRef('');

  useEffect(() => {
    if (historyIndex === null) {
      draftBeforeHistoryRef.current = value;
    }
  }, [historyIndex, value]);

  const submit = () => {
    const trimmed = value.trim();

    if (!trimmed) {
      return;
    }

    const sent = onSend(trimmed);

    if (sent) {
      setHistoryIndex(null);
      draftBeforeHistoryRef.current = '';
      onChange('');
    }
  };

  return (
    <section className="input-shell">
      <div className="input-topline">
        <label className="input-label" htmlFor="codex-input">
          Send prompt
        </label>
        {isRunning || queuedCount > 0 ? (
          <span className="input-queue-status">
            {isRunning ? 'Current turn running' : 'Idle'}{queuedCount > 0 ? ` • ${queuedCount} queued` : ''}
          </span>
        ) : null}
      </div>
      <div className="input-row">
        <textarea
          id="codex-input"
          className="prompt-input"
          placeholder={disabled ? 'Backend disconnected' : isRunning ? 'Write a prompt and press Enter to queue it' : 'Write a prompt for Codex and press Enter'}
          value={value}
          disabled={disabled}
          rows={4}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            const target = event.currentTarget;

            if (event.key === 'ArrowUp' && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
              const atStart = target.selectionStart === 0 && target.selectionEnd === 0;

              if (atStart && promptHistory.length > 0) {
                event.preventDefault();

                setHistoryIndex((current) => {
                  const nextIndex = current === null ? 0 : Math.min(current + 1, promptHistory.length - 1);
                  if (current === null) {
                    draftBeforeHistoryRef.current = value;
                  }
                  onChange(promptHistory[nextIndex]);
                  return nextIndex;
                });
              }
            }

            if (event.key === 'ArrowDown' && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
              const atEnd = target.selectionStart === value.length && target.selectionEnd === value.length;

              if (atEnd && historyIndex !== null) {
                event.preventDefault();

                setHistoryIndex((current) => {
                  if (current === null) {
                    return null;
                  }

                  const nextIndex = current - 1;

                  if (nextIndex < 0) {
                    onChange(draftBeforeHistoryRef.current);
                    return null;
                  }

                  onChange(promptHistory[nextIndex]);
                  return nextIndex;
                });
              }
            }

            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <button type="button" className="send-button" disabled={disabled || value.trim().length === 0} onClick={submit}>
          {isRunning ? 'Queue' : 'Send'}
        </button>
      </div>
      <p className="input-hint">Enter sends. While Codex is busy, prompts are queued automatically. Commands: `/approvals default|full-access`, `/cwd`, `/multiagent`, `/start`, `/stop`.</p>
    </section>
  );
}
