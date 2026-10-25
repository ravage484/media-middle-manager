import { useState } from 'react';

// Simple original glyphs in each service's rough brand color. To use an official logo instead,
// put an SVG at public/logos/<type>.svg (e.g. radarr.svg); it takes over automatically.
const SERVICES = {
  radarr: ['#ffc230', '#2b2100', <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M12 12l6-6" /></>],
  sonarr: ['#35c5f4', '#03232e', <><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8M12 17v4" /></>],
  overseerr: ['#6366f1', '#ffffff', <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>],
  prowlarr: ['#e66000', '#ffffff', <><circle cx="10" cy="10" r="6" /><path d="M15 15l6 6" /></>],
  qbittorrent: ['#2f67ba', '#ffffff', <><circle cx="12" cy="12" r="9" /><path d="M12 7v10M8 13l4 4 4-4" /></>],
  plex: ['#e5a00d', '#1f1500', <path d="M8 4l9 8-9 8" strokeWidth="3.5" />],
  tdarr: ['#0b2a5c', '#38e0f0', <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M8 12h8M13 9l3 3-3 3" /></>],
  tautulli: ['#dba01e', '#2a1d00', <path d="M5 20v-8M12 20V5M19 20v-9" strokeWidth="3" />],
};

export default function ServiceIcon({ type, size = 36 }) {
  const [bg, fg, glyph] = SERVICES[type] || SERVICES.overseerr;
  const [custom, setCustom] = useState('idle'); // idle -> ok | bad (no public/logos/<type>.svg)
  return (
    <span className={`svcicon ${custom === 'ok' ? 'real' : ''}`} style={{ width: size, height: size, background: bg, color: fg }} aria-hidden="true">
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{glyph}</svg>
      {custom !== 'bad' && (
        <img src={`/logos/${type}.svg`} alt="" style={{ opacity: custom === 'ok' ? 1 : 0 }}
          onLoad={() => setCustom('ok')} onError={() => setCustom('bad')} />
      )}
    </span>
  );
}
