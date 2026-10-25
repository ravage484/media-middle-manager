export const DAY = 86400000;

// When a title was last "used": its last play, or for a never-watched title the date it was added.
export const lastUse = (i) => (i.watch?.plays && i.watch.last ? i.watch.last * 1000 : Date.parse(i.added) || 0);

// "Not watched in N days". Only titles Tautulli or Plex can speak for count: with no watch data there is nothing to say.
export const stale = (i, days) => !!i.watch && Date.now() - lastUse(i) > days * DAY;
