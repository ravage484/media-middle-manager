import { api, getServices } from '../lib.js';
import { browse } from '../discover.js';
import { image } from '../tmdb.js';
import { titleIndex, titleRef } from './titles.js';
import { str, int, isoDate } from './util.js';

/* Overseerr: requests waiting for a decision (which you can make here), and what is trending. */
const svc = () => getServices().find((s) => s.type === 'overseerr');
const bad = (msg) => Object.assign(new Error(msg), { userError: true });
const titles = new Map(); // "movie:603" -> { title, poster, year, at }: a request names its title only by TMDB id

async function titleOf(s, type, id) {
  const k = `${type}:${id}`;
  const hit = titles.get(k);
  if (hit && Date.now() - hit.at < 3600000) return hit;
  let t = { title: `TMDB ${id}`, poster: null, year: 0 };
  try {
    const d = await api(s, `/api/v1/${type}/${id}`);
    t = { title: str(d?.[type === 'movie' ? 'title' : 'name'], 120) || t.title, poster: image(d?.posterPath, 'w185'), year: int(Number(String(d?.releaseDate || d?.firstAirDate || '').slice(0, 4))) };
  } catch { /* keep the fallback */ }
  const entry = { ...t, at: Date.now() };
  titles.set(k, entry);
  if (titles.size > 500) titles.delete(titles.keys().next().value);
  return entry;
}

const decide = (verb) => async (arg) => {
  const id = Number(arg);
  if (!Number.isInteger(id) || id < 1 || id > 999999999) throw bad('Unknown request');
  const s = svc();
  if (!s) throw bad('Add Overseerr in Settings first.');
  await api(s, `/api/v1/request/${id}/${verb}`, { method: 'POST' });
};

export default {
  type: 'overseerr', name: 'Overseerr',
  widgets: [
    {
      id: 'request-count', title: 'Pending requests', kind: 'stat', requires: ['overseerr'], refresh: 30, order: 12, control: { span: 1 }, media: 'hidden',
      fetch: async () => {
        const c = await api(svc(), '/api/v1/request/count');
        return { value: int(c?.pending).toLocaleString('en-US'), sub: `${int(c?.total).toLocaleString('en-US')} ever`, tone: int(c?.pending) ? 'warn' : '' };
      },
    },
    {
      id: 'requests', title: 'Pending requests', kind: 'list', requires: ['overseerr'], refresh: 30, order: 22, control: { span: 2 }, media: 'chip',
      actions: { approve: decide('approve'), decline: decide('decline') },
      fetch: async () => {
        const s = svc();
        const [list, count] = await Promise.all([api(s, '/api/v1/request?take=6&skip=0&filter=pending&sort=added'), api(s, '/api/v1/request/count').catch(() => null)]);
        const valid = (Array.isArray(list?.results) ? list.results : []).filter((r) => Number.isInteger(r?.id) && r.id >= 1);
        const idx = await titleIndex();
        const rows = await Promise.all(valid.map(async (r) => {
          const type = r?.media?.mediaType === 'movie' || r?.type === 'movie' ? 'movie' : 'tv';
          const tmdb = int(r?.media?.tmdbId);
          const who = str(r?.requestedBy?.displayName, 60) || str(r?.requestedBy?.username, 60) || 'Someone';
          const t = tmdb ? await titleOf(s, type, tmdb) : null;
          return {
            id: String(int(r?.id)), title: t?.title || 'Unknown title', subtitle: `${who}, ${type === 'movie' ? 'movie' : 'series'}`,
            ...titleRef(idx, { type: type === 'movie' ? 'movie' : 'show', tmdbId: tmdb, title: t?.title, year: t?.year, poster: t?.poster }),
            when: isoDate(r?.createdAt), actions: [{ id: 'approve', label: 'Approve' }, { id: 'decline', label: 'Decline' }],
          };
        }));
        const pending = int(count?.pending) || rows.length;
        return { rows, empty: 'Nothing is waiting for approval.', chip: pending ? `${pending} pending` : '' };
      },
    },
    {
      id: 'recent-requests', title: 'Recent requests', kind: 'list', requires: ['overseerr'], refresh: 60, order: 25, control: { span: 2 }, media: 'hidden',
      fetch: async () => {
        const s = svc();
        const list = await api(s, '/api/v1/request?take=6&skip=0&sort=added');
        const idx = await titleIndex();
        const rows = await Promise.all((Array.isArray(list?.results) ? list.results : []).filter((r) => Number.isInteger(r?.id) && r.id >= 1).map(async (r) => {
          const type = r?.media?.mediaType === 'movie' || r?.type === 'movie' ? 'movie' : 'tv';
          const tmdb = int(r?.media?.tmdbId);
          const who = str(r?.requestedBy?.displayName, 60) || str(r?.requestedBy?.username, 60) || 'Someone';
          const t = tmdb ? await titleOf(s, type, tmdb) : null;
          // 1 waits for a decision, 3 was declined, 2 was approved: from then on the media itself says how far it got
          const badge = r.status === 1 ? { text: 'Pending', tone: 'warn' } : r.status === 3 ? { text: 'Declined', tone: 'warn' }
            : r.media?.status === 5 ? { text: 'Available', tone: 'ok' } : r.media?.status === 4 ? { text: 'Partly available', tone: 'ok' }
            : r.status === 2 ? { text: r.media?.status === 3 ? 'Processing' : 'Approved', tone: '' } : null;
          return {
            id: String(int(r.id)), title: t?.title || 'Unknown title', subtitle: `${who}, ${type === 'movie' ? 'movie' : 'series'}`, when: isoDate(r.createdAt), ...(badge ? { badge } : {}),
            ...titleRef(idx, { type: type === 'movie' ? 'movie' : 'show', tmdbId: tmdb, title: t?.title, year: t?.year, poster: t?.poster }),
          };
        }));
        return { rows, empty: 'No requests yet.' };
      },
    },
    {
      id: 'trending', title: 'Trending to request', kind: 'posters', requires: ['overseerr'], refresh: 900, order: 31, control: { span: 4 }, media: 'row', link: 'discover',
      fetch: async () => ({ items: (await browse({ section: 'trending', page: 1 })).results.slice(0, 14) }),
    },
  ],
};
