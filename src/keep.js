import { useEffect, useState } from 'react';
import { api } from './api.js';

// The Keep list ("leave this out of Stale") is shared by every screen: a change made in the Stale tab shows on a title's window,
// and the other way round, without each screen asking the server again.
let map = null; // key -> the date it was marked, or null until first loaded
let loading = null;
const subs = new Set();
const emit = () => subs.forEach((f) => f());

const load = () => (loading ||= api.keepList().then((d) => { map = d.keep; emit(); }).catch(() => { map = map || {}; emit(); }).finally(() => { loading = null; }));

export function useKeep() {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    subs.add(f);
    if (!map) load();
    return () => subs.delete(f);
  }, []);
  return {
    map: map || {},
    ready: !!map,
    isKept: (key) => !!map?.[key],
    // keys: a title key or a list of them
    set: async (keys, on) => {
      const d = await api.keepSet(Array.isArray(keys) ? keys : [keys], on);
      map = d.keep;
      emit();
    },
  };
}
