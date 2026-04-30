// Hero — immersive opener with cover + cinematic backdrop
const { useEffect, useState, useRef } = React;

function Hero({ onBuy }) {
  const [scrollY, setScrollY] = useState(0);
  useEffect(() => {
    const h = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);
  const parallax = Math.min(scrollY * 0.35, 300);
  const fade = Math.max(0, 1 - scrollY / 700);

  return (
    <section className="hero">
      {/* Cinematic backdrop */}
      <div className="hero-cinema" style={{ opacity: fade }}>
        <img src="assets/still-mairee.png" alt="" className="cinema-img" />
        <div className="cinema-veil" />
      </div>

      <div className="hero-bg" style={{ opacity: fade }}>
        <div className="nebula nebula-1" />
        <div className="nebula nebula-2" />
      </div>

      {/* Ink splatters */}
      <svg className="splatter splatter-top" viewBox="0 0 800 400" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <filter id="rough"><feTurbulence baseFrequency="0.8" numOctaves="2" seed="3" /><feDisplacementMap in="SourceGraphic" scale="6" /></filter>
        </defs>
        <g filter="url(#rough)" fill="#e94a7c" opacity="0.55">
          {Array.from({ length: 48 }).map((_, i) => {
            const x = (i * 137) % 800, y = (i * 89) % 180, r = 1 + ((i * 7) % 7);
            return <circle key={i} cx={x} cy={y} r={r} />;
          })}
          {Array.from({ length: 14 }).map((_, i) => {
            const x = 40 + (i * 53) % 760, y1 = (i * 29) % 60, y2 = y1 + 80 + (i * 19) % 180;
            return <line key={`l${i}`} x1={x} y1={y1} x2={x + (i%2?-3:3)} y2={y2} stroke="#e94a7c" strokeWidth={0.7 + (i%3)*0.35} />;
          })}
        </g>
      </svg>

      <div className="hero-inner container">
        <div className="hero-left" style={{ transform: `translateY(${-parallax * 0.15}px)` }}>
          <div className="hero-meta">
            <span className="mono-label">Book I · Mairee</span>
            <span className="mono-label muted">A novel by S. Nyland</span>
          </div>
          <h1 className="hero-title">
            <span className="hero-title-the">The</span>
            <span className="hero-title-main glow-rose">Unfolding</span>
          </h1>
          <p className="hero-tagline">
            Three thousand souls arrive expecting a paradise.
            <br />
            <em>Something has been expecting them.</em>
          </p>
          <div className="hero-ctas">
            <button className="btn btn-primary" onClick={onBuy}>Available Now →</button>
            <a href="#excerpt" className="btn btn-ghost">Read the First Chapter</a>
          </div>
          <div className="hero-listen">
            <span className="mono-label muted">A psychedelic space opera</span>
            <span className="divider-dot" />
            <span className="mono-label muted">Available Now</span>
          </div>
        </div>

        <div className="hero-right" style={{ transform: `translateY(${parallax * 0.1}px) rotate(${-2 + scrollY * 0.005}deg)` }}>
          <div className="cover-wrap">
            <img src="assets/cover.png" alt="The Unfolding — Part I: Mairee, by S. Nyland" className="cover-img" />
            <div className="cover-shadow" />
          </div>
          <div className="cover-caption">
            <span className="mono-label muted">First Edition · Hardcover</span>
          </div>
        </div>
      </div>

      <div className="scroll-cue" style={{ opacity: fade }}>
        <span className="mono-label muted">Scroll · Unfold</span>
        <div className="scroll-line" />
      </div>

      {/* Uplink monologue ticker */}
      <div className="uplink-strip" style={{ opacity: fade }}>
        <span className="up-tag">◉ UPLINK · TRANSMISSION</span>
        <span className="up-body">There is a song in the stone. And if you listen, you can hear the math starting to fail. To unfold. You weren't there. But you're next. — UNKNOWN</span>
      </div>

      <style>{`
        .hero { min-height: 100vh; display: flex; align-items: center; overflow: hidden; position: relative; padding: 140px 0 100px; }
        .hero-cinema { position: absolute; inset: 0; z-index: 0; pointer-events: none; transition: opacity 0.3s; }
        .cinema-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 30%; filter: saturate(0.55) contrast(1.05); opacity: 0.45; }
        .cinema-veil {
          position: absolute; inset: 0;
          background:
            radial-gradient(ellipse at 30% 40%, transparent 0%, rgba(6,22,25,0.6) 45%, rgba(6,22,25,1) 80%),
            linear-gradient(180deg, rgba(6,22,25,0.5) 0%, transparent 30%, rgba(6,22,25,0.85) 100%);
        }
        .hero-bg { position: absolute; inset: 0; z-index: 1; pointer-events: none; transition: opacity 0.3s; }
        .nebula { position: absolute; border-radius: 50%; filter: blur(100px); opacity: 0.35; }
        .nebula-1 { top: -20%; right: -10%; width: 60vw; height: 60vw; background: radial-gradient(circle, rgba(233,74,124,0.45), transparent 60%); }
        .nebula-2 { bottom: -20%; left: -20%; width: 70vw; height: 70vw; background: radial-gradient(circle, rgba(45,91,102,0.5), transparent 60%); }
        .splatter-top { top: 0; left: 0; width: 100%; height: 380px; z-index: 2; }

        .hero-inner { position: relative; z-index: 3; display: grid; grid-template-columns: 1.1fr 1fr; gap: 60px; align-items: center; width: 100%; }
        .hero-meta { display: flex; gap: 24px; align-items: center; margin-bottom: 32px; flex-wrap: wrap; }
        .hero-title { display: flex; flex-direction: column; margin-bottom: 36px; font-family: var(--serif); }
        .hero-title-the { font-size: clamp(1.6rem, 3vw, 2.5rem); letter-spacing: 0.4em; text-transform: uppercase; color: var(--rose); opacity: 0.9; font-weight: 300; margin-bottom: 8px; }
        .hero-title-main { font-size: clamp(4rem, 11vw, 9.5rem); line-height: 0.9; font-weight: 400; letter-spacing: -0.02em; color: var(--ivory); }
        .hero-tagline { font-family: var(--serif); font-size: clamp(1.3rem, 2.2vw, 1.8rem); line-height: 1.35; color: var(--ivory-2); max-width: 520px; margin: 0 0 48px; font-weight: 300; }
        .hero-tagline em { color: var(--rose-soft); font-style: italic; }
        .hero-ctas { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 48px; }
        .hero-listen { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        .divider-dot { width: 4px; height: 4px; border-radius: 50%; background: var(--muted); }

        .hero-right { position: relative; display: flex; flex-direction: column; align-items: center; gap: 16px; transition: transform 0.1s ease-out; }
        .cover-wrap { position: relative; max-width: 420px; width: 100%; }
        .cover-img { width: 100%; display: block; box-shadow: 0 40px 80px rgba(0,0,0,0.7), 0 0 60px rgba(233,74,124,0.25), inset 0 0 0 1px rgba(255,255,255,0.08); border-radius: 2px; }
        .cover-shadow { position: absolute; inset: -20px; background: radial-gradient(ellipse at center, rgba(233,74,124,0.25), transparent 70%); filter: blur(40px); z-index: -1; }
        .cover-caption { text-align: center; }

        .scroll-cue { position: absolute; bottom: 80px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 12px; z-index: 5; transition: opacity 0.3s; }
        .scroll-line { width: 1px; height: 48px; background: linear-gradient(to bottom, var(--rose), transparent); animation: pulseDown 2s ease-in-out infinite; }
        @keyframes pulseDown { 0%, 100% { opacity: 0.3; transform: scaleY(0.6); transform-origin: top; } 50% { opacity: 1; transform: scaleY(1); } }

        .uplink-strip {
          position: absolute; bottom: 0; left: 0; right: 0; z-index: 4;
          display: flex; align-items: center; gap: 20px;
          padding: 14px 32px;
          border-top: 1px solid var(--line);
          background: rgba(6,22,25,0.85);
          backdrop-filter: blur(6px);
          font-family: var(--mono); font-size: 0.74rem;
          letter-spacing: 0.08em;
          overflow: hidden;
          transition: opacity 0.3s;
        }
        .up-tag { color: var(--rose); flex-shrink: 0; letter-spacing: 0.18em; }
        .up-body { color: var(--ivory-2); font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        @media (max-width: 960px) {
          .hero-inner { grid-template-columns: 1fr; gap: 40px; text-align: left; }
          .hero-right { order: -1; max-width: 280px; margin: 0 auto; }
          .scroll-cue { display: none; }
        }
      `}</style>
    </section>
  );
}

window.Hero = Hero;
