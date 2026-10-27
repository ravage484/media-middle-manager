import { useEffect, useMemo, useRef, useState } from 'react';
import { api, fmtBytes } from './api.js';
import { stale, lastUse, staleness, DAY } from './stale.js';
import DeleteDialog from './DeleteDialog.jsx';
import Detail from './Detail.jsx';
import Poster from './Poster.jsx';
import Icon from './Icon.jsx';
import SortTh, { sortClick } from './SortTh.jsx';
import { useKeep } from './keep.js';

// Titles nobody has watched for a while, biggest first: what is worth removing to get disk space back.
const PRESETS = [[90, '3 months'], [180, '6 months'], [365, '1 year'], [730, '2 years'], [1095, '3 years']];
const SORTS = {
  size: ['Size', (a, b) => a.size - b.size, ['Largest first', 'Smallest first']],
  scale: ['Stale scale', (a, b) => staleness(a).score - staleness(b).score, ['Stalest first', 'Freshest first']],
  idle: ['Longest unwatched', (a, b) => lastUse(b) - lastUse(a), ['Longest first', 'Shortest first']],
  added: ['Date added', (a, b) => (a.added || '').localeCompare(b.added || ''), ['Newest first', 'Oldest first']],
  title: ['Title', (a, b) => a.title.localeCompare(b.title), ['Z to A', 'A to Z']],
  type: ['Type', (a, b) => a.type.localeCompare(b.type), ['Shows first', 'Movies first']],
};
const PAGE = 200;
const store = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const when = (ms) => (ms ? new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');
const ago = (ms) => {
  const d = Math.floor((Date.now() - ms) / DAY);
  return d < 60 ? `${d} days ago` : d < 730 ? `${Math.round(d / 30)} months ago` : `${(d / 365).toFixed(1)} years ago`;
};

const SCALE_HINT = 'How long unwatched, against how long in your library. 0 is fresh, 100 is a fossil.';

// A title's place on the stale scale: a bar, green to red, with its band. The tooltip says how it was worked out.
function Meter({ it }) {
  const s = staleness(it);
  const dur = (d) => (d < 60 ? `${d} days` : d < 730 ? `${Math.round(d / 30)} months` : `${(d / 365).toFixed(1)} years`);
  return (
    <span className="smeter" title={`${s.label} (${s.score}/100). ${s.never ? 'Never watched' : `Last watched ${dur(s.idle)} ago`}; in your library for ${dur(s.age)}.`}>
      <i><b style={{ width: `${Math.max(4, s.score)}%`, background: `hsl(${s.hue} 70% 45%)` }} /></i>
      <em style={{ color: `hsl(${s.hue} 70% 55%)` }}>{s.label}</em>
    </span>
  );
}

// The heading a title is filed under in the tile and grid views: how long since it was last watched (or "Never watched").
// rank orders the headings, longest unwatched first; the label is rounded down to the largest whole unit.
const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
function bucket(it) {
  if (!(it.watch?.plays && it.watch.last)) return { rank: Infinity, label: 'Never watched' };
  const d = Math.max(0, Math.floor((Date.now() - lastUse(it)) / DAY));
  if (d >= 365) { const y = Math.floor(d / 365); return { rank: y * 365, label: plural(y, 'year') }; }
  if (d >= 30) { const m = Math.floor(d / 30); return { rank: m * 30, label: plural(m, 'month') }; }
  if (d >= 7) { const w = Math.floor(d / 7); return { rank: w * 7, label: plural(w, 'week') }; }
  return { rank: 0, label: 'This week' };
}

export default function Stale() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [days, setDays] = useState(Math.max(1, Number(store('staleDays', '365')) || 365));
  const [never, setNever] = useState(store('staleNever', '1') === '1'); // include titles that were never played
  const [played, setPlayed] = useState(store('stalePlayed', '1') === '1'); // include titles that were played once but not lately
  const [types, setTypes] = useState(new Set());
  const [minGB, setMinGB] = useState('');
  const [q, setQ] = useState('');
  const [panel, setPanel] = useState(false); // the stale-rule controls, folded away until asked for
  const [sort, setSort] = useState('size');
  const [desc, setDesc] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState(new Set());
  const [dialog, setDialog] = useState(null);
  const [detail, setDetail] = useState(null);
  const [view, setView] = useState('stale'); // 'stale', or 'kept': the titles marked Keep
  const [layout, setLayout] = useState(['tile', 'grid', 'list'].includes(store('staleLayout', 'list')) ? store('staleLayout', 'list') : 'list');
  const last = useRef(null); // the row last ticked, for shift-click ranges
  const keep = useKeep();

  const load = (refresh) => api.library(refresh).then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(false); }, []);
  useEffect(() => { try { localStorage.setItem('staleLayout', layout); } catch { /* ignore */ } }, [layout]);
  useEffect(() => {
    try { localStorage.setItem('staleDays', String(days)); localStorage.setItem('staleNever', never ? '1' : '0'); localStorage.setItem('stalePlayed', played ? '1' : '0'); } catch { /* ignore */ }
  }, [days, never, played]);

  const hasWatch = !!data && (data.serviceTypes.includes('tautulli') || data.serviceTypes.includes('plex'));
  const { rows, hiddenKept } = useMemo(() => {
    if (!data || !hasWatch) return { rows: [], hiddenKept: 0 };
    const min = minGB === '' ? 0 : Number(minGB) * 1024 ** 3;
    const cmp = SORTS[sort][1];
    const needle = q.trim().toLowerCase();
    const matches = data.items.filter((i) => stale(i, days)
      && i.hasFile && i.size >= min
      && (!types.size || types.has(i.type))
      && (!needle || i.title.toLowerCase().includes(needle))
      && (i.watch.plays ? played : never));
    const open = matches.filter((i) => !keep.map[i.key]); // Keep: left out until the mark is removed
    return { rows: open.sort((a, b) => (desc ? -1 : 1) * cmp(a, b)), hiddenKept: matches.length - open.length };
  }, [data, hasWatch, days, never, played, types, minGB, q, sort, desc, keep.map]);
  // Everything marked Keep that is in the library, most recently marked first.
  const keptRows = useMemo(
    () => (data ? data.items.filter((i) => keep.map[i.key] && (!q.trim() || i.title.toLowerCase().includes(q.trim().toLowerCase()))).sort((a, b) => (keep.map[b.key] || '').localeCompare(keep.map[a.key] || '')) : []),
    [data, keep.map, q],
  );
  useEffect(() => setLimit(PAGE), [rows, keptRows]);

  const total = useMemo(() => rows.reduce((n, i) => n + i.size, 0), [rows]);
  const grouped = view === 'stale' && layout !== 'list';
  const list = useMemo(() => {
    const base = view === 'kept' ? keptRows : rows;
    if (!grouped) return base;
    const b = new Map(base.map((i) => [i.key, bucket(i)]));
    return [...base].sort((x, y) => (b.get(y.key).rank === b.get(x.key).rank ? 0 : b.get(y.key).rank > b.get(x.key).rank ? 1 : -1)); // stable: the chosen sort holds inside a heading
  }, [view, keptRows, rows, grouped]);
  const shown = list.slice(0, limit);
  const chosen = list.filter((i) => selected.has(i.key));
  const chosenBytes = chosen.reduce((n, i) => n + i.size, 0);
  // Ticking: shift extends from the last one ticked. While anything is ticked (or shift/ctrl/cmd is held) a click on a title ticks it
  // instead of opening its window.
  const toggle = (idx, e) => {
    const next = new Set(selected);
    if (e?.shiftKey && last.current != null) {
      for (let i = Math.min(last.current, idx); i <= Math.max(last.current, idx); i++) if (shown[i]) next.add(shown[i].key);
    } else {
      const k = shown[idx].key;
      next.has(k) ? next.delete(k) : next.add(k);
    }
    last.current = idx;
    setSelected(next);
  };
  const onRow = (it, idx) => (e) => (selected.size > 0 || e.shiftKey || e.ctrlKey || e.metaKey ? toggle(idx, e) : setDetail(it.key));
  const onCheck = (idx) => (e) => { e.stopPropagation(); toggle(idx, e); };
  const sortBy = (k) => sortClick(sort, desc, k, (s, d) => { setSort(s); setDesc(d); });
  const th = (k, label, className, hint) => <SortTh k={k} label={label} sort={sort} desc={desc} onSort={sortBy} className={className} hint={hint} />;
  const flipType = (t) => setTypes((s) => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n; });
  const chips = [
    { id: 'days', label: 'Not watched in', text: `${days} days` },
    ...(!never ? [{ id: 'never', label: 'Never watched', text: 'left out', clear: () => setNever(true) }] : []),
    ...(!played ? [{ id: 'played', label: 'Watched before', text: 'left out', clear: () => setPlayed(true) }] : []),
    ...(types.size ? [{ id: 'types', label: 'Type', text: [...types].map((t) => (t === 'movie' ? 'Movies' : 'Shows')).join(', '), clear: () => setTypes(new Set()) }] : []),
    ...(minGB !== '' && Number(minGB) > 0 ? [{ id: 'gb', label: 'Over', text: `${minGB} GB`, clear: () => setMinGB('') }] : []),
  ];
  const item = detail && data?.items.find((i) => i.key === detail);
  const setKept = (keys, on) => keep.set(keys, on).then(() => setSelected(new Set())).catch((e) => setErr(e.message));
  const switchView = (v) => { setView(v); setSelected(new Set()); setLimit(PAGE); last.current = null; };

  // One row or card per title, in whichever layout is chosen. The stale list files cards under a last-watched heading.
  const kept = view === 'kept';
  const sinceText = (it) => (kept ? `Kept ${when(Date.parse(keep.map[it.key]))}` : it.watch.plays && it.watch.last ? `${when(lastUse(it))}, ${ago(lastUse(it))}` : 'Never watched');
  const rowActions = (it) => (kept
    ? <button className="withicon" title="Put it back in the Stale list when it qualifies" onClick={(e) => { e.stopPropagation(); setKept([it.key], false); }}><Icon name="x" size={14} />Stop keeping</button>
    : <>
      <button className="icon" title="Keep: leave this out of the list" onClick={(e) => { e.stopPropagation(); setKept([it.key], true); }}><Icon name="shield" size={16} /></button>
      <button className="icon" title="Delete" onClick={(e) => { e.stopPropagation(); setDialog([it.key]); }}><Icon name="trash" size={16} /></button>
    </>);
  const card = (it, idx) => {
    const on = selected.has(it.key);
    return (
      <div key={it.key} className={`card ${on ? 'sel' : ''}`} onClick={onRow(it, idx)}>
        <div className="poster">
          <Poster item={it} />
          <span className="check" onClick={onCheck(idx)} title="Select">{on ? <Icon name="check" size={14} /> : null}</span>
          <span className="kind">{it.type === 'movie' ? 'Movie' : 'Series'}</span>
          <span className="size">{fmtBytes(it.size)}</span>
          {kept
            ? <button className="icon kebab" title="Stop keeping: put it back in the Stale list when it qualifies" onClick={(e) => { e.stopPropagation(); setKept([it.key], false); }}><Icon name="x" size={16} /></button>
            : <button className="icon kebab" title="Keep: leave this out of the list" onClick={(e) => { e.stopPropagation(); setKept([it.key], true); }}><Icon name="shield" size={16} /></button>}
          {!kept && <button className="icon trash" title="Delete" onClick={(e) => { e.stopPropagation(); setDialog([it.key]); }}><Icon name="trash" size={16} /></button>}
        </div>
        <div className="meta">
          <b>{it.title}</b><small>{it.year} · {fmtBytes(it.size)}</small>
          <small>{sinceText(it)}</small>
          {!kept && <Meter it={it} />}
        </div>
      </div>
    );
  };
  const body = () => {
    if (layout === 'list') {
      return (
        <table className="list">
          <thead><tr><th /><th />{kept ? <><th>Title</th><th className="hm">Type</th><th>Size</th><th>Kept since</th></> : <>{th('title', 'Title')}{th('type', 'Type', 'hm')}{th('size', 'Size')}{th('idle', 'Last watched')}{th('added', 'Added', 'hm')}{th('scale', 'Stale scale', 'hm', SCALE_HINT)}</>}<th /></tr></thead>
          <tbody>
            {shown.map((it, idx) => (
              <tr key={it.key} className={selected.has(it.key) ? 'sel' : ''} onClick={onRow(it, idx)}>
                <td onClick={onCheck(idx)}><input type="checkbox" readOnly checked={selected.has(it.key)} aria-label={`Select ${it.title}`} /></td>
                <td className="thumb"><Poster item={it} /></td>
                <td><b>{it.title}</b> <small>{it.year}</small></td>
                <td className="hm">{it.type === 'movie' ? 'Movie' : 'Series'}</td>
                <td className="nw">{fmtBytes(it.size)}</td>
                <td>{kept ? when(Date.parse(keep.map[it.key]))
                  : it.watch.plays && it.watch.last ? <>{when(lastUse(it))} <small className="dim">{ago(lastUse(it))}</small></> : <span className="dim">Never</span>}</td>
                {!kept && <td className="hm">{when(Date.parse(it.added))} <small className="dim">{it.added ? ago(Date.parse(it.added)) : ''}</small></td>}
                {!kept && <td className="hm"><Meter it={it} /></td>}
                <td className="rowbtns">{rowActions(it)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    if (!grouped) return <div className={`cards ${layout}`}>{shown.map((it, idx) => card(it, idx))}</div>;
    const groups = [];
    shown.forEach((it, idx) => {
      const g = bucket(it).label;
      if (groups.at(-1)?.label !== g) groups.push({ label: g, items: [] });
      groups.at(-1).items.push([it, idx]);
    });
    return groups.map((g) => (
      <section key={g.label} className="stalegroup">
        <h3>{g.label}<small>{g.items.length} {g.items.length === 1 ? 'title' : 'titles'} · {fmtBytes(g.items.reduce((n, [i]) => n + i.size, 0))}</small></h3>
        <div className={`cards ${layout}`}>{g.items.map(([it, idx]) => card(it, idx))}</div>
      </section>
    ));
  };

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
        <div className="stalehead-row">
          <h2 className="ptitle2">Stale content</h2>
          <div className="seg small">
            <button className={view === 'stale' ? 'active' : ''} onClick={() => switchView('stale')}>Stale ({rows.length})</button>
            <button className={view === 'kept' ? 'active' : ''} onClick={() => switchView('kept')}>Kept ({keptRows.length})</button>
          </div>
        </div>
        <p className="dim">Titles nobody has watched for a while. Tick what you want to remove, then review it before anything is deleted. Mark a title <b>Keep</b> to leave it out of this list.</p>
      </div>

      <div className="toolbar">
        <div className="dsearch toolbarsearch">
          <Icon name="search" size={18} />
          <input placeholder="Search these titles…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" aria-label="Search these titles" />
          {q && <button className="icon" aria-label="Clear search" onClick={() => setQ('')}><Icon name="x" size={16} /></button>}
        </div>
        {view === 'stale' && (
          <>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {Object.entries(SORTS).map(([k, [l]]) => <option key={k} value={k}>Sort: {l}</option>)}
            </select>
            <button className="withicon" title="Toggle sort direction" onClick={() => setDesc(!desc)}><Icon name={desc ? 'arrowDown' : 'arrowUp'} />{SORTS[sort][2][desc ? 0 : 1]}</button>
          </>
        )}
        <div className="seg">
          {['tile', 'grid', 'list'].map((v) => <button key={v} className={layout === v ? 'active' : ''} onClick={() => setLayout(v)}>{v}</button>)}
        </div>
        {view === 'stale' && <button className={`withicon filtersbtn ${panel ? 'on' : ''}`} aria-expanded={panel} onClick={() => setPanel(!panel)}><Icon name="filter" size={15} />Filters{chips.length > 1 ? ` (${chips.length - 1})` : ''}</button>}
        <button className="refreshbtn" onClick={() => load(true)} title="Refresh the library" aria-label="Refresh the library"><Icon name="refresh" size={17} /></button>
      </div>

      {view === 'stale' && panel && (
        <div className="stalepanel">
          <div className="sp-field">
            <span className="range">Not watched in <input type="number" min="1" value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))} /> days</span>
            <div className="seg small">
              {PRESETS.map(([d, l]) => <button key={d} className={days === d ? 'active' : ''} onClick={() => setDays(d)}>{l}</button>)}
            </div>
          </div>
          <div className="sp-field">
            <label className="recfilter"><input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} /> Never watched</label>
            <label className="recfilter"><input type="checkbox" checked={played} onChange={(e) => setPlayed(e.target.checked)} /> Watched before</label>
          </div>
          <div className="sp-field">
            <div className="seg small">
              {[['movie', 'Movies'], ['show', 'Shows']].map(([t, l]) => <button key={t} className={types.has(t) ? 'active' : ''} onClick={() => flipType(t)}>{l}</button>)}
            </div>
            <span className="range">Over <input type="number" min="0" placeholder="0" value={minGB} onChange={(e) => setMinGB(e.target.value)} /> GB</span>
          </div>
        </div>
      )}

      {view === 'stale' && (
        <div className="chiprow">
          {chips.map((c) => (
            <span key={c.id} className="fchip">
              <button className="fchiptext" onClick={() => setPanel(true)} title="Change this filter"><b>{c.label}:</b> {c.text}</button>
              {c.clear && <button className="fchipx" onClick={c.clear} aria-label={`Remove the ${c.label} filter`}><Icon name="x" size={12} /></button>}
            </span>
          ))}
        </div>
      )}

      {view === 'stale' && <div className="count"><b>{rows.length}</b> stale titles · <b>{fmtBytes(total)}</b> could be freed{hiddenKept > 0 && <> · <button className="link" onClick={() => switchView('kept')}>{hiddenKept} kept {hiddenKept === 1 ? 'title is' : 'titles are'} left out</button></>}</div>}
      {view === 'stale' && rows.length === 0 && <div className="notice">Nothing has gone unwatched for {days} days with these settings.</div>}

      {view === 'stale' && rows.length > 0 && body()}
      {view === 'kept' && (
        <>
          <div className="count"><b>{keptRows.length}</b> kept {keptRows.length === 1 ? 'title' : 'titles'}: left out of the Stale list until you stop keeping them</div>
          {keptRows.length === 0 && <div className="notice">Nothing is kept. Use the shield on a stale title, or <b>Keep</b> in its window, to leave it out of the list.</div>}
          {keptRows.length > 0 && body()}
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
