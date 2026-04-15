import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../types';

type ChatViewProps = {
  messages: ChatMessage[];
  isRunning: boolean;
  showThreadStatus: boolean;
  onApprovalAction: (requestId: string | number, action: 'approve' | 'approve-session' | 'decline' | 'cancel') => void;
};

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(timestamp);
}

export function ChatView({ messages, isRunning, showThreadStatus, onApprovalAction }: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const visibleMessages = messages.filter((message) => showThreadStatus || message.kind !== 'thread-status');

  useEffect(() => {
    if (!scrollRef.current) {
      return;
    }

    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [visibleMessages, isRunning]);

  return (
    <section className="chat-shell">
      <div className="chat-header">
        <div>
          <p className="eyebrow">Streaming Output</p>
          <h2>Conversation Feed</h2>
        </div>
        <span className={`terminal-badge ${isRunning ? 'terminal-badge--live' : 'terminal-badge--idle'}`}>
          {isRunning ? 'running' : 'idle'}
        </span>
      </div>

      <div ref={scrollRef} className="event-log">
        {visibleMessages.length === 0 ? (
          <div className="empty-state">
            <p>No messages yet. Send a prompt to start the session.</p>
          </div>
        ) : (
          visibleMessages.map((message) => (
            <article key={message.id} className={`message message--${message.role}`}>
              <div className="message-meta">
                <span className="message-role">{message.role}</span>
                <time>{formatTime(message.timestamp)}</time>
              </div>
              <pre className="message-content">{message.content}</pre>
              {message.role === 'approval' && message.approval && !message.approval.resolved ? (
                <div className="approval-actions">
                  <button type="button" className="approval-btn approval-btn--approve" onClick={() => onApprovalAction(message.approval!.requestId, 'approve')}>
                    Accept
                  </button>
                  <button
                    type="button"
                    className="approval-btn approval-btn--session"
                    onClick={() => onApprovalAction(message.approval!.requestId, 'approve-session')}
                  >
                    Accept for session
                  </button>
                  <button type="button" className="approval-btn" onClick={() => onApprovalAction(message.approval!.requestId, 'decline')}>
                    Decline
                  </button>
                  <button type="button" className="approval-btn" onClick={() => onApprovalAction(message.approval!.requestId, 'cancel')}>
                    Cancel
                  </button>
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
