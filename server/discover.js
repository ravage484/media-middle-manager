import { getLibrary, api } from './lib.js';
import { overseerrService } from './keywords.js';
import { shapeResults, libraryIndex, withLibrary, text, num, image, id, mediaStatus } from './tmdb.js';

/*
 * Discover: browse and search what exists (not just what you own) through Overseerr, and ask for it. Lists and details come from
 * Overseerr's discover, search and title endpoints, are cut down by tmdb.js, and each result says whether you already have it.
 * Asking for a title (a request) is the only thing here that changes anything: it creates a request in Overseerr, which hands it to
 * Radarr or Sonarr the way a request made in Overseerr itself would.
 */
const userError = (msg) => Object.assign(new Error(msg), { userError: true });
const svc = () => {
  const s = overseerrService();
  if (!s) throw userError('Add Overseerr in Settings first: Discover works through it.');
  return s;
};
const page1 = (p) => {
  if (!Number.isInteger(p) || p < 1 || p > 20) throw userError('Unknown page');
  return p;
};
const kind = (type) => {
  if (type !== 'movie' && type !== 'show') throw userError('Expected a movie or a show');
  return type === 'movie' ? 'movie' : 'tv';
};

const cache = new Map(); // path -> { at, body }
const cached = async (path, ttl, fetcher) => {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < ttl) return hit.body;
  const body = await fetcher();
  cache.set(path, { at: Date.now(), body });
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return body;
};

/* ---------- browsing and searching ---------- */
const SECTIONS = {
  trending: '/api/v1/discover/trending',
  movies: '/api/v1/discover/movies',
  tv: '/api/v1/discover/tv',
  upcomingMovies: '/api/v1/discover/movies/upcoming',
  upcomingTv: '/api/v1/discover/tv/upcoming',
};

async function listFrom(path, page, ttl) {
  const d = await cached(path, ttl, async () => {
    const r = await api(svc(), path);
    return { totalPages: Number.isInteger(r?.totalPages) ? r.totalPages : 1, results: shapeResults(r?.results) };
  });
  const { items } = await getLibrary(false);
  return { page, hasMore: page < Math.min(d.totalPages, 20), results: withLibrary(d.results, libraryIndex(items)) };
}

// section: one of SECTIONS, or "genre" with a type and a genre id.
export async function browse({ section, type, genre, page = 1 }) {
  page = page1(page);
  svc();
  if (section === 'genre') {
    const g = id(genre);
    if (!g) throw userError('Unknown genre');
    return listFrom(`/api/v1/discover/${kind(type) === 'movie' ? 'movies' : 'tv'}/genre/${g}?page=${page}`, page, 10 * 60000);
  }
  if (!Object.hasOwn(SECTIONS, section)) throw userError('Unknown list');
  return listFrom(`${SECTIONS[section]}?page=${page}`, page, 10 * 60000);
}

export async function search(q, page = 1) {
  page = page1(page);
  svc();
  const query = typeof q === 'string' ? q.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';
  if (!query || query.length > 100) throw userError('Type something to search for (up to 100 characters)');
  return listFrom(`/api/v1/search?query=${encodeURIComponent(query)}&page=${page}`, page, 2 * 60000);
}

export async function genres(type) {
  const k = kind(type);
  svc();
  return cached(`genres:${k}`, 60 * 60000, async () => {
    const r = await api(svc(), `/api/v1/genres/${k}`);
    return (Array.isArray(r) ? r : []).map((g) => ({ id: id(g?.id), name: text(g?.name, 60) })).filter((g) => g.id && g.name);
  });
}

