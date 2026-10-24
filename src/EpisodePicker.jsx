import { useEffect, useMemo, useRef, useState } from 'react';
import { api, fmtBytes } from './api.js';
import Icon from './Icon.jsx';

const FIRST = 5; // seasons shown before the rest are folded behind "Show more"
const fmtDate = (s) => (s ? new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');

function Tri({ checked, some, onChange, disabled, label }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !checked && some; }, [checked, some]);
  return <input ref={ref} type="checkbox" checked={checked} disabled={disabled} onChange={onChange} aria-label={label} />;
}

// Lists every season and episode of a show, per Sonarr instance, and lets you tick episodes to delete.
export default function EpisodePicker({ item, refreshKey, onDelete }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState({}); // serviceId -> Set(episodeId)
  const [open, setOpen] = useState(new Set()); // "serviceId:season"
  const [unfolded, setUnfolded] = useState(new Set()); // serviceIds whose full season list is shown
  const last = useRef({}); // for shift-click ranges: "serviceId:season" -> last index

  useEffect(() => {
    setData(null); setErr(''); setSel({}); setUnfolded(new Set());
    api.episodes(item.key).then((d) => {
      setData(d);
      // a short show opens fully; a long one shows its season list and lets you open what you need
      const seasons = d.instances.flatMap((i) => i.seasons.map((s) => `${i.serviceId}:${s.number}`));
      setOpen(seasons.length <= 2 ? new Set(seasons) : new Set());
    }).catch((e) => setErr(e.message));
  }, [item.key, refreshKey]);

  // Episodes that share one file (a double episode) must be chosen together, because deleting the file removes both.
  const groups = useMemo(() => {
    const g = {};
    for (const inst of data?.instances || []) {
      const byFile = new Map();
      for (const s of inst.seasons) for (const e of s.episodes) if (e.fileId) { if (!byFile.has(e.fileId)) byFile.set(e.fileId, []); byFile.get(e.fileId).push(e.id); }
      g[inst.serviceId] = { byFile };
    }
    return g;
  }, [data]);

  const setMany = (inst, eps, on) => {
    setSel((cur) => {
      const next = new Set(cur[inst.serviceId] || []);
      for (const e of eps) {
        if (!e.hasFile) continue;
        const ids = groups[inst.serviceId].byFile.get(e.fileId) || [e.id]; // the whole file group moves together
        for (const id of ids) on ? next.add(id) : next.delete(id);
      }
      return { ...cur, [inst.serviceId]: next };
    });
  };

  if (err) return <div className="notice bad">{err}</div>;
  if (!data) return <p className="dim">Loading episodes…</p>;

  const chosen = (inst) => sel[inst.serviceId] || new Set();
  const all = data.instances.flatMap((i) => i.seasons.flatMap((s) => s.episodes.map((e) => ({ inst: i, e }))));
  // bytes are counted once per file, even when one file holds two episodes
  const seenFile = new Set();
  const bytes = all.reduce((n, { inst, e }) => {
    if (!chosen(inst).has(e.id) || !e.fileId) return n;
    const k = inst.serviceId + ':' + e.fileId;
    if (seenFile.has(k)) return n;
    seenFile.add(k);
    return n + e.size;
  }, 0);
  const count = all.filter(({ inst, e }) => chosen(inst).has(e.id)).length;
  const withFiles = all.filter(({ e }) => e.hasFile).length;

  const toggleEp = (inst, season, idx, e, ev) => {
    const key = `${inst.serviceId}:${season.number}`;
    const on = !chosen(inst).has(e.id);
    if (ev.shiftKey && last.current[key] != null) {
      const [a, b] = [Math.min(last.current[key], idx), Math.max(last.current[key], idx)];
      setMany(inst, season.episodes.slice(a, b + 1), on);
    } else setMany(inst, [e], on);
    last.current[key] = idx;
  };

  const submit = () => onDelete(data.instances.map((i) => ({ serviceId: i.serviceId, episodeIds: [...chosen(i)] })).filter((s) => s.episodeIds.length));

  if (!withFiles) return <p className="dim">None of this show's episodes have files on disk.</p>;

  const renderSeason = (inst, season) => {
    const sk = `${inst.serviceId}:${season.number}`;
    const eps = season.episodes;
    const files = eps.filter((e) => e.hasFile);
    const picked = files.filter((e) => chosen(inst).has(e.id));
    const isOpen = open.has(sk);
    const toggleOpen = () => setOpen((o) => { const n = new Set(o); n.has(sk) ? n.delete(sk) : n.add(sk); return n; });
    // Available = every episode that has aired is on disk; partial = some are; otherwise none.
    const today = new Date().toISOString().slice(0, 10);
    const aired = eps.filter((e) => !e.airDate || e.airDate <= today);
    const state = !files.length ? ['Not available', 'dim']
      : aired.length && aired.every((e) => e.hasFile) ? ['Available', 'ok'] : [`Partially available · ${files.length}/${eps.length}`, 'warn'];
    return (
      <div key={sk} className="season">
        <div className="seasonhead" onClick={(ev) => { if (!ev.target.closest('input')) toggleOpen(); }}>
          <Tri checked={files.length > 0 && picked.length === files.length} some={picked.length > 0} disabled={!files.length}
            onChange={() => setMany(inst, eps, picked.length !== files.length)} label={`Select all of season ${season.number}`} />
          <span className="seasontitle">{season.number === 0 ? 'Specials' : `Season ${season.number}`}</span>
          <span className="chip small">{eps.length} Episode{eps.length === 1 ? '' : 's'}</span>
          <span className="dim seasonsize">{files.length ? fmtBytes(files.reduce((n, e) => n + e.size, 0)) : ''}{picked.length ? ` · ${picked.length} selected` : ''}</span>
          <span className="spacer" />
          <span className={`badge ${state[1]}`}>{state[0]}</span>
          <button className="chev" aria-label={isOpen ? 'Collapse season' : 'Expand season'} aria-expanded={isOpen} onClick={(ev) => { ev.stopPropagation(); toggleOpen(); }}><Icon name={isOpen ? 'chevronUp' : 'chevronDown'} size={20} /></button>
        </div>
        {isOpen && (
          <ul className="eplist">
            {eps.map((e, idx) => {
              const shared = e.fileId ? (groups[inst.serviceId].byFile.get(e.fileId) || []).length > 1 : false;
              return (
                <li key={e.id} className={`eprow ${chosen(inst).has(e.id) ? 'on' : ''} ${e.hasFile ? '' : 'missing'}`}>
                  <input type="checkbox" checked={chosen(inst).has(e.id)} disabled={!e.hasFile} onChange={() => {}} onClick={(ev) => toggleEp(inst, season, idx, e, ev)} aria-label={e.label} />
                  <span className="eplabel">{e.label}</span>
                  <span className="eptitle">{e.title}{shared && <small className="dim"> · shares a file with another episode, chosen together</small>}</span>
                  <span className="dim epdate">{fmtDate(e.airDate)}</span>
                  <span className="epsize">{e.hasFile ? `${fmtBytes(e.size)}${e.quality ? ' · ' + e.quality : ''}` : <i>no file</i>}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className="eppicker">
      {data.instances.map((inst) => {
        const folded = inst.seasons.length > FIRST && !unfolded.has(inst.serviceId);
        const hidden = inst.seasons.length - FIRST;
        return (
          <div key={inst.serviceId} className="epinst">
            {data.instances.length > 1 && <h5>{inst.serviceName}</h5>}
            {(folded ? inst.seasons.slice(0, FIRST) : inst.seasons).map((season) => renderSeason(inst, season))}
            {!folded && inst.seasons.length > FIRST && (
              <div className="showless">
                <button className="showmore inline" onClick={(ev) => {
                  const box = ev.currentTarget.closest('.epinst');
                  setUnfolded((u) => { const n = new Set(u); n.delete(inst.serviceId); return n; });
                  requestAnimationFrame(() => box?.scrollIntoView({ block: 'nearest' })); // the list just got shorter: keep it in view
                }}>
                  Show fewer <Icon name="chevronUp" size={16} />
                </button>
              </div>
            )}
            {folded && (
              // The next season peeks out, fading away under the button.
              <div className="peek">
                <div className="peekclip" aria-hidden="true" inert="">{renderSeason(inst, inst.seasons[FIRST])}</div>
                <button className="showmore" onClick={() => setUnfolded((u) => new Set(u).add(inst.serviceId))}>
                  Show {hidden} more season{hidden === 1 ? '' : 's'} <Icon name="chevronDown" size={16} />
                </button>
              </div>
            )}
          </div>
        );
      })}
      {count > 0 && (
        // Only once something is ticked. At the bottom, so it appears without moving the list.
        <div className="epbar">
          <b>{count} episode{count === 1 ? '' : 's'} selected · {fmtBytes(bytes)}</b>
          <span className="spacer" />
          <button onClick={() => setOpen(new Set(data.instances.flatMap((i) => i.seasons.map((s) => `${i.serviceId}:${s.number}`))))}>Expand all</button>
          <button onClick={() => setOpen(new Set())} disabled={!open.size}>Collapse all</button>
          <button onClick={() => data.instances.forEach((i) => setMany(i, i.seasons.flatMap((s) => s.episodes), true))}>Select all with files</button>
          <button onClick={() => setSel({})}>Clear</button>
          <button className="danger" onClick={submit}>Delete {count} episode{count === 1 ? '' : 's'}…</button>
        </div>
      )}
    </div>
  );
}
