import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

// A row that scrolls sideways: drag it with the mouse and let go for a glide (touch screens already scroll it), or use the arrows.
// resetKey: when it changes the row jumps back to the start. stale: dims it while new content is on its way.
export default function Carousel({ children, resetKey, stale = false }) {
  const row = useRef(null);
  const drag = useRef({ down: false, x: 0, left: 0, moved: false, suppress: false, samples: [] });
  const glideRaf = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [edge, setEdge] = useState({ left: false, right: false });

  const measure = () => {
    const r = row.current;
    if (!r) return;
    const left = r.scrollLeft > 4, right = r.scrollLeft + r.clientWidth < r.scrollWidth - 4;
    setEdge((e) => (e.left === left && e.right === right ? e : { left, right })); // same answer: no re-render, so no loop
  };
  useEffect(measure); // after every render: the content may have changed
  useEffect(() => { window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }, []);
  useLayoutEffect(() => { if (row.current) row.current.scrollLeft = 0; }, [resetKey]);

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
  const slide = (dir) => { stopGlide(); row.current.scrollBy({ left: dir * row.current.clientWidth * 0.8, behavior: 'smooth' }); };

  return (
    <div className="recwrap">
      {edge.left && <button className="rarrow l" aria-label="Scroll left" onClick={() => slide(-1)}><Icon name="chevronLeft" size={20} /></button>}
      {edge.right && <button className="rarrow r" aria-label="Scroll right" onClick={() => slide(1)}><Icon name="chevronRight" size={20} /></button>}
      <div className={`recrow ${dragging ? 'dragging' : ''} ${stale ? 'stale' : ''}`} ref={row} onScroll={measure} onWheel={stopGlide}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onClickCapture={(e) => { if (drag.current.suppress) { e.preventDefault(); e.stopPropagation(); } }}
        onDragStart={(e) => e.preventDefault()}>
        {children}
      </div>
    </div>
  );
}