/* ---------- one title ---------- */
export async function titleDetails(type, tmdbId) {
  const k = kind(type);
  const tid = id(Number(tmdbId));
  if (!tid) throw userError('Unknown title');
  const s = svc();
  const d = await cached(`title:${k}:${tid}`, 2 * 60000, () => api(s, `/api/v1/${k}/${tid}`));
  const { items } = await getLibrary(false);
  const info = d?.mediaInfo;
  const bySeason = new Map((Array.isArray(info?.seasons) ? info.seasons : []).map((x) => [x?.seasonNumber, mediaStatus(x)]));
  // seasons somebody has already asked for (waiting for approval, or approved)
  const asked = new Set();
  for (const r of Array.isArray(info?.requests) ? info.requests : []) {
    if (r?.status === 1 || r?.status === 2) for (const sn of Array.isArray(r.seasons) ? r.seasons : []) if (Number.isInteger(sn?.seasonNumber)) asked.add(sn.seasonNumber);
  }
  const year = /^(\d{4})/.exec(String(d?.releaseDate ?? d?.firstAirDate ?? ''))?.[1];
  return {
    tmdbId: tid, type, title: text(d?.title ?? d?.name, 200) || '(untitled)', year: year ? Number(year) : null,
    tagline: text(d?.tagline, 200), overview: text(d?.overview, 2000),
    poster: image(d?.posterPath, 'w500'), backdrop: image(d?.backdropPath, 'w1280'),
    genres: (Array.isArray(d?.genres) ? d.genres : []).map((g) => text(g?.name, 40)).filter(Boolean).slice(0, 8),
    runtime: num(k === 'movie' ? d?.runtime : d?.episodeRunTime?.[0]) > 0 ? (k === 'movie' ? d.runtime : d.episodeRunTime[0]) : null,
    rating: num(d?.voteAverage) > 0 ? Math.round(d.voteAverage * 10) / 10 : null,
    votes: Number.isInteger(d?.voteCount) && d.voteCount >= 0 ? d.voteCount : null,
    status: mediaStatus(info),
    inLibrary: libraryIndex(items).get(`${type}:${tid}`) || null,
    cast: (Array.isArray(d?.credits?.cast) ? d.credits.cast : []).slice(0, 12).map((c) => ({ name: text(c?.name, 80), character: text(c?.character, 80) })).filter((c) => c.name),
    seasons: k === 'tv'
      ? (Array.isArray(d?.seasons) ? d.seasons : []).filter((x) => Number.isInteger(x?.seasonNumber) && x.seasonNumber > 0).slice(0, 200).map((x) => ({
        number: x.seasonNumber, name: text(x.name, 80) || `Season ${x.seasonNumber}`, episodes: Number.isInteger(x.episodeCount) ? x.episodeCount : null,
        airDate: /^\d{4}-\d{2}-\d{2}$/.test(String(x.airDate)) ? x.airDate : null, status: bySeason.get(x.seasonNumber) ?? null, requested: asked.has(x.seasonNumber),
      }))
      : null,
  };
}

/* ---------- asking for a title ---------- */
// seasons (shows only): "all" or a list of season numbers.
export async function requestTitle({ type, tmdbId, seasons }) {
  const k = kind(type);
  const tid = id(tmdbId);
  if (!tid) throw userError('Unknown title');
  let body;
  if (k === 'movie') body = { mediaType: 'movie', mediaId: tid };
  else {
    if (seasons !== 'all' && !(Array.isArray(seasons) && seasons.length >= 1 && seasons.length <= 100 && seasons.every((n) => Number.isInteger(n) && n >= 1 && n <= 200))) {
      throw userError('Choose which seasons to request');
    }
    body = { mediaType: 'tv', mediaId: tid, seasons: seasons === 'all' ? 'all' : [...new Set(seasons)] };
  }
  let r;
  try { r = await api(svc(), '/api/v1/request', { method: 'POST', body }); } catch (e) {
    const code = /-> (\d{3})(?!\d)/.exec(String(e.message))?.[1];
    if (code === '409') throw userError('This has already been requested.');
    if (code === '403') throw userError('Overseerr will not allow this request (a request limit, or the title is blocked).');
    if (code === '404') throw userError('Overseerr does not know this title.');
    throw e;
  }
  cache.delete(`title:${k}:${tid}`); // its status just changed
  return { ok: true, requestStatus: r?.status === 2 ? 'approved' : 'pending' }; // 1 waits for approval, 2 is approved and sent on
}
