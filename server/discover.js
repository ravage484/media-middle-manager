import { getLibrary, getServices, api } from './lib.js';
import { overseerrService } from './keywords.js';
import { shapeResults, shapeCast, shapePeople, isReleased, libraryIndex, inLibraryOf, withLibrary, text, num, image, id, mediaStatus } from './tmdb.js';

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

// type:tmdbId of everything in the Radarr and Sonarr download queues, so a requested title can say it is really downloading.
const downloadingNow = () => cached('queue', 15000, async () => {
  const keys = new Set();
  await Promise.all(getServices().filter((x) => x.type === 'radarr' || x.type === 'sonarr').map(async (x) => {
    const movie = x.type === 'radarr';
    try {
      const q = await api(x, `/api/v3/queue?page=1&pageSize=100&${movie ? 'includeMovie=true' : 'includeSeries=true'}`);
      for (const r of Array.isArray(q?.records) ? q.records : []) { const t = id(movie ? r?.movie?.tmdbId : r?.series?.tmdbId); if (t) keys.add(`${movie ? 'movie' : 'show'}:${t}`); }
    } catch { /* optional: the label just stays general */ }
  }));
  return keys;
});
const withDownloading = async (results) => { const q = await downloadingNow(); return results.map((r) => ({ ...r, downloading: q.has(`${r.type}:${r.tmdbId}`) })); };

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
    return { totalPages: Number.isInteger(r?.totalPages) ? r.totalPages : 1, results: shapeResults(r?.results), people: shapePeople(r?.results) };
  });
  const { items } = await getLibrary(false);
  return { page, hasMore: page < Math.min(d.totalPages, 20), results: await withDownloading(withLibrary(d.results, libraryIndex(items))), ...(page === 1 && d.people.length ? { people: d.people } : {}) };
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

