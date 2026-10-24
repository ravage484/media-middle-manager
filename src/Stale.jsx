import { useEffect, useMemo, useState } from 'react';
import { api, fmtBytes } from './api.js';
import { stale, lastUse, DAY } from './stale.js';
import DeleteDialog from './DeleteDialog.jsx';
import Detail from './Detail.jsx';
import Poster from './Poster.jsx';
import Icon from './Icon.jsx';
import { useKeep } from './keep.js';

// Titles nobody has watched for a while, biggest first: what is worth removing to get disk space back.
const PRESETS = [[90, '3 months'], [180, '6 months'], [365, '1 year'], [730, '2 years'], [1095, '3 years']];
const SORTS = {
  size: ['Size', (a, b) => a.size - b.size, ['Largest first', 'Smallest first']],
  idle: ['Longest unwatched', (a, b) => lastUse(b) - lastUse(a), ['Longest first', 'Shortest first']],
  added: ['Date added', (a, b) => (a.added || '').localeCompare(b.added || ''), ['Newest first', 'Oldest first']],
  title: ['Title', (a, b) => a.title.localeCompare(b.title), ['Z to A', 'A to Z']],
};
const PAGE = 200;
const store = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const when = (ms) => (ms ? new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');
const ago = (ms) => {
  const d = Math.floor((Date.now() - ms) / DAY);
  return d < 60 ? `${d} days ago` : d < 730 ? `${Math.round(d / 30)} months ago` : `${(d / 365).toFixed(1)} years ago`;
};

export default function Stale() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [days, setDays] = useState(Math.max(1, Number(store('staleDays', '365')) || 365));
  const [never, setNever] = useState(store('staleNever', '1') === '1'); // include titles that were never played
  const [played, setPlayed] = useState(store('stalePlayed', '1') === '1'); // include titles that were played once but not lately
  const [types, setTypes] = useState(new Set());
  const [minGB, setMinGB] = useState('');
  const [sort, setSort] = useState('size');
  const [desc, setDesc] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState(new Set());
  const [dialog, setDialog] = useState(null);
  const [detail, setDetail] = useState(null);
  const [view, setView] = useState('stale'); // 'stale', or 'kept': the titles marked Keep
  const keep = useKeep();

  const load = (refresh) => api.library(refresh).then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(false); }, []);
  useEffect(() => {
    try { localStorage.setItem('staleDays', String(days)); localStorage.setItem('staleNever', never ? '1' : '0'); localStorage.setItem('stalePlayed', played ? '1' : '0'); } catch { /* ignore */ }
  }, [days, never, played]);

  const hasWatch = !!data && (data.serviceTypes.includes('tautulli') || data.serviceTypes.includes('plex'));
  const { rows, hiddenKept } = useMemo(() => {
    if (!data || !hasWatch) return { rows: [], hiddenKept: 0 };
    const min = minGB === '' ? 0 : Number(minGB) * 1024 ** 3;
    const cmp = SORTS[sort][1];
    const matches = data.items.filter((i) => stale(i, days)
      && i.hasFile && i.size >= min
      && (!types.size || types.has(i.type))
      && (i.watch.plays ? played : never));
    const open = matches.filter((i) => !keep.map[i.key]); // Keep: left out until the mark is removed
    return { rows: open.sort((a, b) => (desc ? -1 : 1) * cmp(a, b)), hiddenKept: matches.length - open.length };
  }, [data, hasWatch, days, never, played, types, minGB, sort, desc, keep.map]);
  // Everything marked Keep that is in the library, most recently marked first.
  const keptRows = useMemo(
    () => (data ? data.items.filter((i) => keep.map[i.key]).sort((a, b) => (keep.map[b.key] || '').localeCompare(keep.map[a.key] || '')) : []),
    [data, keep.map],
  );
  useEffect(() => setLimit(PAGE), [rows, keptRows]);

  const total = useMemo(() => rows.reduce((n, i) => n + i.size, 0), [rows]);
  const list = view === 'kept' ? keptRows : rows;
  const shown = list.slice(0, limit);
  const chosen = list.filter((i) => selected.has(i.key));
  const chosenBytes = chosen.reduce((n, i) => n + i.size, 0);
  const toggle = (k) => setSelected((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const flipType = (t) => setTypes((s) => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n; });
  const item = detail && data?.items.find((i) => i.key === detail);
  const setKept = (keys, on) => keep.set(keys, on).then(() => setSelected(new Set())).catch((e) => setErr(e.message));
  const switchView = (v) => { setView(v); setSelected(new Set()); setLimit(PAGE); };

  if (err) return <div className="notice bad">{err}</div>;
  if (!data) return <p className="dim">Loading…</p>;
  if (!hasWatch) {
    return (
      <div className="stalehead">
        <h2 className="ptitle2">Stale content</h2>
        <div className="notice">To know what has not been watched, this needs <b>Tautulli</b> or <b>Plex</b>. Add one in Settings &gt; Services.</div>
      </div>
    );
  }

  return (
    <>
      <div className="stalehead">
        <h2 className="ptitle2">Stale content</h2>
        <p className="dim">Titles nobody has watched for a while, biggest first. Tick what you want to remove, then review it before anything is deleted. Mark a title <b>Keep</b> to leave it out of this list.</p>
        <div className="seg small">
          <button className={view === 'stale' ? 'active' : ''} onClick={() => switchView('stale')}>Stale ({rows.length})</button>
          <button className={view === 'kept' ? 'active' : ''} onClick={() => switchView('kept')}>Kept ({keptRows.length})</button>
        </div>
      </div>

      {view === 'stale' && <div className="toolbar stalebar">
        <span className="range">Not watched in <input type="number" min="1" value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))} /> days</span>
        <div className="seg small">
          {PRESETS.map(([d, l]) => <button key={d} className={days === d ? 'active' : ''} onClick={() => setDays(d)}>{l}</button>)}
        </div>
        <label className="recfilter"><input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} /> Never watched</label>
        <label className="recfilter"><input type="checkbox" checked={played} onChange={(e) => setPlayed(e.target.checked)} /> Watched before</label>
        <div className="seg small">
          {[['movie', 'Movies'], ['show', 'Shows']].map(([t, l]) => <button key={t} className={types.has(t) ? 'active' : ''} onClick={() => flipType(t)}>{l}</button>)}
        </div>
        <span className="range">Over <input type="number" min="0" placeholder="0" value={minGB} onChange={(e) => setMinGB(e.target.value)} /> GB</span>
        <span className="spacer" />
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          {Object.entries(SORTS).map(([k, [l]]) => <option key={k} value={k}>Sort: {l}</option>)}
        </select>
        <button className="withicon" onClick={() => setDesc(!desc)}><Icon name={desc ? 'arrowDown' : 'arrowUp'} />{SORTS[sort][2][desc ? 0 : 1]}</button>
        <button className="refreshbtn" onClick={() => load(true)} title="Refresh the library" aria-label="Refresh the library"><Icon name="refresh" size={17} /></button>
      </div>}

      {view === 'stale' && <div className="count"><b>{rows.length}</b> stale titles · <b>{fmtBytes(total)}</b> could be freed{hiddenKept > 0 && <> · <button className="link" onClick={() => switchView('kept')}>{hiddenKept} kept {hiddenKept === 1 ? 'title is' : 'titles are'} left out</button></>}</div>}
      {view === 'stale' && rows.length === 0 && <div className="notice">Nothing has gone unwatched for {days} days with these settings.</div>}

      {view === 'stale' && rows.length > 0 && (
        <table className="list">
          <thead><tr><th /><th /><th>Title</th><th className="hm">Type</th><th>Size</th><th>Last watched</th><th className="hm">Added</th><th /></tr></thead>
          <tbody>
            {shown.map((it) => (
              <tr key={it.key} className={selected.has(it.key) ? 'sel' : ''} onClick={() => setDetail(it.key)}>
                <td onClick={(e) => { e.stopPropagation(); toggle(it.key); }}><input type="checkbox" readOnly checked={selected.has(it.key)} aria-label={`Select ${it.title}`} /></td>
                <td className="thumb"><Poster item={it} /></td>
                <td><b>{it.title}</b> <small>{it.year}</small></td>
                <td className="hm">{it.type === 'movie' ? 'Movie' : 'Series'}</td>
                <td className="nw">{fmtBytes(it.size)}</td>
                <td>{it.watch.plays && it.watch.last ? <>{when(lastUse(it))} <small className="dim">{ago(lastUse(it))}</small></> : <span className="dim">Never</span>}</td>
                <td className="hm">{when(Date.parse(it.added))} <small className="dim">{it.added ? ago(Date.parse(it.added)) : ''}</small></td>
                <td className="rowbtns">
                  <button className="icon" title="Keep: leave this out of the list" onClick={(e) => { e.stopPropagation(); setKept([it.key], true); }}><Icon name="shield" size={16} /></button>
                  <button className="icon" title="Delete" onClick={(e) => { e.stopPropagation(); setDialog([it.key]); }}><Icon name="trash" size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {view === 'kept' && (
        <>
          <div className="count"><b>{keptRows.length}</b> kept {keptRows.length === 1 ? 'title' : 'titles'}: left out of the Stale list until you stop keeping them</div>
          {keptRows.length === 0 && <div className="notice">Nothing is kept. Use the shield on a stale title, or <b>Keep</b> in its window, to leave it out of the list.</div>}
          {keptRows.length > 0 && (
            <table className="list">
              <thead><tr><th /><th /><th>Title</th><th className="hm">Type</th><th>Size</th><th>Kept since</th><th /></tr></thead>
              <tbody>
                {shown.map((it) => (
                  <tr key={it.key} className={selected.has(it.key) ? 'sel' : ''} onClick={() => setDetail(it.key)}>
                    <td onClick={(e) => { e.stopPropagation(); toggle(it.key); }}><input type="checkbox" readOnly checked={selected.has(it.key)} aria-label={`Select ${it.title}`} /></td>
                    <td className="thumb"><Poster item={it} /></td>
                    <td><b>{it.title}</b> <small>{it.year}</small></td>
                    <td className="hm">{it.type === 'movie' ? 'Movie' : 'Series'}</td>
                    <td className="nw">{fmtBytes(it.size)}</td>
                    <td>{when(Date.parse(keep.map[it.key]))}</td>
                    <td className="rowbtns"><button className="withicon" title="Put it back in the Stale list when it qualifies" onClick={(e) => { e.stopPropagation(); setKept([it.key], false); }}><Icon name="x" size={14} />Stop keeping</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {list.length > shown.length && <div className="pager"><button onClick={() => setLimit(limit + PAGE)}>Show {Math.min(PAGE, list.length - shown.length)} more of {list.length - shown.length} left</button></div>}

      {selected.size > 0 && (
        <div className="actionbar">
          <span>{chosen.length} selected ({fmtBytes(chosenBytes)})</span>
          <button onClick={() => setSelected(new Set(shown.map((i) => i.key)))}>Select shown</button>
          <button onClick={() => setSelected(new Set(list.map((i) => i.key)))}>Select all {list.length}</button>
          <button onClick={() => setSelected(new Set())}>Clear</button>
          {view === 'stale'
            ? <button className="withicon" onClick={() => setKept(chosen.map((i) => i.key), true)}><Icon name="shield" size={14} />Keep</button>
            : <button className="withicon" onClick={() => setKept(chosen.map((i) => i.key), false)}>Stop keeping</button>}
          <button className="danger" onClick={() => setDialog(chosen.map((i) => i.key))} disabled={!chosen.length}>Delete…</button>
        </div>
      )}

      {item && (
        <Detail
          item={item} hasWatch hasPlex={data.serviceTypes.includes('plex')} hasOverseerr={data.serviceTypes.includes('overseerr')}
          onClose={() => setDetail(null)}
          onDelete={() => { setDetail(null); setDialog([item.key]); }}
          onChanged={() => load(true)}
          onOpen={(k) => setDetail(k)}
        />
      )}
      {dialog && (
        <DeleteDialog
          keys={dialog} hasPlex={data.serviceTypes.includes('plex')}
          onClose={(changed) => { setDialog(null); if (changed) { setSelected(new Set()); load(true); } }}
        />
      )}
    </>
  );
}
