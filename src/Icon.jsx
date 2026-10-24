// Small inline SVG icon set. Inline SVG needs no font download, is crisp at any size, and takes its color from the text.
const PATHS = {
  chevronDown: 'M6 9l6 6 6-6',
  chevronUp: 'M6 15l6-6 6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  chevronsLeft: 'M11 7l-5 5 5 5M18 7l-5 5 5 5',
  chevronsRight: 'M6 7l5 5-5 5M13 7l5 5-5 5',
  arrowDown: 'M12 5v14M6 13l6 6 6-6',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5L20 7',
  filter: 'M3 5h18l-7 8v6l-4 2v-8z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3',
  shield: 'M12 3l8 3v6c0 4.5-3.2 8.2-8 9-4.8-.8-8-4.5-8-9V6zM9 12l2 2 4-4',
  more: 'M12 5h.01M12 12h.01M12 19h.01',
  folder: 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eyeOff: 'M3 3l18 18M10.6 6.1A9.7 9.7 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6A17 17 0 0 0 2 12s4 7 10 7a9.5 9.5 0 0 0 4-.9M9.9 9.9a3 3 0 0 0 4.2 4.2',
  refresh: 'M21 12a9 9 0 1 1-3-6.7M21 4v5h-5',
  analyze: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  info: 'M12 8h.01M11 12h1v5h1M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6',
  plus: 'M12 5v14M5 12h14',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
};

export default function Icon({ name, size = 16, className = '', ...rest }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={PATHS[name]} />
    </svg>
  );
}

// ✓ / ✗ / warning marks used in result lists.
export const Mark = ({ ok, warn }) => (ok ? <Icon name="check" size={15} className="mark ok" /> : <Icon name={warn ? 'alert' : 'x'} size={15} className={`mark ${warn ? 'warn' : 'bad'}`} />);
