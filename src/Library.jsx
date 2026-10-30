import { useEffect, useMemo, useRef, useState } from 'react';
import { api, fmtBytes, watchLabel } from './api.js';
import DeleteDialog from './DeleteDialog.jsx';
import FilterPanel from './FilterPanel.jsx';
import Detail from './Detail.jsx';
import Poster from './Poster.jsx';
import Icon from './Icon.jsx';
import SortTh, { sortClick } from './SortTh.jsx';
import ItemMenu from './ItemMenu.jsx';
import PlexListDialog from './PlexListDialog.jsx';
import { useKeep } from './keep.js';
import { useDownloads, DOWNLOAD_LABEL } from './downloads.js';
import LoadingLogo from './LoadingLogo.jsx';
import CastRow from './CastRow.jsx';

// Each sort returns an ascending comparator; the direction toggle flips it.
const perEp = (i) => (i.type === 'show' && i.episodes ? i.size / i.episodes : i.size);
// Each sort is [name, ascending comparator, [label when high to low, label when low to high]]; the direction button names the order
// in terms of what is being sorted.
const LARGEST = ['Largest first', 'Smallest first'];
const MOST = ['Most first', 'Fewest first'];
const NEWEST = ['Newest first', 'Oldest first'];
const SORTS = {
  size: ['Total size', (a, b) => a.size - b.size, LARGEST],
  perep: ['Size per episode', (a, b) => perEp(a) - perEp(b), LARGEST],
  episodes: ['Episode count', (a, b) => a.episodes - b.episodes, MOST],
  title: ['Title', (a, b) => a.title.localeCompare(b.title), ['Z to A', 'A to Z']],
  type: ['Type', (a, b) => a.type.localeCompare(b.type), ['Shows first', 'Movies first']],
  added: ['Date added', (a, b) => (a.added || '').localeCompare(b.added || ''), NEWEST],
  year: ['Year', (a, b) => (a.year || 0) - (b.year || 0), NEWEST],
  rating: ['Rating', (a, b) => (a.rating || 0) - (b.rating || 0), ['Highest first', 'Lowest first']], // titles without a rating count as 0, so they sit last when sorting high to low
  last: ['Last watched', (a, b) => (a.watch?.last || 0) - (b.watch?.last || 0), ['Most recent first', 'Least recent first']],
  plays: ['Play count', (a, b) => (a.watch?.plays || 0) - (b.watch?.plays || 0), MOST],
};
const WATCH = [['never', 'Never watched'], ['watched', 'Watched'], ['unknown', 'Not found in Plex/Tautulli']];
const WATCH_TEST = { never: (i) => i.watch && !i.watch.plays, watched: (i) => i.watch?.plays > 0, unknown: (i) => !i.watch };
const DAY = 86400000;
// "Not watched in N days": the last play, or for never-watched titles the date added, is older than N days.
const stale = (i, days) => {
  if (!i.watch) return false;
  const ref = i.watch.plays && i.watch.last ? i.watch.last * 1000 : Date.parse(i.added) || 0;
  return Date.now() - ref > days * DAY;
};
const GB = 1024 ** 3;
const STATUS = [['disk', 'On disk'], ['nofile', 'No file'], ['mon', 'Monitored'], ['unmon', 'Unmonitored']];
const STATUS_TEST = { disk: (i) => i.hasFile, nofile: (i) => !i.hasFile, mon: (i) => i.monitored, unmon: (i) => !i.monitored };
const empty = () => new Set();
const UNTAGGED = '\u0000untagged';
const Tags = ({ item }) => item.tags.length > 0 && <span className="tags">{item.tags.map((t) => <i key={t}>{t}</i>)}</span>;
// Stored preferences can come from an imported file, so only known values are accepted.
const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);
const store = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };

const Trash = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
  </svg>
);

