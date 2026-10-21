import { useEffect, useState } from 'react';
import Library from './Library.jsx';
import Settings from './Settings.jsx';
import History from './History.jsx';
import Logo from './Logo.jsx';
import { applyAppearance, loadAppearance } from './themes.js';

const Icon = ({ children }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const TABS = [
  ['library', 'Library', <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>],
  ['history', 'History', <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>],
  ['settings', 'Settings', <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="9" cy="18" r="2" /></>],
];

const read = () => { try { const v = localStorage.getItem('navCollapsed'); return v === null ? window.innerWidth < 800 : v === '1'; } catch { return false; } };

export default function App() {
  const [tab, setTab] = useState('library');
  const [collapsed, setCollapsed] = useState(read);
  const [appearance, setAppearanceState] = useState(loadAppearance);
  const setAppearance = (a) => { applyAppearance(a); setAppearanceState(a); };
  useEffect(() => { try { localStorage.setItem('navCollapsed', collapsed ? '1' : '0'); } catch { /* ignore */ } }, [collapsed]);

  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
      <aside className="side">
        <button className="brand" onClick={() => setTab('library')} title="Go to Library">
          <Logo style={appearance.logo} theme={appearance.theme} size={32} />
          <span className="label">Media Middle Manager</span>
        </button>
        <nav>
          {TABS.map(([id, label, icon]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)} title={label} aria-label={label}>
              <Icon>{icon}</Icon><span className="label">{label}</span>
            </button>
          ))}
        </nav>
        <button className="collapse" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand menu' : 'Collapse menu'} aria-label={collapsed ? 'Expand menu' : 'Collapse menu'} aria-expanded={!collapsed}>
          <Icon><path d={collapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} /></Icon><span className="label">Collapse</span>
        </button>
      </aside>
      <main>
        {/* Library stays mounted so search/selection survive tab switches */}
        <div hidden={tab !== 'library'}><Library goSettings={() => setTab('settings')} /></div>
        {tab === 'history' && <History />}
        {tab === 'settings' && <Settings appearance={appearance} setAppearance={setAppearance} />}
      </main>
    </div>
  );
}
