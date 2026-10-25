import { getLibrary, getServices, testService } from '../lib.js';
import { keepMap } from '../keep.js';
import { fmtBytes, str, posterOf, httpUrl } from './util.js';

/*
 * Widgets that belong to this app itself rather than to one service: service health, library numbers, and what is worth cleaning
 * up. They are built from the library, which already merges Radarr, Sonarr and the watch history.
 */
const DAY = 86400000;
const STALE_DAYS = 365; // the same default as the Stale tab
const lastUse = (i) => (i.watch?.plays && i.watch.last ? i.watch.last * 1000 : Date.parse(i.added) || 0);
const staleTitles = async () => {
  const keep = keepMap();
  const { items } = await getLibrary(false);
  return items.filter((i) => i.hasFile && i.watch && Date.now() - lastUse(i) > STALE_DAYS * DAY && !keep[i.key]);
};

export default {
  type: 'app', name: 'Media Middle Manager',
  widgets: [
    {
      id: 'health', title: 'Services', kind: 'status', refresh: 60, order: 0, control: { span: 4 }, media: 'chip',
      fetch: async () => {
        const items = await Promise.all(getServices().map(async (s) => {
          try { return { name: str(s.name, 60), type: s.type, url: httpUrl(s.url), ok: true, detail: str(await testService(s), 120) }; }
          catch (e) { return { name: str(s.name, 60), type: s.type, url: httpUrl(s.url), ok: false, detail: str(e.message, 120) }; }
        }));
        const down = items.filter((x) => !x.ok).length;
        return { items, chip: down ? `${down} service${down === 1 ? '' : 's'} down` : 'All services up', tone: down ? 'warn' : 'ok' };
      },
    },
    {
      id: 'library', title: 'Library', kind: 'stat', requires: ['radarr', 'sonarr'], refresh: 120, order: 10, control: { span: 1 }, media: 'hidden', link: 'library',
      fetch: async () => {
        const { items } = await getLibrary(false);
        const bytes = (type) => items.filter((i) => i.type === type).reduce((n, i) => n + i.size, 0);
        return {
          value: items.length.toLocaleString('en-US'), sub: fmtBytes(items.reduce((n, i) => n + i.size, 0)), label: 'titles',
          tags: [{ label: 'Movies', value: fmtBytes(bytes('movie')), types: ['movie'] }, { label: 'Series', value: fmtBytes(bytes('show')), types: ['show'] }],
        };
      },
    },
    {
      id: 'reclaimable', title: 'Could be freed', kind: 'stat', requires: ['tautulli', 'plex'], refresh: 300, order: 11, control: { span: 1 }, media: 'chip', link: 'stale',
      fetch: async () => {
        const list = await staleTitles();
        const bytes = list.reduce((n, i) => n + i.size, 0);
        return { value: fmtBytes(bytes), sub: `${list.length.toLocaleString('en-US')} stale · estimated`, chip: list.length ? `${fmtBytes(bytes)} reclaimable` : '', link: 'stale' };
      },
    },
    {
      id: 'recent', title: 'Recently added', kind: 'posters', requires: ['radarr', 'sonarr'], refresh: 120, order: 30, control: { span: 4 }, media: 'row',
      fetch: async () => {
        const { items } = await getLibrary(false);
        const list = items.filter((i) => i.hasFile && Date.parse(i.added)).sort((a, b) => Date.parse(b.added) - Date.parse(a.added)).slice(0, 14);
        return { items: list.map((i) => posterOf(i)) };
      },
    },
    {
      id: 'stale-top', title: 'Worth cleaning up', kind: 'posters', requires: ['tautulli', 'plex'], refresh: 300, order: 32, control: { span: 4 }, media: 'row', link: 'stale',
      fetch: async () => {
        const list = (await staleTitles()).sort((a, b) => b.size - a.size).slice(0, 14);
        return { items: list.map((i) => posterOf(i, fmtBytes(i.size))) };
      },
    },
  ],
};
