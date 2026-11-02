import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from './api.js';
import Icon from './Icon.jsx';
import { THEMES, isLight } from './themes.js';

const LEVELS = [['error', 'Errors'], ['warn', 'Warnings and up'], ['info', 'Info and up'], ['debug', 'Everything']];
const LIVE_MS = 3000;

// Syntax colouring for a log message, the way an editor would: HTTP methods, paths, key=value pairs, quoted text, numbers. Everything is
// rendered as React text nodes, never as HTML, so nothing in the log can inject markup.
const TOKEN = /(?<method>\b(?:GET|POST|PUT|DELETE|PATCH|HEAD)\b)|(?<key>\b[A-Za-z_][\w.]*)=(?<val>"(?:[^"\\]|\\.)*"|\S+)|(?<str>"(?:[^"\\]|\\.)*")|(?<path>\/[\w\-./:%,]{2,})|(?<num>\b\d+(?:\.\d+)?\b)/g;
const statusClass = (v) => (/^2/.test(v) ? 'ok' : /^[45]/.test(v) ? (v[0] === '5' ? 'err' : 'warn') : '');

function highlight(msg) {
  const out = [];
  let last = 0;
  let n = 0;
  for (const m of msg.matchAll(TOKEN)) {
    if (m.index > last) out.push(msg.slice(last, m.index));
    const g = m.groups;
    if (g.method) out.push(<span key={n++} className="t-kw">{g.method}</span>);
    else if (g.key) out.push(<span key={n++}><span className="t-key">{g.key}</span><span className="t-op">=</span><span className={g.key === 'status' ? `t-st ${statusClass(g.val)}` : /^"/.test(g.val) ? 't-str' : /^\d/.test(g.val) ? 't-num' : 't-val'}>{g.val}</span></span>);
    else if (g.str) out.push(<span key={n++} className="t-str">{g.str}</span>);
    else if (g.path) out.push(<span key={n++} className="t-path">{g.path}</span>);
    else out.push(<span key={n++} className="t-num">{g.num}</span>);
    last = m.index + m[0].length;
  }
  if (last < msg.length) out.push(msg.slice(last));
  return out;
}

// The server's log, shown like a file in an editor: oldest at the top, newest at the bottom, the view following the end.
export default function Logs({ appearance }) {
  const [level, setLevel] = useState('info');
  const [area, setArea] = useState('');
  const [q, setQ] = useState('');
  const [live, setLive] = useState(false);
  const [wrap, setWrap] = useState(true);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);
  const pane = useRef(null);
  const atEnd = useRef(true); // the view stays on the newest line until you scroll up
  const [behind, setBehind] = useState(false); // scrolled up: offer a way back to the newest line

  useEffect(() => { atEnd.current = true; setBehind(false); }, [level, area, q]); // a different view of the log starts at its newest line
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => { // typing in the search box waits a moment before asking
      api.logs({ level, area, q, limit: 300 }).then((d) => { if (alive) { setData(d); setErr(''); } }).catch((e) => alive && setErr(e.message));
    }, q ? 250 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [level, area, q, tick]);
  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(() => { if (!document.hidden) setTick((n) => n + 1); }, LIVE_MS);
    return () => clearInterval(t);
  }, [live]);
  useLayoutEffect(() => { if (atEnd.current && pane.current) pane.current.scrollTop = pane.current.scrollHeight; }, [data, wrap]);

  const onScroll = () => {
    const p = pane.current;
    atEnd.current = p.scrollHeight - p.scrollTop - p.clientHeight < 24;
    setBehind((b) => (b === !atEnd.current ? b : !atEnd.current));
  };
  const toEnd = () => { atEnd.current = true; setBehind(false); pane.current?.scrollTo({ top: pane.current.scrollHeight, behavior: 'smooth' }); };
  const lines = data ? [...data.entries].reverse() : []; // the server sends newest first
  const seen = new Map();
  const keys = lines.map((e) => { const k = `${e.at}|${e.area}|${e.msg}`; const n = (seen.get(k) || 0) + 1; seen.set(k, n); return `${k}#${n}`; }); // not the position: that shifts as the oldest lines drop off
  const stamp = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString(undefined, { hour12: false }); };
  const full = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(); };
  const light = isLight(THEMES.find((t) => t.id === appearance?.theme) || THEMES[0]); // only the red/amber/green shades differ; the rest follows the theme
  const levelName = LEVELS.find(([v]) => v === level)?.[1];

  return (
    <section className="sgroup">
      <h3>Logs</h3>
      <p className="dim">What the server did and what went wrong. The file is <code>logs/mmm.log</code> in the data folder; it is also on the server's console.</p>
      {err && <div className="notice bad">{err}</div>}
      {data && !data.enabled && <div className="notice">File logging is turned off (<code>MMM_LOG_FILE=false</code>), so there is nothing to show here. Lines still go to the server's console.</div>}
      {(!data || data.enabled) && (
        <>
          <div className="logbar">
            <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Level">
              {LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area">
              <option value="">All areas</option>
              {(data?.areas || []).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <div className="dsearch">
              <Icon name="search" size={18} />
              <input placeholder="Search the log…" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} autoComplete="off" aria-label="Search the log" />
            </div>
            <label className="check"><input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Live</label>
            <label className="check"><input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} /> Wrap</label>
            <button onClick={() => setTick((n) => n + 1)}>Refresh</button>
            <button onClick={() => { window.location.href = '/api/logs/download'; }} title="Download the whole log file">Download</button>
          </div>

          <div className={`editor ${light ? 'light' : ''}`}>
            <div className="edtabs">
              <span className="edtab"><Icon name="file" size={14} />mmm.log</span>
              <span className="edpath dim">logs/mmm.log</span>
            </div>
            <div className="edbody">
            <div className={`edpane ${wrap ? 'wrap' : ''}`} ref={pane} onScroll={onScroll} role="log" aria-label="Server log" tabIndex={0}>
              {!data && <div className="edempty">Loading…</div>}
              {data && lines.length === 0 && <div className="edempty">{q || area || level !== 'debug' ? 'Nothing matches these filters.' : 'The log is empty.'}</div>}
              {lines.map((e, i) => (
                <div key={keys[i]} className={`edline ${e.level}`}>
                  <span className="ln" aria-hidden="true">{i + 1}</span>
                  <span className="code">
                    <time dateTime={e.at} title={full(e.at)} className="t-ts">{stamp(e.at)}</time>{' '}
                    <span className={`t-lv ${e.level}`}>{e.level.toUpperCase().padEnd(5, ' ')}</span>{' '}
                    <span className="t-area">[{e.area}]</span>{' '}
                    {highlight(e.msg)}
                  </span>
                </div>
              ))}
            </div>
            {behind && <button className="edjump" onClick={toEnd} title="Scroll to the newest line">↓ Latest</button>}
            </div>
            <div className="edstatus">
              <span>{lines.length} line{lines.length === 1 ? '' : 's'}{lines.length >= 300 ? ' (newest 300)' : ''}</span>
              <span>{levelName}{area ? ` · ${area}` : ''}{q ? ` · “${q}”` : ''}</span>
              <span className="spacer" />
              {live && <span className="edlive">● Live</span>}
              <span>UTF-8</span>
              <span>LF</span>
              <span>Log</span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
