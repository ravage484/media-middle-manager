import { useEffect, useState } from 'react';
import Library from './Library.jsx';
import Settings from './Settings.jsx';
import History from './History.jsx';
import Home from './home/Home.jsx';
import Discover from './Discover.jsx';
import Stale from './Stale.jsx';
import Login from './Login.jsx';
import Logo from './Logo.jsx';
import { api } from './api.js';
import { applyAppearance, loadAppearance } from './themes.js';
import { VERSION } from './version.js';

const Icon = ({ children }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const TABS = [
  ['home', 'Home', <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>],
  ['library', 'Library', <><path d="M16 6l4 14" /><path d="M12 6v14" /><path d="M8 8v12" /><path d="M4 4v16" /></>],
  ['discover', 'Discover', <><circle cx="12" cy="12" r="10" /><path d="M16.2 7.8l-2.1 6.3-6.3 2.1 2.1-6.3z" /></>],
  ['stale', 'Stale', <><path d="M5 22h14M5 2h14M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4A2 2 0 0 0 7 17.8V22M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4A2 2 0 0 0 17 6.2V2" /></>],
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
  const [tab, setTab] = useState('home');
  const [visited, setVisited] = useState(new Set(['home', 'library'])); // tabs keep their state once opened
  const go = (id) => { setTab(id); setVisited((v) => (v.has(id) ? v : new Set(v).add(id))); };
  const [libPreset, setLibPreset] = useState(null); // filters Home asks the Library to start with
  const navigate = (id, opts) => { if (id === 'library' && opts) setLibPreset(opts); go(id); };
  const [collapsed, setCollapsed] = useState(read);
  const [appearance, setAppearanceState] = useState(loadAppearance);
  const setAppearance = (a) => { applyAppearance(a); setAppearanceState(a); };
  useEffect(() => { try { localStorage.setItem('navCollapsed', collapsed ? '1' : '0'); } catch { /* ignore */ } }, [collapsed]);

  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
      <aside className="side">
        <button className="brand" onClick={() => go('home')} title="Go to Home">
          <Logo style={appearance.logo} theme={appearance.theme} size={32} />
          <span className="label">Media Middle Manager</span>
        </button>
        <nav>
          {TABS.map(([id, label, icon]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => go(id)} title={label} aria-label={label}>
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
        <button className="ver" onClick={() => go('settings')} title={`Media Middle Manager ${VERSION}. Click for details.`}>v{VERSION}</button>
      </aside>
      {/* On a phone: two tabs, the logo (Home) in the exact middle, two tabs. Settings is the gear at the top of Home. */}
      <nav className="tabbar" aria-label="Main">
        {['library', 'discover', 'home', 'stale', 'history'].map((id) => {
          const [, label, icon] = TABS.find((t) => t[0] === id);
          return id === 'home' ? (
            <button key={id} className={`tablogo ${tab === id ? 'active' : ''}`} onClick={() => go(id)} aria-label="Home" aria-current={tab === id ? 'page' : undefined}>
              <Logo style={appearance.logo} theme={appearance.theme} size={52} />
            </button>
          ) : (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => go(id)} aria-label={label} aria-current={tab === id ? 'page' : undefined}>
              <Icon>{icon}</Icon><span>{label}</span>
            </button>
          );
        })}
      </nav>
      <main>
        {/* Tabs stay mounted once opened, so search, selection and scroll survive switching */}
        <div hidden={tab !== 'home'}><Home active={tab === 'home'} onNavigate={navigate} /></div>
        <div hidden={tab !== 'library'}><Library goSettings={() => go('settings')} appearance={appearance} preset={libPreset} /></div>
        {visited.has('discover') && <div hidden={tab !== 'discover'}><Discover goSettings={() => go('settings')} /></div>}
        {visited.has('stale') && <div hidden={tab !== 'stale'}><Stale /></div>}
        {tab === 'history' && <History />}
        {tab === 'settings' && <Settings appearance={appearance} setAppearance={setAppearance} auth={auth} onSignOut={onSignOut} />}
      </main>
    </div>
  );
}
