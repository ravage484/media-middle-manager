// Where a title stands, in Overseerr's words, for a badge: [label, tone] or null. Being in Radarr or Sonarr does not mean it is here:
// a title that was only requested is in there too (monitored, no file), so "In library" is kept for what is really on disk.
// r: { status (Overseerr's media status), inLibrary (its library key, if Radarr/Sonarr know it), onDisk }
const OVERSEERR = { 2: ['Pending', 'warn'], 3: ['Processing', 'warn'], 4: ['Partially available', 'warn'], 5: ['Available', 'ok'] };

export function statusOf(r) {
  if (r.status === 4) return OVERSEERR[4]; // some of it is missing, whatever Radarr or Sonarr hold
  if (r.onDisk) return ['In library', 'ok'];
  if (OVERSEERR[r.status]) return OVERSEERR[r.status];
  return r.inLibrary ? ['Not on disk', 'dim'] : null; // known to Radarr or Sonarr, not requested, nothing downloaded
}
