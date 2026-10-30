import { getServices } from '../lib.js';
import { log } from '../log.js';
import core from './core.js';
import arr from './arr.js';
import overseerr from './overseerr.js';
import media from './media.js';

/*
 * The widget registry. An adapter is one file per service (or group of services) that lists the widgets it can show. A widget is
 * { id, title, kind, requires, refresh, order, control, media, fetch, actions? }:
 *   kind      how the browser draws it: status, stat, list or posters (see src/home/primitives.jsx)
 *   requires  service types it needs, any one of them; leave out for widgets of this app itself
 *   refresh   seconds the data stays fresh: both the server's cache time and how often an open page asks again
 *   control   its place in the Dashboard view (a column span out of 4)
 *   media     how the Media view shows it: 'chip', 'row' or 'hidden'
 *   fetch     returns plain data of that kind
 *   actions   optional { name: async (arg) => ... }: the only things a widget can change, each named
 * Adding a service is one new adapter file listed below; a widget that reuses a kind needs no screen code at all.
 */
const ADAPTERS = [core, arr, overseerr, media];
const DEFS = new Map(ADAPTERS.flatMap((a) => a.widgets.map((w) => [w.id, { ...w, adapter: a.type }])));
const bad = (msg) => Object.assign(new Error(msg), { userError: true });

const have = () => new Set(getServices().map((s) => s.type));
const available = (w, types) => !w.requires || w.requires.some((t) => types.has(t));
const find = (id) => {
  const w = typeof id === 'string' && DEFS.get(id);
  if (!w || !available(w, have())) throw bad('Unknown widget');
  return w;
};

export function listWidgets() {
  const types = have();
  return [...DEFS.values()].filter((w) => available(w, types)).sort((a, b) => a.order - b.order).map((w) => ({
    id: w.id, title: w.title, kind: w.kind, refresh: w.refresh, order: w.order, control: w.control, media: w.media, link: w.link || null,
    write: !!w.actions, service: w.adapter,
  }));
}

const cache = new Map(); // id -> { at, ttl, promise }: one request at a time per widget, shared by everyone who asks
const failing = new Set(); // widgets whose last fetch failed, so one outage is one log line

export async function widgetData(id) {
  const w = find(id);
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.promise;
  const entry = { at: Date.now(), ttl: w.refresh * 1000, promise: null };
  // A failure is answered as data, not as an HTTP error, so one broken service shows as one broken widget. It is retried soon.
  entry.promise = Promise.resolve().then(() => w.fetch()).then(
    (data) => {
      if (failing.delete(id)) log.info('widget', `${id} is working again`);
      return { data, at: new Date().toISOString() };
    },
    (e) => {
      entry.ttl = 10000;
      const error = String(e.message || e).slice(0, 200);
      if (!failing.has(id)) { failing.add(id); log.warn('widget', `${id} failed (logged once until it recovers)`, { err: error }); } // it is retried every few seconds
      return { error, at: new Date().toISOString() };
    },
  );
  cache.set(id, entry);
  return entry.promise;
}

export async function widgetAction(id, action, arg) {
  const w = find(id);
  if (typeof action !== 'string' || !w.actions || !Object.hasOwn(w.actions, action)) throw bad('Unknown action');
  await w.actions[action](arg);
  cache.delete(id); // what it just changed shows on the next look
  return { ok: true };
}

export const resetWidgetCache = () => cache.clear(); // after the services change
