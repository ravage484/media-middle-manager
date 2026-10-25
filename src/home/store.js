import { useEffect, useState } from 'react';
import { api } from '../api.js';

/*
 * One shared copy of each widget's data. Every view that shows a widget reads from here, so flipping between Dashboard and Media
 * never fetches again, and a widget is refreshed at its own pace for as long as something on screen is using it.
 */
const entries = new Map(); // id -> { state, subs, timer, refresh }

const get = (id, refresh) => {
  let e = entries.get(id);
  if (!e) { e = { state: { data: null, error: '', at: 0, loading: false }, subs: new Set(), timer: 0, refresh, inflight: false }; entries.set(id, e); }
  e.refresh = refresh;
  return e;
};
const publish = (e, patch) => { e.state = { ...e.state, ...patch }; e.subs.forEach((f) => f()); };

async function load(id) {
  const e = entries.get(id);
  if (!e || e.inflight) return;
  e.inflight = true;
  publish(e, { loading: true });
  try {
    const r = await api.widgetData(id);
    publish(e, r.error ? { error: r.error, loading: false, at: Date.now() } : { data: r.data, error: '', loading: false, at: Date.now() }); // old data stays through a failed refresh
  } catch (err) { publish(e, { error: err.message, loading: false, at: Date.now() }); }
  e.inflight = false;
}

function start(id) {
  const e = entries.get(id);
  if (Date.now() - e.state.at > e.refresh * 1000) load(id);
  if (!e.timer) e.timer = setInterval(() => { if (!document.hidden) load(id); }, e.refresh * 1000);
}
function stop(id) {
  const e = entries.get(id);
  if (e && !e.subs.size) { clearInterval(e.timer); e.timer = 0; }
}

// active: false while the Home tab is not on screen, so nothing is fetched for a page nobody is looking at.
export function useWidget(w, active = true) {
  const e = get(w.id, w.refresh);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const f = () => tick((n) => n + 1);
    e.subs.add(f);
    start(w.id);
    return () => { e.subs.delete(f); stop(w.id); };
  }, [w.id, active]);
  return { ...e.state, reload: () => load(w.id) };
}

export const refreshWidget = (id) => { if (entries.has(id)) load(id); }; // fetch again now, if anything is showing it

// What a widget can change goes through here; afterwards its data is fetched again.
export async function widgetAction(id, action, arg) {
  await api.widgetAction(id, action, arg);
  await load(id);
}

// The list of widgets the configured services make possible.
export function useManifest() {
  const [m, setM] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.widgets().then((d) => setM(d.widgets)).catch((e) => setErr(e.message)); }, []);
  return { widgets: m, err };
}
