import { FiChevronLeft, FiMessageSquare, FiSettings } from 'react-icons/fi';

type SidebarProps = {
  currentView: 'chat' | 'config';
  onChangeView: (view: 'chat' | 'config') => void;
  sessionActive: boolean;
  collapsed: boolean;
  onToggle: () => void;
};

export function Sidebar({ currentView, onChangeView, sessionActive, collapsed, onToggle }: SidebarProps) {
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
    </aside>
  );
}
