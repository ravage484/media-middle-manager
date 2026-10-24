import crypto from 'node:crypto';
import { getLibrary, getServices, api } from './lib.js';
import { getKeywordMap, cachedKeywordKeys, setKeywords, getSetting, setSetting } from './db.js';

/*
 * Overseerr's title pages show TMDB "keywords" (detective, island, murder...). Overseerr has no tags of its own, but its API
 * hands out those keywords together with production countries and where a title streams. They are cached in the database
 * so the library can be filtered by keyword without asking again; Overseerr itself needs about a second per title the first
 * time, so filling the cache for a whole library is a background job with progress, not something done on page load.
 *
 * The cache can be kept up to date three ways: by hand, whenever new titles show up in the library, and on a schedule.
 */
const userError = (msg) => Object.assign(new Error(msg), { userError: true });
export const REGION = (process.env.MMM_REGION || 'US').toUpperCase().slice(0, 2); // which country's streaming providers to show
const TMDB_RE = /^\d{1,9}$/;

// Text from another service: keep printable strings only, de-duplicate, and cap how many and how long.
function names(list, maxItems, maxLen) {
  const seen = new Set();
  const out = [];
  for (const x of Array.isArray(list) ? list : []) {
    const n = typeof x === 'string' ? x : x?.name;
    if (typeof n !== 'string') continue;
    const t = n.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLen);
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= maxItems) break;
  }
  return out;
}

export const overseerrService = () => getServices().find((s) => s.type === 'overseerr');

// withRatings: also ask for the scores a title's window shows (TMDB, and Rotten Tomatoes for shows). The background sync does not.
export async function fetchOverseerrMeta(item, svc = overseerrService(), { withRatings = false } = {}) {
  if (!svc || !TMDB_RE.test(String(item.tmdbId))) return null;
  const kind = item.type === 'movie' ? 'movie' : 'tv';
  const [d, rt] = await Promise.all([
    api(svc, `/api/v1/${kind}/${item.tmdbId}`),
    withRatings && kind === 'tv' ? api(svc, `/api/v1/tv/${item.tmdbId}/ratings`).catch(() => null) : null, // Rotten Tomatoes; optional
  ]);
  const where = Array.isArray(d.watchProviders) ? d.watchProviders.find((p) => p.iso_3166_1 === REGION) : null;
  const out = {
    keywords: names(d.keywords, 100, 60),
    countries: names(d.productionCountries, 20, 60),
    providers: names(where?.flatrate, 12, 40),
  };
  if (withRatings) {
    const ratings = [];
    const vote = typeof d.voteAverage === 'number' && Number.isFinite(d.voteAverage) ? d.voteAverage : 0;
    if (vote > 0 && vote <= 10) ratings.push({ source: 'TMDB', display: `${Math.round(vote * 10)}%`, votes: Number.isInteger(d.voteCount) && d.voteCount >= 0 ? d.voteCount : null });
    const critics = rt?.criticsScore;
    if (Number.isInteger(critics) && critics >= 0 && critics <= 100) ratings.push({ source: 'Rotten Tomatoes', display: `${critics}%`, votes: null });
    out.ratings = ratings;
  }
  return out;
}

/* ---------- how the cache is kept up to date ---------- */
const DAY = 86400000;
const PERIOD = { daily: DAY, weekly: 7 * DAY, monthly: 30 * DAY };
const known = (v) => v === 'off' || (typeof v === 'string' && Object.hasOwn(PERIOD, v)); // not PERIOD[v]: '__proto__' and 'toString' are truthy there
const DEFAULT_AUTO = { onNewTitles: true, schedule: 'weekly', webhook: false, plexWebhook: false, checkMinutes: 15 };
const CHECK_CHOICES = [5, 15, 60];

export function getAuto() {
  const s = getSetting('keywords.auto', {});
  return {
    onNewTitles: typeof s.onNewTitles === 'boolean' ? s.onNewTitles : DEFAULT_AUTO.onNewTitles,
    schedule: known(s.schedule) ? s.schedule : DEFAULT_AUTO.schedule,
    webhook: typeof s.webhook === 'boolean' ? s.webhook : DEFAULT_AUTO.webhook,
    plexWebhook: typeof s.plexWebhook === 'boolean' ? s.plexWebhook : DEFAULT_AUTO.plexWebhook,
    checkMinutes: CHECK_CHOICES.includes(s.checkMinutes) ? s.checkMinutes : DEFAULT_AUTO.checkMinutes,
  };
}

