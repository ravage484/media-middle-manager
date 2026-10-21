import { useEffect, useRef } from 'react';

// Dropdown with checkboxes. `options` is [[value, label], ...]; `value` is a Set.
export default function MultiSelect({ label, options, value, onChange }) {
  const ref = useRef(null);
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
  return (
    <details className="multi" ref={ref}>
      <summary className={value.size ? 'on' : ''}>{label}{value.size ? ` (${value.size})` : ''}</summary>
      <div className="menu">
        {options.length === 0 && <span className="dim">Nothing to filter</span>}
        {options.map(([v, l]) => (
          <label key={v}><input type="checkbox" checked={value.has(v)} onChange={() => flip(v)} /> {l}</label>
        ))}
        {value.size > 0 && <button className="link" onClick={() => onChange(new Set())}>Clear</button>}
      </div>
    </details>
  );
}
