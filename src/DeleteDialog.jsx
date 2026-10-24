import { useEffect, useState } from 'react';
import { api, fmtBytes } from './api.js';
import { getDeleteDefaults } from './prefs.js';
import { Mark } from './Icon.jsx';

export default function DeleteDialog({ keys, hasPlex, onClose }) {
  const [plans, setPlans] = useState(null);
  const [err, setErr] = useState('');
  const [phase, setPhase] = useState('review'); // review | running | done
  const [results, setResults] = useState([]);
  const [opts, setOpts] = useState(() => { const d = getDeleteDefaults(); return { ...d, plex: hasPlex && d.plex }; });

  useEffect(() => { api.plan(keys).then(setPlans).catch((e) => setErr(e.message)); }, [keys]);

  const set = (k, v) => setOpts((o) => ({ ...o, [k]: v }));
  const totalBytes = (plans || []).reduce((n, p) => n + p.arrs.reduce((m, a) => m + a.files.reduce((s, f) => s + f.size, 0), 0), 0);

  const go = async () => {
    setPhase('running');
    try {
      setResults(await api.remove(keys, { ...opts, unmonitor: true }));
    } catch (e) {
      setErr(e.message);
    }
    setPhase('done');
  };

  return (
    <div className="overlay">
      <div className="dialog">
        <h2>{phase === 'done' ? 'Done' : `Delete ${keys.length} title${keys.length > 1 ? 's' : ''}`}</h2>

        {err && <div className="notice bad">{err}</div>}
        {!plans && !err && <p>Checking what would be affected…</p>}

        {plans && phase === 'review' && (
          <>
            <div className="opts">
              <label>Overseerr request:{' '}
                <select value={opts.overseerr} onChange={(e) => set('overseerr', e.target.value)}>
                  <option value="delete">Delete request and reset media</option>
                  <option value="decline">Mark as declined</option>
                  <option value="none">Leave alone</option>
                </select>
              </label>
              <label><input type="checkbox" checked disabled /> Unmonitor in Radarr/Sonarr (history is kept)</label>
              <label><input type="checkbox" checked={opts.files} onChange={(e) => set('files', e.target.checked)} /> Delete media files ({fmtBytes(totalBytes)})</label>
              <label><input type="checkbox" checked={opts.torrents} onChange={(e) => set('torrents', e.target.checked)} /> Remove matching torrents + data from qBittorrent</label>
              {hasPlex && <label><input type="checkbox" checked={opts.plex} onChange={(e) => set('plex', e.target.checked)} /> Rescan Plex libraries afterwards</label>}
            </div>
            <div className="scroll">
              {plans.map((p) => (
                <div className="plan" key={p.key}>
                  <div className="ptitle">{p.title} <small>{p.year} · {p.type === 'movie' ? 'Movie' : 'Series'}</small></div>
                  <ul>
                    {p.overseerr.map((o) => (
                      <li key={o.serviceId}>{o.serviceName}: {o.requests.length} request(s){o.requests.length ? ` by ${[...new Set(o.requests.map((r) => r.by))].join(', ')}` : ''}</li>
                    ))}
                    {!p.overseerr.length && <li className="dim">No Overseerr record</li>}
                    {p.arrs.map((a) => (
                      <li key={a.serviceId}>
                        {a.serviceName}: unmonitor, {a.files.length} file(s), {fmtBytes(a.files.reduce((s, f) => s + f.size, 0))}
                        {a.files.slice(0, 5).map((f) => <div key={f.id} className="path">{f.path}</div>)}
                        {a.files.length > 5 && <div className="path">…and {a.files.length - 5} more</div>}
                      </li>
                    ))}
                    {p.torrents.map((t) => <li key={t.hash}>{t.serviceName}: torrent <span className="path">{t.name}</span> ({fmtBytes(t.size)})</li>)}
                    {p.warnings.map((w) => <li key={w} className="warn">{w}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}

        {phase === 'running' && <p>Working… don’t close this window.</p>}

        {phase === 'done' && (
          <div className="scroll">
            {results.map((r) => (
              <div className="plan" key={r.key}>
                <div className="ptitle"><Mark ok={r.ok} warn /> {r.title}</div>
                <ul>
                  {r.steps.map((s, i) => (
                    <li key={i} className={s.ok ? '' : 'warn'}><Mark ok={s.ok} /> {s.label}{s.ok ? '' : ` — ${s.detail}`}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <div className="buttons">
          {phase === 'review' && <>
            <button onClick={() => onClose(false)}>Back</button>
            <button className="danger" disabled={!plans} onClick={go}>Delete</button>
          </>}
          {phase === 'done' && <button onClick={() => onClose(true)}>Close</button>}
        </div>
      </div>
    </div>
  );
}
