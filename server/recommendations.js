import { getLibrary, api } from './lib.js';
import { overseerrService } from './keywords.js';

/*
 * "Recommendations" and "Similar" under a title, from Overseerr (which gets them from TMDB). Each result says whether you already
 * have it, so a card can open it. Everything that came from another service is checked and cut down before the browser sees it,
 * because some of it ends up in image addresses.
 */
const userError = (msg) => Object.assign(new Error(msg), { userError: true });
const KINDS = ['recommendations', 'similar'];
const POSTER_RE = /^\/[A-Za-z0-9_-]{5,60}\.(jpg|jpeg|png|webp)$/;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const text = (v, max) => (typeof v === 'string' && v.trim() ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : null);

const cache = new Map(); // "key|kind|page" -> { at, body }
const TTL = 10 * 60 * 1000;

export async function getRecommendations(key, kind = 'recommendations', page = 1) {
  if (!KINDS.includes(kind)) throw userError('Unknown list');
  if (!Number.isInteger(page) || page < 1 || page > 10) throw userError('Unknown page');
  const svc = overseerrService();
  if (!svc) throw userError('Add Overseerr in Settings first: recommendations come from it.');
  const { items } = await getLibrary(false);
  const item = items.find((i) => i.key === key);
  if (!item) throw userError('That title was not found in your library. Refresh the library and try again.');
  if (!/^\d{1,9}$/.test(String(item.tmdbId))) return { results: [], page, hasMore: false };

  const ck = `${key}|${kind}|${page}`;
  const hit = cache.get(ck);
  const have = new Map(items.filter((i) => i.tmdbId).map((i) => [`${i.type}:${i.tmdbId}`, i.key])); // fresh each time: the library changes
  const shape = (body) => ({
    ...body,
    results: body.results.map((r) => ({ ...r, inLibrary: have.get(`${r.type}:${r.tmdbId}`) || null })),
  });
  if (hit && Date.now() - hit.at < TTL) return shape(hit.body);

  const d = await api(svc, `/api/v1/${item.type === 'movie' ? 'movie' : 'tv'}/${item.tmdbId}/${kind}?page=${page}`);
  const results = [];
  for (const r of Array.isArray(d?.results) ? d.results : []) {
    const type = r?.mediaType === 'movie' ? 'movie' : r?.mediaType === 'tv' ? 'show' : null;
    const title = text(r?.title ?? r?.name, 200);
    if (!type || !title || !Number.isInteger(r.id) || r.id < 1 || r.id > 999999999) continue;
    const year = /^(\d{4})/.exec(String(r.releaseDate ?? r.firstAirDate ?? ''))?.[1];
    const status = r.mediaInfo && Number.isInteger(r.mediaInfo.status) && r.mediaInfo.status >= 1 && r.mediaInfo.status <= 6 ? r.mediaInfo.status : null;
    results.push({
      tmdbId: r.id, type, title, year: year ? Number(year) : null,
      poster: typeof r.posterPath === 'string' && POSTER_RE.test(r.posterPath) ? `https://image.tmdb.org/t/p/w342${r.posterPath}` : null,
      rating: num(r.voteAverage) > 0 ? Math.round(r.voteAverage * 10) / 10 : null,
      status, // Overseerr's: 2 pending, 3 processing, 4 partially available, 5 available
    });
  }
  const body = { page, hasMore: Number.isInteger(d?.totalPages) ? page < d.totalPages : results.length >= 20, results };
  cache.set(ck, { at: Date.now(), body });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return shape(body);
}
