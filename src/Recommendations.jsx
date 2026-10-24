import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from './api.js';
import Icon from './Icon.jsx';

// What Overseerr (TMDB) suggests after this title. A card for something you already have opens it here; any other opens its TMDB page.
const BADGE = { 2: ['Requested', 'warn'], 3: ['Requested', 'warn'], 4: ['Partial', 'warn'], 5: ['Available', 'ok'] };
const TABS = [['recommendations', 'Recommendations'], ['similar', 'Similar']];

export default function Recommendations({ item, onOpen }) {
  const row = useRef(null);
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
  useLayoutEffect(() => { if (row.current) row.current.scrollLeft = 0; }, [fresh]);

  // The list is filtered here, so when the filter hides most of a page and Overseerr has more, the next page is fetched (up to 5
  // pages) until the row has something to show.
  const shown = onlyIn ? list.filter((r) => !!r.inLibrary) : list;
  useEffect(() => {
    if (onlyIn && !loading && !err && more && shown.length < 8 && page < 5) load(kind, page + 1, true);
  }, [onlyIn, loading, more, page, shown.length]);

  // Carousel: drag the row with the mouse (touch screens already scroll it), or use the arrows.
  const drag = useRef({ down: false, x: 0, left: 0, moved: false, suppress: false, samples: [] });
  const glideRaf = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [edge, setEdge] = useState({ left: false, right: false });
  const measure = () => {
    const r = row.current;
    if (r) setEdge({ left: r.scrollLeft > 4, right: r.scrollLeft + r.clientWidth < r.scrollWidth - 4 });
  };
  useEffect(measure, [list, loading]);
  useEffect(() => { window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }, []);

  // Inertia: on release the row keeps moving at the speed it was dragged and slows down by friction, stopping at either end.
  // The position is kept as a decimal here, because the browser rounds scrollLeft to whole pixels and the slow end of the glide
  // moves less than a pixel per frame.
  const stopGlide = () => cancelAnimationFrame(glideRaf.current);
  useEffect(() => stopGlide, []);
  const glide = (v0) => {
    stopGlide();
    const el = row.current;
    let pos = el.scrollLeft;
    let v = v0; // pixels per millisecond
    let t = performance.now();
    const step = (now) => {
      const dt = Math.min(now - t, 32);
      t = now;
      pos += v * dt;
      v *= 0.95 ** (dt / 16.7);
      const max = el.scrollWidth - el.clientWidth;
      if (pos <= 0 || pos >= max) { el.scrollLeft = Math.max(0, Math.min(max, pos)); return; } // hit an end
      el.scrollLeft = pos;
      if (Math.abs(v) > 0.015) glideRaf.current = requestAnimationFrame(step);
    };
    glideRaf.current = requestAnimationFrame(step);
  };

  const down = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    stopGlide(); // grabbing it while it glides stops it
    drag.current = { down: true, x: e.clientX, left: row.current.scrollLeft, moved: false, suppress: false, samples: [] };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d.down) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 5) { d.moved = true; setDragging(true); row.current.setPointerCapture(e.pointerId); }
    if (d.moved) {
      row.current.scrollLeft = d.left - dx;
      const now = performance.now();
      d.samples = [...d.samples.filter((s) => now - s.t < 100), { t: now, x: e.clientX }]; // the last tenth of a second
    }
  };
  const up = () => {
    const d = drag.current;
    if (d.moved) {
      d.suppress = true; setTimeout(() => { d.suppress = false; }, 0); // the click that ends a drag must not open a card
      const [a, b] = [d.samples[0], d.samples[d.samples.length - 1]];
      const held = !b || performance.now() - b.t > 80; // stopped moving before letting go: no fling
      if (!held && a && b.t > a.t) glide(Math.max(-4, Math.min(4, -(b.x - a.x) / (b.t - a.t))));
    }
    d.down = false; d.moved = false;
    setDragging(false);
  };
  const slide = (dir) => stopGlide() || row.current.scrollBy({ left: dir * row.current.clientWidth * 0.8, behavior: 'smooth' });

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
      <div className="recwrap">
        {edge.left && <button className="rarrow l" aria-label="Scroll left" onClick={() => slide(-1)}><Icon name="chevronLeft" size={20} /></button>}
        {edge.right && <button className="rarrow r" aria-label="Scroll right" onClick={() => slide(1)}><Icon name="chevronRight" size={20} /></button>}
      <div className={`recrow ${dragging ? 'dragging' : ''} ${loading && list.length ? 'stale' : ''}`} ref={row} onScroll={measure} onWheel={stopGlide}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onClickCapture={(e) => { if (drag.current.suppress) { e.preventDefault(); e.stopPropagation(); } }}
        onDragStart={(e) => e.preventDefault()}>
        {shown.map((r) => {
          const badge = r.inLibrary ? ['In library', 'ok'] : BADGE[r.status];
          const inner = (
            <>
              <div className="rposter">
                {r.poster ? <img src={r.poster} alt="" loading="lazy" /> : <span className="dim">{r.title}</span>}
                {badge && <span className={`rbadge ${badge[1]}`}>{badge[0]}</span>}
                {r.rating && <span className="rrate">{r.rating.toFixed(1)}</span>}
              </div>
              <b>{r.title}</b>
              <small className="dim">{r.year || ''}{r.year ? ' · ' : ''}{r.type === 'movie' ? 'Movie' : 'Series'}</small>
            </>
          );
          return r.inLibrary
            ? <button key={r.type + r.tmdbId} className="rcard" title="Open it here" onClick={() => onOpen?.(r.inLibrary)}>{inner}</button>
            : <a key={r.type + r.tmdbId} className="rcard" title="Open on TMDB" href={`https://www.themoviedb.org/${r.type === 'movie' ? 'movie' : 'tv'}/${r.tmdbId}`} target="_blank" rel="noopener noreferrer">{inner}</a>;
        })}
        {more && <button className="rcard rmore" disabled={loading} onClick={() => load(kind, page + 1, true)}>{loading ? 'Loading…' : 'Show more'}</button>}
        {loading && list.length === 0 && !err && <span className="dim">Asking Overseerr…</span>}
      </div>
      </div>
    </section>
  );
}
