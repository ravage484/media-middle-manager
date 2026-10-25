import { useEffect, useRef, useState } from 'react';

/*
 * A quiet, see-through pattern of the tie logo behind the sign-in card. One of a few looks is picked at random each time
 * (never the same one twice in a row): drifting diagonal rows, or ties floating and bouncing around the screen.
 * The colour is the theme's accent, so it follows the appearance setting. It moves only when the system allows motion.
 */
const ROWS = (o) => ({ kind: 'rows', rows: 5, size: 350, gap: 480, angle: -28, speed: 80, opacity: 13, rowspace: 6, vary: 100, rvary: 100, alternate: true, ...o });
const VERSIONS = [
  ROWS({ align: 'along' }),
  ROWS({ align: 'across' }),
  ROWS({ align: 'across', angle: 39 }),
  { kind: 'float', count: 1, min: 556, max: 864, speed: 126, spin: 16, opacity: 8, depth: 100, edge: 'bounce', collide: false, bounce: 100 },
  { kind: 'float', count: 14, min: 140, max: 422, speed: 126, spin: 14, opacity: 8, depth: 100, edge: 'wrap', collide: true, bounce: 100 },
];
// The knot, the blade, and the play button cut out of the blade (even-odd fill leaves a hole), in a 100 x 130 box.
const TIE = 'M40 6H60L66 24H34Z M34 24H66L80 98L50 124L20 98Z M42 48V76L64 62Z';
const rnd = (a, b) => a + Math.random() * (b - a);

function pick() {
  let last = -1;
  try { last = Number(sessionStorage.getItem('tieBackdrop') ?? -1); } catch { /* ignore */ }
  let i;
  do { i = Math.floor(Math.random() * VERSIONS.length); } while (i === last && VERSIONS.length > 1);
  try { sessionStorage.setItem('tieBackdrop', String(i)); } catch { /* ignore */ }
  return VERSIONS[i];
}

// Rows of ties, tilted, alternate rows drifting opposite ways. Every row has its own size and loops by exactly ten ties,
// so the drift never jumps.
function buildRows(el, S, still) {
  const w = S.size, h = Math.round(S.size * 1.3), along = S.align === 'along';
  const thick = along ? w : h, length = along ? h : w;
  const pitch = Math.max(thick * 0.4, (innerHeight / S.rows) * Math.abs(Math.cos((S.angle * Math.PI) / 180)));
  const rowgap = pitch - thick + S.rowspace;
  const period = length + S.gap, diag = Math.hypot(innerWidth, innerHeight) * 1.4;
  const kmin = Math.max(0.15, 1 - (S.rvary / 100) * 0.7);
  const nRows = Math.ceil(diag / Math.max(20, thick + rowgap)) + 2;
  const nTies = Math.ceil((diag + period * 10) / (period * kmin)) + 2;
  const rows = [];
  for (let r = 0; r < nRows; r++) {
    const k = Math.max(0.15, 1 + (Math.random() * 2 - 1) * (S.rvary / 100) * 0.7), rw = w * k, rh = h * k;
    const rowPeriod = (along ? rh : rw) + S.gap;
    const draws = Array.from({ length: 10 }, () => [Math.max(0.15, 1 + (Math.random() * 2 - 1) * (S.vary / 100) * 0.7), S.vary ? 0.6 + Math.random() * 0.8 : 1]);
    const ties = Array.from({ length: nTies }, (_, i) => `<svg viewBox="0 0 100 130" style="--s:${draws[i % 10][0].toFixed(3)};--o:${draws[i % 10][1].toFixed(2)}"><path fill-rule="evenodd" d="${TIE}"/></svg>`).join('');
    const style = `--tb-w:${rw}px;--tb-h:${rh}px;--tb-mx:${along ? (rh - rw) / 2 : 0}px;--tb-rowh:${along ? rw : rh}px;--tb-shift:-${rowPeriod * 10}px`;
    rows.push(`<div class="tb-row${S.alternate && r % 2 ? ' rev' : ''}" style="${style}">${ties}</div>`);
  }
  el.style.setProperty('--tb-angle', `${S.angle}deg`);
  el.style.setProperty('--tb-rowgap', `${rowgap}px`);
  el.style.setProperty('--tb-gap', `${S.gap}px`);
  el.style.setProperty('--tb-rot', `${along ? 90 : 0}deg`);
  el.style.setProperty('--tb-op', S.opacity / 100);
  el.style.setProperty('--tb-dur', `${S.speed}s`);
  el.style.setProperty('--tb-play', still ? 'paused' : 'running');
  el.innerHTML = `<div class="tb-rot">${rows.join('')}</div>`;
}

