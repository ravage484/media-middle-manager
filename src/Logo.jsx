import { useMemo } from 'react';
import { THEMES, logoSvg } from './themes.js';

export default function Logo({ style, theme, size = 28 }) {
  const th = THEMES.find((x) => x.id === theme) || THEMES[0];
  const html = useMemo(() => logoSvg(style, th), [style, th]);
  return <span className="logo" style={{ height: size }} dangerouslySetInnerHTML={{ __html: html }} />;
}
