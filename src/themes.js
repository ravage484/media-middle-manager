// Color themes. `accent`/`accent2` color the necktie logo and the UI; `mark` is the detail color on the tie.
const t = (id, name, bg, panel, panel2, text, dim, accent, accent2, on = '#fff', mark = '#fff') =>
  ({ id, name, bg, panel, panel2, text, dim, accent, accent2, on, mark });

export const THEMES = [
  t('indigo', 'Indigo', '#111827', '#1f2937', '#374151', '#f3f4f6', '#9ca3af', '#6366f1', '#4f46e5'),
  t('boardroom', 'Boardroom', '#0b1220', '#14203a', '#26365a', '#f1f5f9', '#94a3b8', '#d4a017', '#a37c0e', '#0b1220', '#0b1220'),
  t('emerald', 'Emerald', '#0b1713', '#13261f', '#234237', '#ecfdf5', '#8fb8a5', '#10b981', '#059669', '#04201a', '#04201a'),
  t('crimson', 'Crimson', '#190d10', '#2a1519', '#4a2830', '#fef2f2', '#c79ca3', '#ef4444', '#b91c1c'),
  t('ocean', 'Ocean', '#08141c', '#0f2230', '#1d3d52', '#ecfeff', '#8bb3c4', '#06b6d4', '#0e7490', '#042f3a', '#042f3a'),
  t('violet', 'Violet', '#140f21', '#201738', '#3a2c63', '#f5f3ff', '#a899d1', '#8b5cf6', '#6d28d9'),
  t('rose', 'Rose', '#1d0f16', '#301824', '#523044', '#fff1f2', '#d1a1b4', '#ec4899', '#be185d'),
  t('sunset', 'Sunset', '#1a1008', '#2b1a0d', '#4d3118', '#fff7ed', '#cfa982', '#f97316', '#c2410c', '#1a0a00', '#1a0a00'),
  t('slate', 'Slate', '#0f1115', '#1a1d23', '#2d323b', '#f4f4f5', '#9a9fab', '#9ca3af', '#6b7280', '#0f1115', '#0f1115'),
  t('midnight', 'Midnight', '#000000', '#0d0d0d', '#222222', '#e5ffe9', '#7fae8a', '#22ff88', '#00c060', '#000000', '#000000'),
  t('casual', 'Casual Friday', '#f4f1ea', '#ffffff', '#d6d0c2', '#1f2937', '#6b6558', '#0d9488', '#0f766e'),
  // Casual Friday's sibling themes: the same natural, warm light surfaces (each leaning a little toward its color), with the dark themes' names
  t('casual-crimson', 'Casual Crimson', '#f5efeb', '#ffffff', '#dccfc8', '#2a1b1e', '#74625f', '#c4343f', '#9f2530'),
  t('casual-ocean', 'Casual Ocean', '#f1f1ea', '#ffffff', '#d2d4c8', '#1b2a30', '#5f6c6a', '#0e7490', '#155e75'),
  t('casual-sunset', 'Casual Sunset', '#f6efe4', '#ffffff', '#e0d0b8', '#2b1d12', '#78654f', '#c2570c', '#9a3f06'),
  t('casual-emerald', 'Casual Emerald', '#f0f1e8', '#ffffff', '#d0d4c0', '#1d2a22', '#5f6e62', '#15803d', '#116530'),
  t('casual-violet', 'Casual Violet', '#f2eef0', '#ffffff', '#d9cfd6', '#26202e', '#6c6275', '#7c3aed', '#6027c3'),
  t('casual-rose', 'Casual Rose', '#f6eeea', '#ffffff', '#e2d0ca', '#2d1d22', '#7a6268', '#be185d', '#9d1450'),
  t('paper', 'Paper', '#f3f4f6', '#ffffff', '#d1d5db', '#111827', '#6b7280', '#4f46e5', '#3730a3'),
  // Three colors, each as a light theme and a dark one. The dark ones are not inversions: they keep the light one's hue,
  // lift the accent so it reads on a dark surface, and put dark text on filled accent buttons where white would be too faint.
  t('pink-paper', 'Pink Paper', '#f5f5f7', '#ffffff', '#d5d5da', '#1d1d1f', '#6e6e73', '#fc3c6e', '#d62a5a'), // white with pink
  t('pink-night', 'Pink Night', '#151517', '#232326', '#3a3a3f', '#f5f5f7', '#9a9aa1', '#ff4d7e', '#fc3c6e', '#1a0610', '#1a0610'),
  t('silver-blue', 'Silver Blue', '#e6e9ee', '#f7f8fa', '#bfc6d0', '#1c2530', '#566273', '#2f74d6', '#1f58aa'), // brushed silver with blue
  t('graphite-blue', 'Graphite Blue', '#181b20', '#23272e', '#383e48', '#e9edf3', '#96a0ae', '#5aa0ff', '#3b82e6', '#06152b', '#06152b'),
  t('tunes-light', 'Tunes Light', '#fafafa', '#ffffff', '#e0e0e3', '#1c1c1e', '#6c6c70', '#fa243c', '#c91a30'), // white with red
  t('tunes-dark', 'Tunes Dark', '#0a0a0b', '#1c1c1e', '#343437', '#fafafa', '#98989d', '#ff4d5e', '#fa243c', '#1c0306', '#1c0306'),
];

