import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';

const SHOWN = 60; // a long list (hundreds of keywords) shows its first entries until the search narrows it

// A searchable list of checkboxes. `options` is [[value, label], ...]; `value` is a Set.
function CheckList({ options, value, onChange, empty }) {
  const [find, setFind] = useState('');
  const f = find.trim().toLowerCase();
  const matches = f ? options.filter(([, l]) => String(l).toLowerCase().includes(f)) : options;
  // Selected entries stay on top so they can be unticked without searching for them.
  const list = [...matches.filter(([v]) => value.has(v)), ...matches.filter(([v]) => !value.has(v))].slice(0, f ? 150 : SHOWN);
  const flip = (v) => { const n = new Set(value); n.has(v) ? n.delete(v) : n.add(v); onChange(n); };
  return (
    <div className="fchecks">
      {options.length > 8 && <input placeholder={`Search ${options.length}…`} value={find} onChange={(e) => setFind(e.target.value)} />}
      {options.length === 0 && <span className="dim">{empty || 'Nothing to filter'}</span>}
      <div className="flist">
        {list.map(([v, l]) => <label key={v}><input type="checkbox" checked={value.has(v)} onChange={() => flip(v)} /> <span>{l}</span></label>)}
        {matches.length > list.length && <span className="dim">{matches.length - list.length} more: type to search</span>}
      </div>
    </div>
  );
}

// Short lists as toggle buttons.
function Chips({ options, value, onChange }) {
  const flip = (v) => { const n = new Set(value); n.has(v) ? n.delete(v) : n.add(v); onChange(n); };
  return (
    <div className="fchips">
      {options.map(([v, l]) => <button key={v} className={value.has(v) ? 'on' : ''} aria-pressed={value.has(v)} onClick={() => flip(v)}>{l}</button>)}
    </div>
  );
}

// One section of the panel: a heading with how many are chosen, folding open to its choices. Sections in use start open.
function Section({ label, count, children, open }) {
  return (
    <details className="fsec" open={open || count > 0}>
      <summary><span>{label}</span>{count > 0 && <span className="fcount">{count}</span>}<Icon name="chevronDown" size={14} className="fchev" /></summary>
      <div className="fbody">{children}</div>
    </details>
  );
}

// All of the library's filters in a panel at the side. The list behind it updates as you choose, so there is nothing to apply.
// defs: [{ id, label, kind: 'chips' | 'list', options, value, set, empty }]; ranges are the two number inputs.
export default function FilterPanel({ defs, stale, size, shown, total, canClear, onClear, onClose }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <aside className="fpanel" role="dialog" aria-label="Filters">
      <header>
        <h3>Filters</h3>
        <span className="spacer" />
        {canClear && <button className="link" onClick={onClear}>Clear all</button>}
        <button className="icon" onClick={onClose} aria-label="Close filters" title="Close"><Icon name="x" size={18} /></button>
      </header>
      <div className="fscroll">
        {defs.map((d) => (
          <Section key={d.id} label={d.label} count={d.value.size} open={d.kind === 'chips'}>
            {d.kind === 'chips'
              ? <Chips options={d.options} value={d.value} onChange={d.set} />
              : <CheckList options={d.options} value={d.value} onChange={d.set} empty={d.empty} />}
          </Section>
        ))}
        {stale && (
          <Section label="Not watched in" count={stale.value ? 1 : 0}>
            <span className="range"><input type="number" min="1" placeholder="days" value={stale.value} onChange={(e) => stale.set(e.target.value)} /> days</span>
          </Section>
        )}
        <Section label="Size" count={size.min || size.max ? 1 : 0}>
          <span className="range">
            <input type="number" min="0" placeholder="min" value={size.min} onChange={(e) => size.setMin(e.target.value)} />
            to <input type="number" min="0" placeholder="max" value={size.max} onChange={(e) => size.setMax(e.target.value)} /> GB
          </span>
        </Section>
      </div>
      <footer>
        <span className="dim">{shown} of {total} titles</span>
        <button className="primary" onClick={onClose}>Done</button>
      </footer>
    </aside>
  );
}
