import { getLibrary, getServices, api } from './lib.js';
import { plexService, plexIndex, matchRows, plexInfo, plexPass } from './plex.js';
import { getPlexMap, plexMetaKeys, setPlexMeta, replacePlexMeta, getSetting, setSetting } from './db.js';
import { getAuto, authHook, newEvery, schedulePeriod } from './keywords.js';

/*
 * What Plex says about each library title (is it in Plex, watched, which collections and playlists), kept in the database so the
 * library can filter by it and a title's menu opens instantly. One sync reads Plex's libraries and playlists in a few requests and
 * rewrites the whole cache. It is kept current by a manual button, the schedule, new titles appearing, and (Plex Pass) Plex's
 * own webhook. Edits made from this app update the title's entry at once.
 */
const hasPlex = () => getServices().some((s) => s.type === 'plex');

let job = { running: false, trigger: null, startedAt: null, finishedAt: null, lastError: null, total: 0, found: 0 };
let pass = { at: 0, v: null };

export async function plexStatus() {
  let plexPassValue = null;
  if (hasPlex()) {
    if (Date.now() - pass.at > 3600000) { pass = { at: Date.now(), v: await plexPass(plexService()).catch(() => null) }; }
    plexPassValue = pass.v;
  }
  const map = getPlexMap();
  const keys = Object.keys(map);
  return { ...job, configured: hasPlex(), plexPass: plexPassValue, cached: keys.length, inPlex: keys.filter((k) => map[k].found).length, lastFull: getSetting('plex.lastFull', null), hookLastReceived: lastHook };
}

const entryFromInfo = (info) => ({
  found: info.found,
  matches: info.matches,
  watched: info.watched,
  collections: [...info.collections.filter((c) => c.member).map((c) => c.title), ...(info.smartMember || [])],
  playlists: info.playlists.filter((p) => p.member).map((p) => p.title),
});

// One title, asked of Plex directly. Used when its menu opens and after a change made here.
export async function refreshEntry(key) {
  const info = await plexInfo(key);
  const entry = entryFromInfo(info);
  setPlexMeta(key, entry);
  return { info, entry };
}

export async function syncPlexData({ trigger = 'manual' } = {}) {
  if (job.running) return plexStatus();
  const svc = plexService(); // throws a clear message when Plex is not set up
  job = { running: true, trigger, startedAt: new Date().toISOString(), finishedAt: null, lastError: null, total: 0, found: 0 };
  const mine = job;
  try {
    const { items } = await getLibrary(true);
    const rows = await plexIndex(svc, true);

    // Playlists: which Plex entries each one holds.
    const inList = new Map(); // ratingKey -> [playlist titles]
    const lists = ((await api(svc, '/playlists?playlistType=video')).MediaContainer.Metadata || []).filter((p) => !p.smart && /^\d{1,12}$/.test(String(p.ratingKey))).slice(0, 100);
    for (const p of lists) {
      for (const x of (await api(svc, `/playlists/${p.ratingKey}/items`)).MediaContainer.Metadata || []) {
        const k = String(x.ratingKey);
        if (!inList.has(k)) inList.set(k, []);
        inList.get(k).push(String(p.title || ''));
      }
    }

    const entries = {};
    for (const item of items) {
      const hits = matchRows(rows, item);
      entries[item.key] = hits.length
        ? {
          found: true,
          matches: hits.map(({ ratingKey, sectionId, section }) => ({ ratingKey, sectionId, section })),
          watched: hits.every((h) => h.watched),
          collections: [...new Set(hits.flatMap((h) => h.collectionTags))],
          playlists: [...new Set(hits.flatMap((h) => inList.get(h.ratingKey) || []))],
        }
        : { found: false, matches: [], watched: null, collections: [], playlists: [] };
    }
    replacePlexMeta(entries);
    setSetting('plex.lastFull', new Date().toISOString());
    mine.total = items.length;
    mine.found = Object.values(entries).filter((e) => e.found).length;
  } catch (e) {
    mine.lastError = String(e.message).slice(0, 200);
  } finally {
    mine.running = false;
    mine.finishedAt = new Date().toISOString();
  }
  return plexStatus();
}

export const plexPayload = async () => ({ map: getPlexMap(), status: await plexStatus() });

/* ---------- Plex's own webhook (needs Plex Pass) ---------- */
// Plex posts multipart/form-data with a JSON "payload" field (and sometimes a thumbnail). Only the event name is read from it.
function eventOf(body, contentType) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!boundary || !Buffer.isBuffer(body)) return null;
  const b = boundary[1] || boundary[2];
  for (const part of body.toString('latin1').split(`--${b}`)) {
    const [head, ...rest] = part.split('\r\n\r\n');
    if (!/name="payload"/i.test(head || '')) continue;
    try { const ev = JSON.parse(Buffer.from(rest.join('\r\n\r\n').replace(/\r\n$/, ''), 'latin1').toString('utf8')).event; return typeof ev === 'string' ? ev : null; } catch { return null; }
  }
  return null;
}

const HOOK_DELAY = Number(process.env.MMM_PLEX_HOOK_DELAY_MS) || 30000; // playing, adding and rating arrive in bursts
const HOOK_EVENTS = new Set(['library.new', 'media.scrobble', 'media.rate']);
let hookTimer = null;
let lastHook = null;
export const plexHookInfo = () => ({ lastReceived: lastHook });

// 200 accepted (also when the event is one that changes nothing here), 401/429 token problems, 404 the Plex webhook is off.
export function acceptPlexHook(req) {
  if (!getAuto().plexWebhook) return 404;
  const code = authHook(req);
  if (code !== 200) return code;
  lastHook = new Date().toISOString();
  const ev = eventOf(req.body, req.headers['content-type']);
  if (ev && HOOK_EVENTS.has(ev)) {
    let tries = 0;
    const run = async () => {
      if (job.running && tries++ < 20) { hookTimer = setTimeout(run, HOOK_DELAY); return; }
      await syncPlexData({ trigger: 'webhook' }).catch(() => {});
    };
    clearTimeout(hookTimer);
    hookTimer = setTimeout(run, HOOK_DELAY);
  }
  return 200;
}

/* ---------- the scheduler: the same switches as the keywords ---------- */
const TICK = Number(process.env.MMM_SCHEDULER_MS) || 60000;
let lastNewCheck = 0;

export async function plexTick() {
  try {
    if (job.running || !hasPlex()) return;
    const auto = getAuto();
    const now = Date.now();
    const period = schedulePeriod(auto);
    const last = Date.parse(getSetting('plex.lastFull', null)) || 0;
    if (period && now - last >= period) { await syncPlexData({ trigger: 'schedule' }); return; }
    if (auto.onNewTitles && now - lastNewCheck >= newEvery()) {
      lastNewCheck = now;
      const have = plexMetaKeys();
      const { items } = await getLibrary(false);
      if (items.some((i) => !have.has(i.key))) await syncPlexData({ trigger: 'new' }); // a title no sync has seen yet
    }
  } catch { /* the next tick tries again */ }
}
setInterval(plexTick, TICK).unref();
setTimeout(plexTick, Math.min(TICK, 30000)).unref();

