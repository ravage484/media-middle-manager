const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// A date for a row: "Today" or "Yesterday", the weekday within the next week ("Thu"), otherwise the date. When the moment has a
// time of day (an episode airing at 9 PM, shown in local time) the time follows. A plain calendar date (a movie's release day,
// which arrives as midnight UTC) is flagged by the caller and has none to show.
export function fmtDay(iso, dateOnly = false) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  // A plain date is a calendar day, not a moment: read it as that day here, or west of UTC midnight UTC falls on the evening before.
  const u = new Date(t);
  const d = dateOnly ? new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate()) : u;
  const offset = Math.round((startOfDay(d.getTime()) - startOfDay(Date.now())) / 86400000);
  const day = offset === 0 ? 'Today' : offset === -1 ? 'Yesterday' : offset > 0 && offset < 7 ? d.toLocaleDateString(undefined, { weekday: 'short' }) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return dateOnly ? cap(day) : `${cap(day)} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}