// Only the fields that are sent change; anything sent must be valid, and at least one must be sent.
export function setAuto(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw userError('Expected the update settings');
  const next = { ...getAuto() };
  let any = false;
  const has = (k) => o[k] !== undefined && (any = true);
  if (has('onNewTitles')) {
    if (typeof o.onNewTitles !== 'boolean') throw userError('"Update when new titles appear" must be on or off');
    next.onNewTitles = o.onNewTitles;
  }
  if (has('schedule')) {
    if (!known(o.schedule)) throw userError('Choose how often to refresh: off, daily, weekly or monthly');
    next.schedule = o.schedule;
  }
  if (has('webhook')) {
    if (typeof o.webhook !== 'boolean') throw userError('The webhook must be on or off');
    next.webhook = o.webhook;
  }
  if (has('plexWebhook')) {
    if (typeof o.plexWebhook !== 'boolean') throw userError('The Plex webhook must be on or off');
    next.plexWebhook = o.plexWebhook;
  }
  if (has('checkMinutes')) {
    if (!CHECK_CHOICES.includes(o.checkMinutes)) throw userError('Check every 5, 15 or 60 minutes');
    next.checkMinutes = o.checkMinutes;
  }
  if (!any) throw userError('Expected the update settings');
  setSetting('keywords.auto', next);
  if (next.webhook || next.plexWebhook) hookToken(); // make sure there is a token to show
  return next;
}

/* ---------- webhook: Radarr/Sonarr tell us the moment a title is added or imported ---------- */
// The call only says "something changed": nothing in its body is used. The library is re-read from Radarr/Sonarr themselves.
export function hookToken(renew = false) {
  let t = getSetting('keywords.hookToken', null);
  if (renew || typeof t !== 'string' || t.length < 32) { t = crypto.randomBytes(32).toString('hex'); setSetting('keywords.hookToken', t); }
  return t;
}
const HOOK_DELAY = Number(process.env.MMM_HOOK_DELAY_MS) || 5000; // a burst of events (a season import) becomes one run
let lastHook = null;
let hookTimer = null;
const fails = new Map(); // ip -> { n, since }: guesses at the token are throttled

const basicPassword = (h) => {
  const m = /^Basic (.+)$/i.exec(h || '');
  if (!m) return null;
  const d = Buffer.from(m[1], 'base64').toString('utf8');
  return d.slice(d.indexOf(':') + 1);
};

// Checks the token and throttles guessing. Returns the HTTP status to answer with: 200 fine, 401 wrong token, 429 too many wrong tokens.
export function authHook(req) {
  const now = Date.now();
  const f = fails.get(req.ip);
  if (f && now - f.since < 60000 && f.n >= 10) return 429;
  const given = [req.query.token, req.headers['x-webhook-token'], basicPassword(req.headers.authorization)].find((v) => typeof v === 'string' && v);
  const want = Buffer.from(hookToken());
  const have = Buffer.from(given || '');
  if (!given || have.length !== want.length || !crypto.timingSafeEqual(have, want)) {
    fails.set(req.ip, !f || now - f.since >= 60000 ? { n: 1, since: now } : { n: f.n + 1, since: f.since });
    return 401;
  }
  fails.delete(req.ip);
  return 200;
}

// Radarr/Sonarr webhook. 200 accepted, 401 wrong token, 404 webhook is off, 429 too many wrong tokens.
export function acceptHook(req) {
  if (!getAuto().webhook) return 404;
  const code = authHook(req);
  if (code !== 200) return code;
  lastHook = new Date().toISOString();
  let tries = 0;
  const run = async () => {
    if (job.running && tries++ < 60) { hookTimer = setTimeout(run, HOOK_DELAY); return; } // let the current run finish, then look again
    await getLibrary(true).catch(() => {});
    await startSync({ trigger: 'webhook' }).catch(() => {});
  };
  clearTimeout(hookTimer);
  hookTimer = setTimeout(run, HOOK_DELAY);
  return 200;
}

export const schedulePeriod = (auto) => (known(auto.schedule) && auto.schedule !== 'off' ? PERIOD[auto.schedule] : null);

