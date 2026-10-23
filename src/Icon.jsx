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
