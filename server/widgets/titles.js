import { getLibrary } from '../lib.js';
import { httpUrl } from './util.js';

/*
 * Ties a title a widget names to the library: which library item it is (so a click opens it), its poster, and, when it is not in
 * the library, the TMDB id the Discover window needs to look it up. Types are the library's own: 'movie' and 'show'.
 */
const norm = (t) => String(t || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

export async function titleIndex() {
  const idx = { byId: new Map(), byName: new Map() };
  try {
    for (const i of (await getLibrary(false)).items) {
      if (i.tmdbId) idx.byId.set(`${i.type}:tmdb:${i.tmdbId}`, i);
      if (i.tvdbId) idx.byId.set(`${i.type}:tvdb:${i.tvdbId}`, i);
      idx.byName.set(`${i.type}:${norm(i.title)}:${i.year || ''}`, i);
      if (!idx.byName.has(`${i.type}:${norm(i.title)}:`)) idx.byName.set(`${i.type}:${norm(i.title)}:`, i);
    }
  } catch { /* without the library nothing links, but the widget still draws */ }
  return idx;
}

// { poster, open } for a row. `open` is what the browser hands to its title opener; null when there is nothing to open.
export function titleRef(idx, { type, tmdbId, tvdbId, title, year, poster }) {
  const hit = (tmdbId && idx.byId.get(`${type}:tmdb:${tmdbId}`)) || (tvdbId && idx.byId.get(`${type}:tvdb:${tvdbId}`))
    || idx.byName.get(`${type}:${norm(title)}:${year || ''}`) || idx.byName.get(`${type}:${norm(title)}:`);
  const id = hit?.tmdbId || tmdbId || 0;
  return {
    poster: httpUrl(hit?.poster) || httpUrl(poster) || null,
    open: hit ? { type, tmdbId: id, inLibrary: hit.key } : id ? { type, tmdbId: id } : null,
  };
}

export const posterIn = (images) => httpUrl(Array.isArray(images) ? images.find((i) => i?.coverType === 'poster')?.remoteUrl : null);
