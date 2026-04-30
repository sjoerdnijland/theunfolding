// Nav + Tweaks panel
const { useState: useState_N, useEffect: useEffect_N } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "rose",
  "heroVariant": "split",
  "grainIntensity": 8,
  "serifFont": "cormorant"
}/*EDITMODE-END*/;

function Nav({ onOpenTweaks, tweaksOn }) {
  const [scrolled, setScrolled] = useState_N(false);
  useEffect_N(() => {
    const h = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', h);
    return () => window.removeEventListener('scroll', h);
  }, []);
  return (
    <nav className={`nav ${scrolled?'nav-scrolled':''}`}>
      <a href="#top" className="nav-logo">
        <span className="nav-flower" aria-hidden="true">
          <svg className="flower-svg" viewBox="0 0 32 32" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
            <g className="flower-petals">
              <ellipse cx="16" cy="9.1" rx="2.2" ry="4.8" fill="#e94a7c" opacity="0.9"/>
              <ellipse cx="16" cy="9.1" rx="2.2" ry="4.8" fill="#e94a7c" opacity="0.9" transform="rotate(60 16 16)"/>
              <ellipse cx="16" cy="9.1" rx="2.2" ry="4.8" fill="#e94a7c" opacity="0.9" transform="rotate(120 16 16)"/>
              <ellipse cx="16" cy="9.1" rx="2.2" ry="4.8" fill="#e94a7c" opacity="0.9" transform="rotate(180 16 16)"/>
              <ellipse cx="16" cy="9.1" rx="2.2" ry="4.8" fill="#e94a7c" opacity="0.9" transform="rotate(240 16 16)"/>
              <ellipse cx="16" cy="9.1" rx="2.2" ry="4.8" fill="#e94a7c" opacity="0.9" transform="rotate(300 16 16)"/>
            </g>
            <circle cx="16" cy="16" r="5" fill="#e94a7c" opacity="0.3" className="flower-glow"/>
            <circle cx="16" cy="16" r="3.8" fill="#e94a7c" className="flower-centre"/>
            <circle cx="16" cy="16" r="1.8" fill="#f39bb4" className="flower-highlight"/>
          </svg>
        </span>
        <span>THE UNFOLDING</span>
      </a>
      <div className="nav-links">
        <a href="index.html#synopsis">Story</a>
        <a href="index.html#excerpt">Excerpt</a>
        <a href="wiki.html">Wiki</a>
        <a href="reader.html" target="_blank" rel="noopener">Read</a>
        <a href="map.html" target="unfolding-map" rel="noopener">Map</a>
        <a href="index.html#author">Author</a>
        <a href="index.html#buy" className="nav-buy-btn always-show">Buy Now</a>
      </div>
      <style>{`
        .nav-scrolled {
          background: rgba(6,22,25,0.92) !important;
          border-bottom: 1px solid var(--line);
        }

        /* ── Flower ── */
        .nav-flower {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .flower-svg {
          overflow: visible;
          filter: drop-shadow(0 0 6px rgba(233,74,124,0.7));
        }

        /* Petals start collapsed (scale 0) and unfold on load */
        .flower-petals {
          transform-origin: 16px 16px;
          animation: petalUnfold 1.1s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s both;
        }
        @keyframes petalUnfold {
          0%   { transform: scale(0) rotate(-60deg); opacity: 0; }
          60%  { opacity: 1; }
          100% { transform: scale(1) rotate(0deg);   opacity: 1; }
        }

        .flower-glow {
          transform-origin: 16px 16px;
          animation: glowPulse 2.8s ease-in-out 1.4s infinite;
        }
        @keyframes glowPulse {
          0%, 100% { transform: scale(1);   opacity: 0.3; }
          50%       { transform: scale(1.5); opacity: 0.6; }
        }

        /* Hover: rotate slowly */
        .nav-logo:hover .flower-petals {
          animation: petalSpin 3s linear infinite;
        }
        @keyframes petalSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .nav-logo:hover .flower-svg {
          filter: drop-shadow(0 0 10px rgba(233,74,124,0.95));
        }

        /* Buy button */
        .nav-buy-btn {
          padding: 6px 16px;
          border: 1px solid var(--rose);
          background: transparent;
          color: var(--rose) !important;
          font-family: var(--mono);
          font-size: 0.68rem;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          text-decoration: none;
          border-radius: 2px;
          transition: background 0.2s, color 0.2s;
          white-space: nowrap;
        }
        .nav-buy-btn:hover {
          background: var(--rose);
          color: #060810 !important;
        }
      `}</style>
    </nav>
  );
}

