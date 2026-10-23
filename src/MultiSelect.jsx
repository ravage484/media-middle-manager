import { useEffect, useRef, useState } from 'react';

const SHOWN = 60; // a long list (hundreds of keywords) shows its first entries until the search narrows it

// Dropdown with checkboxes. `options` is [[value, label], ...]; `value` is a Set. `searchable` adds a search box for long lists.
export default function MultiSelect({ label, options, value, onChange, searchable = false, empty = 'Nothing to filter' }) {
  const ref = useRef(null);
  const [find, setFind] = useState('');
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) ref.current.open = false; };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const flip = (v) => {
    const n = new Set(value);
    n.has(v) ? n.delete(v) : n.add(v);
    onChange(n);
  };
  const f = find.trim().toLowerCase();
  const matches = f ? options.filter(([, l]) => String(l).toLowerCase().includes(f)) : options;
  // Selected entries stay on top so they can be unticked without searching for them.
  const list = searchable
    ? [...matches.filter(([v]) => value.has(v)), ...matches.filter(([v]) => !value.has(v))].slice(0, f ? 150 : SHOWN)
    : matches;
  return (
    <details className="multi" ref={ref}>
      <summary className={value.size ? 'on' : ''}>{label}{value.size ? ` (${value.size})` : ''}</summary>
      <div className="menu">
        {searchable && <input className="menusearch" placeholder={`Search ${options.length} ${label.toLowerCase()}…`} value={find} onChange={(e) => setFind(e.target.value)} />}
        {options.length === 0 && <span className="dim">{empty}</span>}
        {list.map(([v, l]) => (
          <label key={v}><input type="checkbox" checked={value.has(v)} onChange={() => flip(v)} /> {l}</label>
        ))}
        {searchable && matches.length > list.length && <span className="dim">{matches.length - list.length} more: type to search</span>}
        {value.size > 0 && <button className="link" onClick={() => onChange(new Set())}>Clear</button>}
      </div>
    </details>
  );
}
