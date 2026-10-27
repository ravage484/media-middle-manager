import { useState } from 'react';
import Icon from '../Icon.jsx';
import { useManifest, useWidget, refreshWidget } from './store.js';
import WidgetView from './WidgetView.jsx';
import DiscoverTitle from '../DiscoverTitle.jsx';
import LibraryCard from '../LibraryCard.jsx';
import CoverFlow from '../CoverFlow.jsx';

/*
 * Home: the same widgets in two layouts. Dashboard is everything operational at once, as cards. Media puts posters first and
 * shrinks the operational widgets to status chips; a chip opens its widget in place. The choice is remembered on this device.
 */
const VIEWS = [['control', 'Dashboard', 'layout-dashboard'], ['media', 'Media', 'movie']];
const readView = () => {
  try { const v = localStorage.getItem('homeView'); if (v === 'control' || v === 'media') return v; } catch { /* ignore */ }
  return window.innerWidth < 720 ? 'media' : 'control'; // a phone is for browsing; a desktop is for keeping an eye on things
};

const DashIcon = ({ name }) => (name === 'movie'
  ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" /></svg>
  : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>);

// One status chip of the Media view. It shares its data with the Dashboard card of the same widget.
function Chip({ w, active, open, onClick }) {
  const { data } = useWidget(w, active);
  const text = data?.chip;
  if (!text) return null;
  return <button className={`hchip ${data?.tone === 'warn' ? 'warn' : ''}`} aria-pressed={open} onClick={onClick}><span className={`dot ${data?.tone === 'warn' ? 'wn' : 'ok'}`} />{text}</button>;
}

// The banner of the Media view: what was just added to your library, as a Cover Flow, newest in front.
function Hero({ w, active, onOpenTitle }) {
  const { data } = useWidget(w, active);
  const items = data?.items;
  if (!items?.length) return null;
  return <CoverFlow items={items} onOpen={onOpenTitle} label={w.title} />;
}

export default function Home({ active, onNavigate, welcome }) {
  const { widgets, err } = useManifest();
  const [view, setView] = useState(readView);
  const [openChip, setOpenChip] = useState(null);
  const [title, setTitle] = useState(null); // a title from a poster, to open
  const [libOpen, setLibOpen] = useState(null);
  const [find, setFind] = useState(''); // the search box: Enter looks it up in Discover
  const pick = (v) => { setView(v); setOpenChip(null); try { localStorage.setItem('homeView', v); } catch { /* ignore */ } };
  const openTitle = (r) => (r.inLibrary ? setLibOpen(r.inLibrary) : setTitle({ type: r.type, tmdbId: r.tmdbId }));

  if (err) return <div className="notice bad">{err}</div>;
  if (!widgets) return <p className="dim">Loading…</p>;
  const status = widgets.find((w) => w.kind === 'status');
  const rest = widgets.filter((w) => w.kind !== 'status');
  const stats = rest.filter((w) => w.kind === 'stat');
  const lists = rest.filter((w) => w.kind === 'list');
  const rows = rest.filter((w) => w.kind === 'posters');
  const common = { active, onNavigate, onOpenTitle: openTitle };
  const canFind = widgets.some((w) => w.id === 'trending'); // Discover works through Overseerr
  const search = (e) => {
    e.preventDefault();
    const q = find.trim();
    if (q.length < 2) return;
    onNavigate('discover', { q, at: Date.now() }); // `at` makes the same words typed again count as a new search
    setFind('');
  };

  // under the status row, above what it leads to (the posters)
  const searchBox = canFind && (
        <form className="dsearch homesearch" role="search" onSubmit={search}>
          <Icon name="search" size={18} />
          <input placeholder="Search movies, series and people…" value={find} onChange={(e) => setFind(e.target.value)} autoComplete="off" aria-label="Search movies, series and people" />
          {find && <button type="button" className="icon" aria-label="Clear" onClick={() => setFind('')}><Icon name="x" size={16} /></button>}
        </form>
  );

  return (
    <>
      <div className="homehead">
        <h2 className="ptitle2">{welcome?.trim() || 'Home'}</h2>
        <span className="spacer" />
        <button className="icon homegear" onClick={() => onNavigate('settings')} aria-label="Settings" title="Settings">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="9" cy="18" r="2" /></svg>
        </button>
        <div className="seg" role="group" aria-label="Home view">
          {VIEWS.map(([v, label, icon]) => <button key={v} aria-pressed={view === v} className={view === v ? 'active' : ''} onClick={() => pick(v)}><DashIcon name={icon} />{label}</button>)}
        </div>
      </div>

      {!rest.length && <div className="notice">Add your services in Settings and this page fills with what they are doing. <button className="link" onClick={() => onNavigate('settings')}>Open Settings</button></div>}

      {view === 'control' ? (
        <div className="hdash">
          {status && <WidgetView w={status} {...common} />}
          {searchBox}
          {stats.length > 0 && <div className="hstats">{stats.map((w) => <WidgetView key={w.id} w={w} {...common} />)}</div>}
          {lists.length > 0 && <div className="hmasonry">{lists.map((w) => <div key={w.id} className="hitem"><WidgetView w={w} {...common} /></div>)}</div>}
          {rows.map((w) => <WidgetView key={w.id} w={w} {...common} />)}
        </div>
      ) : (
        <>
          <div className="hchips">
            {widgets.filter((w) => w.media === 'chip').map((w) => (
              <Chip key={w.id} w={w} active={active} open={openChip === w.id} onClick={() => (w.kind === 'stat' && w.link ? onNavigate(w.link) : setOpenChip(openChip === w.id ? null : w.id))} />
            ))}
          </div>
          {searchBox}
          {openChip && <div className="hopen"><WidgetView w={widgets.find((w) => w.id === openChip)} {...common} /></div>}
          {widgets.find((w) => w.id === 'recent') && <Hero w={widgets.find((w) => w.id === 'recent')} active={active} onOpenTitle={openTitle} />}
          {widgets.filter((w) => w.media === 'row' && w.id !== 'recent').map((w) => <WidgetView key={w.id} w={w} variant="row" {...common} />)}
        </>
      )}

      {libOpen && <LibraryCard key={libOpen} itemKey={libOpen} onClose={() => setLibOpen(null)} onChanged={() => widgets.filter((w) => w.media === 'row').forEach((w) => refreshWidget(w.id))} />}
      {title && <DiscoverTitle type={title.type} tmdbId={title.tmdbId} onClose={() => setTitle(null)} onOpenLibrary={(k) => { setTitle(null); setLibOpen(k); }} onRequested={() => { refreshWidget('trending'); refreshWidget('requests'); }} />}
    </>
  );
}