function Tweaks({ visible, values, onChange }) {
  if (!visible) return null;
  return (
    <div className="tweaks-panel">
      <div className="tw-head">
        <span className="mono-label">Tweaks</span>
        <span className="tw-sub">Live preview — changes persist</span>
      </div>
      <div className="tw-group">
        <label className="tw-label">Accent color</label>
        <div className="tw-row">
          {[
            { id: 'rose',   swatch: '#e94a7c', label: 'Rose' },
            { id: 'teal',   swatch: '#3b7682', label: 'Teal' },
            { id: 'saffron', swatch: '#f4ce74', label: 'Saffron' },
            { id: 'violet', swatch: '#c4a6ff', label: 'Violet' },
          ].map(c => (
            <button key={c.id}
              className={`tw-sw ${values.accent===c.id?'on':''}`}
              onClick={() => onChange({ accent: c.id })}
              title={c.label}
            >
              <span className="tw-dot" style={{ background: c.swatch }} />
              <span>{c.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="tw-group">
        <label className="tw-label">Hero layout</label>
        <div className="tw-row">
          {[
            { id: 'split', label: '□|□ Split' },
            { id: 'centered', label: '◉ Centered' },
            { id: 'minimal', label: '— Minimal' },
          ].map(h => (
            <button key={h.id}
              className={`tw-pill ${values.heroVariant===h.id?'on':''}`}
              onClick={() => onChange({ heroVariant: h.id })}
            >{h.label}</button>
          ))}
        </div>
      </div>
      <div className="tw-group">
        <label className="tw-label">Grain intensity · {values.grainIntensity}</label>
        <input type="range" min="0" max="20" value={values.grainIntensity}
          onChange={e => onChange({ grainIntensity: +e.target.value })}
        />
      </div>
      <div className="tw-group">
        <label className="tw-label">Display font</label>
        <div className="tw-row">
          {[
            { id: 'cormorant', label: 'Cormorant' },
            { id: 'playfair', label: 'Playfair' },
            { id: 'spectral', label: 'Spectral' },
          ].map(f => (
            <button key={f.id}
              className={`tw-pill ${values.serifFont===f.id?'on':''}`}
              onClick={() => onChange({ serifFont: f.id })}
            >{f.label}</button>
          ))}
        </div>
      </div>

      <style>{`
        .tweaks-panel {
          position: fixed;
          right: 24px; bottom: 24px;
          width: 320px;
          background: rgba(6,22,25,0.97);
          border: 1px solid var(--rose);
          box-shadow: 0 30px 80px rgba(0,0,0,0.6);
          padding: 20px;
          z-index: 200;
          backdrop-filter: blur(10px);
        }
        .tw-head { display: flex; justify-content: space-between; align-items: baseline; padding-bottom: 14px; margin-bottom: 14px; border-bottom: 1px solid var(--line); }
        .tw-sub { font-family: var(--mono); font-size: 0.66rem; color: var(--muted); letter-spacing: 0.1em; }
        .tw-group { margin-bottom: 18px; }
        .tw-label { display: block; font-family: var(--mono); font-size: 0.72rem; color: var(--muted); letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 10px; }
        .tw-row { display: flex; gap: 6px; flex-wrap: wrap; }
        .tw-sw {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 10px; border: 1px solid var(--line); background: transparent;
          color: var(--ivory); font-family: var(--mono); font-size: 0.7rem;
          border-radius: 2px;
        }
        .tw-sw.on { border-color: var(--rose); background: rgba(233,74,124,0.14); }
        .tw-dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
        .tw-pill {
          padding: 6px 12px; border: 1px solid var(--line); background: transparent;
          color: var(--ivory); font-family: var(--mono); font-size: 0.7rem;
          letter-spacing: 0.1em; border-radius: 2px;
        }
        .tw-pill.on { border-color: var(--rose); background: rgba(233,74,124,0.14); color: var(--rose); }
        .tweaks-panel input[type=range] { width: 100%; accent-color: var(--rose); }
      `}</style>
    </div>
  );
}

window.Nav = Nav;
window.Tweaks = Tweaks;
window.TWEAK_DEFAULTS = TWEAK_DEFAULTS;
