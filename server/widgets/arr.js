import { api, getServices, qb } from '../lib.js';
import { fmtBytes, fmtEta, timeleftSec, str, int, pct, isoDate, httpUrl } from './util.js';
import { titleIndex, titleRef, posterIn } from './titles.js';

/* Radarr and Sonarr: what is downloading, what is coming up, and how full the drives are. */
const of = (type) => getServices().filter((s) => s.type === type);
const arr = () => [...of('radarr'), ...of('sonarr')];
const ymd = (d) => d.toISOString().slice(0, 10);
const label = (state) => ({ importBlocked: 'Import blocked', importPending: 'Waiting to import', importing: 'Importing', downloading: 'Downloading', downloadFailed: 'Download failed' }[state] || str(state, 30) || 'Queued');
const sxe = (s, e) => `S${String(Number.isInteger(s) ? s : 0).padStart(2, '0')}E${String(Number.isInteger(e) ? e : 0).padStart(2, '0')}`;

// Seconds left per torrent (by lower-case hash) from every qBittorrent; empty when there is none or it cannot be reached.
async function torrentEtas() {
  const map = new Map();
  await Promise.all(getServices().filter((s) => s.type === 'qbittorrent').map(async (s) => {
    try { for (const t of await qb(s, '/api/v2/torrents/info?filter=downloading')) map.set(String(t.hash).toLowerCase(), t.eta); } catch { /* optional */ }
  }));
  return map;
}

