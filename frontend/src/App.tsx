import { FiSidebar } from 'react-icons/fi';
import { useState } from 'react';
import { ChatView } from './components/ChatView';
import { ConfigPanel } from './components/ConfigPanel';
import { InputBox } from './components/InputBox';
import { Sidebar } from './components/Sidebar';
import { useCodexSocket } from './hooks/useCodexSocket';

export default function App() {
  const [showThreadStatus, setShowThreadStatus] = useState(false);
  const [currentView, setCurrentView] = useState<'chat' | 'config'>('chat');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const {
    connectionState,
    messages,
    sessionId,
    error,
    canSend,
    isRunning,
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
    sendInput,
    stopSession,
    startSession,
    respondToApproval,
  } = useCodexSocket();

  return (
    <main className={`app-shell ${sidebarCollapsed ? 'app-shell--sidebar-collapsed' : ''}`}>
      <div className="app-backdrop" />
      <Sidebar
        currentView={currentView}
        onChangeView={setCurrentView}
        sessionActive={connectionState === 'connected'}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((current) => !current)}
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
                showThreadStatus={showThreadStatus}
                onApprovalAction={respondToApproval}
              />
              <InputBox disabled={!canSend} onSend={sendInput} />
            </>
          ) : (
            <ConfigPanel
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
              showThreadStatus={showThreadStatus}
              onToggleThreadStatus={setShowThreadStatus}
            />
          )}
        </section>
      </div>
    </main>
  );
}
