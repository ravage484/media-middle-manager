import { useState } from 'react';
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

// A badge is a link when it says where the problem is shown; the hint says what it is.
function Badge({ b, onGo }) {
  const cls = `rbadge ${b.tone || ''}`;
  if (onGo) return <button className={`${cls} wbadge`} onClick={onGo} title={b.hint || undefined}>{b.text}<Icon name="chevronRight" size={11} /></button>;
  return b.href
    ? <a className={`${cls} wbadge`} href={b.href} target="_blank" rel="noopener noreferrer" title={b.hint ? `${b.hint} (opens the service)` : 'Open the service'}>{b.text}<Icon name="chevronRight" size={11} /></a>
    : <span className={cls} title={b.hint || undefined}>{b.text}</span>;
}

// onOpen runs with a row's `open` ({ type, tmdbId, inLibrary }) when its title is clicked: your own copy if you have one, otherwise the lookup.
// A row can also carry `go` (somewhere in this app to take you: a drive's titles, say); its title and badge then lead there.
export function RowList({ rows, empty, onAction, onOpen, onGo }) {
  if (!rows.length) return <p className="dim wempty">{empty}</p>;
  return (
    <ul className="wrows">
      {rows.map((r) => {
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
            {r.badge && <Badge b={r.badge} onGo={r.go ? () => onGo(r.go) : undefined} />}
            {typeof r.progress === 'number' && <div className="wbar"><i style={{ width: `${Math.round(r.progress * 100)}%` }} /></div>}
            {(r.right || r.when) && <small className="wright">{r.right || fmtDay(r.when)}</small>}
            {r.right && r.when && <small className="wright">{fmtDay(r.when)}</small>}
            {r.actions?.map((a) => <ConfirmButton key={a.id} label={a.label} onConfirm={() => onAction(a.id, r.id)} />)}
          </li>
        );
      })}
    </ul>
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
