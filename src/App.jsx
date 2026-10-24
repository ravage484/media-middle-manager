import { useEffect, useState } from 'react';
import Library from './Library.jsx';
import Settings from './Settings.jsx';
import History from './History.jsx';
import Login from './Login.jsx';
import Logo from './Logo.jsx';
import { api } from './api.js';
import { applyAppearance, loadAppearance } from './themes.js';
import { VERSION } from './version.js';

const Icon = ({ children }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const TABS = [
  ['library', 'Library', <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>],
  ['history', 'History', <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>],
  ['settings', 'Settings', <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="9" cy="18" r="2" /></>],
];

const read = () => { try { const v = localStorage.getItem('navCollapsed'); return v === null ? window.innerWidth < 800 : v === '1'; } catch { return false; } };

// Decides what to show: first-run setup, sign-in, or the app.
export default function App() {
  const [auth, setAuth] = useState(null); // null while loading

  useEffect(() => {
    api.authStatus().then(setAuth).catch(() => setAuth({ error: true }));
    // Any API call that comes back 401 (for example an expired session) lands here.
    const expired = () => setAuth((a) => ({ ...a, authenticated: false, setupRequired: false, username: null }));
    window.addEventListener('mmm-unauthorized', expired);
    return () => window.removeEventListener('mmm-unauthorized', expired);
  }, []);

  if (!auth) return <div className="loginpage"><p className="dim">Loading…</p></div>;
  if (auth.error) return <div className="loginpage"><div className="notice bad">Cannot reach the server. Check that it is running, then reload.</div></div>;
  if (!auth.authenticated) {
    return <Login mode={auth.setupRequired ? 'setup' : 'login'} onDone={(username) => setAuth({ authDisabled: false, setupRequired: false, authenticated: true, username })} />;
  }
  const signOut = async () => {
    try { await api.logout(); } catch { /* the session is gone either way */ }
    setAuth((a) => ({ ...a, authenticated: false, username: null }));
  };
  return <Shell auth={auth} onSignOut={signOut} />;
}

function Shell({ auth, onSignOut }) {
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
        {!auth.authDisabled && (
          <button className="collapse" onClick={onSignOut} title={`Sign out (${auth.username})`} aria-label="Sign out">
            <Icon><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></Icon><span className="label">Sign out</span>
          </button>
        )}
        <button className="collapse" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand menu' : 'Collapse menu'} aria-label={collapsed ? 'Expand menu' : 'Collapse menu'} aria-expanded={!collapsed}>
          <Icon><path d={collapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} /></Icon><span className="label">Collapse</span>
        </button>
        <button className="ver" onClick={() => setTab('settings')} title={`Media Middle Manager ${VERSION}. Click for details.`}>v{VERSION}</button>
      </aside>
      <main>
        {/* Library stays mounted so search/selection survive tab switches */}
        <div hidden={tab !== 'library'}><Library goSettings={() => setTab('settings')} /></div>
        {tab === 'history' && <History />}
        {tab === 'settings' && <Settings appearance={appearance} setAppearance={setAppearance} auth={auth} onSignOut={onSignOut} />}
      </main>
    </div>
  );
}
