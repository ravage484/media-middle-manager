import { useState } from 'react';
import { api } from './api.js';

// Per-browser preferences that travel with an export.
const PREF_KEYS = ['appearance', 'deleteDefaults', 'view', 'sort', 'desc', 'pageSize', 'navCollapsed'];
const readPrefs = () => {
  const out = {};
  try { for (const k of PREF_KEYS) { const v = localStorage.getItem(k); if (v !== null) out[k] = v; } } catch { /* ignore */ }
  return out;
};
const writePrefs = (p) => {
  try { for (const k of PREF_KEYS) if (typeof p?.[k] === 'string' && p[k].length < 2000) localStorage.setItem(k, p[k]); } catch { /* ignore */ }
};

export default function ImportExport() {
  const [secrets, setSecrets] = useState(false);
  const [history, setHistory] = useState(true);
  const [prefs, setPrefs] = useState(true);
  const [msg, setMsg] = useState(null);

  const [file, setFile] = useState(null); // { name, data }
  const [mode, setMode] = useState('merge');
  const [impHistory, setImpHistory] = useState(true);
  const [impPrefs, setImpPrefs] = useState(true);
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    setMsg(null);
    try {
      const data = await api.exportData(secrets, history);
      if (prefs) data.preferences = readPrefs();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `mmm-settings-${new Date().toISOString().slice(0, 10)}${secrets ? '-with-keys' : ''}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setMsg({ ok: true, text: `Exported ${data.services.length} service(s)${secrets ? ' including API keys and passwords' : ''}.` });
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  };

  const pick = async (e) => {
    setMsg(null);
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data?.app !== 'media-middle-manager' || !Array.isArray(data.services)) throw new Error('This is not a Media Middle Manager export file.');
      setFile({ name: f.name, data });
      setImpHistory(Array.isArray(data.history));
      setImpPrefs(!!data.preferences);
    } catch (err) { setFile(null); setMsg({ ok: false, text: err.message }); }
  };

  const doImport = async () => {
    if (mode === 'replace' && !window.confirm('Replace all current services with the ones in this file?')) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api.importData(file.data, { mode, history: impHistory });
      const parts = [`${r.added} added`, `${r.updated} updated`];
      if (r.removed) parts.push(`${r.removed} removed`);
      if (impHistory && file.data.history) parts.push(`${r.historyAdded} history entries added`);
      const reload = impPrefs && file.data.preferences;
      if (reload) writePrefs(file.data.preferences);
      setMsg({ ok: true, text: `Imported: ${parts.join(', ')}.${reload ? ' Reloading to apply your preferences…' : ''}` });
      setFile(null);
      if (reload) setTimeout(() => window.location.reload(), 1200);
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    setBusy(false);
  };

  const d = file?.data;
  const hasKeys = d?.services.some((s) => s.apiKey || s.password);
  return (
    <div>
      {msg && <div className={`notice ${msg.ok ? '' : 'bad'}`}>{msg.text}</div>}

      <section className="sgroup">
        <h3>Export</h3>
        <p className="dim">Save your settings to a file so you can restore them or move them to another Media Middle Manager install.</p>
        <div className="form narrow">
          <label className="check"><input type="checkbox" checked disabled /> Services (names and URLs)</label>
          <label className="check"><input type="checkbox" checked={secrets} onChange={(e) => setSecrets(e.target.checked)} /> Include API keys and passwords <span className="dim">(needed to move to another install)</span></label>
          <label className="check"><input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} /> Deletion history</label>
          <label className="check"><input type="checkbox" checked={prefs} onChange={(e) => setPrefs(e.target.checked)} /> Appearance and preferences <span className="dim">(this browser)</span></label>
          {secrets && <div className="notice bad">The file will contain your keys and passwords in plain text. Store it somewhere private and do not share it.</div>}
          <div><button className="primary" onClick={doExport}>Download export</button></div>
        </div>
      </section>

      <section className="sgroup">
        <h3>Import</h3>
        <p className="dim">Load a file exported from any Media Middle Manager install.</p>
        <div className="form narrow">
          <input type="file" accept="application/json,.json" onChange={pick} />
          {d && (
            <>
              <div className="teststat">
                <div>
                  <b>{file.name}</b>
                  <div className="dim">
                    {d.services.length} service(s){d.history ? `, ${d.history.length} history entries` : ''}{d.preferences ? ', preferences' : ''}
                    {d.exportedAt ? `. Exported ${new Date(d.exportedAt).toLocaleString()}` : ''}
                  </div>
                  <div className={hasKeys ? 'dim' : 'warn'}>{hasKeys ? 'Contains API keys and passwords.' : 'No API keys or passwords in this file. You will need to enter them afterwards (existing ones are kept when a service already exists).'}</div>
                </div>
              </div>
              <label className="check"><input type="radio" name="mode" checked={mode === 'merge'} onChange={() => setMode('merge')} /> Merge: update matching services (same type and URL), add new ones, keep the rest</label>
              <label className="check"><input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} /> Replace: make the services in this file the full list</label>
              <label className="check"><input type="checkbox" disabled={!d.history} checked={impHistory && !!d.history} onChange={(e) => setImpHistory(e.target.checked)} /> Import deletion history {mode === 'replace' ? '(replaces current)' : '(adds missing entries)'}</label>
              <label className="check"><input type="checkbox" disabled={!d.preferences} checked={impPrefs && !!d.preferences} onChange={(e) => setImpPrefs(e.target.checked)} /> Apply appearance and preferences in this browser</label>
              <div><button className="primary" onClick={doImport} disabled={busy}>{busy ? 'Importing…' : 'Import'}</button></div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
