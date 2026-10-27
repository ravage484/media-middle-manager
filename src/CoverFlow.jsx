import { useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { statusOf } from './status.js';

// The old iTunes "Cover Flow": the chosen title faces you, the rest fan out to each side. Each is one wide tile: its backdrop with
// the poster, name, standing and a line of the story on top (a plain poster when there is no backdrop). Click a side poster (or use the arrows,
// the arrow keys, a swipe or a sideways wheel) to bring it forward; click the one in front to open it. It goes round without an
// end, and moves on by itself every few seconds (a faint bar along the bottom shows the time left) until the pointer or keyboard
// focus is on it. Plain CSS 3D, no library.
const SHOWN = 5; // posters visible each side of the middle one
const LOOP_MIN = 4; // fewer than this and going round would look odd, so it simply stops at the ends
const AUTO_MS = 7000; // time each poster stays in front on its own
const SWIPE = 40; // pixels of dragging that count as one step

const meta = (r) => [r.type === 'movie' ? 'Movie' : 'Series', r.genres?.join(', '), r.rating ? `★ ${r.rating.toFixed(1)}` : ''].filter(Boolean).join(' · ');

function Cover({ r, d, shown, onPick }) {
  const [bad, setBad] = useState(false); // poster failed
  const [badBg, setBadBg] = useState(false); // backdrop failed
  const st = statusOf(r);
  const bg = !badBg && (r.backdrop || (r.poster && !bad && r.poster)); // no backdrop: the poster, enlarged and dimmed
  const s = Math.sign(d);
  const a = Math.abs(d);
  // the middle poster is pushed toward you; the others turn away and sit closer together the further out they are
  const x = d === 0 ? 0 : s * (a * 46 + 70); // percent of the poster's own width
  const style = {
    transform: `translateX(${x}%) translateZ(${d === 0 ? 90 : -a * 40}px) rotateY(${d === 0 ? 0 : -s * 58}deg)`,
    zIndex: 100 - a, opacity: a > shown ? 0 : 1, pointerEvents: a > shown ? 'none' : 'auto',
    // a poster hopping from one end round to the other does it unseen (both ends are hidden), not by sliding across the stage
    ...(a > shown ? { transition: 'none' } : {}),
  };
  return (
    <button className={`cfcover ${r.poster && !bad ? '' : 'nopost'}`} style={style} tabIndex={-1} aria-label={`${r.title}${r.year ? ` (${r.year})` : ''}`} aria-current={d === 0} onClick={() => onPick(d)}>
      {bg && <img className={`cfbg ${r.backdrop ? '' : 'blur'}`} src={bg} alt="" draggable="false" onError={() => setBadBg(true)} />}
      <span className="cfshade" />
      {r.poster && !bad && <img className="cfposter" src={r.poster} alt="" draggable="false" onError={() => setBad(true)} />}
      <span className="cftext">
        {st && <span className={`badge ${st[1]}`}>{st[0]}</span>}
        <b>{r.title}{r.year ? <small> ({r.year})</small> : null}</b>
        <small>{meta(r)}</small>
        {r.overview && <em>{r.overview}</em>}
      </span>
    </button>
  );
}

export default function CoverFlow({ items, onOpen, label }) {
  const [i, setI] = useState(0);
  const [held, setHeld] = useState(false); // pointer or focus is on it: stay put
  const drag = useRef({ x: 0, down: false, moved: false, suppress: false });
  const wheel = useRef(0);
  const n = items.length;
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; // never moves by itself
  const loop = n >= LOOP_MIN;
  // the hidden ones must include the pair that swaps ends, so with a short list fewer are shown
  const shown = loop ? Math.min(SHOWN, Math.floor(n / 2) - 1) : SHOWN;
  const go = (k) => setI((v) => (loop ? v + k : Math.max(0, Math.min(n - 1, v + k)))); // i keeps counting; only its place in the list wraps
  const at = loop ? ((i % n) + n) % n : Math.min(i, n - 1);
  const cur = items[at];
  if (!cur) return null;
  // how far a poster is from the front, the short way round
  const dist = (k) => { let d = k - at; if (loop) { d = ((d % n) + n) % n; if (d > n / 2) d -= n; } return d; };

  const pick = (d) => { if (drag.current.suppress) return; if (d === 0) onOpen(cur); else go(d); };
  const down = (e) => { drag.current = { x: e.clientX, down: true, moved: false, suppress: false }; };
  const move = (e) => {
    const g = drag.current;
    if (!g.down) return;
    const dx = e.clientX - g.x;
    if (Math.abs(dx) >= SWIPE) { go(dx < 0 ? 1 : -1); g.x = e.clientX; g.moved = true; } // keep dragging for more steps
  };
  const up = () => {
    const g = drag.current;
    g.down = false;
    if (g.moved) { g.suppress = true; setTimeout(() => { g.suppress = false; }, 0); } // the click that ends a swipe must not open anything
  };
  const key = (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === 'Enter') { e.preventDefault(); onOpen(cur); }
  };
  // only sideways wheel (a trackpad swipe) moves it; the up-and-down wheel still scrolls the page
  const onWheel = (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 8) return;
    const now = Date.now();
    if (now - wheel.current < 120) return;
    wheel.current = now;
    go(e.deltaX > 0 ? 1 : -1);
  };

  return (
    <section className="cflow" aria-label={label} aria-roledescription="carousel"
      onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)} onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}>
      {(loop || at > 0) && <button className="rarrow l" aria-label="Previous" onClick={() => go(-1)}><Icon name="chevronLeft" size={20} /></button>}
      {(loop || at < n - 1) && <button className="rarrow r" aria-label="Next" onClick={() => go(1)}><Icon name="chevronRight" size={20} /></button>}
      <div className="cfstage" tabIndex={0} onKeyDown={key} onWheel={onWheel}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} onDragStart={(e) => e.preventDefault()}>
        {items.map((r, k) => <Cover key={r.inLibrary || `${r.type}:${r.tmdbId}`} r={r} d={dist(k)} shown={shown} onPick={pick} />)}
      </div>
      {n > 1 && !still && (
        // keyed on the poster in front, so any move (by itself or by hand) starts the bar over; it moves on when the bar is full
        <i key={i} className="cfprog" aria-hidden="true" style={{ animationDuration: `${AUTO_MS}ms`, animationPlayState: held ? 'paused' : 'running' }} onAnimationEnd={() => go(1)} />
      )}
      <div className="cfdots" role="group" aria-label="Choose a title">
        {items.map((r, k) => <button key={r.inLibrary || `${r.type}:${r.tmdbId}`} className={k === at ? 'on' : ''} aria-label={r.title} aria-current={k === at} title={r.title} onClick={() => go(dist(k))} />)}
      </div>
      <div className="cfcap" aria-live="polite">{cur.title}{cur.year ? ` (${cur.year})` : ''}</div>
    </section>
  );
}
