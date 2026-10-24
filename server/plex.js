import { getLibrary, getServices, api } from './lib.js';

/*
 * What Plex's own "..." menu does to a title, minus playing it: watched state, refresh/analyze, and collections and playlists
 * (add, remove, create). A library title is found in Plex by its TMDB/TVDB id (or title and year) and every id that goes back
 * into a Plex URL is checked to be a plain number first. Watched state and playlists belong to the account the token is for.
 */
const userError = (msg) => Object.assign(new Error(msg), { userError: true });
const NUM = /^\d{1,12}$/;
const num = (v, what) => { if (!NUM.test(String(v))) throw userError(`Invalid ${what}`); return String(v); };
const norm = (t) => (t || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
const q = (o) => new URLSearchParams(o).toString();
const asList = (r) => r?.MediaContainer?.Metadata || [];

export const plexService = () => {
  const s = getServices().find((x) => x.type === 'plex');
  if (!s) throw userError('Add Plex in Settings first.');
  return s;
};

/* ---------- an index of Plex's movie and show libraries (ids only), kept for a few minutes ---------- */
let index = { at: 0, id: null, rows: [] };
export const resetPlexIndex = () => { index = { at: 0, id: null, rows: [] }; };

export async function plexIndex(svc, force = false) {
  if (!force && index.id === svc.id && Date.now() - index.at < 300000) return index.rows;
  const rows = [];
  const secs = (await api(svc, '/library/sections')).MediaContainer.Directory || [];
  for (const sec of secs.filter((x) => x.type === 'movie' || x.type === 'show')) {
    if (!NUM.test(String(sec.key))) continue;
    for (let start = 0; ;) {
      const r = await api(svc, `/library/sections/${sec.key}/all?${q({ type: sec.type === 'movie' ? 1 : 2, includeGuids: 1, includeCollections: 1, 'X-Plex-Container-Start': start, 'X-Plex-Container-Size': 500 })}`);
      const md = asList(r);
      for (const m of md) {
        if (!NUM.test(String(m.ratingKey))) continue;
        rows.push({
          ratingKey: String(m.ratingKey), sectionId: String(sec.key), section: String(sec.title || ''), type: sec.type, title: String(m.title || ''), year: m.year || 0, guids: (m.Guid || []).map((g) => g.id),
          // A movie is watched once played; a show once every episode is.
          watched: sec.type === 'movie' ? (m.viewCount || 0) > 0 : m.leafCount > 0 && m.viewedLeafCount >= m.leafCount,
          collectionTags: (m.Collection || []).map((c) => String(c.tag)),
        });
      }
      start += md.length;
      if (!md.length || start >= (r.MediaContainer.totalSize ?? r.MediaContainer.size)) break;
    }
  }
  index = { at: Date.now(), id: svc.id, rows };
  return rows;
}

// Which Plex entries (one per library that holds it) are this library title? By TMDB/TVDB id, else by title and year.
export function matchRows(rows, item) {
  const of = rows.filter((r) => r.type === item.type);
  const ids = [item.tmdbId && `tmdb://${item.tmdbId}`, item.tvdbId && `tvdb://${item.tvdbId}`].filter(Boolean);
  const hits = of.filter((r) => r.guids.some((g) => ids.includes(g)));
  return hits.length ? hits : of.filter((r) => norm(r.title) === norm(item.title) && r.year === item.year);
}

async function findInPlex(svc, key) {
  const { items } = await getLibrary(false);
  const item = items.find((i) => i.key === key);
  if (!item) throw userError('That title was not found in your library. Refresh the library and try again.');
  return { item, matches: matchRows(await plexIndex(svc), item) };
}

// Whether the account behind this Plex server has Plex Pass (webhooks need it). null when Plex does not say.
export async function plexPass(svc) {
  const v = (await api(svc, '/')).MediaContainer.myPlexSubscription;
  return typeof v === 'boolean' ? v : null;
}

let machine = { id: null, at: 0 };
async function machineId(svc) {
  if (machine.id && machine.svc === svc.id && Date.now() - machine.at < 3600000) return machine.id;
  const id = (await api(svc, '/')).MediaContainer.machineIdentifier;
  if (typeof id !== 'string' || !/^[A-Za-z0-9]{8,64}$/.test(id)) throw new Error('Plex did not report its server id');
  machine = { id, at: Date.now(), svc: svc.id };
  return id;
}
const uri = async (svc, ratingKey) => `server://${await machineId(svc)}/com.plexapp.plugins.library/library/metadata/${ratingKey}`;

/* ---------- what the menu shows for one title ---------- */
export async function plexInfo(key) {
  const svc = plexService();
  const { matches } = await findInPlex(svc, key);
  const out = { server: svc.name, found: matches.length > 0, matches: matches.map(({ ratingKey, sectionId, section }) => ({ ratingKey, sectionId, section })), watched: null, collections: [], playlists: [] };
  if (!matches.length) return out;

  // Any failure here is reported rather than shown as an empty list, which would look like "in nothing".
  // Watched: a movie has a play count; a show is watched once every episode is.
  const meta = await Promise.all(matches.map((m) => api(svc, `/library/metadata/${m.ratingKey}`).then((r) => asList(r)[0] || {})));
  out.watched = meta.every((m, i) => (matches[i].type === 'movie' ? (m.viewCount || 0) > 0 : m.leafCount > 0 && m.viewedLeafCount >= m.leafCount));

  // Collections in the libraries the title is in. Smart collections fill themselves, so they cannot be edited by hand.
  out.smartMember = [];
  for (const [i, m] of matches.entries()) {
    const inside = new Set((meta[i].Collection || []).map((c) => c.tag));
    const cols = asList(await api(svc, `/library/sections/${m.sectionId}/collections`));
    for (const c of cols) {
      if (c.smart === '1' || c.smart === 1 || c.smart === true) { if (inside.has(c.title)) out.smartMember.push(String(c.title)); continue; }
      if (!NUM.test(String(c.ratingKey))) continue;
      out.collections.push({ id: String(c.ratingKey), title: String(c.title || ''), section: m.section, sectionId: m.sectionId, member: inside.has(c.title) });
    }
  }

  // Playlists: whether this title is in each one needs the playlist's contents.
  const lists = asList(await api(svc, `/playlists?${q({ playlistType: 'video' })}`)).filter((p) => !p.smart && NUM.test(String(p.ratingKey))).slice(0, 60);
  const have = new Set(matches.map((m) => m.ratingKey));
  await Promise.all(lists.map(async (p) => {
    const inList = asList(await api(svc, `/playlists/${p.ratingKey}/items`)).some((x) => have.has(String(x.ratingKey)));
    out.playlists.push({ id: String(p.ratingKey), title: String(p.title || ''), member: inList });
  }));
  out.playlists.sort((a, b) => a.title.localeCompare(b.title));
  out.collections.sort((a, b) => a.title.localeCompare(b.title));
  return out;
}

/* ---------- doing something to one title ---------- */
const title = (v) => {
  const t = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';
  if (!t || t.length > 120) throw userError('Give it a name of 1 to 120 characters');
  return t;
};

export async function plexAct(key, body) {
  const svc = plexService();
  const { matches } = await findInPlex(svc, key);
  if (!matches.length) throw userError('This title is not in Plex yet.');
  const act = body.action;
  const inSection = (sectionId) => {
    const m = matches.find((x) => x.sectionId === String(sectionId));
    if (!m) throw userError('This title is not in that library');
    return m;
  };

  switch (act) {
    case 'watched': for (const m of matches) await api(svc, `/:/scrobble?${q({ key: m.ratingKey, identifier: 'com.plexapp.plugins.library' })}`); return { ok: true };
    case 'unwatched': for (const m of matches) await api(svc, `/:/unscrobble?${q({ key: m.ratingKey, identifier: 'com.plexapp.plugins.library' })}`); return { ok: true };
    case 'refresh': for (const m of matches) await api(svc, `/library/metadata/${m.ratingKey}/refresh`, { method: 'PUT' }); return { ok: true };
    case 'analyze': for (const m of matches) await api(svc, `/library/metadata/${m.ratingKey}/analyze`, { method: 'PUT' }); return { ok: true };

    case 'collection-add': {
      const m = inSection(num(body.sectionId, 'library'));
      await api(svc, `/library/collections/${num(body.id, 'collection')}/items?${q({ uri: await uri(svc, m.ratingKey) })}`, { method: 'PUT' });
      return { ok: true };
    }
    case 'collection-remove': {
      const m = inSection(num(body.sectionId, 'library'));
      await api(svc, `/library/collections/${num(body.id, 'collection')}/items/${m.ratingKey}`, { method: 'DELETE' });
      return { ok: true };
    }
    case 'collection-create': {
      const m = inSection(num(body.sectionId, 'library'));
      const r = await api(svc, `/library/collections?${q({ type: m.type === 'movie' ? 1 : 2, title: title(body.title), smart: 0, sectionId: m.sectionId, uri: await uri(svc, m.ratingKey) })}`, { method: 'POST' });
      return { ok: true, id: asList(r)[0]?.ratingKey ?? null };
    }

    case 'playlist-add': {
      await api(svc, `/playlists/${num(body.id, 'playlist')}/items?${q({ uri: await uri(svc, matches[0].ratingKey) })}`, { method: 'PUT' });
      return { ok: true };
    }
    case 'playlist-remove': {
      const id = num(body.id, 'playlist');
      const want = new Set(matches.map((m) => m.ratingKey));
      const items = asList(await api(svc, `/playlists/${id}/items`)).filter((x) => want.has(String(x.ratingKey)) && NUM.test(String(x.playlistItemID)));
      for (const x of items) await api(svc, `/playlists/${id}/items/${x.playlistItemID}`, { method: 'DELETE' });
      return { ok: true, removed: items.length };
    }
    case 'playlist-create': {
      const r = await api(svc, `/playlists?${q({ type: 'video', title: title(body.title), smart: 0, uri: await uri(svc, matches[0].ratingKey) })}`, { method: 'POST' });
      return { ok: true, id: asList(r)[0]?.ratingKey ?? null };
    }
    default: throw userError('Unknown action');
  }
}
