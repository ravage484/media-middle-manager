import { useEffect, useRef, useState } from 'react';
import { fmtDay } from './format.js';
import Carousel from '../Carousel.jsx';
import TitleCard from '../TitleCard.jsx';
import ServiceIcon from '../ServiceIcon.jsx';
import Icon from '../Icon.jsx';

/*
 * The parts every widget is built from. A widget names a kind; the kind decides which of these draws it:
 *   status  -> StatusStrip   one dot per service
 *   stat    -> StatTile      a number with a caption, and optional tags
 *   list    -> RowList       rows with a thumbnail, a bar, a badge, a date or buttons
 *   posters -> PosterRow     a row of poster cards
 * WidgetFrame is the shared card around them: title, refresh, loading and error.
 */

export function WidgetFrame({ title, link, onLink, onReload, loading, error, stale, children }) {
  return (
    <section className={`wcard ${stale ? 'stale' : ''}`}>
      <header>
        <h3>{title}</h3>
        <span className="spacer" />
        {link && <button className="link" onClick={onLink}>See all</button>}
        <button className="icon wref" onClick={onReload} title="Refresh" aria-label={`Refresh ${title}`}><Icon name="refresh" size={14} className={loading ? 'spin' : ''} /></button>
      </header>
      {error && <div className="wbad">{error} <button className="link" onClick={onReload}>Try again</button></div>}
      {children}
    </section>
  );
}

export const Skeleton = ({ rows = 3 }) => (
  <div className="wskel" aria-hidden="true">{Array.from({ length: rows }, (_, i) => <i key={i} style={{ width: `${90 - i * 18}%` }} />)}</div>
);

// A service chip: a link to the service's own site when it has an address.
const ChipLink = ({ href, children, ...rest }) => (href
  ? <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>{children}</a>
  : <span {...rest}>{children}</span>);

export function StatusStrip({ items, chip, tone }) {
  return (
    <div className="wstrip">
      {items.map((s) => (
        <ChipLink key={s.name + s.type} href={s.url} className={`schip ${s.ok ? '' : 'down'}`} title={`${s.detail || ''}${s.url ? ' (opens the service)' : ''}`.trim()}>
          <ServiceIcon type={s.type} size={18} />{s.name}<span className={`dot ${s.ok ? 'ok' : 'er'}`} aria-label={s.ok ? 'up' : 'down'} />
        </ChipLink>
      ))}
      {!items.length && <span className="schip"><span className="dot ok" />{chip}</span>}
      {tone === 'warn' && items.length > 0 && <span className="wnote">{chip}</span>}
    </div>
  );
}

// A number with a caption. The whole tile is a button when it goes somewhere. tags sit on the caption's line, right-justified
// ("Movies 5.3 TB"); each one runs onTag with its own data.
export function StatTile({ title, value, sub, tone, tags, onClick, onTag }) {
  const key = onClick ? (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } } : undefined;
  return (
    <div className={`wstat ${onClick ? 'go' : ''}`} onClick={onClick} onKeyDown={key} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}>
      <small>{title}</small>
      <b className={tone || ''}>{value}</b>
      <div className="wsline">
        {sub && <span>{sub}</span>}
        {tags?.length > 0 && (
          <div className="wtags">
            {tags.map((t) => (
              <button key={t.label} className="wtag" title={`Show the ${t.label.toLowerCase()} in the Library, biggest first`} onClick={(e) => { e.stopPropagation(); onTag(t); }}>
                {t.label} <b>{t.value}</b>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// A button that asks twice: the first press turns it into "Sure?", the second does it. Anything that changes something uses this.
function ConfirmButton({ label, onConfirm }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 4000); return; }
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); setArmed(false); }
  };
  return <button className={`wact ${armed ? 'armed' : ''}`} disabled={busy} onClick={go}>{busy ? '…' : armed ? 'Sure?' : label}</button>;
}

// A small poster beside a row. Without one (or when it will not load) a quiet placeholder keeps the rows lined up.
function Thumb({ src }) {
  const [bad, setBad] = useState(false);
  return <span className="wthumb" aria-hidden="true">{src && !bad ? <img src={src} alt="" loading="lazy" onError={() => setBad(true)} /> : null}</span>;
}

