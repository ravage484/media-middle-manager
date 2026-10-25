const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// A date for a row: "Today" or "Yesterday", the weekday within the next week ("Thu"), otherwise the date. When the moment has a
// time of day (an episode airing at 9 PM) the time follows. A plain date, which arrives as midnight UTC, has none to show.
export function fmtDay(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const offset = Math.round((startOfDay(t) - startOfDay(Date.now())) / 86400000);
  const d = new Date(t);
  const day = offset === 0 ? 'Today' : offset === -1 ? 'Yesterday' : offset > 0 && offset < 7 ? d.toLocaleDateString(undefined, { weekday: 'short' }) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const dateOnly = /T00:00:00(\.000)?Z$/.test(String(iso));
  return dateOnly ? cap(day) : `${cap(day)} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}
