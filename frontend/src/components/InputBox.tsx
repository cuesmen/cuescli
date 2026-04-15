import { useState } from 'react';

type InputBoxProps = {
  disabled: boolean;
  onSend: (message: string) => boolean;
};

export function InputBox({ disabled, onSend }: InputBoxProps) {
  const [value, setValue] = useState('');

  const submit = () => {
    const trimmed = value.trim();

    if (!trimmed) {
      return;
    }

    const sent = onSend(trimmed);

    if (sent) {
      setValue('');
    }
  };

  return (
    <section className="input-shell">
      <div className="input-topline">
        <label className="input-label" htmlFor="codex-input">
          Send prompt
        </label>
      </div>
      <div className="input-row">
        <textarea
          id="codex-input"
          className="prompt-input"
          placeholder={disabled ? 'Backend disconnected' : 'Write a prompt for Codex and press Enter'}
          value={value}
          disabled={disabled}
          rows={4}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <button type="button" className="send-button" disabled={disabled || value.trim().length === 0} onClick={submit}>
          Send
        </button>
      </div>
      <p className="input-hint">Enter sends. Commands: `/approvals default|full-access`, `/cwd`, `/multiagent`, `/start`, `/stop`.</p>
    </section>
  );
}