// A row that needs a person: the chip or badge on it opens this, with what is wrong and what can be done about it. Each choice asks twice.
function ManageDialog({ row, onAction, onClose }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState('');
  const [armed, setArmed] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const m = row.manage;
  const press = async (a) => {
    if (armed !== a.id) { setArmed(a.id); return; }
    setBusy(a.id); setErr('');
    try { await onAction(a.id, row.id); onClose(); } catch (e) { setErr(e.message); setBusy(''); setArmed(''); }
  };
  return (
    <div className="overlay" ref={ref} data-layer onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog small" role="dialog" aria-label={row.title}>
        <h2>{row.title}</h2>
        <p className="dim">{row.subtitle}{m.why && !String(row.subtitle).includes(m.why) ? ` (${m.why})` : ''}</p>
        {err && <div className="notice bad">{err}</div>}
        <div className="manageopts">
          {m.actions.map((a) => (
            <button key={a.id} className={armed === a.id ? 'armed' : ''} disabled={!!busy} onClick={() => press(a)} title={a.hint}>
              {busy === a.id ? '…' : armed === a.id ? 'Sure?' : a.label}<small>{a.hint}</small>
            </button>
          ))}
        </div>
        <div className="buttons">
          {m.href && <a className="link" href={m.href} target="_blank" rel="noopener noreferrer">Open in {m.service}</a>}
          <span className="spacer" />
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// A badge is a link when it says where the problem is shown, a button when it opens something; the hint says what it is.
function Badge({ b, onGo, onOpen }) {
  const cls = `rbadge ${b.tone || ''}`;
  if (onOpen) return <button className={`${cls} wbadge`} onClick={onOpen} title={b.hint || 'Click for options'}>{b.text}<Icon name="chevronRight" size={11} /></button>;
  if (onGo) return <button className={`${cls} wbadge`} onClick={onGo} title={b.hint || undefined}>{b.text}<Icon name="chevronRight" size={11} /></button>;
  return b.href
    ? <a className={`${cls} wbadge`} href={b.href} target="_blank" rel="noopener noreferrer" title={b.hint ? `${b.hint} (opens the service)` : 'Open the service'}>{b.text}<Icon name="chevronRight" size={11} /></a>
    : <span className={cls} title={b.hint || undefined}>{b.text}</span>;
}

// onOpen runs with a row's `open` ({ type, tmdbId, inLibrary }) when its title is clicked: your own copy if you have one, otherwise the lookup.
// A row can also carry `go` (somewhere in this app to take you: a drive's titles, say); its title and badge then lead there.
// fold: how many rows to show before the rest are tucked under a fade and a "Show all" button. A row can also carry `children` (the episodes
// of a season download): a chevron opens them under it.
export function RowList({ rows, empty, fold, onAction, onOpen, onGo }) {
  const [managing, setManaging] = useState(null); // the id of the row whose options are open
  const [all, setAll] = useState(false);
  const [expanded, setExpanded] = useState(new Set());
  if (!rows.length) return <p className="dim wempty">{empty}</p>;
  const folded = fold > 0 && rows.length > fold + 1 && !all; // folding one row away would only hide a row to show a button
  const hidden = rows.length - fold;
  const managed = rows.find((r) => r.id === managing && r.manage);
  const toggle = (id) => setExpanded((s) => { const n = new Set(s); if (!n.delete(id)) n.add(id); return n; });
  return (
    <>
      {managed && <ManageDialog row={managed} onAction={onAction} onClose={() => setManaging(null)} />}
    <ul className="wrows">
      {(folded ? rows.slice(0, fold) : rows).map((r) => {
        const main = (
          <>
            {'poster' in r && <Thumb src={r.poster} />}
            <span className="wmain">
              <b>{r.title}</b>
              {r.subtitle && <small>{r.subtitle}</small>}
            </span>
          </>
        );
        return (
          <li key={r.id}>
            {r.open
              ? <button className="wopen" onClick={() => onOpen(r.open)} title={r.open.inLibrary ? 'Open in your library' : 'Look it up'}>{main}</button>
              : r.go ? <button className="wopen" onClick={() => onGo(r.go)} title="Show what is on it in the Library, biggest first">{main}</button>
                : <div className="wopen">{main}</div>}
            {r.chip && <Badge b={r.chip} onOpen={r.manage ? () => setManaging(r.id) : undefined} />}
            {r.badge && <Badge b={r.badge} onGo={r.go ? () => onGo(r.go) : undefined} onOpen={r.manage && !r.chip ? () => setManaging(r.id) : undefined} />}
            {typeof r.progress === 'number' && <div className="wbar"><i style={{ width: `${Math.round(r.progress * 100)}%` }} /></div>}
            {(r.right || r.when) && <small className="wright">{r.right || fmtDay(r.when, r.whenIsDay)}</small>}
            {r.right && r.when && <small className="wright">{fmtDay(r.when, r.whenIsDay)}</small>}
            {r.actions?.map((a) => <ConfirmButton key={a.id} label={a.label} onConfirm={() => onAction(a.id, r.id)} />)}
            {r.children && <button className="chev wchev" aria-label={expanded.has(r.id) ? 'Hide episodes' : 'Show episodes'} aria-expanded={expanded.has(r.id)} title={`${r.children.length} episodes`} onClick={() => toggle(r.id)}><Icon name={expanded.has(r.id) ? 'chevronUp' : 'chevronDown'} size={18} /></button>}
            {r.children && expanded.has(r.id) && (
              <ul className="wchildren">
                {r.children.map((c) => <li key={c.id}><b>{c.title}</b>{c.subtitle && <small>{c.subtitle}</small>}</li>)}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
    {folded && (
      // the next row peeks out, fading away under the button, the way the seasons list does
      <div className="peek wpeek">
        <div className="peekclip" aria-hidden="true" inert="">
          <ul className="wrows"><li><span className="wmain"><b>{rows[fold].title}</b><small>{rows[fold].subtitle}</small></span></li></ul>
        </div>
        <button className="showmore" onClick={() => setAll(true)}>Show all {rows.length} <Icon name="chevronDown" size={16} /></button>
      </div>
    )}
    {all && fold > 0 && rows.length > fold + 1 && (
      <div className="showless"><button className="showmore inline" onClick={() => setAll(false)}>Show fewer <Icon name="chevronUp" size={16} /></button></div>
    )}
    </>
  );
}

export function PosterRow({ items, onOpen }) {
  if (!items.length) return <p className="dim wempty">Nothing to show yet.</p>;
  return (
    <Carousel>
      {items.map((r) => <TitleCard key={r.type + (r.tmdbId || r.inLibrary)} r={r} onOpen={onOpen} />)}
    </Carousel>
  );
}
