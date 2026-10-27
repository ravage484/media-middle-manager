import { useEffect, useMemo, useState } from 'react';
import { api, fmtBytes } from './api.js';
import Icon, { Mark } from './Icon.jsx';
import { DAY } from './stale.js';

const TYPES = [['movie', 'Movies'], ['show', 'Series'], ['episodes', 'Episodes']];
const PERIODS = [[0, 'Any time'], [7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], [365, 'Last year']];
// [name, ascending comparator, [label when high to low, label when low to high]]
const SORTS = {
  date: ['Date', (a, b) => Date.parse(a.at) - Date.parse(b.at), ['Newest first', 'Oldest first']],
  freed: ['Space freed', (a, b) => a.freedBytes - b.freedBytes, ['Most first', 'Least first']],
  files: ['Files removed', (a, b) => a.removedFiles.length - b.removedFiles.length, ['Most first', 'Fewest first']],
  title: ['Title', (a, b) => a.title.localeCompare(b.title), ['Z to A', 'A to Z']],
  type: ['Type', (a, b) => label(a.type).localeCompare(label(b.type)), ['Z to A', 'A to Z']],
  result: ['Result', (a, b) => Number(a.ok) - Number(b.ok), ['Clean first', 'Problems first']],
};
const label = (t) => (t === 'movie' ? 'Movie' : t === 'episodes' ? 'Episodes' : 'Series');

export default function History() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [types, setTypes] = useState(new Set());
  const [outcome, setOutcome] = useState('all'); // all | ok | problems
  const [period, setPeriod] = useState(0);
  const [service, setService] = useState('');
  const [sort, setSort] = useState('date');
  const [desc, setDesc] = useState(true);
  useEffect(() => { api.history().then(setRows).catch((e) => setErr(e.message)); }, []);

  // The Radarr/Sonarr instances files were removed from, offered as a filter only when there is more than one.
  const services = useMemo(() => [...new Set((rows || []).flatMap((h) => h.removedFiles.map((f) => f.service).filter(Boolean)))].sort(), [rows]);

  const shown = useMemo(() => {
    if (!rows) return [];
    const t = q.trim().toLowerCase();
    const since = period ? Date.now() - period * DAY : 0;
    return rows
      .filter((h) => (!types.size || types.has(h.type))
        && (outcome === 'all' || (outcome === 'ok') === h.ok)
        && (!since || Date.parse(h.at) >= since)
        && (!service || h.removedFiles.some((f) => f.service === service))
        && (!t || h.title.toLowerCase().includes(t) || h.removedFiles.some((f) => String(f.path).toLowerCase().includes(t))))
      .sort((a, b) => (desc ? -1 : 1) * SORTS[sort][1](a, b));
  }, [rows, q, types, outcome, period, service, sort, desc]);

  const filtered = !!(q || types.size || outcome !== 'all' || period || service);
  const clear = () => { setQ(''); setTypes(new Set()); setOutcome('all'); setPeriod(0); setService(''); };
  const flip = (t) => setTypes((s) => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n; });
  const freed = shown.reduce((n, h) => n + h.freedBytes, 0);

  if (err) return <div className="notice bad">{err}</div>;
  if (!rows) return <p>Loading…</p>;
  if (!rows.length) return <p className="dim">Nothing deleted yet.</p>;
  return (
    <>
      <div className="toolbar historybar">
        <div className="dsearch toolbarsearch">
          <Icon name="search" size={18} />
          <input placeholder="Search titles and file paths…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" aria-label="Search titles and file paths" />
          {q && <button className="icon" aria-label="Clear search" onClick={() => setQ('')}><Icon name="x" size={16} /></button>}
        </div>
        <div className="seg small">
          {TYPES.map(([t, l]) => <button key={t} className={types.has(t) ? 'active' : ''} aria-pressed={types.has(t)} onClick={() => flip(t)}>{l}</button>)}
        </div>
        <select value={outcome} onChange={(e) => setOutcome(e.target.value)} aria-label="Outcome">
          <option value="all">Any outcome</option>
          <option value="ok">Completed cleanly</option>
          <option value="problems">Had problems</option>
        </select>
        <select value={period} onChange={(e) => setPeriod(Number(e.target.value))} aria-label="Period">
          {PERIODS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}
        </select>
        {services.length > 1 && (
          <select value={service} onChange={(e) => setService(e.target.value)} aria-label="Instance">
            <option value="">Any instance</option>
            {services.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          {Object.entries(SORTS).map(([k, [l]]) => <option key={k} value={k}>Sort: {l}</option>)}
        </select>
        <button className="withicon" title="Toggle sort direction" onClick={() => setDesc(!desc)}><Icon name={desc ? 'arrowDown' : 'arrowUp'} />{SORTS[sort][2][desc ? 0 : 1]}</button>
        {filtered && <button className="link" onClick={clear}>Clear all</button>}
      </div>
      <div className="count">{shown.length} of {rows.length} deletions · {fmtBytes(freed)} freed</div>
      {shown.length === 0 && <p className="dim">No deletions match these filters.</p>}
      <div className="history">
        {shown.map((h) => (
          <details key={h.id}>
            <summary>
              <Mark ok={h.ok} warn />
              <b>{h.title}</b> <small>{h.year} · {label(h.type)}</small>
              <span className="dim">{new Date(h.at).toLocaleString()} · freed {fmtBytes(h.freedBytes)}</span>
            </summary>
            <ul>
              {h.steps.map((s, i) => <li key={i} className={s.ok ? '' : 'warn'}><Mark ok={s.ok} /> {s.label}{s.ok ? '' : ` — ${s.detail}`}</li>)}
              {h.removedFiles.map((f, i) => <li key={'f' + i} className="path">{f.path}</li>)}
            </ul>
          </details>
        ))}
      </div>
    </>
  );
}