// A theme is light when its page background is: the Appearance screen lists the two kinds apart.
const luma = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
export const isLight = (th) => luma(th.bg) > 0.5;
// Names themes had before they were renamed, so a saved choice (or an imported file) still finds its theme.
const RENAMED = { itunes: 'pink-paper', 'itunes-night': 'pink-night', 'itunes-aqua': 'silver-blue', 'itunes-graphite': 'graphite-blue', 'itunes-music': 'tunes-light', 'itunes-music-dark': 'tunes-dark', 'red-light': 'tunes-light', 'red-dark': 'tunes-dark' };

export const LOGO_STYLES = [
  ['classic', 'Classic'], ['striped', 'Repp stripe'], ['polka', 'Polka dot'], ['skinny', 'Skinny'], ['bowtie', 'Bow tie'],
  ['knit', 'Knit'], ['outline', 'Outline'], ['film', 'Film strip'], ['clip', 'Tie clip'], ['argyle', 'Argyle'],
];

// Fonts are bundled (no CDN) and loaded on demand, so only the chosen one is downloaded.
export const FONTS = [
  { id: 'system', name: 'System', stack: "system-ui, 'Segoe UI', sans-serif" },
  { id: 'inter', name: 'Inter', stack: "'Inter Variable', system-ui, sans-serif", load: () => import('@fontsource-variable/inter/wght.css') },
  { id: 'plex', name: 'IBM Plex Sans', stack: "'IBM Plex Sans Variable', system-ui, sans-serif", load: () => import('@fontsource-variable/ibm-plex-sans/wght.css') },
  { id: 'grotesk', name: 'Space Grotesk', stack: "'Space Grotesk Variable', system-ui, sans-serif", load: () => import('@fontsource-variable/space-grotesk/wght.css') },
  { id: 'nunito', name: 'Nunito', stack: "'Nunito Variable', system-ui, sans-serif", load: () => import('@fontsource-variable/nunito/wght.css') },
  { id: 'playfair', name: 'Playfair Display', stack: "'Playfair Display Variable', Georgia, serif", load: () => import('@fontsource-variable/playfair-display/wght.css') },
  { id: 'merriweather', name: 'Merriweather', stack: "'Merriweather Variable', Georgia, serif", load: () => import('@fontsource-variable/merriweather/wght.css') },
  { id: 'mono', name: 'JetBrains Mono', stack: "'JetBrains Mono Variable', ui-monospace, monospace", load: () => import('@fontsource-variable/jetbrains-mono/wght.css') },
];

const KNOT ='40,6 60,6 66,24 34,24';
const BLADE = '34,24 66,24 80,98 50,124 20,98';
const edge = (y) => 34 - (14 * (y - 24)) / 74; // left edge of the blade at height y
let uid = 0;