export default {
  type: 'arr', name: 'Radarr and Sonarr',
  widgets: [
    {
      id: 'queue', title: 'Download queue', kind: 'list', requires: ['radarr', 'sonarr'], refresh: 10, order: 21, control: { span: 2 }, media: 'chip',
      fetch: async () => {
        const rows = [];
        const idx = await titleIndex();
        const etas = await torrentEtas(); // qBittorrent knows the time left when the *arr does not
        await Promise.all(arr().map(async (svc) => {
          const movie = svc.type === 'radarr';
          const q = await api(svc, `/api/v3/queue?page=1&pageSize=20&${movie ? 'includeMovie=true' : 'includeSeries=true&includeEpisode=true'}`);
          for (const r of Array.isArray(q?.records) ? q.records : []) {
            if (!r || typeof r !== 'object') continue;
            const ep = r.episode && Number.isInteger(r.episode.seasonNumber) ? ` ${sxe(r.episode.seasonNumber, r.episode.episodeNumber)}` : '';
            const left = typeof r.sizeleft === 'number' ? r.sizeleft : 0;
            const size = typeof r.size === 'number' ? r.size : 0;
            const bad = r.trackedDownloadStatus === 'warning' || r.trackedDownloadStatus === 'error';
            const eta = fmtEta(timeleftSec(r.timeleft)) || fmtEta(etas.get(String(r.downloadId || '').toLowerCase()));
            const t = movie ? r.movie : r.series;
            const why = (Array.isArray(r.statusMessages) ? r.statusMessages : []).flatMap((m) => (Array.isArray(m?.messages) ? m.messages : [])).map((m) => str(m, 160)).filter(Boolean)[0] || str(r.errorMessage, 160);
            rows.push({
              id: `${svc.id}:${int(r.id)}`, title: str(movie ? r.movie?.title : `${r.series?.title || ''}${ep}`, 120) || str(r.title, 120),
              subtitle: label(r.trackedDownloadState) + (bad && why ? `: ${why}` : ''),
              progress: size > 0 ? pct(1 - left / size) : 0, right: [left > 0 ? `${fmtBytes(left)} left` : fmtBytes(size), eta && left > 0 ? `~${eta}` : ''].filter(Boolean).join(' · '),
              ...titleRef(idx, { type: movie ? 'movie' : 'show', tmdbId: int(t?.tmdbId), tvdbId: int(t?.tvdbId), title: t?.title, year: int(t?.year), poster: posterIn(t?.images) }),
              // the badge goes to where the problem is shown and can be fixed: the queue page of the service that holds the download
              ...(bad ? { badge: { text: 'Needs attention', tone: 'warn', href: httpUrl(`${svc.url.replace(/\/+$/, '')}/activity/queue`), hint: why || `Open ${svc.name}` } } : {}),
            });
          }
        }));
        return { rows: rows.slice(0, 8), empty: 'Nothing is downloading.', chip: rows.length ? `${rows.length} downloading` : '' };
      },
    },
    {
      id: 'upcoming', title: 'Coming up', kind: 'list', requires: ['radarr', 'sonarr'], refresh: 600, order: 23, control: { span: 2 }, media: 'hidden',
      fetch: async () => {
        const start = new Date();
        const end = new Date(Date.now() + 14 * 86400000);
        const win = (iso) => { const t = Date.parse(iso); return !Number.isNaN(t) && t >= start.getTime() - 86400000 && t <= end.getTime(); };
        const rows = [];
        const idx = await titleIndex();
        await Promise.all(arr().map(async (svc) => {
          const movie = svc.type === 'radarr';
          const list = await api(svc, `/api/v3/calendar?start=${ymd(start)}&end=${ymd(end)}${movie ? '' : '&includeSeries=true'}`);
          for (const e of Array.isArray(list) ? list : []) {
            if (!e || typeof e !== 'object') continue;
            if (movie) {
              const kinds = [['digitalRelease', 'Digital release'], ['physicalRelease', 'Physical release'], ['inCinemas', 'In cinemas']];
              const hit = kinds.find(([k]) => win(e[k]));
              if (hit) rows.push({ id: `m${int(e.id)}`, title: str(e.title, 120), subtitle: hit[1], when: isoDate(e[hit[0]]), whenIsDay: true, ...titleRef(idx, { type: 'movie', tmdbId: int(e.tmdbId), title: e.title, year: int(e.year), poster: posterIn(e.images) }) });
            } else if (win(e.airDateUtc)) {
              rows.push({ id: `e${int(e.id)}`, title: str(e.series?.title, 120) || str(e.title, 120), subtitle: `${sxe(e.seasonNumber, e.episodeNumber)}${e.title ? `, ${str(e.title, 60)}` : ''}`, when: isoDate(e.airDateUtc), ...titleRef(idx, { type: 'show', tmdbId: int(e.series?.tmdbId), tvdbId: int(e.series?.tvdbId), title: e.series?.title, year: int(e.series?.year), poster: posterIn(e.series?.images) }) });
            }
          }
        }));
        rows.sort((a, b) => Date.parse(a.when) - Date.parse(b.when));
        return { rows: rows.slice(0, 8), empty: 'Nothing scheduled in the next two weeks.' };
      },
    },
    {
      id: 'disk', title: 'Disk space', kind: 'list', requires: ['radarr', 'sonarr'], refresh: 300, order: 24, control: { span: 2 }, media: 'hidden',
      fetch: async () => {
        const seen = new Map(); // the same drive is reported by every instance that can see it
        await Promise.all(arr().map(async (svc) => {
          const list = await api(svc, '/api/v3/diskspace');
          for (const d of Array.isArray(list) ? list : []) {
            if (!d || typeof d !== 'object') continue;
            if (typeof d.totalSpace !== 'number' || d.totalSpace <= 0 || typeof d.freeSpace !== 'number') continue;
            const k = `${str(d.path, 200)}|${d.totalSpace}`;
            if (!seen.has(k)) seen.set(k, d);
          }
        }));
        const rows = [...seen.values()].map((d) => {
          const used = pct(1 - d.freeSpace / d.totalSpace);
          return { id: str(d.path, 200), title: str(d.label, 60) || str(d.path, 60), subtitle: str(d.path, 80), progress: used, right: `${fmtBytes(d.freeSpace)} free`, go: { drive: str(d.path, 200) }, ...(used > 0.9 ? { badge: { text: 'Almost full', tone: 'warn' } } : {}) };
        }).sort((a, b) => b.progress - a.progress).slice(0, 8);
        return { rows, empty: 'No drives reported.' };
      },
    },
  ],
};
