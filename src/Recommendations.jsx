import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import Carousel from './Carousel.jsx';
import TitleCard from './TitleCard.jsx';

// What Overseerr (TMDB) suggests after this title. A card for something you already have opens it here; any other opens its TMDB page.
const TABS = [['recommendations', 'Recommendations'], ['similar', 'Similar']];

export default function Recommendations({ item, onOpen }) {
  const [kind, setKind] = useState('recommendations');
  const [list, setList] = useState([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [onlyIn, setOnlyIn] = useState(false); // show only titles you already have

  // Flipping between Recommendations and Similar keeps the old cards (dimmed) until the new ones arrive, so the section does not
  // collapse and refill. A slow answer to an earlier request is ignored if a newer one has been made since.
  const req = useRef(0);
  const [fresh, setFresh] = useState(0); // bumped when a new first page replaces the list, to scroll the row back to the start
  const load = (k, p, append) => {
    const mine = ++req.current;
    setLoading(true); setErr('');
    api.recommendations(item.key, k, p)
      .then((d) => {
        if (mine !== req.current) return;
        setList((cur) => (append ? [...cur, ...d.results] : d.results)); setPage(d.page); setMore(d.hasMore);
        if (!append) setFresh((n) => n + 1);
      })
      .catch((e) => { if (mine === req.current) setErr(e.message); })
      .finally(() => { if (mine === req.current) setLoading(false); });
  };
  useEffect(() => { setList([]); setMore(false); setPage(1); }, [item.key]); // another title: its suggestions, not the last one's
  useEffect(() => { load(kind, 1, false); }, [item.key, kind]);

  // The list is filtered here, so when the filter hides most of a page and Overseerr has more, the next page is fetched (up to 5
  // pages) until the row has something to show.
  const shown = onlyIn ? list.filter((r) => !!r.inLibrary) : list;
  useEffect(() => {
    if (onlyIn && !loading && !err && more && shown.length < 8 && page < 5) load(kind, page + 1, true);
  }, [onlyIn, loading, more, page, shown.length]);

  return (
    <section className="recs">
      <div className="recshead">
        <h3>{TABS.find(([k]) => k === kind)[1]}</h3>
        <div className="recctl">
          <label className="recfilter"><input type="checkbox" checked={onlyIn} onChange={(e) => setOnlyIn(e.target.checked)} /> In library only</label>
          <div className="seg small">
            {TABS.map(([k, l]) => <button key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>{l}</button>)}
          </div>
        </div>
      </div>
      {err && <div className="notice bad">{err}</div>}
      {!err && !loading && list.length === 0 && <p className="dim">Nothing to suggest.</p>}
      {!err && !loading && list.length > 0 && shown.length === 0 && <p className="dim">{more ? 'None of the titles loaded so far match.' : 'No titles match.'}</p>}
      <Carousel resetKey={fresh} stale={loading && list.length > 0}>
        {shown.map((r) => (r.inLibrary
          ? <TitleCard key={r.type + r.tmdbId} r={r} title="Open it here" onOpen={() => onOpen?.(r.inLibrary)} />
          : <TitleCard key={r.type + r.tmdbId} r={r} title="Open on TMDB" href={`https://www.themoviedb.org/${r.type === 'movie' ? 'movie' : 'tv'}/${r.tmdbId}`} />))}
        {more && <button className="rcard rmore" disabled={loading} onClick={() => load(kind, page + 1, true)}>{loading ? 'Loading…' : 'Show more'}</button>}
        {loading && list.length === 0 && !err && <span className="dim">Asking Overseerr…</span>}
      </Carousel>
    </section>
  );
}