export function logoSvg(style, th) {
  const m = th.accent, d = th.accent2, k = th.mark;
  const knot = `<polygon points="${KNOT}" fill="${d}"/>`;
  const blade = `<polygon points="${BLADE}" fill="${m}" stroke="${m}" stroke-width="1" stroke-linejoin="round"/>`;
  const play = `<polygon points="42,48 42,76 64,62" fill="${k}"/>`;
  let body;
  switch (style) {
    case 'striped': {
      const id = `lc${uid++}`;
      const lines = Array.from({ length: 9 }, (_, i) => `<line x1="${i * 16 - 20}" y1="20" x2="${i * 16 + 40}" y2="130"/>`).join('');
      body = `<clipPath id="${id}"><polygon points="${BLADE}"/></clipPath>${knot}${blade}<g clip-path="url(#${id})" stroke="${k}" stroke-opacity=".35" stroke-width="5">${lines}</g>`;
      break;
    }
    case 'polka':
      body = knot + blade + [[50, 40], [40, 58], [60, 58], [50, 76], [38, 92], [62, 92], [50, 108]]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="${k}" fill-opacity=".7"/>`).join('');
      break;
    case 'skinny':
      body = `<polygon points="42,6 58,6 61,22 39,22" fill="${d}"/><polygon points="39,22 61,22 68,100 50,124 32,100" fill="${m}"/><polygon points="44,50 44,72 60,61" fill="${k}"/>`;
      break;
    case 'bowtie':
      body = `<polygon points="8,36 46,60 46,72 8,96" fill="${m}"/><polygon points="92,36 54,60 54,72 92,96" fill="${m}"/><rect x="41" y="55" width="18" height="22" rx="5" fill="${d}"/><polygon points="47,62 47,70 54,66" fill="${k}"/>`;
      break;
    case 'knit':
      body = knot + `<polygon points="34,24 66,24 80,110 20,110" fill="${m}"/>` +
        [40, 54, 68, 82, 96].map((y) => `<line x1="32" y1="${y}" x2="68" y2="${y}" stroke="${k}" stroke-opacity=".3" stroke-width="3"/>`).join('') + play;
      break;
    case 'outline':
      body = `<polygon points="${KNOT}" fill="${m}"/><polygon points="${BLADE}" fill="none" stroke="${m}" stroke-width="6" stroke-linejoin="round"/><polygon points="42,48 42,76 64,62" fill="${m}"/>`;
      break;
    case 'film': {
      const holes = [44, 60, 76, 92].map((y) => `<rect x="${edge(y) + 5}" y="${y}" width="5" height="8" rx="1" fill="${k}" fill-opacity=".6"/><rect x="${100 - edge(y) - 10}" y="${y}" width="5" height="8" rx="1" fill="${k}" fill-opacity=".6"/>`).join('');
      body = knot + blade + holes + play;
      break;
    }
    case 'clip':
      body = knot + blade + play + '<rect x="33" y="33" width="34" height="5" rx="2" fill="#fbbf24"/>';
      break;
    case 'argyle':
      body = knot + blade + [52, 86].map((y) => `<polygon points="50,${y - 14} 62,${y} 50,${y + 14} 38,${y}" fill="${k}" fill-opacity=".55"/>`).join('');
      break;
    default:
      body = knot + blade + play;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 130">${body}</svg>`;
}

/* ---------- apply + persist ---------- */
const KEY = 'appearance';
export const WELCOME_MAX = 60;
export const DEFAULT = { theme: 'indigo', logo: 'classic', font: 'system', welcome: '', showAdult: false }; // showAdult: list adult titles in Discover and Home; welcome: the Home heading; empty keeps "Home"

export function loadAppearance() {
  try {
    const a = JSON.parse(localStorage.getItem(KEY));
    if (a && RENAMED[a.theme]) a.theme = RENAMED[a.theme];
    if (THEMES.some((x) => x.id === a?.theme) && LOGO_STYLES.some(([id]) => id === a?.logo)) {
      return { ...a, font: FONTS.some((f) => f.id === a.font) ? a.font : DEFAULT.font, welcome: typeof a.welcome === 'string' ? a.welcome.slice(0, WELCOME_MAX) : '', showAdult: a.showAdult === true };
    }
  } catch { /* ignore */ }
  return DEFAULT;
}

export function applyAppearance(a) {
  const th = THEMES.find((x) => x.id === a.theme) || THEMES[0];
  const root = document.documentElement.style;
  const vars = { bg: th.bg, panel: th.panel, panel2: th.panel2, text: th.text, dim: th.dim, accent: th.accent, accent2: th.accent2, 'on-accent': th.on };
  for (const [k, v] of Object.entries(vars)) root.setProperty(`--${k}`, v);
  const font = FONTS.find((f) => f.id === a.font) || FONTS[0];
  font.load?.().catch(() => { /* falls back to the next font in the stack */ });
  root.setProperty('--font', font.stack);
  const link = document.querySelector('link[rel="icon"]');
  if (link) link.href = `data:image/svg+xml,${encodeURIComponent(logoSvg(a.logo, th))}`;
  try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* ignore */ }
}
