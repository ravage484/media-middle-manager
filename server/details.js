import { getLibrary, getServices, api } from './lib.js';
import { fetchOverseerrMeta, overseerrService, REGION } from './keywords.js';
import { getKeywordMap, setKeywords } from './db.js';

/*
 * Everything the title window shows beyond the library list: backdrop, ratings, dates, runtime, language, network/studio,
 * external links. It is fetched for one title when its window opens (Radarr/Sonarr already hold it), so the library list
 * stays small. All values come from a service and are validated here before the browser sees them, because some end up in
 * links and image addresses.
 */
const userError = (msg) => Object.assign(new Error(msg), { userError: true });
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const text = (v, max = 120) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const id = (v) => (v !== null && v !== undefined && ID_RE.test(String(v)) ? String(v) : null);
const httpUrl = (v) => { try { const u = new URL(String(v)); return ['http:', 'https:'].includes(u.protocol) ? u.href : null; } catch { return null; } };
const date = (v) => { const t = Date.parse(v); return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10); };

function ratings(r, isShow) {
  if (!r || typeof r !== 'object') return [];
  const out = [];
  if (isShow) { // Sonarr gives one combined score out of 10
    if (num(r.value) > 0) out.push({ source: 'Rating', display: `${r.value.toFixed(1)}/10`, votes: num(r.votes) });
    return out;
  }
  if (num(r.imdb?.value) > 0) out.push({ source: 'IMDb', display: `${r.imdb.value.toFixed(1)}/10`, votes: num(r.imdb.votes) });
  if (num(r.tmdb?.value) > 0) out.push({ source: 'TMDB', display: `${Math.round(r.tmdb.value * 10)}%`, votes: num(r.tmdb.votes) });
  if (num(r.rottenTomatoes?.value) > 0) out.push({ source: 'Rotten Tomatoes', display: `${Math.round(r.rottenTomatoes.value)}%`, votes: null });
  if (num(r.metacritic?.value) > 0) out.push({ source: 'Metacritic', display: String(Math.round(r.metacritic.value)), votes: null });
  return out;
}

const STATUS = { continuing: 'Returning series', ended: 'Ended', upcoming: 'Upcoming', released: 'Released', inCinemas: 'In cinemas', announced: 'Announced', tba: 'To be announced' };

function normalize(isShow, o) {
  const images = Array.isArray(o.images) ? o.images : [];
  const pick = (type) => httpUrl(images.find((i) => i.coverType === type)?.remoteUrl);
  const links = [];
  const imdb = id(o.imdbId), tmdb = id(o.tmdbId), tvdb = id(o.tvdbId), yt = id(o.youTubeTrailerId);
  if (imdb) links.push({ label: 'IMDb', url: `https://www.imdb.com/title/${imdb}/` });
  if (tmdb) links.push({ label: 'TMDB', url: `https://www.themoviedb.org/${isShow ? 'tv' : 'movie'}/${tmdb}` });
  if (tvdb && isShow) links.push({ label: 'TheTVDB', url: `https://thetvdb.com/dereferrer/series/${tvdb}` });
  const seasons = Array.isArray(o.seasons) ? o.seasons.filter((s) => s.seasonNumber > 0) : [];
  return {
    backdrop: pick('fanart') || pick('banner'),
    ratings: ratings(o.ratings, isShow),
    certification: text(o.certification, 12),
    runtime: num(o.runtime) > 0 ? o.runtime : null,
    status: STATUS[o.status] || null,
    language: text(o.originalLanguage?.name, 40),
    network: text(isShow ? o.network : o.studio, 80),
    firstAired: isShow ? date(o.firstAired) : null,
    inCinemas: isShow ? null : date(o.inCinemas),
    digitalRelease: isShow ? null : date(o.digitalRelease),
    physicalRelease: isShow ? null : date(o.physicalRelease),
    nextAiring: isShow ? date(o.nextAiring) : null,
    seasonCount: isShow ? (num(o.statistics?.seasonCount) ?? seasons.length) : null,
    episodeCount: isShow ? num(o.statistics?.episodeCount) : null,
    totalEpisodeCount: isShow ? num(o.statistics?.totalEpisodeCount) : null,
    episodeFileCount: isShow ? num(o.statistics?.episodeFileCount) : null,
    quality: !isShow ? text(o.movieFile?.quality?.quality?.name, 40) : null,
    collection: !isShow ? text(o.collection?.title ?? o.collection?.name, 80) : null,
    links,
    trailerId: yt, // played in the app; the id was checked above
  };
}

// One title may live in several Radarr/Sonarr instances: take the first value found for each field.
export async function getDetails(key) {
  const { items } = await getLibrary(false);
  const item = items.find((i) => i.key === key);
  if (!item) throw userError('That title was not found in your library. Refresh the library and try again.');
  const isShow = item.type === 'show';
  const byId = Object.fromEntries(getServices().map((s) => [s.id, s]));
  const merged = {};
  const errors = [];
  for (const inst of item.instances) {
    const svc = byId[inst.serviceId];
    if (!svc) continue;
    try {
      const d = normalize(isShow, await api(svc, `/api/v3/${isShow ? 'series' : 'movie'}/${inst.arrId}`));
      for (const [k, v] of Object.entries(d)) {
        const empty = v === null || v === undefined || (Array.isArray(v) && !v.length);
        if (empty) continue;
        if (merged[k] === undefined || (Array.isArray(merged[k]) && !merged[k].length)) merged[k] = v;
      }
    } catch (e) { errors.push(`${svc.name}: ${e.message}`); }
  }

  // Keywords, production countries and streaming providers come from Overseerr, when it is configured.
  const overseerr = overseerrService();
  if (overseerr && item.tmdbId) {
    try {
      const m = await fetchOverseerrMeta(item, overseerr, { withRatings: isShow });
      if (m) {
        // Sonarr gives a show one unnamed score; Overseerr's are named (TMDB, Rotten Tomatoes), so they win when there are any.
        if (m.ratings?.length) merged.ratings = m.ratings;
        setKeywords(item.key, m.keywords); // opening a title also refreshes its cached keywords
        merged.keywords = m.keywords; merged.countries = m.countries; merged.providers = m.providers; merged.region = REGION;
      }
    } catch (e) {
      errors.push(`${overseerr.name}: ${e.message}`);
      const cached = getKeywordMap()[key];
      if (cached) merged.keywords = cached;
    }
  }
  return { key, ...merged, errors };
}
