export const DAY = 86400000;

// When a title was last "used": its last play, or for a never-watched title the date it was added.
export const lastUse = (i) => (i.watch?.plays && i.watch.last ? i.watch.last * 1000 : Date.parse(i.added) || 0);

// "Not watched in N days". Only titles Tautulli or Plex can speak for count: with no watch data there is nothing to say.
export const stale = (i, days) => !!i.watch && Date.now() - lastUse(i) > days * DAY;

/*
 * The stale scale: how stale a title is, 0 (fresh) to 100 (a fossil), from two things: how long it has gone unwatched, and how much
 * of its time in your library that has been. Two years idle is the top of the scale. A title that has never been played has been
 * idle for its whole life, so it scores highest for its age; one watched often but not lately is less stale than one never touched.
 *   score = 100 x idle/730 days (capped) x (0.65 + 0.35 x the share of its life in the library it has been idle)
 */
export const BANDS = [[20, 'Fresh'], [40, 'Cooling'], [60, 'Stale'], [80, 'Moldy'], [101, 'Fossil']];
const SCALE_DAYS = 730;

export function staleness(i) {
  const idle = Math.max(0, (Date.now() - lastUse(i)) / DAY);
  const added = Date.parse(i.added);
  const age = Number.isFinite(added) ? Math.max(idle, (Date.now() - added) / DAY) : idle; // in the library at least as long as it has been idle
  const share = age > 0 ? Math.min(1, idle / age) : 1;
  const score = Math.round(100 * Math.min(1, idle / SCALE_DAYS) * (0.65 + 0.35 * share));
  const never = !(i.watch?.plays && i.watch.last);
  return { score, label: BANDS.find(([max]) => score < max)[1], idle: Math.round(idle), age: Math.round(age), never, hue: Math.round(120 - 1.2 * score) };
}
