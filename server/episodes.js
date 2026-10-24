import crypto from 'node:crypto';
import { getLibrary, getServices, api, qb, resetLibraryCache } from './lib.js';
import { addHistory } from './db.js';

/*
 * Delete individual episodes of a show (Sonarr only). The whole-show delete lives in lib.js; this is the same recipe
 * narrowed to chosen episodes:
 *   1. unmonitor those episodes (so nothing downloads them again; their history stays in Sonarr)
 *   2. delete their files, but only for instances where step 1 worked
 *   3. remove torrents, but ONLY ones that nothing else still needs (a season pack serves many episodes)
 *   4. optionally rescan Plex, and log the result
 * Overseerr is deliberately left alone: the show is still there, so its request is still valid.
 */
const userError = (msg) => Object.assign(new Error(msg), { userError: true }); // shown to the user as a 400, not a 500
const pad = (n) => String(n).padStart(2, '0');
export const label = (e) => `S${pad(e.seasonNumber)}E${pad(e.episodeNumber)}`;
const basename = (p) => String(p || '').split(/[\\/]/).pop();

async function findShow(key) {
  const { items } = await getLibrary(false);
  const item = items.find((i) => i.key === key && i.type === 'show');
  if (!item) throw userError('That show was not found in your library. Refresh the library and try again.');
  return item;
}

// Everything Sonarr knows about one series.
async function fetchSeries(svc, seriesId) {
  const [eps, files] = await Promise.all([api(svc, `/api/v3/episode?seriesId=${seriesId}`), api(svc, `/api/v3/episodefile?seriesId=${seriesId}`)]);
  return { eps, files, epById: new Map(eps.map((e) => [e.id, e])), fileById: new Map(files.map((f) => [f.id, f])) };
}

/* ---------- list: seasons and episodes for the picker ---------- */
export async function listEpisodes(key) {
  const item = await findShow(key);
  const byId = Object.fromEntries(getServices().map((s) => [s.id, s]));
  const instances = [];
  for (const inst of item.instances) {
    const svc = byId[inst.serviceId];
    if (!svc) continue;
    const { eps, fileById } = await fetchSeries(svc, inst.arrId);
    const seasons = new Map();
    for (const e of eps) {
      const f = e.hasFile ? fileById.get(e.episodeFileId) : null;
      if (!seasons.has(e.seasonNumber)) seasons.set(e.seasonNumber, []);
      seasons.get(e.seasonNumber).push({
        id: e.id, season: e.seasonNumber, number: e.episodeNumber, label: label(e), title: e.title || '', airDate: e.airDate || null,
        monitored: !!e.monitored, hasFile: !!f, fileId: f ? f.id : null, size: f ? f.size : 0, path: f ? f.relativePath || f.path : '',
        quality: f?.quality?.quality?.name || '',
      });
    }
    instances.push({
      serviceId: inst.serviceId, serviceName: inst.serviceName,
      seasons: [...seasons.entries()].sort((a, b) => a[0] - b[0]).map(([number, episodes]) => ({ number, episodes: episodes.sort((a, b) => a.number - b.number) })),
    });
  }
  return { key, title: item.title, year: item.year, instances };
}

/* ---------- torrents: which can go, which must stay ---------- */
// Returns { remove: Map(hash -> reason), keep: Map(hash -> reason) } for the torrents behind the chosen episodes.
async function analyseTorrents(svc, seriesId, selIds, epById) {
  const out = { remove: new Map(), keep: new Map(), warning: null };
  const hist = await api(svc, `/api/v3/history/series?seriesId=${seriesId}`).catch(() => null);
  if (!Array.isArray(hist)) { out.warning = `${svc.name}: could not read the download history, so no torrents will be removed`; return out; }
  const candidates = new Map(); // lowercase hash -> id as Sonarr wrote it
  for (const r of hist) if (r.downloadId && selIds.has(r.episodeId)) candidates.set(r.downloadId.toLowerCase(), r.downloadId);

  for (const [hash, original] of candidates) {
    // Everything Sonarr has ever linked to this download, across ALL series (one pack can serve several shows).
    let recs = null;
    try {
      const page = await api(svc, `/api/v3/history?page=1&pageSize=500&downloadId=${encodeURIComponent(original)}`);
      if (Array.isArray(page?.records) && (page.totalRecords ?? page.records.length) <= page.records.length) recs = page.records;
    } catch { /* handled below */ }
    if (!recs) { out.keep.set(hash, 'Could not check what else uses this download, so it was left alone'); continue; }

    const users = new Set(); // what still needs it
    let elsewhere = false;
    for (const r of recs) {
      if (r.seriesId !== seriesId) { elsewhere = true; continue; }
      if (selIds.has(r.episodeId)) continue; // being deleted anyway
      const e = epById.get(r.episodeId);
      if (!e || e.hasFile) users.add(e ? label(e) : `episode ${r.episodeId}`); // an episode you keep (or cannot identify)
    }
    if (users.size || elsewhere) {
      const parts = [];
      if (users.size) parts.push([...users].slice(0, 6).join(', ') + (users.size > 6 ? ` and ${users.size - 6} more` : ''));
      if (elsewhere) parts.push('another show');
      out.keep.set(hash, `Still used by ${parts.join(' and ')}`);
    } else out.remove.set(hash, 'Only used by the episodes being deleted');
  }
  return out;
}

