import { useEffect, useState } from 'react';
import { api } from './api.js';
import Icon from './Icon.jsx';

const SCHEDULES = [['off', 'Never'], ['daily', 'Every day'], ['weekly', 'Every week'], ['monthly', 'Every month']];
const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null);
const WHY = { manual: 'started by you', new: 'new titles were found', webhook: 'Radarr/Sonarr reported a change', schedule: 'scheduled refresh' };
const CHECKS = [[5, 'every 5 minutes'], [15, 'every 15 minutes'], [60, 'every hour']];

// Keeps the keywords from Overseerr up to date: by hand, when new titles appear, and on a schedule. The server does the work,
// so it carries on with this page closed.
export default function LibrarySync() {
  const [st, setSt] = useState(null);
  const [err, setErr] = useState('');
  const refresh = () => api.keywords().then((d) => setSt(d.status)).catch((e) => setErr(e.message));
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2500);
    return () => clearInterval(t);
  }, []);
  const run = (fn) => fn().then(setSt).then(() => setErr('')).catch((e) => setErr(e.message));

  if (!st) return <div className="sgroup"><h3>Library sync</h3><p className="dim">{err || 'Loading…'}</p></div>;
  const { auto } = st;
  const hookUrl = st.hook?.token ? `${window.location.origin}/api/hooks/library?token=${st.hook.token}` : '';
  const setAuto = (patch) => run(() => api.keywordAuto(patch));

  return (
    <div className="sgroup">
      <h3>Library sync</h3>
      <p className="dim">
        Keywords come from Overseerr (they are the same ones its title pages show). They are remembered here, so the library can be
        filtered by them instantly. Keep them up to date any of these ways.
      </p>

      <div className="form narrow">
        <label className="check">
          <input type="checkbox" checked={auto.onNewTitles} onChange={(e) => setAuto({ onNewTitles: e.target.checked })} />
          Check for new titles (only the new ones are fetched)
        </label>
        {auto.onNewTitles && (
          <label>Check
            <select value={auto.checkMinutes} onChange={(e) => setAuto({ checkMinutes: Number(e.target.value) })}>
              {CHECKS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        )}
        <label>Refresh everything
          <select value={auto.schedule} onChange={(e) => setAuto({ schedule: e.target.value })}>
            {SCHEDULES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        {auto.schedule !== 'off' && (
          <p className="dim">{st.lastFull ? <>Last full refresh {when(st.lastFull)}. Next {when(st.nextFull)}.</> : 'Starts shortly: nothing has been loaded yet.'}</p>
        )}
      </div>

      <h3 style={{ marginTop: 28 }}>Instant updates (webhook)</h3>
      <p className="dim">
        Instead of waiting for the next check, Radarr and Sonarr can tell this app the moment a title is added or imported, and its
        keywords are fetched within seconds.
      </p>
      <div className="form narrow">
        <label className="check">
          <input type="checkbox" checked={auto.webhook} onChange={(e) => setAuto({ webhook: e.target.checked })} />
          Accept updates from Radarr and Sonarr
        </label>
      </div>
      {auto.webhook && st.hook?.token && (
        <div className="syncbox">
          <p>In Radarr and in Sonarr open <b>Settings &gt; Connect &gt; +  &gt; Webhook</b> and fill in:</p>
          <ul className="steps">
            <li>Triggers: <b>On Import</b> and <b>On Movie Added</b> (Radarr) or <b>On Import</b> and <b>On Series Add</b> (Sonarr)</li>
            <li>Method: <b>POST</b></li>
            <li>URL: <code className="url">{hookUrl}</code> <button onClick={() => navigator.clipboard?.writeText(hookUrl)}>Copy</button></li>
          </ul>
          <p className="dim">
            Use <b>Test</b> in Radarr/Sonarr to check it. The address must be one they can reach, so replace the host if they run elsewhere.
            The token in the address is the password: anyone who has it can only ask this app to look for new titles, but keep it private.
            It works as an <code>X-Webhook-Token</code> header too.
            {st.hook.lastReceived ? ` Last call received ${when(st.hook.lastReceived)}.` : ' Nothing received yet.'}
          </p>
          <button onClick={() => { if (confirm('Make a new token? The old address stops working, so Radarr and Sonarr need the new one.')) run(api.keywordNewToken); }}>New token…</button>
        </div>
      )}

      <h3 style={{ marginTop: 28 }}>Run it now</h3>
      <div className="syncbox">
        {st.running ? (
          <>
            <div className="bar"><i style={{ width: `${st.total ? Math.round((st.done / st.total) * 100) : 0}%` }} /></div>
            <p>Loading keywords from Overseerr: {st.done} of {st.total} ({WHY[st.trigger] || st.trigger}){st.failed ? `, ${st.failed} skipped` : ''}</p>
            <button onClick={() => run(api.keywordStop)} disabled={st.stopping}>{st.stopping ? 'Stopping…' : 'Stop'}</button>
          </>
        ) : (
          <>
            <p>{st.cached} {st.cached === 1 ? 'title has' : 'titles have'} keywords loaded.
              {st.finishedAt ? ` Last run finished ${when(st.finishedAt)} (${WHY[st.trigger] || st.trigger}).` : ''}</p>
            {st.failed > 0 && st.finishedAt && (
              <details className="skipped">
                <summary><span>{st.failed} {st.failed === 1 ? 'title' : 'titles'} skipped</span><Icon name="chevronDown" size={14} /></summary>
                <div className="tscroll"><table>
                  <thead><tr><th>Name</th><th>Year</th><th>Type</th><th>Reason</th></tr></thead>
                  <tbody>
                    {st.failures?.map((f) => (
                      <tr key={f.type + f.title + f.year}>
                        <td><b>{f.title}</b></td>
                        <td>{f.year || ''}</td>
                        <td>{f.type === 'movie' ? 'Movie' : 'Series'}</td>
                        <td className="dim">{f.why}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
                <p className="dim">
                  {st.failed > (st.failures?.length || 0) ? `Showing the first ${st.failures.length}. ` : ''}They are tried again at the next check.
                </p>
              </details>
            )}
            <div className="row">
              <button className="primary" onClick={() => run(() => api.keywordSync(false))}>Load missing keywords</button>
              <button onClick={() => run(() => api.keywordSync(true))}>Refresh everything</button>
            </div>
          </>
        )}
      </div>
      {err && <div className="notice bad">{err}</div>}
    </div>
  );
}
