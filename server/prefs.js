import { getSetting, setSetting } from './db.js';

/*
 * Per-account preferences, kept on the server so they follow the person to any browser: how the app looks, and whether adult titles are
 * listed. They live in the settings table under one key per user (0 when sign-in is turned off). The theme, logo and font are only checked
 * for shape here; the app falls back to its default for a name it does not know.
 */
const userError = (msg) => Object.assign(new Error(msg), { userError: true });
const SLUG = /^[a-z0-9-]{1,40}$/;
const WELCOME_MAX = 60;
const keyOf = (req) => `prefs.${req.user?.userId ?? 0}`;

const cleanAppearance = (a) => {
  if (!a || typeof a !== 'object' || Array.isArray(a)) throw userError('Expected the appearance settings');
  const welcome = a.welcome === undefined ? '' : a.welcome;
  if (!SLUG.test(a.theme) || !SLUG.test(a.logo) || !SLUG.test(a.font) || typeof welcome !== 'string') throw userError('Unknown appearance');
  return { theme: a.theme, logo: a.logo, font: a.font, welcome: welcome.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, WELCOME_MAX) };
};

// appearance is null until it has been saved once, so the browser can hand over what it had.
export function getPrefs(req) {
  const p = getSetting(keyOf(req), {});
  let appearance = null;
  try { if (p.appearance) appearance = cleanAppearance(p.appearance); } catch { /* ignore a bad stored value */ }
  return { appearance, showAdult: p.showAdult === true };
}

// Only what is sent changes.
export function setPrefs(req, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw userError('Expected the preferences');
  const next = getPrefs(req);
  if (body.appearance !== undefined) next.appearance = cleanAppearance(body.appearance);
  if (body.showAdult !== undefined) {
    if (typeof body.showAdult !== 'boolean') throw userError('Show adult content must be on or off');
    next.showAdult = body.showAdult;
  }
  setSetting(keyOf(req), next);
  return next;
}
