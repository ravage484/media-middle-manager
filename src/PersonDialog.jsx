import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api.js';
import { useTopEscape } from './useTopEscape.js';
import TitleCard from './TitleCard.jsx';
import DiscoverTitle from './DiscoverTitle.jsx';
import LibraryCard from './LibraryCard.jsx';
import Icon from './Icon.jsx';

// One person: a photo, a few facts and everything they have been in, as poster cards. A title you own opens its library window, any
// other opens the Discover window where it can be requested. Opens over whatever window you were in.
const FILTERS = [['', 'All'], ['movie', 'Movies'], ['show', 'Series']];
const day = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '');

export default function PersonDialog({ person, onClose }) {
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');
  const [kind, setKind] = useState('');
  const [more, setMore] = useState(false); // the whole biography
  const [title, setTitle] = useState(null); // a title to look up
  const [libOpen, setLibOpen] = useState(null);
  const [version, setVersion] = useState(0); // bumped after a request, so the cards show it
  const [badImg, setBadImg] = useState(false);
  const ref = useRef(null);
  useTopEscape(ref, onClose);

  useEffect(() => {
    let live = true;
    setErr('');
    api.discoverPerson(person.id).then((d) => live && setP(d)).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [person.id, version]);

  const list = p ? p.credits.filter((r) => !kind || r.type === kind) : [];
  const open = (r) => (r.inLibrary ? setLibOpen(r.inLibrary) : setTitle({ type: r.type, tmdbId: r.tmdbId }));
  const facts = p && [p.born && `Born ${day(p.born)}${p.birthplace ? `, ${p.birthplace}` : ''}`, p.died && `Died ${day(p.died)}`].filter(Boolean);
  const photo = p?.photo || person.photo;

  return createPortal( // at the page level: inside another window it would be painted underneath it
    <div className="overlay stacked" data-layer ref={ref} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog person" role="dialog" aria-label={p?.name || person.name}>
        <div className="personhead">
          <div className="pphoto">{photo && !badImg ? <img src={photo} alt="" onError={() => setBadImg(true)} /> : <i>{(p?.name || person.name).charAt(0)}</i>}</div>
          <div className="pinfo">
            <h2>{p?.name || person.name}</h2>
            {facts?.map((f) => <small key={f} className="dim">{f}</small>)}
            {p?.bio && (
              <p className={`pbio ${more ? 'full' : ''}`}>{p.bio}{!more && p.bio.length > 320 && <button className="link" onClick={() => setMore(true)}> more</button>}</p>
            )}
            {p && <a className="plink" href={p.link} target="_blank" rel="noopener noreferrer">TMDB</a>}
          </div>
          <button className="x icon" onClick={onClose} aria-label="Close" title="Close"><Icon name="x" size={18} /></button>
        </div>
        {err && <div className="notice bad">{err}</div>}
        {!p && !err && <p className="dim">Loading…</p>}
        {p && (
          <>
            <div className="recshead">
              <h3>Known for</h3>
              <div className="seg small">{FILTERS.map(([k, l]) => <button key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
            </div>
            <div className="pcredits">
              {list.length === 0 && <p className="dim">Nothing found.</p>}
              <div className="dgrid">{list.map((r) => <TitleCard key={r.type + r.tmdbId} r={r} onOpen={open} title={r.inLibrary ? 'Open it here' : 'Open details and request'} />)}</div>
            </div>
          </>
        )}
        {libOpen && <LibraryCard key={libOpen} itemKey={libOpen} onClose={() => setLibOpen(null)} onChanged={() => setVersion((n) => n + 1)} />}
        {title && <DiscoverTitle type={title.type} tmdbId={title.tmdbId} onClose={() => setTitle(null)} onOpenLibrary={(k) => { setTitle(null); setLibOpen(k); }} onRequested={() => setVersion((n) => n + 1)} />}
      </div>
    </div>,
    document.body,
  );
}
