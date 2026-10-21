import { useEffect } from 'react';
import { fmtBytes, watchLabel } from './api.js';
import Poster from './Poster.jsx';

const fmtDate = (s) => (s ? new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown');

export default function Detail({ item, hasWatch, onClose, onDelete }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const w = item.watch;
  const status = item.hasFile ? (item.monitored ? 'On disk' : 'On disk, unmonitored') : item.monitored ? 'Missing (monitored)' : 'No file, unmonitored';
  const facts = [
    ['Type', item.type === 'movie' ? 'Movie' : 'Series'],
    ['Status', status],
    ['Total size', fmtBytes(item.size)],
    item.type === 'show' && ['Episodes on disk', item.episodes],
    ['Added', fmtDate(item.added)],
    hasWatch && ['Watched', watchLabel(w) + (w?.plays ? ` · ${w.plays} play${w.plays === 1 ? '' : 's'}` : '')],
  ].filter(Boolean);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog detail" role="dialog" aria-label={item.title}>
        <div className="dbody">
          <div className="dposter"><Poster item={item} /></div>
          <div className="dinfo">
            <h2>{item.title} <small>{item.year}</small></h2>
            {(item.genres.length > 0 || item.tags.length > 0) && (
              <div className="tags">
                {item.genres.map((g) => <i key={'g' + g}>{g}</i>)}
                {item.tags.map((t) => <i key={'t' + t} className="tagchip">{t}</i>)}
              </div>
            )}
            {item.overview && <p className="overview">{item.overview}</p>}
            <dl className="facts">
              {facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            </dl>
            <h4>Managed by</h4>
            <ul className="insts">
              {item.instances.map((n) => (
                <li key={n.serviceId + n.arrId}>
                  <b>{n.serviceName}</b> <span className="dim">{fmtBytes(n.size)} · {n.monitored ? 'monitored' : 'unmonitored'}</span>
                  <div className="path">{n.path}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="buttons">
          <button className="danger" onClick={onDelete}>Delete…</button>
          <span className="spacer" />
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
