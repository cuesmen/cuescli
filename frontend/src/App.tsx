import { FiSidebar, FiX } from 'react-icons/fi';
import { useEffect, useMemo, useState } from 'react';
import { AppConfigPanel } from './components/AppConfigPanel';
import { ChatView } from './components/ChatView';
import { ConfigPanel } from './components/ConfigPanel';
import { InputBox } from './components/InputBox';
import { Sidebar } from './components/Sidebar';
import { useCodexSocket } from './hooks/useCodexSocket';
import type { StoredConversation } from './types';

const PROMPT_DRAFT_KEY = 'cuescli.promptDraft.v1';
const PROMPT_HISTORY_KEY = 'cuescli.promptHistory.v1';
const CONVERSATIONS_KEY = 'cuescli.conversations.v1';
const ACTIVE_CONVERSATION_KEY = 'cuescli.activeConversationId.v1';
const RESUME_BEHAVIOR_KEY = 'cuescli.resumeBehavior.v1';

type ResumeBehavior = 'ask' | 'last' | 'new';
type ConversationSettingsMode = 'create' | 'edit';

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }

    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function createConversation(overrides: Partial<StoredConversation> = {}): StoredConversation {
  const timestamp = Date.now();
  return {
    id: crypto.randomUUID(),
    title: 'New Conversation',
    cwd: '/home/cues/cuescli/backend',
    accessMode: 'default',
    multiAgentEnabled: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: [],
    turnDiffs: [],
    ...overrides,
  };
}

function deriveConversationTitle(conversation: StoredConversation) {
  const firstUserMessage = conversation.messages.find((message) => message.role === 'user' || message.role === 'queued');
  if (firstUserMessage?.content) {
    return firstUserMessage.content.slice(0, 48);
  }

  return conversation.title || 'New Conversation';
}