/* ---------- plan ---------- */
export async function planEpisodes(key, selection) {
  const item = await findShow(key);
  const svcs = getServices();
  const byId = Object.fromEntries(svcs.map((s) => [s.id, s]));
  const plan = { key, title: item.title, year: item.year, instances: [], blocked: [], torrents: { remove: [], keep: [] }, warnings: [], bytes: 0, episodeCount: 0 };
  const seen = new Set();
  const hashStates = []; // { svc, hash, state }

  for (const sel of selection) {
    const inst = item.instances.find((i) => i.serviceId === sel.serviceId);
    if (!inst || !byId[sel.serviceId]) throw userError('That service does not manage this show');
    if (seen.has(sel.serviceId)) throw userError('The same service appears twice in the selection');
    seen.add(sel.serviceId);
    const svc = byId[sel.serviceId];
    const { eps, epById, fileById } = await fetchSeries(svc, inst.arrId);

    const selected = [];
    for (const id of new Set(sel.episodeIds)) {
      const e = epById.get(id);
      if (!e) throw userError(`Episode ${id} does not belong to this show`);
      if (!e.hasFile || !fileById.has(e.episodeFileId)) { plan.warnings.push(`${svc.name}: ${label(e)} has no file and was skipped`); continue; }
      selected.push(e);
    }
    if (!selected.length) continue;
    const selIds = new Set(selected.map((e) => e.id));

    // One file can hold several episodes (S01E01-E02). Deleting it removes them all, so it needs all of them chosen.
    const files = new Map();
    for (const e of selected) if (!files.has(e.episodeFileId)) files.set(e.episodeFileId, fileById.get(e.episodeFileId));
    for (const [fid, f] of files) {
      const siblings = eps.filter((e) => e.episodeFileId === fid);
      const missing = siblings.filter((e) => !selIds.has(e.id));
      if (missing.length) plan.blocked.push({ serviceId: svc.id, serviceName: svc.name, path: basename(f.relativePath || f.path), episodes: siblings.map(label), missing: missing.map(label) });
    }

    const bytes = [...files.values()].reduce((n, f) => n + (f.size || 0), 0);
    plan.bytes += bytes; plan.episodeCount += selected.length;
    plan.instances.push({
      serviceId: svc.id, serviceName: svc.name, arrId: inst.arrId, bytes,
      episodes: selected.map((e) => ({ id: e.id, label: label(e), title: e.title || '' })),
      files: [...files.values()].map((f) => ({ id: f.id, path: f.path, size: f.size })),
    });
    const t = await analyseTorrents(svc, inst.arrId, selIds, epById);
    if (t.warning) plan.warnings.push(t.warning);
    for (const [hash, reason] of t.remove) hashStates.push({ svc, hash, state: 'remove', reason });
    for (const [hash, reason] of t.keep) hashStates.push({ svc, hash, state: 'keep', reason });
  }

  // Turn hashes into the torrents qBittorrent actually has.
  const hashes = [...new Set(hashStates.map((h) => h.hash))];
  if (hashes.length) {
    for (const q of svcs.filter((s) => s.type === 'qbittorrent')) {
      try {
        for (const t of await qb(q, `/api/v2/torrents/info?hashes=${hashes.join('|')}`)) {
          const st = hashStates.find((h) => h.hash === String(t.hash).toLowerCase());
          if (!st) continue;
          (st.state === 'remove' ? plan.torrents.remove : plan.torrents.keep).push({ serviceId: q.id, serviceName: q.name, hash: t.hash, name: t.name, size: t.size, reason: st.reason });
        }
      } catch (e) { plan.warnings.push(`${q.name}: ${e.message}`); }
    }
  }
  return plan;
}