// Ties floating on a canvas, each with its own size, direction, speed and spin. Bigger ones are slower and fainter, so they sit "behind".
function floatTies(canvas, S, still) {
  const ctx = canvas.getContext('2d'), path = new Path2D(TIE);
  const dpr = devicePixelRatio || 1;
  let W = innerWidth, H = innerHeight;
  const size = () => { W = innerWidth; H = innerHeight; canvas.width = W * dpr; canvas.height = H * dpr; };
  size();
  const speed = still ? 0 : S.speed, spin = still ? 0 : S.spin;
  const lo = Math.min(S.min, S.max), hi = Math.max(S.min, S.max);
  const ties = Array.from({ length: S.count }, () => {
    const sz = rnd(lo, hi), far = hi > lo ? (sz - lo) / (hi - lo) : 0, k = 1 - (S.depth / 100) * far * 0.75, ang = Math.random() * Math.PI * 2;
    return { x: rnd(0, W), y: rnd(0, H), size: sz, vx: Math.cos(ang) * speed * k * rnd(0.5, 1.2), vy: Math.sin(ang) * speed * k * rnd(0.5, 1.2),
      rot: Math.random() * 360, vr: rnd(-1, 1) * spin * k, alpha: (S.opacity / 100) * (1 - (S.depth / 100) * far * 0.6) * rnd(0.7, 1.3) };
  });
  let raf = 0, last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#888';
    if (S.collide) { // circles that swap momentum along the line between their centres; the bigger one is heavier
      for (let i = 0; i < ties.length; i++) for (let j = i + 1; j < ties.length; j++) {
        const a = ties[i], b = ties[j], min = (a.size + b.size) * 0.4;
        let dx = b.x - a.x, dy = b.y - a.y; const d = Math.hypot(dx, dy);
        if (d >= min || d === 0) continue;
        dx /= d; dy /= d;
        const ma = a.size * a.size, mb = b.size * b.size, push = (min - d) / (ma + mb);
        a.x -= dx * push * mb; a.y -= dy * push * mb; b.x += dx * push * ma; b.y += dy * push * ma;
        const rv = (b.vx - a.vx) * dx + (b.vy - a.vy) * dy;
        if (rv < 0) {
          const j2 = (-(1 + S.bounce / 100) * rv) / (1 / ma + 1 / mb);
          a.vx -= (j2 / ma) * dx; a.vy -= (j2 / ma) * dy; b.vx += (j2 / mb) * dx; b.vy += (j2 / mb) * dy;
          a.vr += rnd(-8, 8) * (spin / 12); b.vr += rnd(-8, 8) * (spin / 12);
        }
      }
    }
    for (const t of ties) {
      t.x += t.vx * dt; t.y += t.vy * dt; t.rot += t.vr * dt;
      const r = t.size * 0.4;
      if (S.edge === 'bounce') {
        if (t.x < r) { t.x = r; t.vx = Math.abs(t.vx); } else if (t.x > W - r) { t.x = W - r; t.vx = -Math.abs(t.vx); }
        if (t.y < r) { t.y = r; t.vy = Math.abs(t.vy); } else if (t.y > H - r) { t.y = H - r; t.vy = -Math.abs(t.vy); }
      } else { // wrap: out one side, back in on the other
        if (t.x < -r) t.x = W + r; else if (t.x > W + r) t.x = -r;
        if (t.y < -r) t.y = H + r; else if (t.y > H + r) t.y = -r;
      }
      ctx.globalAlpha = Math.min(1, t.alpha);
      ctx.save(); ctx.translate(t.x, t.y); ctx.rotate((t.rot * Math.PI) / 180); const s = t.size / 130; ctx.scale(s, s); ctx.translate(-50, -65); ctx.fill(path, 'evenodd'); ctx.restore();
    }
    raf = requestAnimationFrame(frame);
  };
  const onResize = () => size();
  addEventListener('resize', onResize);
  raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); removeEventListener('resize', onResize); };
}

export default function TieBackdrop() {
  const [S] = useState(pick);
  const box = useRef(null);
  useEffect(() => {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const el = box.current;
    if (S.kind === 'float') return floatTies(el.firstChild, S, still);
    let t;
    const draw = () => buildRows(el, S, still);
    draw();
    const onResize = () => { clearTimeout(t); t = setTimeout(draw, 250); }; // rebuild once the window stops changing size
    addEventListener('resize', onResize);
    return () => { clearTimeout(t); removeEventListener('resize', onResize); };
  }, [S]);
  return (
    <div className={`tb ${S.kind}`} ref={box} aria-hidden="true">
      {S.kind === 'float' && <canvas />}
    </div>
  );
}
