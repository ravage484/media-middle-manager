import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, fmtBytes, watchLabel } from './api.js';
import Poster from './Poster.jsx';
import EpisodePicker from './EpisodePicker.jsx';
import EpisodeDeleteDialog from './EpisodeDeleteDialog.jsx';
import Icon from './Icon.jsx';
import Recommendations from './Recommendations.jsx';
import CastRow from './CastRow.jsx';
import TrailerDialog from './TrailerDialog.jsx';
import { useKeep } from './keep.js';
import { useDownloads, DOWNLOAD_LABEL } from './downloads.js';

// Dates from the server are "2011-10-25" (no time zone); added dates are full timestamps.
const day = (s) => (s ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00` : s).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : null);
const mins = (m) => (m ? (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} minutes`) : null);
// A rating's source: its logo if public/logos/rating-<name>.svg exists, otherwise the name as text.
const RATING_LOGO = { IMDb: 'imdb', TMDB: 'tmdb', 'Rotten Tomatoes': 'rottentomatoes', Metacritic: 'metacritic' };
function RatingLabel({ source }) {
  const [bad, setBad] = useState(false);
  const f = RATING_LOGO[source];
  if (!f || bad) return <small>{source}</small>;
  return <img className="ratelogo" src={`/logos/rating-${f}.svg`} alt={source} onError={() => setBad(true)} />;
}
const Row = ({ k, children }) => (children ? <div className="irow"><dt>{k}</dt><dd>{children}</dd></div> : null);
const TagIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 12V4h8l10 10-8 8L3 12z" /><circle cx="7.5" cy="8.5" r="1" />
  </svg>
);

