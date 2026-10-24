/*
 * Shared by Recommendations and Discover: what Overseerr (TMDB) returns for a movie or show, cut down to values that are safe to put
 * in a page. Poster and backdrop paths become TMDB image addresses only when they look like a plain file name, because they end up
 * in <img src>; text loses control characters and is capped; numbers must really be numbers.
 */
const IMG_RE = /^\/[A-Za-z0-9_-]{5,60}\.(jpg|jpeg|png|webp)$/;
export const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const text = (v, max) => (typeof v === 'string' && v.trim() ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : null);
export const image = (path, size) => (typeof path === 'string' && IMG_RE.test(path) ? `https://image.tmdb.org/t/p/${size}${path}` : null);
export const id = (v) => (Number.isInteger(v) && v >= 1 && v <= 999999999 ? v : null);
const yearOf = (r) => { const y = /^(\d{4})/.exec(String(r?.releaseDate ?? r?.firstAirDate ?? ''))?.[1]; return y ? Number(y) : null; };

// Overseerr's media status: 2 pending, 3 processing, 4 partially available, 5 available.
export const mediaStatus = (info) => (info && Number.isInteger(info.status) && info.status >= 1 && info.status <= 6 ? info.status : null);

// One entry of a results list, or null when it is not a movie or show (people, or something malformed).
export function shapeResult(r) {
  const type = r?.mediaType === 'movie' ? 'movie' : r?.mediaType === 'tv' ? 'show' : null;
  const title = text(r?.title ?? r?.name, 200);
  const tmdbId = id(r?.id);
  if (!type || !title || !tmdbId) return null;
  return {
    tmdbId, type, title, year: yearOf(r),
    poster: image(r.posterPath, 'w342'),
    rating: num(r.voteAverage) > 0 ? Math.round(r.voteAverage * 10) / 10 : null,
    overview: text(r.overview, 400),
    status: mediaStatus(r.mediaInfo),
  };
}

export const shapeResults = (list) => (Array.isArray(list) ? list : []).map(shapeResult).filter(Boolean);

// type:tmdbId -> the key of that title in your library, so a result can say "In library" and open it.
export const libraryIndex = (items) => new Map(items.filter((i) => i.tmdbId).map((i) => [`${i.type}:${i.tmdbId}`, i.key]));
export const withLibrary = (results, have) => results.map((r) => ({ ...r, inLibrary: have.get(`${r.type}:${r.tmdbId}`) || null }));
