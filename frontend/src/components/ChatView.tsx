import { useEffect, useMemo, useRef, useState } from 'react';
import { FiChevronLeft, FiChevronRight, FiGitCommit, FiTrash2, FiX } from 'react-icons/fi';
import { MonacoDiffViewer } from './MonacoDiffViewer';
import type { ChatMessage, TurnDiff } from '../types';

type ChatViewProps = {
  messages: ChatMessage[];
  isRunning: boolean;
  turnDiffs: TurnDiff[];
  showThreadStatus: boolean;
  autoOpenChanges: boolean;
  onApprovalAction: (requestId: string | number, action: 'approve' | 'approve-session' | 'decline' | 'cancel') => void;
  onRemoveTurnDiff: (turnId: string) => void;
  onRemoveTurnDiffFile: (turnId: string, path: string) => void;
};

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(timestamp);
}

function formatStatusLabel(status: string) {
  if (status === '??') return 'new';
  if (status.includes('D')) return 'deleted';
  if (status.includes('R')) return 'renamed';
  return 'modified';
}

function ThinkingDots() {
  return (
    <span className="thinking-dots" aria-label="AI is working">
      <span />
      <span />
      <span />
    </span>
  );
}

export function ChatView({
  messages,
  isRunning,
  turnDiffs,
  showThreadStatus,
  autoOpenChanges,
  onApprovalAction,
  onRemoveTurnDiff,
  onRemoveTurnDiffFile,
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const visibleMessages = messages.filter((message) => showThreadStatus || message.kind !== 'thread-status');
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const activeDiff = useMemo(
    () => turnDiffs.find((item) => item.turnId === (selectedTurnId || turnDiffs[0]?.turnId)) || null,
    [selectedTurnId, turnDiffs]
  );
  const activeFile = useMemo(() => {
    if (!activeDiff) return null;
    return activeDiff.files.find((file) => file.path === (selectedFilePath || activeDiff.files[0]?.path)) || activeDiff.files[0] || null;
  }, [activeDiff, selectedFilePath]);

  useEffect(() => {
    if (!scrollRef.current) {
      return;
    }

    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [visibleMessages, isRunning]);

  useEffect(() => {
    if (!turnDiffs.length) {
      setSelectedTurnId(null);
      setSelectedFilePath(null);
      return;
    }
    setSelectedTurnId((current) => (current && turnDiffs.some((item) => item.turnId === current) ? current : turnDiffs[0].turnId));
  }, [turnDiffs]);

  useEffect(() => {
    if (!autoOpenChanges || !turnDiffs.length) {
      return;
    }

    const latestTurn = turnDiffs[0];
    if (latestTurn.available !== false && latestTurn.files.length > 0) {
      setDrawerOpen(true);
    }
  }, [autoOpenChanges, turnDiffs]);

  useEffect(() => {
    if (!activeDiff) {
      setSelectedFilePath(null);
      return;
    }
    setSelectedFilePath((current) => (current && activeDiff.files.some((file) => file.path === current) ? current : activeDiff.files[0]?.path || null));
  }, [activeDiff]);

  return (
    <section className="chat-shell chat-shell--with-drawer">
        <div className="chat-header">
          <div>
            <p className="eyebrow">Streaming Output</p>
            <h2>Conversation Feed</h2>
          </div>
          <div className="chat-header__actions">
            <button
              type="button"
              className={`changes-toggle ${drawerOpen ? 'changes-toggle--active' : ''}`}
              onClick={() => setDrawerOpen((current) => !current)}
            >
              <FiGitCommit size={15} />
              <span>Changes</span>
              {turnDiffs.length ? <strong>{turnDiffs[0].files.length}</strong> : null}
              {drawerOpen ? <FiChevronRight size={16} /> : <FiChevronLeft size={16} />}
            </button>
            <span className={`terminal-badge ${isRunning ? 'terminal-badge--live' : 'terminal-badge--idle'}`}>
              {isRunning ? <><ThinkingDots />working</> : 'idle'}
            </span>
          </div>
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
          {isRunning ? (
            <article className="message message--system message--pending">
              <div className="message-meta">
                <span className="message-role">assistant</span>
                <span>live</span>
              </div>
              <div className="message-pending">
                <ThinkingDots />
                <span>Codex is working on the current turn</span>
              </div>
            </article>
          ) : null}
        </div>

      <div className={`diff-overlay ${drawerOpen ? 'diff-overlay--open' : ''}`} onClick={() => setDrawerOpen(false)} />

      <aside className={`diff-drawer ${drawerOpen ? 'diff-drawer--open' : ''}`}>
        <div className="diff-shell">
          <div className="diff-header">
            <div>
              <p className="eyebrow">Workspace Changes</p>
              <h2>Files Modified</h2>
            </div>
            <button type="button" className="diff-close" onClick={() => setDrawerOpen(false)} aria-label="Close changes panel">
              <FiX size={18} />
            </button>
          </div>

          {!turnDiffs.length ? (
            <div className="diff-empty">
              <p>No diff captured yet. Run a turn that edits files inside a git repo.</p>
            </div>
          ) : (
            <div className="diff-content">
              <div className="diff-turns">
                {turnDiffs.map((item) => (
                  <div key={item.turnId} className={`diff-turn ${activeDiff?.turnId === item.turnId ? 'diff-turn--active' : ''}`}>
                    <button type="button" className="diff-turn__main" onClick={() => setSelectedTurnId(item.turnId)}>
                      <strong>{item.files.length} file{item.files.length === 1 ? '' : 's'}</strong>
                      <span>Turn {item.turnId.slice(0, 8)}</span>
                    </button>
                    <button
                      type="button"
                      className="diff-turn__remove"
                      onClick={() => onRemoveTurnDiff(item.turnId)}
                      aria-label={`Remove history for turn ${item.turnId}`}
                    >
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {activeDiff?.available === false ? (
                <div className="diff-empty">
                  <p>{activeDiff.reason || 'Diff is unavailable for this turn.'}</p>
                </div>
              ) : activeDiff && activeDiff.files.length > 0 ? (
                <div className="diff-body">
                  <div className="diff-files">
                    <div className="diff-files__header">
                      <span>Files</span>
                      <span>{activeDiff.files.length}</span>
                    </div>
                    {activeDiff.files.map((file) => (
                      <div key={file.path} className={`diff-file ${activeFile?.path === file.path ? 'diff-file--active' : ''}`}>
                        <button type="button" className="diff-file__main" onClick={() => setSelectedFilePath(file.path)}>
                          <span className="diff-file__topline">
                            <span className={`diff-file__status diff-file__status--${formatStatusLabel(file.status)}`}>{formatStatusLabel(file.status)}</span>
                          </span>
                          <span className="diff-file__path">{file.path}</span>
                        </button>
                        <button
                          type="button"
                          className="diff-file__remove"
                          onClick={() => onRemoveTurnDiffFile(activeDiff.turnId, file.path)}
                          aria-label={`Remove ${file.path} from diff history`}
                        >
                          <FiX size={14} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {activeFile ? (
                    <div className="diff-viewer">
                      <div className="diff-viewer__title">
                        <div className="diff-viewer__file">
                          <strong>{activeFile.path.split('/').pop() || activeFile.path}</strong>
                          <span>{activeFile.path}</span>
                        </div>
                        <div className="diff-viewer__meta">
                          <span>{formatStatusLabel(activeFile.status)}</span>
                        </div>
                      </div>
                      <MonacoDiffViewer
                        path={activeFile.path}
                        original={activeFile.beforeContent}
                        modified={activeFile.afterContent}
                      />
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="diff-empty">
                  <p>This turn completed without tracked file changes.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </section>
  );
}
