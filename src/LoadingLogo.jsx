import { useMemo } from 'react';
import { THEMES, logoSvg } from './themes.js';

// The logo as a hanging tie: it swings from the knot and its shadow follows along the floor.
export default function LoadingLogo({ style, theme, size = 150 }) {
  const html = useMemo(() => {
    const tie = logoSvg(style, THEMES.find((x) => x.id === theme) || THEMES[0]).replace('<svg ', '<svg width="100" height="130" ');
    return `<g transform="translate(20 0)"><g class="ll-slide"><ellipse cx="50" cy="142" rx="31" ry="3.5" fill="#000" opacity=".3"/></g><g class="ll-swing">${tie}</g></g>`;
  }, [style, theme]);
  return <svg className="loadinglogo" viewBox="0 0 140 150" style={{ height: size }} role="img" aria-label="Loading" dangerouslySetInnerHTML={{ __html: html }} />;
}
