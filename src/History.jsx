import { useEffect, useState } from 'react';
import { api, fmtBytes } from './api.js';

export default function History() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.history().then(setRows); }, []);
  if (!rows) return <p>Loading…</p>;
  if (!rows.length) return <p className="dim">Nothing deleted yet.</p>;
  return (
    <div className="history">
      {rows.map((h) => (
        <details key={h.id}>
          <summary>
            <span>{h.ok ? '✓' : '⚠'}</span>
            <b>{h.title}</b> <small>{h.year} · {h.type === 'movie' ? 'Movie' : 'Series'}</small>
            <span className="dim">{new Date(h.at).toLocaleString()} · freed {fmtBytes(h.freedBytes)}</span>
          </summary>
          <ul>
            {h.steps.map((s, i) => <li key={i} className={s.ok ? '' : 'warn'}>{s.ok ? '✓' : '✗'} {s.label}{s.ok ? '' : ` — ${s.detail}`}</li>)}
            {h.removedFiles.map((f, i) => <li key={'f' + i} className="path">{f.path}</li>)}
          </ul>
        </details>
      ))}
    </div>
  );
}