// Is a 4K Radarr (movies) or Sonarr (shows) set up in Overseerr? Only then is "Request 4K" offered.
async function has4k(k) {
  return cached(`4k:${k}`, 10 * 60000, async () => {
    try {
      const r = await api(svc(), `/api/v1/settings/${k === 'movie' ? 'radarr' : 'sonarr'}`);
      return Array.isArray(r) && r.some((x) => x?.is4k === true);
    } catch { return false; } // not an admin key, or older Overseerr: just don't offer it
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
  const seasonInfo = Array.isArray(info?.seasons) ? info.seasons : [];
  const bySeason = new Map(seasonInfo.map((x) => [x?.seasonNumber, mediaStatus({ status: x?.status })]));
  const bySeason4k = new Map(seasonInfo.map((x) => [x?.seasonNumber, mediaStatus({ status: x?.status4k })]));
  // requests somebody has made and that are still standing (waiting for approval, or approved), and the seasons they cover
  const requests = [];
  const asked = { hd: new Set(), uhd: new Set() };
  for (const r of Array.isArray(info?.requests) ? info.requests : []) {
    if (!(r?.status === 1 || r?.status === 2) || !id(r?.id)) continue;
    const tier = r.is4k === true ? 'uhd' : 'hd';
    const nums = (Array.isArray(r.seasons) ? r.seasons : []).map((sn) => sn?.seasonNumber).filter(Number.isInteger);
    requests.push({ id: r.id, is4k: tier === 'uhd', status: r.status, by: text(r?.requestedBy?.displayName ?? r?.requestedBy?.username, 60), seasons: nums });
    for (const n of nums) asked[tier].add(n);
  }
  const year = /^(\d{4})/.exec(String(d?.releaseDate ?? d?.firstAirDate ?? ''))?.[1];
  return {
    tmdbId: tid, type, title: text(d?.title ?? d?.name, 200) || '(untitled)', year: year ? Number(year) : null,
    links: [
      ...(/^tt\d{5,10}$/.test(String(d?.externalIds?.imdbId ?? d?.imdbId)) ? [{ label: 'IMDb', url: `https://www.imdb.com/title/${d?.externalIds?.imdbId ?? d.imdbId}/` }] : []),
      { label: 'TMDB', url: `https://www.themoviedb.org/${k}/${tid}` },
    ],
    tagline: text(d?.tagline, 200), overview: text(d?.overview, 2000),
    poster: image(d?.posterPath, 'w500'), backdrop: image(d?.backdropPath, 'w1280'),
    genres: (Array.isArray(d?.genres) ? d.genres : []).map((g) => text(g?.name, 40)).filter(Boolean).slice(0, 8),
    runtime: num(k === 'movie' ? d?.runtime : d?.episodeRunTime?.[0]) > 0 ? (k === 'movie' ? d.runtime : d.episodeRunTime[0]) : null,
    rating: num(d?.voteAverage) > 0 ? Math.round(d.voteAverage * 10) / 10 : null,
    votes: Number.isInteger(d?.voteCount) && d.voteCount >= 0 ? d.voteCount : null,
    status: mediaStatus(info), status4k: mediaStatus({ status: info?.status4k }), can4k: await has4k(k), requests,
    ...inLibraryOf(libraryIndex(items), type, tid), released: isReleased(d), downloading: (await downloadingNow()).has(`${type}:${tid}`),
    cast: shapeCast(d?.credits?.cast),
    seasons: k === 'tv'
      ? (Array.isArray(d?.seasons) ? d.seasons : []).filter((x) => Number.isInteger(x?.seasonNumber) && x.seasonNumber > 0).slice(0, 200).map((x) => ({
        number: x.seasonNumber, name: text(x.name, 80) || `Season ${x.seasonNumber}`, episodes: Number.isInteger(x.episodeCount) ? x.episodeCount : null,
        airDate: /^\d{4}-\d{2}-\d{2}$/.test(String(x.airDate)) ? x.airDate : null, status: bySeason.get(x.seasonNumber) ?? null, status4k: bySeason4k.get(x.seasonNumber) ?? null,
        requested: asked.hd.has(x.seasonNumber), requested4k: asked.uhd.has(x.seasonNumber),
      }))
      : null,
  };
}

/* ---------- one person ---------- */
// Who they are and what they have been in, most popular first, each marked with where it stands in your library and Overseerr.
export async function personDetails(personId) {
  const pid = id(Number(personId));
  if (!pid) throw userError('Unknown person');
  const s = svc();
  const [p, c] = await Promise.all([
    cached(`person:${pid}`, 10 * 60000, () => api(s, `/api/v1/person/${pid}`)),
    cached(`credits:${pid}`, 10 * 60000, () => api(s, `/api/v1/person/${pid}/combined_credits`).catch(() => null)),
  ]);
  const { items } = await getLibrary(false);
  const seen = new Set();
  const cast = (Array.isArray(c?.cast) ? c.cast : []).filter((x) => num(x?.popularity) !== null).sort((a, b) => b.popularity - a.popularity);
  const credits = shapeResults(cast).filter((r) => r.poster && !seen.has(r.type + r.tmdbId) && seen.add(r.type + r.tmdbId)).slice(0, 80);
  const born = /^\d{4}-\d{2}-\d{2}$/.test(String(p?.birthday)) ? p.birthday : null;
  return {
    id: pid, name: text(p?.name, 80) || '(unknown)', photo: image(p?.profilePath, 'w342'),
    bio: text(p?.biography, 1800), born, died: /^\d{4}-\d{2}-\d{2}$/.test(String(p?.deathday)) ? p.deathday : null, birthplace: text(p?.placeOfBirth, 120),
    link: `https://www.themoviedb.org/person/${pid}`,
    credits: await withDownloading(withLibrary(credits, libraryIndex(items))),
  };
}

/* ---------- a person's titles in your library ---------- */
// Which of your library's titles this person is in (cast credits, matched by TMDB id): for filtering the library by actor.
export async function personLibrary(personId) {
  const pid = id(Number(personId));
  if (!pid) throw userError('Unknown person');
  const s = svc();
  const [p, c] = await Promise.all([
    cached(`person:${pid}`, 10 * 60000, () => api(s, `/api/v1/person/${pid}`)),
    cached(`credits:${pid}`, 10 * 60000, () => api(s, `/api/v1/person/${pid}/combined_credits`)),
  ]);
  const credited = new Set((Array.isArray(c?.cast) ? c.cast : []).map((x) => `${x?.mediaType === 'movie' ? 'movie' : x?.mediaType === 'tv' ? 'show' : ''}:${x?.id}`));
  const { items } = await getLibrary(false);
  return { id: pid, name: text(p?.name, 80) || '(unknown)', keys: items.filter((i) => i.tmdbId && credited.has(`${i.type}:${i.tmdbId}`)).map((i) => i.key) };
}

/* ---------- asking for a title ---------- */
// seasons (shows only): "all" or a list of season numbers.
export async function requestTitle({ type, tmdbId, seasons, is4k = false }) {
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
  if (is4k) {
    if (is4k !== true) throw userError('Unknown quality');
    if (!(await has4k(k))) throw userError(`Overseerr has no 4K ${k === 'movie' ? 'Radarr' : 'Sonarr'} set up.`);
    body.is4k = true;
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

/* ---------- taking a request back ---------- */
// Removes the request from Overseerr. What it already sent to Radarr or Sonarr is left alone.
export async function cancelRequest(requestId) {
  if (!id(requestId)) throw userError('Unknown request');
  try { await api(svc(), `/api/v1/request/${requestId}`, { method: 'DELETE' }); } catch (e) {
    const code = /-> (\d{3})(?!\d)/.exec(String(e.message))?.[1];
    if (code === '404') throw userError('That request is already gone.');
    if (code === '403') throw userError('Overseerr will not let this key remove that request.');
    throw e;
  }
  for (const key of cache.keys()) if (key.startsWith('title:')) cache.delete(key); // its status just changed
  return { ok: true };
}
