import { useEffect, useState } from 'react';
import { api } from './api.js';
import Icon from './Icon.jsx';

// Pick the Plex collections or playlists a title belongs to: ticking adds it, unticking removes it, straight away. A new one can be
// made with the title already in it. Smart collections and playlists fill themselves, so they are not offered. The lists are asked of
// Plex when this opens, because they are what you are about to change.
export default function PlexListDialog({ kind, item, onClose, onChanged }) {
  const [info, setInfo] = useState(null);
  const [find, setFind] = useState('');
  const [name, setName] = useState('');
  const [section, setSection] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const isCol = kind === 'collection';
  const word = isCol ? 'collection' : 'playlist';

  useEffect(() => {
    api.plexItem(item.key).then(setInfo).catch((e) => setErr(e.message));
  }, [item.key]);
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const list = info ? (isCol ? info.collections : info.playlists) : [];
  const f = find.trim().toLowerCase();
  const shown = f ? list.filter((l) => l.title.toLowerCase().includes(f)) : list;
  const sec = section ?? info?.matches[0]?.sectionId;

  const run = async (id, body) => {
    setBusy(id); setErr('');
    try {
      await api.plexAct(item.key, body);
      setInfo(await api.plexItem(item.key));
      onChanged?.();
    } catch (e) { setErr(e.message); }
    setBusy('');
  };
  const toggle = (l) => run(l.id, isCol
    ? { action: l.member ? 'collection-remove' : 'collection-add', id: l.id, sectionId: l.sectionId }
    : { action: l.member ? 'playlist-remove' : 'playlist-add', id: l.id });
  const create = async () => {
    await run('new', isCol ? { action: 'collection-create', title: name, sectionId: sec } : { action: 'playlist-create', title: name });
    setName('');
  };

  return (
    <div className="overlay stacked" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog small" role="dialog" aria-label={`Add to ${word}`}>
        <h2>Add to {word}</h2>
        <div className="dim">{item.title}{item.year ? ` (${item.year})` : ''}</div>
        {!info && !err && <div className="dim">Asking Plex…</div>}
        {info && (
          <>
            {list.length > 6 && <input placeholder={`Search ${list.length} ${word}s…`} value={find} onChange={(e) => setFind(e.target.value)} />}
            <div className="plist">
              {shown.length === 0 && <div className="dim pempty">{list.length ? 'No match.' : `No ${word}s yet. Make the first one below.`}</div>}
              {shown.map((l) => (
                <label key={l.id + (l.sectionId || '')} className={busy === l.id ? 'busy' : ''}>
                  <input type="checkbox" checked={l.member} disabled={!!busy} onChange={() => toggle(l)} />
                  <span>{l.title}</span>
                  {isCol && info.matches.length > 1 && <small className="dim">{l.section}</small>}
                </label>
              ))}
            </div>
          </>
        )}
        {err && <div className="notice bad">{err}</div>}
        {info && (
          <div className="pnew">
            <input placeholder={`New ${word} name`} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && !busy && create()} />
            {isCol && info.matches.length > 1 && (
              <select value={sec} onChange={(e) => setSection(e.target.value)} title="Which library the new collection goes in">
                {info.matches.map((m) => <option key={m.sectionId} value={m.sectionId}>{m.section}</option>)}
              </select>
            )}
            <button className="primary withicon" disabled={!name.trim() || !!busy} onClick={create}><Icon name="plus" size={14} />Create</button>
          </div>
        )}
        <div className="buttons"><button onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}
