import { api, getServices, tautulli, qb } from '../lib.js';
import { fmtBytes, str, int, pct } from './util.js';
import { titleIndex, titleRef } from './titles.js';

/* Who is watching (Tautulli, or Plex when there is no Tautulli) and how fast qBittorrent is going. */
const of = (type) => getServices().filter((s) => s.type === type);
const how = (d) => ({ 'direct play': 'direct play', directplay: 'direct play', transcode: 'transcoding', copy: 'direct stream' }[String(d).toLowerCase()] || '');
const tmdbOf = (guids) => { const m = (Array.isArray(guids) ? guids : []).map((g) => /^tmdb:\/\/(\d+)/.exec(typeof g === 'string' ? g : g?.id || '')).find(Boolean); return m ? Number(m[1]) : 0; };
const sxe = (s, e) => `S${String(Number.isInteger(s) ? s : 0).padStart(2, '0')}E${String(Number.isInteger(e) ? e : 0).padStart(2, '0')}`;

export default {
  type: 'media', name: 'Plex and Tautulli',
  widgets: [
    {
      id: 'now-playing', title: 'Now playing', kind: 'list', requires: ['tautulli', 'plex'], refresh: 15, order: 20, control: { span: 2 }, media: 'chip',
      fetch: async () => {
        const rows = [];
        const idx = await titleIndex();
        const tt = of('tautulli');
        if (tt.length) {
          for (const s of tt) {
            const a = await tautulli(s, 'get_activity');
            for (const x of Array.isArray(a?.sessions) ? a.sessions : []) {
              if (!x || typeof x !== 'object') continue;
              rows.push({
                id: str(x.session_key, 40) || str(x.full_title, 40), title: str(x.full_title, 120) || str(x.title, 120), progress: pct(Number(x.progress_percent) / 100),
                subtitle: [`${str(x.friendly_name, 40) || str(x.user, 40)} on ${str(x.platform, 30) || str(x.product, 30) || 'a device'}`, how(x.transcode_decision)].filter(Boolean).join(', '),
                ...titleRef(idx, x.media_type === 'episode'
                  ? { type: 'show', title: x.grandparent_title, tmdbId: tmdbOf(x.grandparent_guids || x.guids) }
                  : { type: 'movie', title: x.title, year: int(Number(x.year)), tmdbId: tmdbOf(x.guids) }),
                ...(x.state === 'paused' ? { badge: { text: 'Paused', tone: '' } } : {}),
              });
            }
          }
        } else {
          for (const s of of('plex')) {
            const r = await api(s, '/status/sessions');
            for (const m of Array.isArray(r?.MediaContainer?.Metadata) ? r.MediaContainer.Metadata : []) {
              if (!m || typeof m !== 'object') continue;
              const ep = m.type === 'episode' && Number.isInteger(m.parentIndex) ? ` ${sxe(m.parentIndex, m.index)}` : '';
              rows.push({
                id: str(m.sessionKey, 40) || str(m.title, 40), title: `${str(m.grandparentTitle, 100) || str(m.title, 100)}${ep}`, progress: m.duration > 0 ? pct(m.viewOffset / m.duration) : 0,
                subtitle: [`${str(m.User?.title, 40) || 'Someone'} on ${str(m.Player?.title, 30) || 'a device'}`, how(m.Media?.[0]?.Part?.[0]?.decision)].filter(Boolean).join(', '),
                ...titleRef(idx, m.type === 'episode'
                  ? { type: 'show', title: m.grandparentTitle, tmdbId: tmdbOf(m.grandparentGuid ? [m.grandparentGuid] : m.Guid) }
                  : { type: 'movie', title: m.title, year: int(m.year), tmdbId: tmdbOf(m.Guid) }),
                ...(m.Player?.state === 'paused' ? { badge: { text: 'Paused', tone: '' } } : {}),
              });
            }
          }
        }
        return { rows: rows.slice(0, 8), empty: 'Nobody is watching right now.', chip: rows.length ? `${rows.length} streaming` : '' };
      },
    },
    {
      id: 'watch-history', title: 'Recently watched', kind: 'list', requires: ['tautulli'], refresh: 120, order: 26, control: { span: 2 }, media: 'hidden',
      fetch: async () => {
        const idx = await titleIndex();
        const rows = [];
        for (const s of of('tautulli')) {
          const h = await tautulli(s, 'get_history', { length: 8, order_column: 'date', order_dir: 'desc' });
          for (const x of Array.isArray(h?.data) ? h.data : []) {
            if (!x || typeof x !== 'object') continue;
            const at = Number.isFinite(x.started) ? x.started : Number.isFinite(x.date) ? x.date : 0;
            rows.push({
              id: `${s.id}:${str(String(x.row_id ?? x.id ?? at), 40)}`, title: str(x.full_title, 120) || str(x.title, 120),
              subtitle: `${str(x.friendly_name, 40) || str(x.user, 40) || 'Someone'} on ${str(x.platform, 30) || str(x.product, 30) || 'a device'}`,
              when: at ? new Date(at * 1000).toISOString() : null,
              ...titleRef(idx, x.media_type === 'episode' ? { type: 'show', title: x.grandparent_title } : { type: 'movie', title: x.title, year: int(Number(x.year)) }),
            });
          }
        }
        rows.sort((a, b) => Date.parse(b.when || 0) - Date.parse(a.when || 0));
        return { rows: rows.slice(0, 8), empty: 'Nothing has been watched yet.' };
      },
    },
    {
      id: 'speed', title: 'Downloading', kind: 'stat', requires: ['qbittorrent'], refresh: 10, order: 13, control: { span: 1 }, media: 'hidden',
      fetch: async () => {
        let dl = 0;
        let up = 0;
        for (const s of of('qbittorrent')) { const t = await qb(s, '/api/v2/transfer/info'); dl += int(t?.dl_info_speed); up += int(t?.up_info_speed); }
        return { value: `${fmtBytes(dl)}/s`, sub: `${fmtBytes(up)}/s up` };
      },
    },
  ],
};
