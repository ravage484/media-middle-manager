import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import Carousel from './Carousel.jsx';
import TitleCard from './TitleCard.jsx';
import DiscoverTitle from './DiscoverTitle.jsx';
import LibraryCard from './LibraryCard.jsx';
import Icon from './Icon.jsx';

// Find something to watch, the way Overseerr's Discover page does: search, rows of what is trending, popular and coming soon, and
// browsing by genre. Opening a title shows it and lets you request it; what you already own is marked.
const ROWS = [
  { id: 'trending', title: 'Trending', params: { section: 'trending' } },
  { id: 'movies', title: 'Popular movies', params: { section: 'movies' } },
  { id: 'tv', title: 'Popular series', params: { section: 'tv' } },
  { id: 'upcomingMovies', title: 'Upcoming movies', params: { section: 'upcomingMovies' } },
  { id: 'upcomingTv', title: 'Upcoming series', params: { section: 'upcomingTv' } },
];

// A row of titles from one list, with a link to see all of it.
function Row({ title, params, version, onSeeAll, onOpen }) {
  const [state, setState] = useState({ list: [], loading: true, err: '' });
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, err: '' }));
    api.discover(params)
      .then((d) => live && setState({ list: d.results, loading: false, err: '' }))
      .catch((e) => live && setState({ list: [], loading: false, err: e.message }));
    return () => { live = false; };
  }, [JSON.stringify(params), version]);
  return (
    <section className="drow">
      <div className="recshead">
        <h3>{title}</h3>
        <button className="link withicon" onClick={onSeeAll}>See all<Icon name="chevronRight" size={14} /></button>
      </div>
      {state.err && <div className="notice bad">{state.err}</div>}
      <Carousel stale={state.loading && state.list.length > 0}>
        {state.list.map((r) => <TitleCard key={r.type + r.tmdbId} r={r} onOpen={onOpen} />)}
        {state.loading && !state.list.length && <span className="dim">Loading…</span>}
      </Carousel>
    </section>
  );
}

// Every page of one list, a page at a time.
function Grid({ title, fetchPage, version, onBack, onOpen }) {
  const [list, setList] = useState([]);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const req = useRef(0);
  const load = (p) => {
    const mine = ++req.current;
    setLoading(true); setErr('');
    fetchPage(p)
      .then((d) => { if (mine !== req.current) return; setList((cur) => (p === 1 ? d.results : [...cur, ...d.results])); setPage(d.page); setMore(d.hasMore); })
      .catch((e) => { if (mine === req.current) setErr(e.message); })
      .finally(() => { if (mine === req.current) setLoading(false); });
  };
  useEffect(() => { setList([]); setMore(true); load(1); }, [title, version]);
  return (
    <section>
      <div className="recshead">
        <button className="withicon" onClick={onBack}><Icon name="chevronLeft" size={14} />Back</button>
        <h3 style={{ flex: 1 }}>{title}</h3>
      </div>
      {err && <div className="notice bad">{err}</div>}
      {!err && !loading && list.length === 0 && <p className="dim">Nothing found.</p>}
      <div className="dgrid">
        {list.map((r) => <TitleCard key={r.type + r.tmdbId} r={r} onOpen={onOpen} />)}
      </div>
      {more && list.length > 0 && <div className="pager"><button disabled={loading} onClick={() => load(page + 1)}>{loading ? 'Loading…' : 'Load more'}</button></div>}
      {loading && list.length === 0 && <p className="dim">Loading…</p>}
    </section>
  );
}

export default function Discover({ goSettings }) {
  const [has, setHas] = useState(null); // is Overseerr set up?
  const [q, setQ] = useState('');
  const [view, setView] = useState({ mode: 'home' });
  const [open, setOpen] = useState(null); // the title whose window is open
  const [libOpen, setLibOpen] = useState(null); // a title you own: its library window
  const [version, setVersion] = useState(0); // bumped after a request, so statuses on the cards refresh
  const [genreType, setGenreType] = useState('movie');
  const [genres, setGenres] = useState([]);

  useEffect(() => { api.services().then((l) => setHas(l.some((s) => s.type === 'overseerr'))).catch(() => setHas(false)); }, []);
  useEffect(() => {
    if (!has) return;
    let live = true;
    api.discoverGenres(genreType).then((g) => live && setGenres(g)).catch(() => live && setGenres([]));
    return () => { live = false; };
  }, [has, genreType]);

  // Searching starts when you pause typing, and typing nothing goes back to the home page.
  useEffect(() => {
    const t = setTimeout(() => {
      const s = q.trim();
      setView((v) => (s.length >= 2 ? { mode: 'search', q: s } : v.mode === 'search' ? { mode: 'home' } : v));
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  if (has === null) return <p className="dim">Loading…</p>;
  if (!has) {
    return (
      <>
        <h2 className="ptitle2">Discover</h2>
        <div className="notice">Discover works through <b>Overseerr</b>. <button className="link" onClick={goSettings}>Add it in Settings</button></div>
      </>
    );
  }

  const back = () => { setQ(''); setView({ mode: 'home' }); };
  const seeAll = (r) => setView({ mode: 'section', title: r.title, params: r.params });
  // what you already own opens as its library card; anything else as the Discover window, with the request button
  const openTitle = (r) => (r.inLibrary ? setLibOpen(r.inLibrary) : setOpen({ type: r.type, tmdbId: r.tmdbId }));

  let body;
  if (view.mode === 'search') {
    body = <Grid key={`s:${view.q}`} title={`Results for “${view.q}”`} fetchPage={(p) => api.discoverSearch(view.q, p)} version={version} onBack={back} onOpen={openTitle} />;
  } else if (view.mode === 'section') {
    body = <Grid key={view.title} title={view.title} fetchPage={(p) => api.discover({ ...view.params, page: p })} version={version} onBack={back} onOpen={openTitle} />;
  } else {
    body = (
      <>
        <section className="drow">
          <div className="recshead">
            <h3>Browse by genre</h3>
            <div className="seg small">
              {[['movie', 'Movies'], ['show', 'Series']].map(([t, l]) => <button key={t} className={genreType === t ? 'active' : ''} onClick={() => setGenreType(t)}>{l}</button>)}
            </div>
          </div>
          <div className="fchips genrechips">
            {genres.map((g) => (
              <button key={g.id} onClick={() => setView({ mode: 'section', title: `${g.name} ${genreType === 'movie' ? 'movies' : 'series'}`, params: { section: 'genre', type: genreType, genre: g.id } })}>{g.name}</button>
            ))}
          </div>
        </section>
        {ROWS.map((r) => <Row key={r.id} title={r.title} params={r.params} version={version} onSeeAll={() => seeAll(r)} onOpen={openTitle} />)}
      </>
    );
  }

  return (
    <>
      <h2 className="ptitle2">Discover</h2>
      <div className="dsearch">
        <Icon name="search" size={18} />
        <input placeholder="Search movies and series…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        {q && <button className="icon" aria-label="Clear search" onClick={back}><Icon name="x" size={16} /></button>}
      </div>
      {body}
      {libOpen && <LibraryCard key={libOpen} itemKey={libOpen} onClose={() => setLibOpen(null)} onChanged={() => setVersion((n) => n + 1)} />}
      {open && (
        <DiscoverTitle
          type={open.type} tmdbId={open.tmdbId}
          onClose={() => setOpen(null)}
          onOpenLibrary={(key) => { setOpen(null); setLibOpen(key); }}
          onRequested={() => setVersion((n) => n + 1)}
        />
      )}
    </>
  );
}
