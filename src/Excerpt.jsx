// Excerpt — cinematic experience promo. No inline text. Just the invitation.
function Excerpt() {
  const { useEffect, useRef, useState } = React;
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { threshold: 0.2 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <section id="excerpt" className={`xp-section ${visible ? 'xp-in' : ''}`} ref={ref}>
      <div className="container">
        <div
          className={`xp-card ${hovered ? 'xp-hovered' : ''}`}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {/* Background layers */}
          <div className="xp-bg" />
          <div className="xp-veil" />
          <div className="xp-noise" />

          {/* Waveform SVG — suggests audio without showing text */}
          <div className="xp-wave-wrap" aria-hidden="true">
            <svg className="xp-wave" viewBox="0 0 800 80" preserveAspectRatio="none">
              {Array.from({ length: 80 }, (_, i) => {
                const x = i * 10 + 5;
                const seed = Math.sin(i * 0.7) * 0.5 + Math.sin(i * 1.3) * 0.3 + Math.sin(i * 0.2) * 0.2;
                const h = 8 + Math.abs(seed) * 52;
                const y = 40 - h / 2;
                return (
                  <rect
                    key={i}
                    x={x - 1.5}
                    y={y}
                    width={3}
                    height={h}
                    rx={1.5}
                    className={`xp-bar xp-bar-${i % 4}`}
                  />
                );
              })}
            </svg>
          </div>

          {/* Content */}
          <div className="xp-content">
            <div className="xp-top">
              <span className="xp-label">◉ Interactive Reader — Free</span>
            </div>

            <div className="xp-mid">
              <h2 className="xp-headline">
                Hear the story.<br/>
                <em>As it was meant to be told.</em>
              </h2>
              <p className="xp-desc">
                Charlotte narrates. Characters speak in their own voices.
                The music shifts with the scene. You read along, word by word.
              </p>
            </div>

            <div className="xp-bottom">
              {/* The CTA */}
              <a href="reader.html" className="xp-btn" aria-label="Open the interactive reader">
                <span className="xp-btn-glow" />
                <span className="xp-btn-rings">
                  <span className="xp-ring" />
                  <span className="xp-ring xp-ring-2" />
                </span>
                <span className="xp-btn-play">▶</span>
                <span className="xp-btn-text">
                  <span className="xp-btn-main">Listen &amp; Read</span>
                  <span className="xp-btn-sub">Chapter One — Free</span>
                </span>
              </a>

              {/* Feature pills */}
              <div className="xp-pills">
                {[
                  '▶ Narrated',
                  '◉ Full cast',
                  '♪ Soundscape',
                  '◈ Wiki links',
                  '💬 Threads',
                ].map(p => <span key={p} className="xp-pill">{p}</span>)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        /* ── Section ──────────────────────────────────── */
        .xp-section {
          padding: 100px 0 120px;
          opacity: 0;
          transform: translateY(28px);
          transition: opacity 0.8s cubic-bezier(0.22,1,0.36,1),
                      transform 0.8s cubic-bezier(0.22,1,0.36,1);
        }
        .xp-section.xp-in {
          opacity: 1;
          transform: none;
        }

        /* ── Card ─────────────────────────────────────── */
        .xp-card {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(233,74,124,0.2);
          border-radius: 4px;
          min-height: 380px;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          cursor: default;
          transition: border-color 0.4s, box-shadow 0.4s;
        }
        .xp-card.xp-hovered {
          border-color: rgba(233,74,124,0.55);
          box-shadow:
            0 0 60px rgba(233,74,124,0.12),
            0 0 120px rgba(233,74,124,0.05),
            inset 0 0 40px rgba(233,74,124,0.04);
        }

        /* ── Background ───────────────────────────────── */
        .xp-bg {
          position: absolute; inset: 0;
          background:
            radial-gradient(ellipse at 20% 50%, rgba(233,74,124,0.18) 0%, transparent 55%),
            radial-gradient(ellipse at 80% 20%, rgba(45,91,102,0.22) 0%, transparent 50%),
            radial-gradient(ellipse at 60% 80%, rgba(233,74,124,0.08) 0%, transparent 45%),
            linear-gradient(135deg, #061619 0%, #0b2227 50%, #0a1a1f 100%);
          transition: opacity 0.4s;
        }
        .xp-card.xp-hovered .xp-bg {
          opacity: 1.15;
        }
        .xp-veil {
          position: absolute; inset: 0;
          background: linear-gradient(
            180deg,
            transparent 0%,
            transparent 40%,
            rgba(6,22,25,0.7) 75%,
            rgba(6,22,25,0.95) 100%
          );
          pointer-events: none;
        }
        .xp-noise {
          position: absolute; inset: 0;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.04 0'/></filter><rect width='180' height='180' filter='url(%23n)'/></svg>");
          pointer-events: none;
          mix-blend-mode: overlay;
        }

        /* ── Waveform ─────────────────────────────────── */
        .xp-wave-wrap {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 100%;
          display: flex;
          align-items: center;
          padding: 0;
          pointer-events: none;
        }
        .xp-wave {
          width: 100%;
          height: 80px;
          opacity: 0.18;
          transition: opacity 0.4s;
        }
        .xp-card.xp-hovered .xp-wave { opacity: 0.28; }
        .xp-bar { fill: var(--rose); }
        /* Animate bars in groups */
        .xp-bar-0 { animation: xpBar 2.1s ease-in-out infinite; }
        .xp-bar-1 { animation: xpBar 2.1s ease-in-out 0.35s infinite; }
        .xp-bar-2 { animation: xpBar 2.1s ease-in-out 0.7s infinite; }
        .xp-bar-3 { animation: xpBar 2.1s ease-in-out 1.05s infinite; }
        @keyframes xpBar {
          0%, 100% { transform: scaleY(1);    opacity: 0.6; }
          50%       { transform: scaleY(1.35); opacity: 1;   }
        }
        /* Pause animation when not hovered — subtle not distracting */
        .xp-card:not(.xp-hovered) .xp-bar {
          animation-play-state: paused;
        }

        /* ── Content ──────────────────────────────────── */
        .xp-content {
          position: relative;
          z-index: 2;
          padding: 48px 52px 44px;
          display: flex;
          flex-direction: column;
          gap: 28px;
        }
        .xp-top {
          display: flex;
          align-items: center;
        }
        .xp-label {
          font-family: var(--mono);
          font-size: 0.64rem;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: var(--rose);
          opacity: 0.8;
        }

        /* ── Headline ─────────────────────────────────── */
        .xp-mid { max-width: 680px; }
        .xp-headline {
          font-family: var(--serif);
          font-size: clamp(1.9rem, 3.5vw, 3rem);
          font-weight: 300;
          line-height: 1.12;
          color: var(--ivory);
          margin: 0 0 16px;
        }
        .xp-headline em {
          color: var(--rose);
          font-style: italic;
        }
        .xp-desc {
          font-family: var(--serif);
          font-size: 1.08rem;
          line-height: 1.65;
          color: var(--ivory-2);
          font-weight: 300;
          margin: 0;
          opacity: 0.85;
        }

        /* ── Bottom row ───────────────────────────────── */
        .xp-bottom {
          display: flex;
          align-items: center;
          gap: 28px;
          flex-wrap: wrap;
        }

        /* ── CTA Button ───────────────────────────────── */
        .xp-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 16px;
          padding: 18px 34px 18px 26px;
          background: rgba(233,74,124,0.12);
          border: 1px solid rgba(233,74,124,0.55);
          border-radius: 60px;
          text-decoration: none;
          color: var(--ivory);
          transition: background 0.25s, border-color 0.25s, box-shadow 0.25s, transform 0.15s;
          box-shadow:
            0 0 36px rgba(233,74,124,0.22),
            inset 0 0 24px rgba(233,74,124,0.05);
          flex-shrink: 0;
        }
        .xp-btn:hover {
          background: rgba(233,74,124,0.2);
          border-color: rgba(233,74,124,0.9);
          box-shadow:
            0 0 60px rgba(233,74,124,0.42),
            0 0 120px rgba(233,74,124,0.14),
            inset 0 0 28px rgba(233,74,124,0.08);
          transform: translateY(-2px);
          color: var(--ivory);
        }
        .xp-btn:active {
          transform: scale(0.97) translateY(0);
        }

        /* Glow blob behind button */
        .xp-btn-glow {
          position: absolute;
          inset: -20px;
          border-radius: 80px;
          background: radial-gradient(ellipse, rgba(233,74,124,0.25) 0%, transparent 70%);
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.3s;
        }
        .xp-btn:hover .xp-btn-glow { opacity: 1; }

        /* Pulsing rings */
        .xp-btn-rings {
          position: absolute;
          inset: -1px;
          border-radius: 60px;
          pointer-events: none;
        }
        .xp-ring {
          position: absolute; inset: 0;
          border-radius: 60px;
          border: 1px solid rgba(233,74,124,0.4);
          animation: xpRing 2.6s ease-out infinite;
        }
        .xp-ring-2 { animation-delay: 1.3s; }
        @keyframes xpRing {
          0%   { transform: scale(1);    opacity: 0.5; }
          70%  { transform: scale(1.22); opacity: 0; }
          100% { transform: scale(1.22); opacity: 0; }
        }
        .xp-btn:hover .xp-ring { animation: none; opacity: 0; }

        /* Play icon */
        .xp-btn-play {
          font-size: 1.1rem;
          color: var(--rose);
          flex-shrink: 0;
          transition: transform 0.2s;
          line-height: 1;
        }
        .xp-btn:hover .xp-btn-play { transform: scale(1.2); }

        /* Text stack */
        .xp-btn-text {
          display: flex;
          flex-direction: column;
          gap: 3px;
          align-items: flex-start;
        }
        .xp-btn-main {
          font-family: var(--mono);
          font-size: 0.78rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--ivory);
          font-weight: 500;
        }
        .xp-btn-sub {
          font-family: var(--mono);
          font-size: 0.58rem;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--muted);
        }

        /* ── Feature pills ────────────────────────────── */
        .xp-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .xp-pill {
          font-family: var(--mono);
          font-size: 0.6rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--muted);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 30px;
          padding: 5px 12px;
          background: rgba(255,255,255,0.03);
          white-space: nowrap;
          transition: border-color 0.2s, color 0.2s;
        }
        .xp-btn:hover ~ .xp-pills .xp-pill,
        .xp-pill:hover {
          color: var(--ivory-2);
          border-color: rgba(255,255,255,0.18);
        }

        /* ── Mobile ───────────────────────────────────── */
        @media (max-width: 720px) {
          .xp-section { padding: 64px 0 80px; }
          .xp-card { min-height: 320px; }
          .xp-content { padding: 32px 24px 28px; gap: 20px; }
          .xp-headline { font-size: clamp(1.5rem, 6vw, 2rem); }
          .xp-desc { font-size: 0.95rem; }
          .xp-btn { padding: 15px 24px 15px 20px; }
          .xp-btn-main { font-size: 0.7rem; }
          .xp-bottom { gap: 18px; }
          .xp-pills { gap: 6px; }
          .xp-pill { font-size: 0.55rem; padding: 4px 10px; }
        }
      `}</style>
    </section>
  );
}

window.Excerpt = Excerpt;
