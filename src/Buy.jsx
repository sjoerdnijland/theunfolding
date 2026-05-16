// Buy section — Live launch with smart store routing
function Buy() {
  const { useState: useState_B, useRef: useRef_B, useEffect: useEffect_B } = React;
  const [visible, setVisible] = useState_B(false);
  const [countryHint, setCountryHint] = useState_B(null);
  const ref = useRef_B(null);

  // Universal Kobo link — strips /nl/nl/ locale → works in 190+ countries
  const KOBO_UNIVERSAL = 'https://www.kobo.com/ww/en/ebook/the-unfolding-15';
  const BOL_NL = 'https://www.bol.com/nl/nl/p/the-unfolding/9300000279913241/';
  const BOOKMUNDO = 'https://publishnl.bookmundo.com/books/22065296';
  const GOODREADS = 'https://www.goodreads.com/book/show/251501817-the-unfolding';

  // Amazon Kindle — region-aware via ASIN (same book ID across all Amazon TLDs)
  const AMAZON_ASIN = 'B0GX32VNTY';
  const AMAZON_TLD_BY_REGION = {
    NL: 'nl', BE: 'nl',
    GB: 'co.uk', UK: 'co.uk', IE: 'co.uk',
    DE: 'de', AT: 'de', CH: 'de',
    FR: 'fr', LU: 'fr',
    IT: 'it',
    ES: 'es',
    SE: 'se',
    PL: 'pl',
    CA: 'ca',
    AU: 'com.au', NZ: 'com.au',
    JP: 'co.jp',
    IN: 'in',
    MX: 'com.mx',
    BR: 'com.br',
    AE: 'ae', SA: 'sa',
    SG: 'sg',
    TR: 'com.tr',
  };
  const amazonTld = AMAZON_TLD_BY_REGION[countryHint] || 'com';
  const AMAZON_URL = amazonTld === 'com'
    ? `https://www.amazon.com/dp/${AMAZON_ASIN}`
    : `https://www.amazon.${amazonTld}/-/en/dp/${AMAZON_ASIN}`;

  useEffect_B(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.15 });
    if (ref.current) obs.observe(ref.current);
    // Detect locale for store hint — no API needed
    const lang = navigator.language || navigator.languages?.[0] || '';
    const region = lang.split('-')[1]?.toUpperCase() || lang.toUpperCase();
    setCountryHint(region);
    return () => obs.disconnect();
  }, []);

  // Pick primary store based on detected region
  const isNL = countryHint === 'NL' || countryHint === 'BE';
  return (
    <section id="buy" className={`buy-live ${visible ? 'buy-visible' : ''}`} ref={ref}>
      <div className="container">

        <div className="bl-head">
          <span className="mono-label">III / Get the Book</span>
          <h2 className="bl-title">
            The Unfolding<br/>
            <em>is out now.</em>
          </h2>
          <p className="bl-sub">eBook available today · Hardcover arriving June 1st</p>
        </div>

        <div className="bl-formats">

          {/* eBook card */}
          <div className="bl-card" style={{ animationDelay: '0s' }}>
            <div className="bl-card-top">
              <div className="bl-card-label">eBook</div>
              <div className="bl-card-price">€12.50</div>
            </div>

{/* All stores — always visible, Bol only for NL/BE */}
            <div className="bl-store-list">
              <a href={KOBO_UNIVERSAL} className="bl-store-btn" target="_blank" rel="noopener">
                <span className="bl-store-arrow">→</span>Kobo <span className="bl-store-note">190+ countries</span>
              </a>
              <a href={AMAZON_URL} className="bl-store-btn" target="_blank" rel="noopener">
                <span className="bl-store-arrow">→</span>Amazon Kindle <span className="bl-store-note">amazon.{amazonTld}</span>
              </a>
              {isNL && (
                <a href={BOL_NL} className="bl-store-btn" target="_blank" rel="noopener">
                  <span className="bl-store-arrow">→</span>Bol.com <span className="bl-store-note">Nederland / België</span>
                </a>
              )}
              <a href={BOOKMUNDO} className="bl-store-btn" target="_blank" rel="noopener">
                <span className="bl-store-arrow">→</span>Bookmundo
              </a>
            </div>
          </div>

          {/* Hardcover card */}
          <div className="bl-card bl-card--soon" style={{ animationDelay: '0.12s' }}>
            <div className="bl-card-top">
              <div className="bl-card-label">Hardcover</div>
              <div className="bl-card-price">June 1st</div>
            </div>
            <p className="bl-card-note">First edition</p>
            <div className="bl-soon-badge">Coming 1 June 2026</div>
          </div>

        </div>

        {/* Text CTAs */}
        <div className="bl-reader-cta">
          <a href="reader.html" className="bl-action-link">
            ▶ Read the first chapter free
          </a>
          <span className="bl-sep">·</span>
          <a href={GOODREADS} className="bl-action-link" target="_blank" rel="noopener">
            ★ Add on Goodreads
          </a>
        </div>
        {/* Social icon bar */}
        <div className="bl-social-bar">
          <a href="https://www.instagram.com/theunfoldingbook" className="bl-social-btn" target="_blank" rel="noopener" title="Instagram @theunfoldingbook">
            <img src="meta/insta.png" width="22" height="22" alt="Instagram" style={{borderRadius:'4px'}} />
          </a>
          <a href="https://discord.gg/45bwdn8J" className="bl-social-btn" target="_blank" rel="noopener" title="Join our Discord">
            <img src="meta/discord.png" width="22" height="22" alt="Discord" />
          </a>
        </div>

      </div>

      <style>{`
        .buy-live {
          padding: 140px 0;
          background: linear-gradient(180deg, transparent, rgba(45,91,102,0.06), transparent);
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.8s cubic-bezier(0.22,1,0.36,1), transform 0.8s cubic-bezier(0.22,1,0.36,1);
        }
        .buy-live.buy-visible { opacity: 1; transform: none; }

        .bl-head { text-align: center; margin-bottom: 56px; }
        .bl-title {
          font-family: var(--serif);
          font-size: clamp(2.4rem, 5vw, 4rem);
          font-weight: 300; line-height: 1.05;
          color: var(--ivory); margin: 16px 0 14px;
        }
        .bl-title em { color: var(--rose); font-style: italic; }
        .bl-sub {
          font-family: var(--serif); font-style: italic;
          color: var(--muted); font-size: 1.05rem; margin: 0;
        }

        .bl-formats {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 20px; max-width: 780px; margin: 0 auto 40px;
        }
        .bl-card {
          border: 1px solid var(--line-strong); padding: 28px 24px;
          display: flex; flex-direction: column; gap: 14px;
          background: rgba(6,22,25,0.5);
          transition: border-color 0.25s, box-shadow 0.25s;
          animation: blCardIn 0.6s cubic-bezier(0.22,1,0.36,1) both;
        }
        @keyframes blCardIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: none; }
        }
        .bl-card:not(.bl-card--soon):hover {
          border-color: rgba(233,74,124,0.45);
          box-shadow: 0 0 28px rgba(233,74,124,0.08);
        }
        .bl-card--soon {
          border-style: dashed;
          overflow: hidden;
          background:
            linear-gradient(180deg, rgba(6,22,25,0.82), rgba(6,22,25,0.92)),
            url('assets/hardcover-stack.png') center / cover no-repeat;
          transition: background 0.4s ease, border-color 0.25s;
        }
        .bl-card--soon:hover {
          background:
            linear-gradient(180deg, rgba(6,22,25,0.65), rgba(6,22,25,0.82)),
            url('assets/hardcover-stack.png') center / cover no-repeat;
        }

        .bl-card-top {
          display: flex; align-items: baseline;
          justify-content: space-between; gap: 12px;
        }
        .bl-card-label {
          font-family: var(--mono); font-size: 0.62rem;
          letter-spacing: 0.28em; text-transform: uppercase; color: var(--muted);
        }
        .bl-card-price {
          font-family: var(--serif); font-size: 1.4rem;
          font-weight: 300; color: var(--ivory);
        }
        .bl-card--soon .bl-card-price {
          font-family: var(--mono); font-size: 0.72rem;
          letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted);
        }
        .bl-card-note {
          font-family: var(--mono); font-size: 0.6rem;
          letter-spacing: 0.14em; color: var(--muted);
          margin: -4px 0 0; text-transform: uppercase;
        }

        /* Primary store button */
        .bl-store-btn {
          display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px;
          padding: 10px 14px;
          border: 1px solid var(--line); background: transparent;
          color: var(--ivory); font-family: var(--mono);
          font-size: 0.68rem; letter-spacing: 0.14em; text-transform: uppercase;
          text-decoration: none; border-radius: 2px;
          transition: border-color 0.2s, color 0.2s, background 0.2s, padding-left 0.2s;
        }
        .bl-store-btn:hover {
          border-color: var(--rose); color: var(--rose);
          background: rgba(233,74,124,0.06); padding-left: 18px;
        }
        .bl-store-primary {
          border-color: rgba(233,74,124,0.4);
          background: rgba(233,74,124,0.06);
          color: var(--ivory);
        }
        .bl-store-tag {
          display: block; width: 100%;
          font-size: 0.55rem; letter-spacing: 0.12em;
          color: var(--muted); text-transform: uppercase;
          margin-top: 2px; padding-left: 16px;
        }
        .bl-store-note {
          font-size: 0.55rem; color: var(--muted);
          letter-spacing: 0.1em; text-transform: none; font-style: italic;
        }
        .bl-store-arrow {
          color: var(--rose); font-size: 0.75rem;
          flex-shrink: 0;
          transition: transform 0.2s;
        }
        .bl-store-btn:hover .bl-store-arrow { transform: translateX(3px); }

        /* More stores details/summary */
        .bl-more-stores { margin-top: 2px; }
        .bl-more-toggle {
          font-family: var(--mono); font-size: 0.6rem;
          letter-spacing: 0.16em; text-transform: uppercase;
          color: var(--muted); cursor: pointer;
          list-style: none; padding: 6px 0;
          transition: color 0.2s;
        }
        .bl-more-toggle:hover { color: var(--ivory); }
        .bl-more-toggle::-webkit-details-marker { display: none; }
        .bl-store-list {
          display: flex; flex-direction: column; gap: 6px;
          padding-top: 8px;
        }

        /* Coming soon badge */
        .bl-soon-badge {
          font-family: var(--mono); font-size: 0.6rem;
          letter-spacing: 0.2em; text-transform: uppercase;
          color: var(--muted); border: 1px dashed var(--line);
          padding: 10px 14px; text-align: center; border-radius: 2px;
        }

        .bl-actions {
          display: flex; align-items: center; justify-content: center;
          gap: 14px; flex-wrap: wrap;
          max-width: 780px; margin: 0 auto;
          padding-top: 28px; border-top: 1px solid var(--line);
        }
        .bl-action-link {
          display: inline-flex; align-items: center; gap: 7px;
          font-family: var(--mono); font-size: 0.66rem;
          letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--muted); text-decoration: none;
          transition: color 0.2s;
        }
        .bl-action-link:hover { color: var(--ivory); }
        .bl-sep { color: var(--line-strong); font-size: 1rem; }

        .bl-reader-cta {
          display: flex; align-items: center; justify-content: center;
          gap: 14px; flex-wrap: wrap;
          max-width: 780px; margin: 0 auto 16px;
          padding-top: 28px; border-top: 1px solid var(--line);
        }
        .bl-social-bar {
          display: flex; align-items: center; justify-content: center;
          gap: 10px; max-width: 780px; margin: 0 auto;
        }
        .bl-social-btn {
          display: flex; align-items: center; justify-content: center;
          width: 40px; height: 40px;
          border: 1px solid var(--line); border-radius: 6px;
          background: rgba(255,255,255,0.03);
          transition: border-color 0.2s, background 0.2s, transform 0.15s;
          text-decoration: none;
        }
        .bl-social-btn:hover {
          border-color: var(--line-strong);
          background: rgba(255,255,255,0.08);
          transform: translateY(-2px);
        }
        @media (max-width: 620px) {
          .buy-live { padding: 80px 0 100px; }
          .bl-formats { grid-template-columns: 1fr; max-width: 420px; }
          .bl-actions { gap: 10px; }
          .bl-sep { display: none; }
        }
      `}</style>
    </section>
  );
}

window.Buy = Buy;
