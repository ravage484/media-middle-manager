import { useEffect } from 'react';
import Logo from './Logo.jsx';
import { THEMES, LOGO_STYLES, FONTS } from './themes.js';

export default function Appearance({ appearance, setAppearance }) {
  const { theme, logo, font } = appearance;
  useEffect(() => { FONTS.forEach((f) => f.load?.().catch(() => {})); }, []); // so each tile previews in its own font
  const pick = (patch) => setAppearance({ ...appearance, ...patch });
  return (
    <div className="appearance">
      <h3>Theme</h3>
      <div className="tiles">
        {THEMES.map((t) => (
          <button key={t.id} className={`choice ${t.id === theme ? 'on' : ''}`} onClick={() => pick({ theme: t.id })}
            style={{ background: t.bg, color: t.text, borderColor: t.id === theme ? t.accent : t.panel2 }}>
            <Logo style={logo} theme={t.id} size={44} />
            <b>{t.name}</b>
            <span className="swatches">{[t.bg, t.panel, t.accent, t.accent2].map((c) => <i key={c} style={{ background: c, borderColor: t.panel2 }} />)}</span>
          </button>
        ))}
      </div>

      <h3>Logo style</h3>
      <div className="tiles">
        {LOGO_STYLES.map(([id, name]) => (
          <button key={id} className={`choice ${id === logo ? 'on' : ''}`} onClick={() => pick({ logo: id })}>
            <Logo style={id} theme={theme} size={44} />
            <b>{name}</b>
          </button>
        ))}
      </div>

      <h3>Font</h3>
      <div className="tiles">
        {FONTS.map((f) => (
          <button key={f.id} className={`choice ${f.id === font ? 'on' : ''}`} style={{ fontFamily: f.stack }} onClick={() => pick({ font: f.id })}>
            <span className="aa">Aa</span>
            <b>{f.name}</b>
            <small>Movies &amp; Shows 1080p</small>
          </button>
        ))}
      </div>

      <details className="matrix">
        <summary>Show every combination ({LOGO_STYLES.length * THEMES.length})</summary>
        <div className="matrixgrid">
          {THEMES.map((t) => (
            <div key={t.id} className="mrow" style={{ background: t.bg, color: t.text }}>
              <span className="mname">{t.name}</span>
              {LOGO_STYLES.map(([id, name]) => (
                <button key={id} title={`${t.name} / ${name}`} className={t.id === theme && id === logo ? 'on' : ''}
                  onClick={() => pick({ theme: t.id, logo: id })}>
                  <Logo style={id} theme={t.id} size={36} />
                </button>
              ))}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
