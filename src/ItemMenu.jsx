import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from './api.js';
import Icon from './Icon.jsx';
import { useKeep } from './keep.js';

// The "..." menu on a title, like Plex's own, without anything that plays. The Plex entries only appear when Plex is set up. What
// they offer (watched or unwatched, whether it is in Plex at all) comes from the cache at once, and Plex is asked about this one
// title in the background, so the menu corrects itself if something changed.
export default function ItemMenu({ item, rect, hasPlex, cached, onClose, onDetails, onDelete, onList, onChanged }) {
  const ref = useRef(null);
  const keep = useKeep();
  const kept = keep.isKept(item.key);
  const [pos, setPos] = useState({ top: rect.bottom + 4, left: rect.left });
  const [info, setInfo] = useState(cached || (hasPlex ? undefined : null)); // undefined: nothing cached yet, so Plex is being asked
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // Keep the menu on screen: nudge it left, or open it upwards, when it would run off an edge.
  useLayoutEffect(() => {
    const r = ref.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - r.width - 8));
    const top = rect.bottom + 4 + r.height > window.innerHeight - 8 ? Math.max(8, rect.top - r.height - 4) : rect.bottom + 4;
    setPos({ top, left });
  }, [rect, info, note, err]);

  useEffect(() => {
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const esc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', esc);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  const load = () => api.plexItem(item.key).then((i) => { setInfo(i); onChanged?.(); }).catch((e) => { if (!cached) setInfo(null); setErr(e.message); });
  useEffect(() => { if (hasPlex) load(); }, [item.key, hasPlex]);

  const act = (action, done) => {
    setBusy(true); setErr(''); setNote('');
    api.plexAct(item.key, { action })
      .then(() => { setNote(done); return load(); })
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(false));
  };

  const Row = ({ icon, children, onClick, disabled, danger }) => (
    <button className={`mitem ${danger ? 'danger' : ''}`} disabled={disabled || busy} onClick={onClick}><Icon name={icon} size={15} />{children}</button>
  );

  return (
    <div className="ctxmenu" ref={ref} style={{ top: pos.top, left: pos.left }} role="menu" onClick={(e) => e.stopPropagation()}>
      <Row icon="info" onClick={() => { onClose(); onDetails(); }}>Details</Row>
      <Row icon="shield" onClick={() => { keep.set(item.key, !kept).catch(() => {}); onClose(); }}>{kept ? 'Stop keeping' : 'Keep (leave out of Stale)'}</Row>
      {hasPlex && (
        <>
          <div className="msep" />
          {info === undefined && <div className="mnote">Asking Plex…</div>}
          {info === null && err && <div className="mnote bad">{err}</div>}
          {info && !info.found && <div className="mnote">Not in Plex yet</div>}
          {info?.found && (
            <>
              <Row icon="folder" onClick={() => onList('collection')}>Add to collection…</Row>
              <Row icon="list" onClick={() => onList('playlist')}>Add to playlist…</Row>
              {info.watched
                ? <Row icon="eyeOff" onClick={() => act('unwatched', 'Marked as unwatched')}>Mark as unwatched</Row>
                : <Row icon="eye" onClick={() => act('watched', 'Marked as watched')}>Mark as watched</Row>}
              <Row icon="refresh" onClick={() => act('refresh', 'Plex is refreshing its metadata')}>Refresh metadata</Row>
              <Row icon="analyze" onClick={() => act('analyze', 'Plex is analyzing the files')}>Analyze</Row>
            </>
          )}
        </>
      )}
      {!hasPlex && <div className="mnote">Add Plex in Settings for collections, playlists and watched status.</div>}
      {note && !err && <div className="mnote ok">{note}</div>}
      {info && err && <div className="mnote bad">{err}</div>}
      <div className="msep" />
      <Row icon="trash" danger onClick={() => { onClose(); onDelete(); }}>Delete…</Row>
    </div>
  );
}
