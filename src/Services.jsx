import { useEffect, useState } from 'react';
import { api } from './api.js';
import ServiceIcon from './ServiceIcon.jsx';

const INFO = { radarr: ['Radarr', 7878], sonarr: ['Sonarr', 8989], overseerr: ['Overseerr', 5055], qbittorrent: ['qBittorrent', 8080], prowlarr: ['Prowlarr', 9696], tautulli: ['Tautulli', 8181], plex: ['Plex', 32400] };
// One section per service.
const HINTS = {
  radarr: 'Your movie libraries. Required for movies: they appear on the Library page, and deleting unmonitors them here and removes the files. Add one entry per instance, for example separate 1080p and 4K servers.',
  sonarr: 'Your TV libraries. Required for shows: they appear on the Library page, and deleting unmonitors the series and its episodes here and removes the files. Add one entry per instance.',
  overseerr: 'Deleting removes the title\'s requests and resets its media record, so it stops showing as available.',
  qbittorrent: 'Deleting removes the title\'s torrents together with their data, so hardlinked or seeding copies don\'t keep using disk space.',
  prowlarr: 'Connection test only. The delete workflow never uses Prowlarr.',
  tautulli: 'Last watched and play counts across every Plex user. Preferred over Plex for watch history.',
  plex: 'Watch history for the token owner only, and an optional library rescan after a delete.',
};
const GROUPS = ['radarr', 'sonarr', 'overseerr', 'qbittorrent', 'prowlarr', 'tautulli', 'plex']
  .map((t) => ({ title: INFO[t][0], types: [t], hint: HINTS[t] }));
const blank = (type, list) => {
  const same = list.filter((s) => s.type === type).length;
  return { type, name: INFO[type][0] + (same ? ` ${same + 1}` : ''), url: `http://localhost:${INFO[type][1]}`, apiKey: '', username: '', password: '' };
};

function ServiceDialog({ initial, onSave, onClose }) {
  const [s, setS] = useState(initial);
  const [test, setTest] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => { setS({ ...s, [k]: v }); setTest(null); };
  const run = async () => {
    setTest({ state: 'testing', detail: 'Testing…' });
    try { const r = await api.test(s); setTest({ state: r.ok ? 'ok' : 'bad', detail: r.detail }); }
    catch (e) { setTest({ state: 'bad', detail: e.message }); }
  };
  const save = async () => { setSaving(true); try { await onSave(s); } finally { setSaving(false); } };
  const qb = s.type === 'qbittorrent';
  return (
    <div className="overlay">
      <div className="dialog small">
        <h2 className="dhead"><ServiceIcon type={s.type} size={32} /> {initial.id ? 'Edit' : 'Add'} {INFO[s.type][0]}</h2>
        <div className="form">
          <label>Name<input value={s.name} onChange={(e) => set('name', e.target.value)} /></label>
          <label>URL<input value={s.url} onChange={(e) => set('url', e.target.value)} placeholder="http://192.168.1.10:7878" /></label>
          {qb ? <>
            <label>Username<input value={s.username || ''} onChange={(e) => set('username', e.target.value)} /></label>
            <label>Password<input type="password" value={s.password || ''} onChange={(e) => set('password', e.target.value)} /></label>
          </> : (
            <label>{s.type === 'plex' ? 'Plex token' : 'API key'}
              <input type="password" value={s.apiKey || ''} onChange={(e) => set('apiKey', e.target.value)} autoComplete="off" />
            </label>
          )}
        </div>
        {test && <div className={`teststat ${test.state}`}><i className={`dot ${test.state}`} />{test.detail}</div>}
        <div className="buttons">
          <button onClick={run}>Test</button>
          <span className="spacer" />
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={save} disabled={saving || !s.name.trim() || !s.url.trim()}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

export default function Services() {
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null); // { index | null, svc }
  const [status, setStatus] = useState({});
  const [err, setErr] = useState('');

  // Test every service as soon as the list loads.
  const [sec, setSec] = useState(null);
  useEffect(() => { api.services().then((l) => { setList(l); l.forEach(testOne); }).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { api.security().then(setSec).catch(() => {}); }, []);

  const persist = async (next) => { const saved = await api.saveServices(next); setList(saved); return saved; };
  const testOne = async (s) => {
    setStatus((m) => ({ ...m, [s.id]: { state: 'testing', detail: 'Testing…' } }));
    try { const r = await api.test(s); setStatus((m) => ({ ...m, [s.id]: { state: r.ok ? 'ok' : 'bad', detail: r.detail } })); }
    catch (e) { setStatus((m) => ({ ...m, [s.id]: { state: 'bad', detail: e.message } })); }
  };
  const remove = async (i) => {
    if (!window.confirm(`Remove ${list[i].name}? This only removes the connection here, not the service itself.`)) return;
    try { await persist(list.filter((_, n) => n !== i)); } catch (e) { setErr(e.message); }
  };
  const save = async (svc) => {
    const next = edit.index == null ? [...list, svc] : list.map((s, i) => (i === edit.index ? svc : s));
    try {
      const saved = await persist(next);
      setEdit(null);
      const fresh = saved.find((s) => s.type === svc.type && s.name === svc.name);
      if (fresh) testOne(fresh);
    } catch (e) { setErr(e.message); }
  };

  if (!list) return <p className="dim">{err || 'Loading…'}</p>;
  return (
    <div>
      {err && <div className="notice bad">{err}</div>}
      <div className="stoolbar">
        <span className="dim">{list.length} service{list.length === 1 ? '' : 's'} configured. Keys stay on the server{sec ? `, encrypted at rest (${sec.encryption}, key from ${sec.keySource === 'env' ? 'MMM_SECRET_KEY' : 'data/secret.key'})` : ''}.</span>
        <button onClick={() => list.forEach(testOne)} disabled={!list.length}>Test all connections</button>
      </div>

      {GROUPS.map((g) => (
        <section className="sgroup" key={g.title}>
          <h3>{g.title}</h3>
          <p className="dim">{g.hint}</p>
          <div className="scards">
            {list.map((s, i) => g.types.includes(s.type) && (
              <div className="scard" key={s.id}>
                <div className="sbody">
                  <div className="sinfo">
                    <b>{s.name}</b>
                    <div><span className="k">Address</span> {s.url}</div>
                    <div className="sstat">
                      {status[s.id] ? <><i className={`dot ${status[s.id].state}`} />{status[s.id].detail}</> : <span className="dim">Not tested</span>}
                    </div>
                  </div>
                  <ServiceIcon type={s.type} size={52} />
                </div>
                <div className="sfoot">
                  <button onClick={() => setEdit({ index: i, svc: s })}>Edit</button>
                  <button onClick={() => remove(i)}>Delete</button>
                </div>
              </div>
            ))}
            {g.types.map((t) => (
              <button key={t} className="sadd" onClick={() => setEdit({ index: null, svc: blank(t, list) })}>+ Add {INFO[t][0]}</button>
            ))}
          </div>
        </section>
      ))}

      {edit && <ServiceDialog initial={edit.svc} onSave={save} onClose={() => setEdit(null)} />}
    </div>
  );
}
