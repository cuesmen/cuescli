import { FiChevronLeft, FiMessageSquare, FiPlus, FiSettings } from 'react-icons/fi';
import type { StoredConversation } from '../types';

type SidebarProps = {
  currentView: 'chat' | 'config';
  onChangeView: (view: 'chat' | 'config') => void;
  sessionActive: boolean;
  collapsed: boolean;
  onToggle: () => void;
  conversations: StoredConversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onCreateConversation: () => void;
};

export function Sidebar({
  currentView,
  onChangeView,
  sessionActive,
  collapsed,
  onToggle,
  conversations,
  activeConversationId,
  onSelectConversation,
  onCreateConversation,
}: SidebarProps) {
  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      <div className="sidebar-brand">
        <div>
          <p className="eyebrow">Local Codex Controller</p>
          <h1>Codex UI</h1>
        </div>
        <button type="button" className="sidebar-toggle" onClick={onToggle} aria-label="Collapse sidebar">
          <FiChevronLeft size={18} />
        </button>
      </div>

      <p className="sidebar-copy">Chat e configurazione in una shell locale leggera.</p>

      <nav className="sidebar-nav" aria-label="Primary">
        <button
          type="button"
          className={`nav-link ${currentView === 'chat' ? 'nav-link--active' : ''}`}
          onClick={() => onChangeView('chat')}
        >
          <span className="nav-link__label">
            <FiMessageSquare size={16} />
            <span>Chat</span>
          </span>
          <small>{sessionActive ? 'live' : 'idle'}</small>
        </button>
        <button
          type="button"
          className={`nav-link ${currentView === 'config' ? 'nav-link--active' : ''}`}
          onClick={() => onChangeView('config')}
        >
          <span className="nav-link__label">
            <FiSettings size={16} />
            <span>Config</span>
          </span>
          <small>session</small>
        </button>
      </nav>

      <div className="sidebar-conversations">
        <div className="sidebar-conversations__header">
          <strong>Conversations</strong>
          <button type="button" className="sidebar-mini-btn" onClick={onCreateConversation} aria-label="Create new conversation">
            <FiPlus size={15} />
          </button>
        </div>

        <div className="sidebar-conversations__list">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              className={`conversation-item ${activeConversationId === conversation.id ? 'conversation-item--active' : ''}`}
              onClick={() => onSelectConversation(conversation.id)}
            >
              <strong>{conversation.title}</strong>
              <span>{conversation.cwd}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
