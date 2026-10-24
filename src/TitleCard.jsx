// A poster card for a movie or show from Overseerr (TMDB): poster, rating, where it stands (in your library, available, requested)
// and its name. Clicking runs onOpen; with href it is a link instead.
import { useState } from 'react';

const BADGE = { 2: ['Requested', 'warn'], 3: ['Requested', 'warn'], 4: ['Partial', 'warn'], 5: ['Available', 'ok'] };

export default function TitleCard({ r, onOpen, href, title }) {
  const [bad, setBad] = useState(false); // the poster could not be loaded: show the name instead of a broken-image icon
  const badge = r.inLibrary ? ['In library', 'ok'] : BADGE[r.status];
  const inner = (
    <>
      <div className="rposter">
        {r.poster && !bad ? <img src={r.poster} alt="" loading="lazy" onError={() => setBad(true)} /> : <span className="dim">{r.title}</span>}
        {badge && <span className={`rbadge ${badge[1]}`}>{badge[0]}</span>}
        {r.rating && <span className="rrate">{r.rating.toFixed(1)}</span>}
      </div>
      <b>{r.title}</b>
      <small className="dim">{r.year || ''}{r.year ? ' · ' : ''}{r.type === 'movie' ? 'Movie' : 'Series'}</small>
    </>
  );
  return href
    ? <a className="rcard" title={title} href={href} target="_blank" rel="noopener noreferrer">{inner}</a>
    : <button className="rcard" title={title} onClick={() => onOpen?.(r)}>{inner}</button>;
}
