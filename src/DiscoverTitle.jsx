import { useEffect, useState } from 'react';
import { api } from './api.js';
import Icon from './Icon.jsx';

// One movie or show from Discover: what it is, where it stands, and a button to request it. For a show you choose the seasons.
const STATUS = { 2: ['Requested', 'warn'], 3: ['Requested', 'warn'], 4: ['Partially available', 'warn'], 5: ['Available', 'ok'] };
const mins = (m) => (m ? (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} minutes`) : null);

export default function DiscoverTitle({ type, tmdbId, onClose, onOpenLibrary, onRequested }) {
  const [t, setT] = useState(null);
  const [err, setErr] = useState('');
  const [picked, setPicked] = useState(new Set()); // season numbers
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [badImg, setBadImg] = useState(false);
  const [sent, setSent] = useState(false); // a request has gone through from this window
  const isShow = type === 'show';

  const load = (first) => api.discoverTitle(type, tmdbId).then((d) => {
    setT(d);
    // what is worth asking for: seasons that are neither here nor already asked for
    if (first) setPicked(new Set((d.seasons || []).filter((s) => s.status !== 5 && !s.requested).map((s) => s.number)));
  }).catch((e) => setErr(e.message));
  useEffect(() => { load(true); }, [type, tmdbId]);
  useEffect(() => {
    // capture phase and stopped here, so Escape closes this window only, not the title window it may be open over
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [onClose]);

  const request = async () => {
    setBusy(true); setErr(''); setDone('');
    try {
      const body = { type, id: tmdbId, ...(isShow ? { seasons: [...picked].sort((a, b) => a - b) } : {}) };
      const r = await api.discoverRequest(body);
      setDone(r.requestStatus === 'approved' ? 'Requested. It has been approved and sent to your download manager.' : 'Requested. It is waiting for approval in Overseerr.');
      setSent(true);
      onRequested?.();
      await load(false);
      setPicked(new Set());
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const badge = t && (t.inLibrary ? ['In library', 'ok'] : STATUS[t.status]);
  const available = t && !isShow && t.status === 5;
  const asked = t && !isShow && (sent || t.status === 2 || t.status === 3); // a movie that is already on its way
  const left = t && isShow ? t.seasons.filter((s) => s.status !== 5 && !s.requested) : [];
  const flip = (n) => setPicked((s) => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x; });
  const sub = t && [isShow ? (t.seasons.length ? `${t.seasons.length} Season${t.seasons.length === 1 ? '' : 's'}` : null) : mins(t.runtime), t.genres.join(', ')].filter(Boolean);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
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
                {t.cast.length > 0 && (
                  <>
                    <h3>Cast</h3>
                    <div className="chips">{t.cast.map((c) => <span key={c.name + c.character} className="chip small" title={c.character || undefined}>{c.name}</span>)}</div>
                  </>
                )}
                {isShow && t.seasons.length > 0 && (
                  <>
                    <h3>Seasons</h3>
                    <ul className="dseasons">
                      {t.seasons.map((s) => {
                        const state = s.status === 5 ? ['Available', 'ok'] : s.requested ? ['Requested', 'warn'] : s.status === 4 ? ['Partial', 'warn'] : null;
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
                    {t.inLibrary && <button className="primary" onClick={() => onOpenLibrary(t.inLibrary)}>Open in your library</button>}
                    {available && !t.inLibrary && <p className="dim">This is already available.</p>}
                    {asked && !available && <p className="dim">This has been requested.</p>}
                    {!available && !asked && (isShow && !left.length
                      ? <p className="dim">{t.seasons.length ? 'Every season is already available or requested.' : 'There are no seasons to request yet.'}</p>
                      : <button className={t.inLibrary ? '' : 'primary'} disabled={busy || (isShow && !picked.size)} onClick={request}>
                        {busy ? 'Requesting…' : isShow ? `Request ${picked.size} season${picked.size === 1 ? '' : 's'}` : 'Request movie'}
                      </button>)}
                    <small className="dim">A request goes to Overseerr, which sends it to {isShow ? 'Sonarr' : 'Radarr'} the way a request made there would.</small>
                  </div>
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