/* ---------- execute ---------- */
async function rescanPlex(svcs) {
  const steps = [];
  for (const px of svcs.filter((s) => s.type === 'plex')) {
    try {
      const d = await api(px, '/library/sections');
      const secs = (d.MediaContainer.Directory || []).filter((x) => x.type === 'show');
      for (const sec of secs) await api(px, `/library/sections/${sec.key}/refresh`);
      steps.push({ label: `${px.name}: scan ${secs.length} show libraries`, ok: true, detail: '' });
    } catch (e) { steps.push({ label: `${px.name}: scan`, ok: false, detail: e.message }); }
  }
  return steps;
}

export async function executeEpisodes(key, selection, opts) {
  const plan = await planEpisodes(key, selection); // re-planned now: what you saw is not trusted, it is recomputed
  if (plan.blocked.length) throw userError(`A file holds several episodes and not all of them are selected: ${plan.blocked.map((b) => `${b.path} (${b.episodes.join(', ')})`).join('; ')}`);
  if (!plan.instances.length) throw userError('None of the selected episodes has a file to delete');

  const svcs = getServices();
  const byId = Object.fromEntries(svcs.map((s) => [s.id, s]));
  const steps = [];
  const run = async (stepLabel, fn) => {
    try { const r = await fn(); steps.push({ label: stepLabel, ok: true, detail: typeof r === 'string' ? r : '' }); return true; } // an API reply is not a message
    catch (e) { steps.push({ label: stepLabel, ok: false, detail: e.message }); return false; }
  };
  const removedFiles = [];
  const goodInstances = new Set(); // instances where every file went

  for (const inst of plan.instances) {
    const svc = byId[inst.serviceId];
    // 1. unmonitor first, so the files cannot be searched for again
    const ok = await run(`${inst.serviceName}: unmonitor ${inst.episodes.length} episode(s)`, () =>
      api(svc, '/api/v3/episode/monitor', { method: 'PUT', body: { episodeIds: inst.episodes.map((e) => e.id), monitored: false } }));
    if (!ok) { steps.push({ label: `${inst.serviceName}: delete files`, ok: false, detail: 'Skipped: unmonitor failed, removing the files could trigger a re-download' }); continue; }
    // 2. delete the files
    let allGood = true;
    for (const f of inst.files) {
      const good = await run(`${inst.serviceName}: delete file ${basename(f.path)}`, () => api(svc, `/api/v3/episodefile/${f.id}`, { method: 'DELETE' }));
      if (good) removedFiles.push({ service: inst.serviceName, path: f.path, size: f.size }); else allGood = false;
    }
    if (allGood) goodInstances.add(inst.serviceId);
  }

  // 3. torrents nothing else needs (only when every file of that show's instance was deleted)
  if (opts.torrents && plan.torrents.remove.length) {
    if (goodInstances.size !== plan.instances.length) {
      steps.push({ label: 'Torrents', ok: false, detail: 'Skipped: not every file was deleted, so the torrents were left in place' });
    } else {
      const groups = {};
      for (const t of plan.torrents.remove) (groups[t.serviceId] ||= []).push(t);
      for (const [sid, ts] of Object.entries(groups)) {
        await run(`${byId[sid].name}: remove ${ts.length} torrent(s) + data`, () =>
          qb(byId[sid], '/api/v2/torrents/delete', { method: 'POST', form: { hashes: ts.map((t) => t.hash).join('|'), deleteFiles: 'true' } }));
      }
    }
  }
  for (const t of plan.torrents.keep) steps.push({ label: `Kept torrent ${t.name}`, ok: true, detail: t.reason });

  // 4. Plex, then the log
  if (opts.plex && removedFiles.length) steps.push(...(await rescanPlex(svcs)));
  const freedBytes = removedFiles.reduce((n, f) => n + (f.size || 0), 0);
  const names = plan.instances.flatMap((i) => i.episodes.map((e) => e.label));
  addHistory({
    id: crypto.randomUUID(), at: new Date().toISOString(), key, title: `${plan.title}: ${names.length} episode${names.length === 1 ? '' : 's'}`,
    year: plan.year, type: 'episodes', options: opts, episodes: names, freedBytes, removedFiles, steps, ok: steps.filter((s) => !/^Kept torrent/.test(s.label)).every((s) => s.ok),
  });
  resetLibraryCache();
  return { steps, ok: steps.every((s) => s.ok), freedBytes, episodeCount: plan.episodeCount };
}