/* ---------- background sync ---------- */
// What went wrong, in words for a person rather than the raw request and response.
function reason(e) {
  const code = /-> ([0-9]{3})(?![0-9])/.exec(String(e.message))?.[1];
  if (code === '404' || /unable to retrieve|not found/i.test(String(e.message))) return "Overseerr couldn't find it";
  if (code === '401' || code === '403') return 'Overseerr refused the API key';
  if (code) return `Overseerr answered with an error (${code})`;
  return "Overseerr couldn't be reached";
}
let job = { running: false, trigger: null, total: 0, done: 0, failed: 0, failures: [], startedAt: null, finishedAt: null, lastError: null, stopping: false };

export function syncStatus() {
  const auto = getAuto();
  const lastFull = getSetting('keywords.lastFull', null); // when a full refresh last started (manual "refresh all" or scheduled)
  const due = auto.schedule !== 'off' && lastFull ? new Date(Date.parse(lastFull) + PERIOD[auto.schedule]).toISOString() : null;
  return { ...job, cached: cachedKeywordKeys().size, auto, lastFull, nextFull: due, hook: { token: auto.webhook || auto.plexWebhook ? hookToken() : null, lastReceived: lastHook } };
}

// trigger: 'manual' (a button), 'new' (found by checking), 'webhook' (Radarr/Sonarr said so) or 'schedule'. Automatic runs with nothing to do stay silent.
export async function startSync({ force = false, trigger = 'manual' } = {}) {
  if (job.running) return syncStatus();
  const svc = overseerrService();
  if (!svc) throw userError('Add Overseerr in Settings first: keywords come from it.');
  const { items } = await getLibrary(false);
  const have = cachedKeywordKeys();
  const todo = items.filter((i) => TMDB_RE.test(String(i.tmdbId)) && (force || !have.has(i.key)));
  if (trigger !== 'manual' && !todo.length) return syncStatus();
  if (force) setSetting('keywords.lastFull', new Date().toISOString());
  job = { running: true, trigger, total: todo.length, done: 0, failed: 0, failures: [], startedAt: new Date().toISOString(), finishedAt: null, lastError: null, stopping: false };
  const mine = job; // a later job must not be updated by an older one still winding down

  const worker = async () => {
    while (todo.length && !mine.stopping) {
      const item = todo.shift();
      try {
        const m = await fetchOverseerrMeta(item, svc);
        if (m) setKeywords(item.key, m.keywords);
      } catch (e) { mine.failed++; const why = reason(e); if (mine.failures.length < 500) mine.failures.push({ title: item.title, year: item.year || null, type: item.type, why }); mine.lastError = why; }
      mine.done++;
    }
  };
  Promise.all(Array.from({ length: 4 }, worker)).finally(() => { mine.running = false; mine.finishedAt = new Date().toISOString(); });
  return syncStatus();
}

export function stopSync() {
  if (job.running) job.stopping = true;
  return syncStatus();
}

export const keywordsPayload = () => ({ map: getKeywordMap(), status: syncStatus() });

/* ---------- the scheduler ---------- */
// Checked once a minute; the intervals below are what is actually waited. Overridable only so the tests do not have to wait.
const TICK = Number(process.env.MMM_SCHEDULER_MS) || 60000;
export const newEvery = () => Number(process.env.MMM_NEW_CHECK_MS) || getAuto().checkMinutes * 60000;
let lastNewCheck = 0;

export async function tick() {
  try {
    if (job.running || !overseerrService()) return;
    const auto = getAuto();
    const now = Date.now();
    const lastFull = Date.parse(getSetting('keywords.lastFull', null)) || 0;
    if (auto.schedule !== 'off' && now - lastFull >= PERIOD[auto.schedule]) {
      await getLibrary(true).catch(() => {});
      await startSync({ force: true, trigger: 'schedule' });
    } else if (auto.onNewTitles && now - lastNewCheck >= newEvery()) {
      lastNewCheck = now;
      await getLibrary(true).catch(() => {}); // a fresh look at Radarr/Sonarr, so titles added since the last visit are seen
      await startSync({ trigger: 'new' });
    }
  } catch { /* the next tick tries again */ }
}
setInterval(tick, TICK).unref();
setTimeout(tick, Math.min(TICK, 30000)).unref();
