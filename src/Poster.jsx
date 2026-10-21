import { useState } from 'react';

export default function Poster({ item }) {
  const [bad, setBad] = useState(false);
  return item.poster && !bad
    ? <img src={item.poster} alt="" loading="lazy" onError={() => setBad(true)} />
    : <div className="noposter">{item.title}</div>;
}
