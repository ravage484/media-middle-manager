// Small helpers for widgets. Everything a widget returns came from another service, so it is cut down to plain values here.
export const str = (v, max = 120) => (typeof v === 'string' && v.trim() ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
export const int = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0);
export const pct = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
export const httpUrl = (v) => { try { const u = new URL(String(v)); return ['http:', 'https:'].includes(u.protocol) ? u.href : null; } catch { return null; } };
export const isoDate = (v) => { const t = Date.parse(v); return Number.isNaN(t) ? null : new Date(t).toISOString(); };

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
export function fmtBytes(n) {
  n = Number(n);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const i = Math.min(UNITS.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${UNITS[i]}`;
}

// A library title as a poster card. Fields match what TitleCard shows; `badge` is optional text on the poster.
export const posterOf = (i, badge) => ({
  tmdbId: Number.isInteger(i.tmdbId) ? i.tmdbId : 0, type: i.type, title: str(i.title, 200), year: Number.isInteger(i.year) ? i.year : null,
  poster: httpUrl(i.poster), rating: typeof i.rating === 'number' ? i.rating : null, status: null, inLibrary: i.key, ...(badge ? { badge } : {}),
});

// "1h 20m", "12m", "3d 4h": a duration in seconds, rounded to what is worth reading. Zero or nonsense gives ''.
export function fmtEta(sec) {
  sec = Number(sec);
  if (!Number.isFinite(sec) || sec <= 0 || sec >= 8640000) return '';
  const m = Math.max(1, Math.round(sec / 60));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${m % 60 ? ` ${m % 60}m` : ''}`;
  return `${Math.floor(h / 24)}d${h % 24 ? ` ${h % 24}h` : ''}`;
}
// Radarr and Sonarr write the time left as [d.]hh:mm:ss.
export const timeleftSec = (v) => { const m = /^(?:(\d+)\.)?(\d+):(\d+):(\d+)/.exec(String(v || '')); return m ? ((+m[1] || 0) * 86400) + (+m[2] * 3600) + (+m[3] * 60) + +m[4] : 0; };
