import { getKeepMap, setKeepMany, replaceKeep, addKeepEntries } from './db.js';

/*
 * "Keep": titles you have said the Stale list should leave alone. It does not stop anything being deleted anywhere else; it only
 * hides a title from Stale until the mark is removed. Titles are addressed by library key (movie:603, show:81189).
 */
const userError = (msg) => Object.assign(new Error(msg), { userError: true });
export const KEY_RE = /^(movie|show):[A-Za-z0-9@._-]{1,120}$/;
const when = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : new Date().toISOString());

export const keepMap = () => getKeepMap();

export function setKeep(keys, on) {
  if (!Array.isArray(keys) || !keys.length || keys.length > 1000 || !keys.every((k) => typeof k === 'string' && KEY_RE.test(k))) throw userError('Expected a list of 1 to 1000 titles');
  if (typeof on !== 'boolean') throw userError('Say whether to keep or to stop keeping');
  setKeepMany([...new Set(keys)], on);
  return getKeepMap();
}

// For an export file.
export const keepForExport = () => Object.entries(getKeepMap()).map(([key, at]) => ({ key, at }));

// From an import file (untrusted): only well-formed entries are used. merge adds to what is there; replace swaps it.
export function keepFromImport(list, mode) {
  if (!Array.isArray(list)) return 0;
  const good = list.filter((e) => e && typeof e.key === 'string' && KEY_RE.test(e.key)).slice(0, 20000).map((e) => [e.key, when(e.at)]);
  if (mode === 'replace') { replaceKeep(good); return good.length; }
  const have = getKeepMap();
  const fresh = good.filter(([k]) => !(k in have));
  addKeepEntries(fresh);
  return fresh.length;
}
