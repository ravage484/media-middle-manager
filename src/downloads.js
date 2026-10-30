import { useEffect, useState } from 'react';
import { api } from './api.js';

// Where each library title's download stands ({ "movie:603": "stalled" }), asked for again every 15 seconds while the page is in view.
// Titles that are not downloading are simply absent.
export const DOWNLOAD_LABEL = { downloading: ['Downloading', 'warn'], attention: ['Needs attention', 'warn'], stalled: ['Stalled', 'bad'] };

export function useDownloads() {
  const [states, setStates] = useState({});
  useEffect(() => {
    let live = true;
    const load = () => { if (!document.hidden) api.downloads().then((d) => live && setStates(d.states || {})).catch(() => {}); };
    load();
    const t = setInterval(load, 15000);
    return () => { live = false; clearInterval(t); };
  }, []);
  return states;
}
