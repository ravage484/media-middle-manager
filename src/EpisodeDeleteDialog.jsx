import { useEffect, useState } from 'react';
import { api, fmtBytes } from './api.js';
import { getDeleteDefaults } from './prefs.js';
import { Mark } from './Icon.jsx';

// Review and run a per-episode delete. The plan is recomputed on the server when you press Delete.
export default function EpisodeDeleteDialog({ item, selection, hasPlex, onClose }) {
  const [plan, setPlan] = useState(null);
  const [err, setErr] = useState('');
  const [phase, setPhase] = useState('review'); // review | running | done
  const [result, setResult] = useState(null);
  const [opts, setOpts] = useState(() => { const d = getDeleteDefaults(); return { torrents: d.torrents, plex: hasPlex && d.plex }; });

  useEffect(() => { api.episodePlan(item.key, selection).then(setPlan).catch((e) => setErr(e.message)); }, [item.key, selection]);

  const go = async () => {
    setPhase('running');
    try { setResult(await api.episodeDelete(item.key, selection, opts)); } catch (e) { setErr(e.message); }
    setPhase('done');
  };
  const blocked = plan?.blocked?.length > 0;

  return (
    <div className="overlay stacked">
      <div className="dialog">
        <h2>{phase === 'done' ? 'Done' : `Delete ${plan ? plan.episodeCount : '…'} episode${plan?.episodeCount === 1 ? '' : 's'} of ${item.title}`}</h2>
        {err && <div className="notice bad">{err}</div>}
        {!plan && !err && <p>Checking what would be affected…</p>}

        {plan && phase === 'review' && (
          <>
            <div className="opts">
              <label><input type="checkbox" checked disabled /> Unmonitor these episodes in Sonarr (history is kept)</label>
              <label><input type="checkbox" checked disabled /> Delete their files ({fmtBytes(plan.bytes)})</label>
              <label><input type="checkbox" checked={opts.torrents} onChange={(e) => setOpts({ ...opts, torrents: e.target.checked })} disabled={!plan.torrents.remove.length} /> Remove torrents that nothing else needs ({plan.torrents.remove.length})</label>
              {hasPlex && <label><input type="checkbox" checked={opts.plex} onChange={(e) => setOpts({ ...opts, plex: e.target.checked })} /> Rescan Plex libraries afterwards</label>}
              <small className="dim">The show, its other episodes and its Overseerr request stay as they are. To remove the whole show, use Delete on the show instead.</small>
            </div>
            {blocked && (
              <div className="notice bad">
                A file holds several episodes and not all of them are selected, so it cannot be deleted:
                <ul>{plan.blocked.map((b) => <li key={b.path}>{b.path}: {b.episodes.join(', ')} (missing {b.missing.join(', ')})</li>)}</ul>
              </div>
            )}
            <div className="scroll">
              {plan.instances.map((i) => (
                <div className="plan" key={i.serviceId}>
                  <div className="ptitle">{i.serviceName} <small>{i.episodes.length} episode{i.episodes.length === 1 ? '' : 's'} · {fmtBytes(i.bytes)}</small></div>
                  <ul>
                    {i.episodes.slice(0, 60).map((e) => <li key={e.id}>{e.label}{e.title ? ` ${e.title}` : ''}</li>)}
                    {i.episodes.length > 60 && <li className="dim">…and {i.episodes.length - 60} more</li>}
                    {i.files.slice(0, 5).map((f) => <li key={f.id} className="path">{f.path}</li>)}
                    {i.files.length > 5 && <li className="path">…and {i.files.length - 5} more files</li>}
                  </ul>
                </div>
              ))}
              {plan.torrents.remove.length > 0 && (
                <div className="plan"><div className="ptitle">Torrents to remove</div>
                  <ul>{plan.torrents.remove.map((t) => <li key={t.hash}>{t.serviceName}: <span className="path">{t.name}</span> ({fmtBytes(t.size)}). {t.reason}</li>)}</ul>
                </div>
              )}
              {plan.torrents.keep.length > 0 && (
                <div className="plan"><div className="ptitle">Torrents that stay</div>
                  <ul>{plan.torrents.keep.map((t) => <li key={t.hash}>{t.serviceName}: <span className="path">{t.name}</span>. {t.reason}</li>)}</ul>
                </div>
              )}
              {plan.warnings.map((w) => <div key={w} className="warn">{w}</div>)}
            </div>
          </>
        )}

        {phase === 'running' && <p>Working… don’t close this window.</p>}
        {phase === 'done' && result && (
          <div className="scroll">
            <div className="plan"><div className="ptitle"><Mark ok={result.ok} warn /> {result.episodeCount} episode{result.episodeCount === 1 ? '' : 's'} · freed {fmtBytes(result.freedBytes)}</div>
              <ul>{result.steps.map((s, i) => <li key={i} className={s.ok ? '' : 'warn'}><Mark ok={s.ok} /> {s.label}{s.detail ? ` — ${s.detail}` : ''}</li>)}</ul>
            </div>
          </div>
        )}

        <div className="buttons">
          {phase === 'review' && <>
            <button onClick={() => onClose(false)}>Back</button>
            <button className="danger" disabled={!plan || blocked || !plan.instances.length} onClick={go}>Delete</button>
          </>}
          {phase === 'done' && <button onClick={() => onClose(!!result)}>Close</button>}
        </div>
      </div>
    </div>
  );
}