// The window for one title: hero with the backdrop, overview and seasons on the left, an info card with ratings on the right.
export default function Detail({ item, hasWatch, hasPlex, hasOverseerr, onClose, onDelete, onChanged, onKeyword, onOpen }) {
  const [d, setD] = useState(null); // backdrop, ratings, dates, links: fetched for this title when the window opens
  const [epDelete, setEpDelete] = useState(null); // selection being reviewed, if any
  const [refresh, setRefresh] = useState(0);
  const [trailer, setTrailer] = useState(false);
  const isShow = item.type === 'show';
  const keep = useKeep();
  const kept = keep.isKept(item.key);
  const [keepBusy, setKeepBusy] = useState(false);
  const toggleKeep = () => { setKeepBusy(true); keep.set(item.key, !kept).catch(() => {}).finally(() => setKeepBusy(false)); };
  const scroller = useRef(null);
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [item.key]); // opening a recommendation starts at the top

  useEffect(() => {
    setD(null); setTrailer(false);
    api.details(item.key).then(setD).catch(() => setD({ ratings: [], links: [] }));
  }, [item.key, refresh]);

  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && !epDelete && !trailer && onClose(); // Escape closes the top window only
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose, epDelete, trailer]);

  // Availability badge, like the one on a request page: all, some or none of it is on disk.
  let avail = item.hasFile ? ['On disk', 'ok'] : ['Not on disk', 'dim'];
  if (!isShow) avail = item.hasFile ? ['Available', 'ok'] : ['Not on disk', 'dim'];
  else if (d?.totalEpisodeCount > 0 || d?.episodeCount > 0) {
    const total = d.totalEpisodeCount || d.episodeCount;
    avail = !d.episodeFileCount ? ['Not on disk', 'dim'] : d.episodeFileCount >= total ? ['Available', 'ok'] : ['Partially available', 'warn'];
  }

  const dl = DOWNLOAD_LABEL[useDownloads()[item.key]]; // a download in progress says more than "Not on disk"
  if (dl && !item.hasFile) avail = dl;

  const sub = [
    isShow && d?.seasonCount ? `${d.seasonCount} Season${d.seasonCount === 1 ? '' : 's'}` : null,
    !isShow ? mins(d?.runtime) : null,
    item.genres.length ? item.genres.join(', ') : null,
  ].filter(Boolean);
  const w = item.watch;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog detail" role="dialog" aria-label={item.title}>
        <div className="hero" style={d?.backdrop ? { backgroundImage: `url("${d.backdrop}")` } : undefined}>
          <button className="x" onClick={onClose} aria-label="Close" title="Close"><Icon name="x" size={18} /></button>
          <div className="herogrid">
            <div className="dposter"><Poster item={item} /></div>
            <div className="herotitle">
              <span className={`badge ${avail[1]}`}>{avail[0]}</span>{kept && <span className="badge keptbadge" title="Left out of the Stale list">Kept</span>}
              <h2>{item.title} {item.year ? <small>({item.year})</small> : null}</h2>
              <div className="sub">
                {d?.certification && <span className="cert">{d.certification}</span>}
                {sub.length > 0 && <span>{sub.join(' | ')}</span>}
              </div>
            </div>
            <div className="heroactions">
              <button className={`withicon keepbtn ${kept ? 'on' : ''}`} onClick={toggleKeep} disabled={keepBusy} title={kept ? 'Stop leaving this out of the Stale list' : 'Leave this out of the Stale list'}><Icon name="shield" size={15} />{kept ? 'Kept' : 'Keep'}</button>
              <button className="danger" onClick={onDelete}>Delete…</button>
            </div>
          </div>
        </div>

        <div className="dscroll" ref={scroller}>
          <div className="dcols">
            <div className="dleft">
              {item.overview && (<><h3>Overview</h3><p className="overview">{item.overview}</p></>)}
              {item.tags.length > 0 && (
                <div className="chips">{item.tags.map((t) => <span key={t} className="chip"><TagIcon />{t}</span>)}</div>
              )}
              {d?.keywords?.length > 0 && (
                <div className="chips" title="Keywords from Overseerr. Click one to filter the library by it.">
                  {d.keywords.map((k) => <button key={k} className="chip kw" onClick={() => onKeyword?.(k)}>{k}</button>)}
                </div>
              )}

              {isShow && item.hasFile && (<><h3>Seasons</h3><EpisodePicker item={item} refreshKey={refresh} onDelete={setEpDelete} /></>)}
              {!isShow && (
                <>
                  <h3>Files</h3>
                  <ul className="filelist">
                    {item.instances.map((n) => (
                      <li key={n.serviceId + n.arrId}>
                        <b>{n.serviceName}</b>{' '}
                        <span className="dim">{n.hasFile ? fmtBytes(n.size) : 'no file'}{d?.quality && n.hasFile ? ` · ${d.quality}` : ''} · {n.monitored ? 'monitored' : 'unmonitored'}</span>
                        <div className="path">{n.path}</div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <CastRow cast={d?.cast} />
              {hasOverseerr && <Recommendations item={item} onOpen={onOpen} />}
            </div>

            <aside className="dside">
              <div className="infocard">
                {d?.ratings?.length > 0 && (
                  <div className="ratings">
                    {d.ratings.map((r) => (
                      <span key={r.source} className="rate" title={`${r.source}${r.votes ? `, ${r.votes.toLocaleString()} votes` : ''}`}><b>{r.display}</b><RatingLabel source={r.source} /></span>
                    ))}
                  </div>
                )}
                {!d && <div className="ratings dim">Loading details…</div>}
                <dl>
                  <Row k="Status">{d?.status}</Row>
                  <Row k="First air date">{day(d?.firstAired)}</Row>
                  <Row k="Next episode">{day(d?.nextAiring)}</Row>
                  <Row k="In cinemas">{day(d?.inCinemas)}</Row>
                  <Row k="Digital release">{day(d?.digitalRelease)}</Row>
                  <Row k="Physical release">{day(d?.physicalRelease)}</Row>
                  <Row k={isShow ? 'Episode runtime' : 'Runtime'}>{mins(d?.runtime)}</Row>
                  <Row k="Original language">{d?.language}</Row>
                  <Row k={isShow ? 'Network' : 'Studio'}>{d?.network}</Row>
                  <Row k="Collection">{d?.collection}</Row>
                  <Row k="Production countries">{d?.countries?.length ? d.countries.join(', ') : null}</Row>
                  <Row k={`Streaming on (${d?.region})`}>{d?.providers?.length ? d.providers.join(', ') : null}</Row>
                  <Row k="Total size">{fmtBytes(item.size)}</Row>
                  {isShow && <Row k="Episodes on disk">{String(item.episodes)}</Row>}
                  <Row k="Added">{day(item.added)}</Row>
                  {hasWatch && <Row k="Watched">{watchLabel(w) + (w?.plays ? ` · ${w.plays} play${w.plays === 1 ? '' : 's'}` : '')}</Row>}
                  <Row k="Managed by">
                    {item.instances.map((n) => <span key={n.serviceId + n.arrId} className="path">{n.serviceName}{isShow ? ` · ${fmtBytes(n.size)}` : ''}</span>)}
                  </Row>
                </dl>
                {(d?.links?.length > 0 || d?.trailerId) && (
                  <div className="xlinks">
                    {d.trailerId && <button onClick={() => setTrailer(true)}>Trailer</button>}
                    {d.links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a>)}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>

      {epDelete && (
        <EpisodeDeleteDialog
          item={item} selection={epDelete} hasPlex={hasPlex}
          onClose={(changed) => { setEpDelete(null); if (changed) { setRefresh((n) => n + 1); onChanged?.(); } }}
        />
      )}
      {trailer && d?.trailerId && createPortal(<TrailerDialog videoId={d.trailerId} title={item.title} onClose={() => setTrailer(false)} />, document.body)}
    </div>
  );
}