export default function App() {
  const [showThreadStatus, setShowThreadStatus] = useState(false);
  const [currentView, setCurrentView] = useState<'chat' | 'config'>('chat');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [startupHandled, setStartupHandled] = useState(false);
  const [startupDialogOpen, setStartupDialogOpen] = useState(false);
  const [conversationSettingsOpen, setConversationSettingsOpen] = useState(false);
  const [conversationSettingsMode, setConversationSettingsMode] = useState<ConversationSettingsMode>('edit');
  const [newConversationDraft, setNewConversationDraft] = useState({
    title: 'New Conversation',
    cwd: '/home/cues/cuescli/backend',
    accessMode: 'default' as const,
    multiAgentEnabled: false,
  });
  const [resumeBehavior, setResumeBehavior] = useState<ResumeBehavior>(() => {
    const value = typeof window === 'undefined' ? null : window.localStorage.getItem(RESUME_BEHAVIOR_KEY);
    return value === 'last' || value === 'new' ? value : 'ask';
  });
  const [promptDraft, setPromptDraft] = useState(() => {
    if (typeof window === 'undefined') {
      return '';
    }

    return window.localStorage.getItem(PROMPT_DRAFT_KEY) || '';
  });
  const [promptHistory, setPromptHistory] = useState<string[]>(() => {
    const parsed = readJson<unknown>(PROMPT_HISTORY_KEY, []);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string' && item.trim()).slice(0, 20) : [];
  });
  const [conversations, setConversations] = useState<StoredConversation[]>(() => {
    const parsed = readJson<unknown>(CONVERSATIONS_KEY, []);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item) => item && typeof item === 'object' && typeof (item as StoredConversation).id === 'string')
      .map((item) => item as StoredConversation)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  });
  const [activeConversationId, setActiveConversationId] = useState<string | null>(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    return window.localStorage.getItem(ACTIVE_CONVERSATION_KEY);
  });
  const {
    connectionState,
    messages,
    sessionId,
    error,
    canSend,
    isRunning,
    queuedPrompts,
    turnDiffs,
    cwd,
    setCwd,
    convertWindowsPath,
    recentPaths,
    selectRecentPath,
    removeRecentPath,
    accessMode,
    setAccessMode,
    multiAgentEnabled,
    setMultiAgentEnabled,
    autoOpenChanges,
    setAutoOpenChanges,
    openConversation,
    startFreshConversation,
    sendInput,
    stopSession,
    startSession,
    respondToApproval,
    terminateConversation,
    removeTurnDiff,
    removeTurnDiffFile,
  } = useCodexSocket();

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) || null,
    [activeConversationId, conversations]
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(PROMPT_DRAFT_KEY, promptDraft);
  }, [promptDraft]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(PROMPT_HISTORY_KEY, JSON.stringify(promptHistory));
  }, [promptHistory]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (activeConversationId) {
      window.localStorage.setItem(ACTIVE_CONVERSATION_KEY, activeConversationId);
    } else {
      window.localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
    }
  }, [activeConversationId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(RESUME_BEHAVIOR_KEY, resumeBehavior);
  }, [resumeBehavior]);

  useEffect(() => {
    if (!activeConversationId) {
      return;
    }

    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === activeConversationId
          ? {
              ...conversation,
              title: deriveConversationTitle({
                ...conversation,
                messages,
              }),
              cwd,
              accessMode,
              multiAgentEnabled,
              messages,
              turnDiffs,
              updatedAt: Date.now(),
            }
          : conversation
      )
    );
  }, [activeConversationId, accessMode, cwd, messages, multiAgentEnabled, turnDiffs]);

  useEffect(() => {
    if (startupHandled) {
      return;
    }

    const lastConversation = activeConversationId
      ? conversations.find((conversation) => conversation.id === activeConversationId) || null
      : conversations[0] || null;

    if (resumeBehavior === 'ask' && conversations.length > 0) {
      setStartupDialogOpen(true);
      setStartupHandled(true);
      return;
    }

    if (resumeBehavior === 'last' && lastConversation) {
      openConversation(lastConversation);
      setActiveConversationId(lastConversation.id);
      setStartupHandled(true);
      return;
    }

    const freshConversation = createConversation(lastConversation ? {
      cwd: lastConversation.cwd,
      accessMode: lastConversation.accessMode,
      multiAgentEnabled: lastConversation.multiAgentEnabled,
    } : undefined);
    setConversations((current) => [freshConversation, ...current]);
    startFreshConversation(freshConversation);
    setActiveConversationId(freshConversation.id);
    setStartupHandled(true);
  }, [activeConversationId, conversations, openConversation, resumeBehavior, startFreshConversation, startupHandled]);

  const handleCreateConversation = () => {
    setNewConversationDraft({
      title: 'New Conversation',
      cwd,
      accessMode,
      multiAgentEnabled,
    });
    setConversationSettingsMode('create');
    setConversationSettingsOpen(true);
  };

  const handleSelectConversation = (conversationId: string) => {
    if (conversationId === activeConversationId) {
      setCurrentView('chat');
      return;
    }

    const selectedConversation = conversations.find((conversation) => conversation.id === conversationId);
    if (!selectedConversation) {
      return;
    }

    setCurrentView('chat');
    openConversation(selectedConversation);
    setActiveConversationId(selectedConversation.id);
  };

  const handleOpenConversationSettings = (conversationId: string) => {
    if (conversationId !== activeConversationId) {
      handleSelectConversation(conversationId);
    }
    setConversationSettingsMode('edit');
    setConversationSettingsOpen(true);
  };

  const handleCreateConversationFromDraft = () => {
    const freshConversation = createConversation({
      title: newConversationDraft.title.trim() || 'New Conversation',
      cwd: newConversationDraft.cwd,
      accessMode: newConversationDraft.accessMode,
      multiAgentEnabled: newConversationDraft.multiAgentEnabled,
    });
    setConversations((current) => [freshConversation, ...current]);
    setCurrentView('chat');
    startFreshConversation(freshConversation);
    setActiveConversationId(freshConversation.id);
    setConversationSettingsOpen(false);
    setConversationSettingsMode('edit');
  };

  const handleDeleteConversation = (conversationId: string) => {
    const conversationToDelete = conversations.find((conversation) => conversation.id === conversationId);
    if (!conversationToDelete) {
      return;
    }

    const shouldDelete = typeof window === 'undefined'
      ? true
      : window.confirm(`Delete conversation "${conversationToDelete.title}"?`);

    if (!shouldDelete) {
      return;
    }

    const remaining = conversations.filter((conversation) => conversation.id !== conversationId);
    setConversations(remaining);
    terminateConversation(conversationId);

    if (conversationId !== activeConversationId) {
      return;
    }

    stopSession();

    if (remaining.length === 0) {
      const freshConversation = createConversation({
        cwd,
        accessMode,
        multiAgentEnabled,
      });
      setConversations([freshConversation]);
      startFreshConversation(freshConversation);
      setActiveConversationId(freshConversation.id);
      setCurrentView('chat');
      return;
    }

    const nextConversation = remaining[0];
    openConversation(nextConversation);
    setActiveConversationId(nextConversation.id);
    setCurrentView('chat');
  };

  const handleStartupChoice = (mode: 'last' | 'new' | 'pick', conversationId?: string) => {
    setStartupDialogOpen(false);

    if (mode === 'last') {
      const lastConversation = activeConversation || conversations[0];
      if (lastConversation) {
        openConversation(lastConversation);
        setActiveConversationId(lastConversation.id);
        return;
      }
    }

    if (mode === 'pick' && conversationId) {
      handleSelectConversation(conversationId);
      return;
    }

    handleCreateConversation();
  };

  const handleSendInput = (message: string) => {
    const sent = sendInput(message);

    if (sent) {
      setPromptHistory((current) => [message, ...current.filter((item) => item !== message)].slice(0, 20));
    }

    return sent;
  };

  return (
    <main className={`app-shell ${sidebarCollapsed ? 'app-shell--sidebar-collapsed' : ''}`}>
      <div className="app-backdrop" />
      <Sidebar
        currentView={currentView}
        onChangeView={setCurrentView}
        sessionActive={connectionState === 'connected'}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((current) => !current)}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onCreateConversation={handleCreateConversation}
        onDeleteConversation={handleDeleteConversation}
        onOpenConversationSettings={handleOpenConversationSettings}
      />

      <div className={`app-panel ${sidebarCollapsed ? 'app-panel--sidebar-collapsed' : ''}`}>
        <section className="workspace-shell">
          {sidebarCollapsed ? (
            <button type="button" className="sidebar-fab" onClick={() => setSidebarCollapsed(false)} aria-label="Open sidebar">
              <FiSidebar size={18} />
            </button>
          ) : null}
          {currentView === 'chat' ? (
            <>
              <ChatView
                messages={messages}
                isRunning={isRunning}
                turnDiffs={turnDiffs}
                showThreadStatus={showThreadStatus}
                autoOpenChanges={autoOpenChanges}
                onApprovalAction={respondToApproval}
                onRemoveTurnDiff={removeTurnDiff}
                onRemoveTurnDiffFile={removeTurnDiffFile}
              />
              <InputBox
                disabled={!canSend}
                value={promptDraft}
                onChange={setPromptDraft}
                isRunning={isRunning}
                queuedCount={queuedPrompts.length}
                promptHistory={promptHistory}
                onSend={handleSendInput}
              />
            </>
          ) : (
            <AppConfigPanel
              resumeBehavior={resumeBehavior}
              onResumeBehaviorChange={setResumeBehavior}
              autoOpenChanges={autoOpenChanges}
              onAutoOpenChangesChange={setAutoOpenChanges}
              showThreadStatus={showThreadStatus}
              onToggleThreadStatus={setShowThreadStatus}
            />
          )}
        </section>
      </div>

      {conversationSettingsOpen ? (
        <div className="startup-modal">
          <div className="startup-modal__backdrop" onClick={() => setConversationSettingsOpen(false)} />
          {conversationSettingsMode === 'create' ? (
            <ConfigPanel
              mode="create"
              title="New Conversation"
              connectionState="disconnected"
              sessionId={null}
              error={null}
              cwd={newConversationDraft.cwd}
              recentPaths={recentPaths}
              onCwdChange={(value) => setNewConversationDraft((current) => ({ ...current, cwd: value }))}
              onConvertWindowsPath={() =>
                setNewConversationDraft((current) => ({ ...current, cwd: convertWindowsPath(current.cwd) }))
              }
              onRecentPathSelect={(value) => setNewConversationDraft((current) => ({ ...current, cwd: value }))}
              onRecentPathRemove={removeRecentPath}
              accessMode={newConversationDraft.accessMode}
              onAccessModeChange={(value) => setNewConversationDraft((current) => ({ ...current, accessMode: value }))}
              multiAgentEnabled={newConversationDraft.multiAgentEnabled}
              onMultiAgentChange={(checked) => setNewConversationDraft((current) => ({ ...current, multiAgentEnabled: checked }))}
              onStart={() => {}}
              onStop={() => {}}
              onClose={() => setConversationSettingsOpen(false)}
              onCreate={handleCreateConversationFromDraft}
            />
          ) : (
            <ConfigPanel
              mode="edit"
              title={activeConversation?.title || 'Conversation'}
              connectionState={connectionState}
              sessionId={sessionId}
              error={error}
              cwd={cwd}
              recentPaths={recentPaths}
              onCwdChange={setCwd}
              onConvertWindowsPath={() => setCwd(convertWindowsPath(cwd))}
              onRecentPathSelect={selectRecentPath}
              onRecentPathRemove={removeRecentPath}
              accessMode={accessMode}
              onAccessModeChange={setAccessMode}
              multiAgentEnabled={multiAgentEnabled}
              onMultiAgentChange={setMultiAgentEnabled}
              onStart={startSession}
              onStop={stopSession}
              onClose={() => setConversationSettingsOpen(false)}
            />
          )}
        </div>
      ) : null}

      {startupDialogOpen ? (
        <div className="startup-modal">
          <div className="startup-modal__backdrop" />
          <section className="startup-modal__panel">
            <button type="button" className="startup-modal__close" onClick={() => handleStartupChoice('new')} aria-label="Close startup dialog">
              <FiX size={18} />
            </button>
            <p className="eyebrow">Resume Session</p>
            <h2>Choose how to start</h2>
            <p className="startup-modal__copy">You have saved conversations. Resume the last one, pick an older one, or start fresh.</p>
            <div className="startup-modal__actions">
              <button type="button" className="start-button" onClick={() => handleStartupChoice('last')}>
                Resume last
              </button>
              <button type="button" className="terminate-button" onClick={() => handleStartupChoice('new')}>
                Start new
              </button>
            </div>
            <div className="startup-modal__list">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  className="startup-conversation"
                  onClick={() => handleStartupChoice('pick', conversation.id)}
                >
                  <strong>{conversation.title}</strong>
                  <span>{conversation.cwd}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
