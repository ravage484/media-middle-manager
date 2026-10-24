import { getLibrary, api } from './lib.js';
import { overseerrService } from './keywords.js';
import { shapeResults, libraryIndex, withLibrary } from './tmdb.js';

/*
 * "Recommendations" and "Similar" under a title, from Overseerr (which gets them from TMDB). Each result says whether you already
 * have it, so a card can open it. Everything that came from another service is checked and cut down before the browser sees it,
 * because some of it ends up in image addresses.
 */
const userError = (msg) => Object.assign(new Error(msg), { userError: true });
const KINDS = ['recommendations', 'similar'];

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
  const have = libraryIndex(items); // fresh each time: the library changes
  const shape = (body) => ({ ...body, results: withLibrary(body.results, have) });
  if (hit && Date.now() - hit.at < TTL) return shape(hit.body);

  const d = await api(svc, `/api/v1/${item.type === 'movie' ? 'movie' : 'tv'}/${item.tmdbId}/${kind}?page=${page}`);
  const results = shapeResults(d?.results).map(({ overview, ...r }) => r);
  const body = { page, hasMore: Number.isInteger(d?.totalPages) ? page < d.totalPages : results.length >= 20, results };
  cache.set(ck, { at: Date.now(), body });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return shape(body);
}
