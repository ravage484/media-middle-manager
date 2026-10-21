const KEY = 'deleteDefaults';
export const DELETE_DEFAULTS = { overseerr: 'delete', files: true, torrents: true, plex: true };

export function getDeleteDefaults() {
  try { return { ...DELETE_DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return DELETE_DEFAULTS; }
}
export function setDeleteDefaults(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ }
}
