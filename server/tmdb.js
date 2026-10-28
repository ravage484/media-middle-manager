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

// Has it come out yet? (Its release or first air date is today or earlier.) A requested title that has not is simply waiting.
export const isReleased = (r) => { const d = String(r?.releaseDate ?? r?.firstAirDate ?? ''); return /^\d{4}-\d{2}-\d{2}/.test(d) && d.slice(0, 10) <= new Date().toISOString().slice(0, 10); };

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
    poster: image(r.posterPath, 'w342'), backdrop: image(r.backdropPath, 'w780'),
    rating: num(r.voteAverage) > 0 ? Math.round(r.voteAverage * 10) / 10 : null,
    overview: text(r.overview, 400),
    status: mediaStatus(r.mediaInfo), released: isReleased(r),
    adult: r.adult === true, // TMDB's adult flag: the app hides these unless the user turns them on
  };
}

// The people of a title (Overseerr's credits.cast): name, part and a photo address, in billing order.
export const shapeCast = (list, max = 20) => (Array.isArray(list) ? list : []).slice(0, max).map((c) => ({
  id: id(c?.id), name: text(c?.name, 80), character: text(c?.character, 80), photo: image(c?.profilePath, 'w185'),
})).filter((c) => c.name);

// The people in a search: Overseerr lists them among the titles, as mediaType "person". `character` carries what they are known for
// (Acting, Directing...), so a person shows the same way a cast member does.
export const shapePeople = (list, max = 12) => (Array.isArray(list) ? list : []).filter((p) => p?.mediaType === 'person').slice(0, max).map((p) => ({
  id: id(p?.id), name: text(p?.name, 80), character: text(p?.knownForDepartment, 40), photo: image(p?.profilePath, 'w185'),
})).filter((p) => p.id && p.name);

export const shapeResults = (list) => (Array.isArray(list) ? list : []).map(shapeResult).filter(Boolean);

// type:tmdbId -> the key of that title in your library (so a result can open it) and whether any of it is on disk (a requested title is
// in Radarr or Sonarr too, before anything is downloaded).
export const libraryIndex = (items) => new Map(items.filter((i) => i.tmdbId).map((i) => [`${i.type}:${i.tmdbId}`, { key: i.key, onDisk: !!i.hasFile }]));
export const inLibraryOf = (have, type, tmdbId) => { const h = have.get(`${type}:${tmdbId}`); return { inLibrary: h?.key || null, onDisk: !!h?.onDisk }; };
export const withLibrary = (results, have) => results.map((r) => ({ ...r, ...inLibraryOf(have, r.type, r.tmdbId) }));
