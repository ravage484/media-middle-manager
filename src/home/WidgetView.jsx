import { useWidget, widgetAction } from './store.js';
import { WidgetFrame, Skeleton, StatusStrip, StatTile, RowList, PosterRow } from './primitives.jsx';
import Icon from '../Icon.jsx';

// One widget, drawn by its kind. variant "card" is the framed tile of the Dashboard; "row" is a heading and a row of posters, as
// the Media view shows them. Everything about the data lives in the shared store, so both views draw the same numbers.
export default function WidgetView({ w, active, variant = 'card', onNavigate, onOpenTitle }) {
  const { data, error, loading, at, reload } = useWidget(w, active);
  const go = w.link ? () => onNavigate(w.link) : undefined;

  if (w.kind === 'status') {
    if (!data) return error ? <div className="wbad">{error}</div> : <Skeleton rows={1} />;
    return <StatusStrip items={data.items} chip={data.chip} tone={data.tone} />;
  }
  if (w.kind === 'stat') {
    if (!data) return <div className="wstat"><small>{w.title}</small>{error ? <span className="wbad">Unavailable</span> : <Skeleton rows={1} />}</div>;
    return <StatTile title={w.title} value={data.value} sub={data.sub} tone={data.tone} tags={data.tags} onClick={go} onTag={(t) => onNavigate('library', { types: t.types, sort: 'size', desc: true })} />;
  }
  if (variant === 'row') {
    return (
      <section className="hrow">
        <div className="recshead">
          <h3>{w.title}</h3>
          {w.link && <button className="link withicon" onClick={go}>See all<Icon name="chevronRight" size={14} /></button>}
        </div>
        {error && !data && <div className="wbad">{error} <button className="link" onClick={reload}>Try again</button></div>}
        {!data && !error && <Skeleton rows={1} />}
        {data && <PosterRow items={data.items} onOpen={onOpenTitle} />}
      </section>
    );
  }
  return (
    <WidgetFrame title={w.title} link={w.link} onLink={go} onReload={reload} loading={loading} error={error} stale={!!error && !!data}>
      {!data && !error && <Skeleton />}
      {data && w.kind === 'list' && <RowList rows={data.rows} fold={data.fold} empty={data.empty} onOpen={onOpenTitle} onGo={(g) => onNavigate('library', { drive: g.drive, sort: 'size', desc: true })} onAction={(action, id) => widgetAction(w.id, action, id).catch((e) => window.alert(e.message))} />}
      {data && w.kind === 'posters' && <PosterRow items={data.items} onOpen={onOpenTitle} />}
      {at > 0 && <small className="wat">Updated {new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</small>}
    </WidgetFrame>
  );
}