export default function Library({ goSettings, appearance, preset }) {
  const [data, setData] = useState({ items: [], errors: [], serviceTypes: [] });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [types, setTypes] = useState(empty());
  const [statuses, setStatuses] = useState(empty());
  const [instances, setInstances] = useState(empty());
  const [roots, setRoots] = useState(empty());
  const [genres, setGenres] = useState(empty());
  const [tagSel, setTagSel] = useState(empty());
  const [watches, setWatches] = useState(empty());
  const [staleDays, setStaleDays] = useState('');
  const [minGB, setMinGB] = useState('');
  const [maxGB, setMaxGB] = useState('');
  const [sort, setSort] = useState(pick(store('sort', 'size'), Object.keys(SORTS), 'size'));
  const [desc, setDesc] = useState(store('desc', '1') === '1');
  const [view, setView] = useState(pick(store('view', 'tile'), ['tile', 'grid', 'list'], 'tile'));
  const [pageSize, setPageSize] = useState(pick(Number(store('pageSize', '250')), [100, 250, 500, 1000], 250));
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(new Set());
  const [dialog, setDialog] = useState(null);
  const [detail, setDetail] = useState(null);
  const [menu, setMenu] = useState(null); // { item, rect }: the "..." menu of one title
  const [plexList, setPlexList] = useState(null); // { kind, item, info }: choosing collections or playlists
  const last = useRef(null);
  const [kwSel, setKwSel] = useState(empty());
  const [panel, setPanel] = useState(false); // the filters panel
  const keep = useKeep();
  const downloads = useDownloads();
  const [keepSel, setKeepSel] = useState(empty()); // Kept / Not kept
  const [colSel, setColSel] = useState(empty());
  const [plSel, setPlSel] = useState(empty());
  const [actor, setActor] = useState(null); // { id, name, keys: Set }: only titles this person is in
  const [people, setPeople] = useState([]); // people matching what is typed in the search box
  const [plex, setPlex] = useState({ map: {}, status: {} }); // what Plex says about each title, cached by the server
  const [kw, setKw] = useState({ map: {}, status: { running: false, cached: 0 } }); // keywords from Overseerr, cached by the server

  const loadKw = () => api.keywords().then(setKw).catch(() => {});
  useEffect(() => { loadKw(); }, []);
  const loadPlex = () => api.plexCache().then(setPlex).catch(() => {});
  useEffect(() => { loadPlex(); }, []);

  const load = (refresh) => {
    setLoading(true);
    api.library(refresh).then(setData).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => load(false), []);
  useEffect(() => {
    try { localStorage.setItem('view', view); localStorage.setItem('sort', sort); localStorage.setItem('desc', desc ? '1' : '0'); } catch { /* ignore */ }
  }, [view, sort, desc]);

  // Filter options come from the data. Drives are the root folders reported by Radarr/Sonarr.
  const opts = useMemo(() => {
    const inst = new Map(), root = new Set(), genre = new Set(), tag = new Set();
    for (const i of data.items) {
      i.instances.forEach((n) => { inst.set(n.serviceId, n.serviceName); root.add(n.root); });
      i.genres.forEach((g) => genre.add(g));
      i.tags.forEach((g) => tag.add(g));
    }
    const tags = [...tag].sort().map((g) => [g, g]);
    return { inst: [...inst], root: [...root].sort().map((r) => [r, r]), genre: [...genre].sort().map((g) => [g, g]), tag: [[UNTAGGED, '(no tags)'], ...tags] };
  }, [data.items]);

  // Keyword options with how many titles carry each, most common first.
  const kwOpts = useMemo(() => {
    const n = new Map();
    for (const i of data.items) (kw.map[i.key] || []).forEach((k) => n.set(k, (n.get(k) || 0) + 1));
    return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, c]) => [k, `${k} (${c})`]);
  }, [data.items, kw.map]);
  const hasOverseerr = data.serviceTypes.includes('overseerr');
  // Typing a name also looks for people with that name (through Overseerr); picking one filters the library to what they are in.
  useEffect(() => {
    const s = q.trim();
    if (!hasOverseerr || s.length < 3) { setPeople([]); return undefined; }
    let live = true;
    const t = setTimeout(() => { api.discoverSearch(s, 1).then((d) => live && setPeople((d.people || []).filter((p) => p.photo).slice(0, 8))).catch(() => live && setPeople([])); }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [q, hasOverseerr]);
  const pickActor = (p) => {
    api.libraryPerson(p.id).then((d) => { setActor({ id: d.id, name: d.name, keys: new Set(d.keys) }); setQ(''); }).catch((e) => setErr(e.message));
  };

  // Collections and playlists that Plex has, with how many library titles are in each.
  const plexOpts = useMemo(() => {
    const col = new Map(), pl = new Map();
    for (const i of data.items) {
      const e = plex.map[i.key];
      e?.collections.forEach((c) => col.set(c, (col.get(c) || 0) + 1));
      e?.playlists.forEach((p) => pl.set(p, (pl.get(p) || 0) + 1));
    }
    const fmt = (m) => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, c]) => [k, `${k} (${c})`]);
    return { col: fmt(col), pl: fmt(pl) };
  }, [data.items, plex.map]);

  const hasWatch = data.serviceTypes.includes('tautulli') || data.serviceTypes.includes('plex');
  // Every filter in one list: the panel shows them as sections, and the chips under the toolbar show the ones in use.
  const defs = [
    { id: 'types', label: 'Type', kind: 'chips', options: [['movie', 'Movies'], ['show', 'Shows']], value: types, set: setTypes },
    { id: 'statuses', label: 'Status', kind: 'chips', options: STATUS, value: statuses, set: setStatuses },
    hasWatch && { id: 'watches', label: 'Watched', kind: 'chips', options: WATCH, value: watches, set: setWatches },
    { id: 'keep', label: 'Keep', kind: 'chips', options: [['kept', 'Kept'], ['notkept', 'Not kept']], value: keepSel, set: setKeepSel },
    { id: 'genres', label: 'Genre', kind: 'list', options: opts.genre, value: genres, set: setGenres },
    hasOverseerr && { id: 'kw', label: 'Keywords', kind: 'list', plain: true, options: kwOpts, value: kwSel, set: setKwSel, empty: 'No keywords yet. Settings > Library sync loads them from Overseerr.' },
    { id: 'tags', label: 'Tag', kind: 'list', options: opts.tag, value: tagSel, set: setTagSel },
    plexOpts.col.length > 0 && { id: 'col', label: 'Plex collection', kind: 'list', plain: true, options: plexOpts.col, value: colSel, set: setColSel },
    plexOpts.pl.length > 0 && { id: 'pl', label: 'Plex playlist', kind: 'list', plain: true, options: plexOpts.pl, value: plSel, set: setPlSel },
    opts.inst.length > 1 && { id: 'inst', label: 'Instance', kind: 'chips', options: opts.inst, value: instances, set: setInstances },
    opts.root.length > 1 && { id: 'roots', label: 'Drive / root folder', kind: 'list', options: opts.root, value: roots, set: setRoots },
  ].filter(Boolean);
  // One chip per filter in use, with a way to clear just that one.
  const chips = [
    ...defs.filter((d) => d.value.size).map((d) => {
      const names = [...d.value].map((v) => (d.plain ? v : d.options.find(([k]) => k === v)?.[1] ?? v));
      return { id: d.id, label: d.label, text: names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', '), clear: () => d.set(empty()) };
    }),
    actor && { id: 'actor', label: 'Cast', text: actor.name, clear: () => setActor(null) },
    staleDays && { id: 'stale', label: 'Not watched in', text: `${staleDays} days`, clear: () => setStaleDays('') },
    (minGB || maxGB) && { id: 'size', label: 'Size', text: `${minGB || 0} to ${maxGB || '∞'} GB`, clear: () => { setMinGB(''); setMaxGB(''); } },
  ].filter(Boolean);
  // What Home asked for (a type, or one drive's titles biggest first) is applied once the library has loaded.
  const applied = useRef(null);
  useEffect(() => {
    if (!preset || applied.current === preset || !data.items.length) return;
    applied.current = preset;
    const norm = (p) => String(p).toLowerCase().replace(/\//g, '\\').replace(/\\+$/, '');
    setTypes(new Set(preset.types || []));
    if (preset.drive) { const d = norm(preset.drive); setRoots(new Set(opts.root.map(([r]) => r).filter((r) => norm(r) === d || norm(r).startsWith(`${d}\\`)))); }
    if (preset.sort && SORTS[preset.sort]) { setSort(preset.sort); setDesc(preset.desc !== false); }
  }, [preset, data.items, opts]);

  const filtered = !!(actor || types.size || statuses.size || instances.size || roots.size || genres.size || tagSel.size || kwSel.size || keepSel.size || colSel.size || plSel.size || watches.size || staleDays || minGB || maxGB);
  const clearFilters = () => { setActor(null); setKeepSel(empty()); setColSel(empty()); setPlSel(empty()); setKwSel(empty()); setTagSel(empty());setTypes(empty()); setStatuses(empty()); setInstances(empty()); setRoots(empty()); setGenres(empty()); setWatches(empty()); setStaleDays(''); setMinGB(''); setMaxGB(''); };

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const min = minGB === '' ? -Infinity : Number(minGB) * GB;
    const max = maxGB === '' ? Infinity : Number(maxGB) * GB;
    const cmp = SORTS[sort][1];
    return data.items
      .filter((i) => (!types.size || types.has(i.type))
        && (!t || i.title.toLowerCase().includes(t))
        && (!actor || actor.keys.has(i.key))
        && (!statuses.size || [...statuses].some((s) => STATUS_TEST[s](i)))
        && (!instances.size || i.instances.some((n) => instances.has(n.serviceId)))
        && (!roots.size || i.instances.some((n) => roots.has(n.root)))
        && (!genres.size || i.genres.some((g) => genres.has(g)))
        && (!tagSel.size || i.tags.some((g) => tagSel.has(g)) || (tagSel.has(UNTAGGED) && !i.tags.length))
        && (!kwSel.size || (kw.map[i.key] || []).some((k) => kwSel.has(k)))
        && (!keepSel.size || keepSel.has(keep.map[i.key] ? 'kept' : 'notkept'))
        && (!colSel.size || (plex.map[i.key]?.collections || []).some((c) => colSel.has(c)))
        && (!plSel.size || (plex.map[i.key]?.playlists || []).some((p) => plSel.has(p)))
        && (!watches.size || [...watches].some((w) => WATCH_TEST[w](i)))
        && (!staleDays || stale(i, Number(staleDays)))
        && i.size >= min && i.size <= max)
      .sort((a, b) => (desc ? -1 : 1) * cmp(a, b));
  }, [data.items, actor, kw.map, kwSel, keep.map, keepSel, plex.map, colSel, plSel, q, types, statuses, instances, roots, genres, tagSel, watches, staleDays, minGB, maxGB, sort, desc]);
  const shownBytes = useMemo(() => shown.reduce((n, i) => n + i.size, 0), [shown]);

  // Only the current page is rendered, which keeps the DOM (and poster requests) small.
  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const start = Math.min(page, pages - 1) * pageSize;
  const paged = shown.slice(start, start + pageSize);
  useEffect(() => setPage(0), [shown, pageSize]);
  useEffect(() => { try { localStorage.setItem('pageSize', String(pageSize)); } catch { /* ignore */ } }, [pageSize]);
  const go = (p) => { setPage(Math.max(0, Math.min(pages - 1, p))); window.scrollTo({ top: 0 }); };
  const pager = shown.length > 0 && (
    <div className="pager">
      <button className="withicon hm" onClick={() => go(0)} disabled={start === 0}><Icon name="chevronsLeft" />First</button>
      <button className="withicon" onClick={() => go(page - 1)} disabled={start === 0}><Icon name="chevronLeft" />Prev</button>
      <span>{start + 1}–{start + paged.length} of {shown.length} · page {Math.min(page, pages - 1) + 1} of {pages}</span>
      <button className="withicon" onClick={() => go(page + 1)} disabled={page >= pages - 1}>Next<Icon name="chevronRight" /></button>
      <button className="withicon hm" onClick={() => go(pages - 1)} disabled={page >= pages - 1}>Last<Icon name="chevronsRight" /></button>
      <select className="hm" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} title="Titles per page">
        {[100, 250, 500, 1000].map((n) => <option key={n} value={n}>{n} per page</option>)}
      </select>
    </div>
  );

  const toggle = (idx, e) => {
    const next = new Set(selected);
    if (e.shiftKey && last.current != null) {
      const [a, b] = [Math.min(last.current, idx), Math.max(last.current, idx)];
      for (let i = a; i <= b; i++) next.add(shown[i].key);
    } else {
      const k = shown[idx].key;
      next.has(k) ? next.delete(k) : next.add(k);
    }
    last.current = idx;
    setSelected(next);
  };

  const props = (item, idx) => ({
    item,
    selected: selected.has(item.key),
    // While anything is selected (or with shift/ctrl/cmd held) a click selects; otherwise it opens the details.
    onClick: (e) => (selected.size > 0 || e.shiftKey || e.ctrlKey || e.metaKey ? toggle(idx, e) : setDetail(item.key)),
    onCheck: (e) => { e.stopPropagation(); toggle(idx, e); },
    onDelete: (e) => { e.stopPropagation(); setDialog([item.key]); },
    onMenu: (e) => { e.stopPropagation(); setMenu({ item, rect: e.currentTarget.getBoundingClientRect() }); },
  });
  const sortBy = (k) => sortClick(sort, desc, k, (s, d) => { setSort(s); setDesc(d); });
  const th = (k, label, className) => <SortTh k={k} label={label} sort={sort} desc={desc} onSort={sortBy} className={className} />;
  const noServices = !loading && !data.items.length && !data.errors.length && !err;

  return (
    <>
      <div className="toolbar">
        <div className="dsearch toolbarsearch">
          <Icon name="search" size={18} />
          <input placeholder="Search your library…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" aria-label="Search your library" />
          {q && <button className="icon" aria-label="Clear search" onClick={() => setQ('')}><Icon name="x" size={16} /></button>}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          {Object.entries(SORTS).map(([k, [label]]) => <option key={k} value={k}>Sort: {label}</option>)}
        </select>
        <button className="withicon" title="Toggle sort direction" onClick={() => setDesc(!desc)}><Icon name={desc ? 'arrowDown' : 'arrowUp'} />{SORTS[sort][2][desc ? 0 : 1]}</button>
        <div className="seg">
          {['tile', 'grid', 'list'].map((v) => (
            <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>{v}</button>
          ))}
        </div>
        <button className={`withicon filtersbtn ${chips.length ? 'on' : ''}`} aria-expanded={panel} onClick={() => setPanel(!panel)}><Icon name="filter" size={15} />Filters{chips.length ? ` (${chips.length})` : ''}</button>
        <button className={`refreshbtn ${loading ? 'spin' : ''}`} onClick={() => load(true)} disabled={loading} title={loading ? 'Loading…' : 'Refresh the library'} aria-label="Refresh the library"><Icon name="refresh" size={17} /></button>
      </div>

      {people.length > 0 && <div className="libpeople"><CastRow cast={people} title={`People matching “${q.trim()}”: show what they are in`} onPick={pickActor} /></div>}

      {(chips.length > 0 || q) && (
        <div className="chiprow">
          {chips.map((c) => (
            <span key={c.id} className="fchip">
              <button className="fchiptext" onClick={() => setPanel(true)} title="Change this filter"><b>{c.label}:</b> {c.text}</button>
              <button className="fchipx" onClick={c.clear} aria-label={`Remove the ${c.label} filter`}><Icon name="x" size={12} /></button>
            </span>
          ))}
          <button className="link" onClick={() => { clearFilters(); setQ(''); }}>Clear all</button>
        </div>
      )}

      {err && <div className="notice bad">{err}</div>}
      {data.errors.map((e) => <div key={e} className="notice bad">{e}</div>)}
      {noServices && <div className="notice">No Radarr/Sonarr found. <button className="link" onClick={goSettings}>Add your services in Settings</button></div>}
      {loading && !data.items.length ? (
        <div className="libloading"><LoadingLogo style={appearance.logo} theme={appearance.theme} /><p className="dim">Loading your library…</p></div>
      ) : (
        <div className="count">{shown.length} of {data.items.length} titles · {fmtBytes(shownBytes)} matching</div>
      )}
      {pager}

      {view === 'list' ? (
        <table className="list">
          <thead><tr><th /><th />{th('title', 'Title')}{th('type', 'Type', 'hm')}<th className="hm">Managed by</th>{th('size', 'Size')}{th('rating', 'Rating', 'hm')}{hasWatch && th('last', 'Watched', 'hm')}<th className="hm">Status</th><th /></tr></thead>
          <tbody>
            {paged.map((it, i) => { const idx = start + i;
              const p = props(it, idx);
              return (
                <tr key={it.key} className={p.selected ? 'sel' : ''} onClick={p.onClick}>
                  <td onClick={p.onCheck}><input type="checkbox" readOnly checked={p.selected} /></td>
                  <td className="thumb"><Poster item={it} /></td>
                  <td><b>{it.title}</b> <small>{it.year}</small> <Tags item={it} /></td>
                  <td className="hm">{it.type === 'movie' ? 'Movie' : 'Series'}</td>
                  <td className="hm">{it.instances.map((i) => i.serviceName).join(', ')}</td>
                  <td className="nw">{fmtBytes(it.size)}</td>
                  <td className="hm">{it.rating ? it.rating.toFixed(1) : ''}</td>
                  {hasWatch && <td className="hm">{watchLabel(it.watch)}</td>}
                  <td className="hm">{DOWNLOAD_LABEL[downloads[it.key]] && !it.hasFile ? <span className={`badge ${DOWNLOAD_LABEL[downloads[it.key]][1]}`}>{DOWNLOAD_LABEL[downloads[it.key]][0]}</span> : it.hasFile ? (it.monitored ? 'On disk' : 'On disk, unmonitored') : it.monitored ? 'Missing' : 'No file, unmonitored'}</td>
                  <td className="rowbtns"><button className="icon" title="More actions" onClick={p.onMenu}><Icon name="more" size={16} strokeWidth={3} /></button><button className="icon" title="Delete" onClick={p.onDelete}><Trash /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className={`cards ${view}`}>
          {paged.map((it, i) => { const idx = start + i;
            const p = props(it, idx);
            return (
              <div key={it.key} className={`card ${p.selected ? 'sel' : ''}`} onClick={p.onClick}>
                <div className="poster">
                  <Poster item={it} />
                  <span className="check" onClick={p.onCheck} title="Select">{p.selected ? <Icon name="check" size={14} /> : null}</span>
                  <span className="kind">{it.type === 'movie' ? 'Movie' : 'Series'}</span>
                  <span className="size">{fmtBytes(it.size)}</span>
                  {!it.hasFile && (DOWNLOAD_LABEL[downloads[it.key]]
                    ? <span className={`nofile ${DOWNLOAD_LABEL[downloads[it.key]][1]}`}>{DOWNLOAD_LABEL[downloads[it.key]][0]}</span>
                    : <span className="nofile">No file</span>)}
                  <button className="icon kebab" title="More actions" onClick={p.onMenu}><Icon name="more" size={16} strokeWidth={3} /></button>
                  <button className="icon trash" title="Delete" onClick={p.onDelete}><Trash /></button>
                </div>
                <div className="meta">
                  <b>{it.title}</b><small>{it.year} · {fmtBytes(it.size)}{sort === 'rating' && it.rating ? ` · ★ ${it.rating.toFixed(1)}` : ''}</small>
                  {hasWatch && <small>{watchLabel(it.watch)}</small>}
                  <Tags item={it} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pager}

      {selected.size > 0 && (
        <div className="actionbar">
          <span>{selected.size} selected ({fmtBytes(data.items.filter((i) => selected.has(i.key)).reduce((n, i) => n + i.size, 0))})</span>
          <button onClick={() => setSelected(new Set(paged.map((i) => i.key)))}>Select page</button>
          <button onClick={() => setSelected(new Set(shown.map((i) => i.key)))}>Select all {shown.length} matching</button>
          <button onClick={() => setSelected(new Set())}>Clear</button>
          <button className="danger" onClick={() => setDialog([...selected])}>Delete…</button>
        </div>
      )}

      {detail && data.items.find((i) => i.key === detail) && (
        <Detail
          item={data.items.find((i) => i.key === detail)}
          hasWatch={hasWatch}
          hasPlex={data.serviceTypes.includes('plex')}
          hasOverseerr={hasOverseerr}
          onOpen={(k) => setDetail(k)}
          onKeyword={(k) => { setKwSel(new Set([k])); setDetail(null); window.scrollTo({ top: 0 }); }}
          onClose={() => setDetail(null)}
          onDelete={() => { setDetail(null); setDialog([detail]); }}
          onChanged={() => load(true)}
        />
      )}

      {panel && (
        <FilterPanel
          defs={defs} shown={shown.length} total={data.items.length} canClear={chips.length > 0}
          stale={hasWatch ? { value: staleDays, set: setStaleDays } : null}
          size={{ min: minGB, max: maxGB, setMin: setMinGB, setMax: setMaxGB }}
          onClear={clearFilters} onClose={() => setPanel(false)}
        />
      )}
      {menu && (
        <ItemMenu
          item={menu.item} rect={menu.rect} hasPlex={data.serviceTypes.includes('plex')}
          cached={plex.map[menu.item.key]} onChanged={loadPlex}
          onClose={() => setMenu(null)}
          onDetails={() => setDetail(menu.item.key)}
          onDelete={() => setDialog([menu.item.key])}
          onList={(kind) => { setPlexList({ kind, item: menu.item }); setMenu(null); }}
        />
      )}
      {plexList && <PlexListDialog kind={plexList.kind} item={plexList.item} onChanged={loadPlex} onClose={() => setPlexList(null)} />}

      {dialog && (
        <DeleteDialog
          keys={dialog}
          hasPlex={data.serviceTypes.includes('plex')}
          onClose={(changed) => {
            setDialog(null);
            if (changed) { setSelected(new Set()); load(true); }
          }}
        />
      )}
    </>
  );
}
