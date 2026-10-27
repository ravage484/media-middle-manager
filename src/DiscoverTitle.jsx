import { useEffect, useRef, useState } from 'react';
import { useTopEscape } from './useTopEscape.js';
import { api } from './api.js';
import Icon from './Icon.jsx';
import CastRow from './CastRow.jsx';
import { statusOf } from './status.js';

// One movie or show from Discover: what it is, where it stands, and buttons to request it (in HD or, when Overseerr has a 4K server, 4K)
// or to take a request back. For a show you choose the seasons.
const mins = (m) => (m ? (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} minutes`) : null);

export default function DiscoverTitle({ type, tmdbId, onClose, onOpenLibrary, onRequested }) {
  const [t, setT] = useState(null);
  const [err, setErr] = useState('');
  const [picked, setPicked] = useState(new Set()); // season numbers
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [badImg, setBadImg] = useState(false);
  const [uhd, setUhd] = useState(false); // asking for / looking at the 4K version
  const isShow = type === 'show';

  // per version (HD or 4K): where the title stands and which seasons are here or already asked for
  const tier = (d, u) => ({
    status: u ? d.status4k : d.status,
    seasons: (d.seasons || []).map((s) => ({ ...s, status: u ? s.status4k : s.status, requested: u ? s.requested4k : s.requested })),
    requests: d.requests.filter((r) => r.is4k === u),
  });
  // what is worth asking for: seasons that are neither here nor already asked for
  const wanted = (d, u) => new Set(tier(d, u).seasons.filter((s) => s.status !== 5 && !s.requested).map((s) => s.number));
  const load = (first) => api.discoverTitle(type, tmdbId).then((d) => {
    setT(d);
    if (first) setPicked(wanted(d, false));
  }).catch((e) => setErr(e.message));
  useEffect(() => { setUhd(false); load(true); }, [type, tmdbId]);
  const layer = useRef(null);
  useTopEscape(layer, onClose); // Escape closes this window only, not the one it may be open over

  const request = async () => {
    setBusy(true); setErr(''); setDone('');
    try {
      const body = { type, id: tmdbId, ...(uhd ? { is4k: true } : {}), ...(isShow ? { seasons: [...picked].sort((a, b) => a - b) } : {}) };
      const r = await api.discoverRequest(body);
      setDone(r.requestStatus === 'approved' ? 'Requested. It has been approved and sent to your download manager.' : 'Requested. It is waiting for approval in Overseerr.');
      onRequested?.();
      await load(false);
      setPicked(new Set());
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const unrequest = async (r) => {
    setBusy(true); setErr(''); setDone('');
    try {
      await api.discoverUnrequest(r.id);
      setDone('Request cancelled.');
      onRequested?.();
      const d = await api.discoverTitle(type, tmdbId);
      setT(d);
      setPicked(wanted(d, uhd));
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const pickTier = (u) => { setUhd(u); setDone(''); setErr(''); if (t) setPicked(wanted(t, u)); };

  const v = t && tier(t, uhd);
  const badge = t && statusOf({ ...t, status: t.can4k ? (t.status === 5 ? t.status : t.status4k ?? t.status) : t.status });
  const available = v && !isShow && v.status === 5;
  const asked = v && !isShow && (v.requests.length > 0 || v.status === 2 || v.status === 3); // a movie that is already on its way
  const left = v && isShow ? v.seasons.filter((s) => s.status !== 5 && !s.requested) : [];
  const label = uhd ? '4K' : t?.can4k ? 'HD' : '';
  const flip = (n) => setPicked((s) => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x; });
  const sub = t && [isShow ? (t.seasons.length ? `${t.seasons.length} Season${t.seasons.length === 1 ? '' : 's'}` : null) : mins(t.runtime), t.genres.join(', ')].filter(Boolean);

  return (
    <div className="overlay" data-layer ref={layer} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog detail" role="dialog" aria-label={t?.title || 'Title'}>
        <div className="hero" style={t?.backdrop ? { backgroundImage: `url("${t.backdrop}")` } : undefined}>
          <button className="x" onClick={onClose} aria-label="Close" title="Close"><Icon name="x" size={18} /></button>
          <div className="herogrid">
            <div className="dposter">{t?.poster && !badImg ? <img src={t.poster} alt="" onError={() => setBadImg(true)} /> : <div className="noposter" />}</div>
            <div className="herotitle">
              {badge && <span className={`badge ${badge[1]}`}>{badge[0]}</span>}
              <h2>{t ? t.title : 'Loading…'} {t?.year ? <small>({t.year})</small> : null}</h2>
              {t && <div className="sub">{sub.length > 0 && <span>{sub.join(' | ')}</span>}</div>}
            </div>
          </div>
        </div>

        <div className="dscroll">
          {err && <div className="notice bad">{err}</div>}
          {done && <div className="notice">{done}</div>}
          {t && (
            <div className="dcols">
              <div className="dleft">
                {t.tagline && <p className="tagline">{t.tagline}</p>}
                <h3>Overview</h3>
                <p className="overview">{t.overview || 'No overview available.'}</p>
                <CastRow cast={t.cast} />
                {isShow && v.seasons.length > 0 && (
                  <>
                    <h3>Seasons</h3>
                    <ul className="dseasons">
                      {v.seasons.map((s) => {
                        const ask = s.requested ? v.requests.find((r) => r.seasons.includes(s.number)) : null; // its request: waiting for approval, or approved
                        const state = s.status === 5 ? ['Available', 'ok'] : ask ? [ask.status === 1 ? 'Pending' : s.status === 3 ? 'Processing' : 'Approved', 'warn'] : s.status === 4 ? ['Partially available', 'warn'] : null;
                        const locked = s.status === 5 || s.requested;
                        return (
                          <li key={s.number} className={locked ? 'locked' : ''}>
                            <label>
                              <input type="checkbox" checked={picked.has(s.number)} disabled={locked || busy} onChange={() => flip(s.number)} />
                              <span>{s.name}</span>
                              <small className="dim">{s.episodes != null ? `${s.episodes} episodes` : ''}{s.airDate ? ` · ${s.airDate.slice(0, 4)}` : ''}</small>
                            </label>
                            {state && <span className={`badge ${state[1]}`}>{state[0]}</span>}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
              <aside className="dside">
                <div className="infocard">
                  {t.rating && <div className="ratings"><span className="rate"><b>{t.rating.toFixed(1)}/10</b><small>TMDB{t.votes ? ` · ${t.votes.toLocaleString()} votes` : ''}</small></span></div>}
                  <div className="requestbox">
                    {t.can4k && (
                      <div className="seg" role="group" aria-label="Quality">
                        <button className={uhd ? '' : 'primary'} disabled={busy} onClick={() => pickTier(false)}>HD</button>
                        <button className={uhd ? 'primary' : ''} disabled={busy} onClick={() => pickTier(true)}>4K</button>
                      </div>
                    )}
                    {t.inLibrary && <button className="primary" onClick={() => onOpenLibrary(t.inLibrary)}>Open in your library</button>}
                    {available && !t.inLibrary && <p className="dim">This is already available{label ? ` in ${label}` : ''}.</p>}
                    {asked && !available && <p className="dim">This has been requested{label ? ` in ${label}` : ''}.</p>}
                    {v.requests.map((r) => (
                      <button key={r.id} disabled={busy} onClick={() => unrequest(r)}
                        title="Removes the request from Overseerr. Anything it already sent to Radarr or Sonarr stays there.">
                        {busy ? 'Working…' : `Cancel ${r.status === 1 ? 'pending ' : ''}request${r.by ? ` by ${r.by}` : ''}${isShow && r.seasons.length ? ` (S${r.seasons.join(', S')})` : ''}`}
                      </button>
                    ))}
                    {!available && !asked && (isShow && !left.length
                      ? <p className="dim">{v.seasons.length ? 'Every season is already available or requested.' : 'There are no seasons to request yet.'}</p>
                      : <button className={t.inLibrary ? '' : 'primary'} disabled={busy || (isShow && !picked.size)} onClick={request}>
                        {busy ? 'Requesting…' : isShow ? `Request ${picked.size} season${picked.size === 1 ? '' : 's'}${uhd ? ' in 4K' : ''}` : uhd ? 'Request movie in 4K' : 'Request movie'}
                      </button>)}
                    <small className="dim">A request goes to Overseerr, which sends it to {isShow ? 'Sonarr' : 'Radarr'} the way a request made there would.</small>
                  </div>
                  {t.links?.length > 0 && (
                    <div className="xlinks">
                      {t.links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a>)}
                    </div>
                  )}
                </div>
              </aside>
            </div>
          )}
          {!t && !err && <p className="dim">Loading…</p>}
        </div>
      </div>
    </div>
  );
}
