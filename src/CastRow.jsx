import { useState } from 'react';
import Carousel from './Carousel.jsx';
import PersonDialog from './PersonDialog.jsx';

// The cast of a title as a row, like the posters: a round photo, the actor and the part. Each opens that person: who they are and
// everything they have been in. Also used for the people a search finds.
function Person({ c, onOpen }) {
  const [bad, setBad] = useState(false);
  const inner = (
    <>
      <span className="cphoto">{c.photo && !bad ? <img src={c.photo} alt="" loading="lazy" draggable="false" onError={() => setBad(true)} /> : <i>{c.name.charAt(0)}</i>}</span>
      <b>{c.name}</b>
      {c.character && <small className="dim">{c.character}</small>}
    </>
  );
  return c.id
    ? <button className="ccard" onClick={() => onOpen(c)} title={`${c.name}: what they have been in`}>{inner}</button>
    : <div className="ccard">{inner}</div>;
}

// onPick: what a click does instead of opening the person window (the library uses it to filter by that person).
export default function CastRow({ cast, title = 'Cast', onPick }) {
  const [person, setPerson] = useState(null);
  if (!cast?.length) return null;
  return (
    <>
      <h3>{title}</h3>
      <Carousel>{cast.map((c) => <Person key={`${c.id}:${c.name}`} c={c} onOpen={onPick || setPerson} />)}</Carousel>
      {person && <PersonDialog person={person} onClose={() => setPerson(null)} />}
    </>
  );
}
