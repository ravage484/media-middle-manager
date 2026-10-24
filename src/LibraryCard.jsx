import { useEffect, useState } from 'react';
import { api } from './api.js';
import Detail from './Detail.jsx';
import DeleteDialog from './DeleteDialog.jsx';

// A library title's own window (the same one the Library tab shows), opened from somewhere else, such as Discover. It reads the
// library itself, so it works wherever it is placed. onChanged runs after something is deleted, so the screen behind can refresh.
export default function LibraryCard({ itemKey, onClose, onChanged }) {
  const [key, setKey] = useState(itemKey); // a recommendation inside the window can open another title
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [dialog, setDialog] = useState(null);
  const load = (refresh) => api.library(refresh).then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(false); }, []);

  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && !data && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [data, onClose]);

  const item = data?.items.find((i) => i.key === key);
  const types = data?.serviceTypes || [];

  if (err || (data && !item)) {
    return (
      <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className="dialog small">
          <h2>Not in the library</h2>
          <p className="dim">{err || 'That title is not in the library you have loaded. Refresh the Library tab and try again.'}</p>
          <div className="buttons"><button onClick={onClose}>Close</button></div>
        </div>
      </div>
    );
  }
  if (!item) return null; // a moment while the library loads

  return (
    <>
      <Detail
        item={item} hasWatch={types.includes('tautulli') || types.includes('plex')} hasPlex={types.includes('plex')} hasOverseerr={types.includes('overseerr')}
        onClose={onClose}
        onDelete={() => setDialog([item.key])}
        onChanged={() => { load(true); onChanged?.(); }}
        onOpen={(k) => setKey(k)}
      />
      {dialog && (
        <DeleteDialog
          keys={dialog} hasPlex={types.includes('plex')}
          onClose={(changed) => { setDialog(null); if (changed) { onChanged?.(); onClose(); } }}
        />
      )}
    </>
  );
}
