// ── Shared Supabase client for the homepage ──────────────
const SUPA_URL = 'https://sscpikfblqtmcefegrpv.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzY3Bpa2ZibHF0bWNlZmVncnB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNzUzMzgsImV4cCI6MjA5Mjk1MTMzOH0.I9qzVnzmiYxwZ6RPLV7KWva8P9L0Q1MHFqgmlmr3g0g';
const STRIPE_PAYMENT_LINK = 'https://buy.stripe.com/3cIdRagb87TygHedtP4ko0B';
const EPUB_BUCKET_NAME = 'ebooks';
const EPUB_OBJECT_NAME = 'the-unfolding.epub';

// Initialise once, share across components on the homepage
if (!window._homepageDb && window.supabase) {
  window._homepageDb = window.supabase.createClient(SUPA_URL, SUPA_KEY);
}

// ── Direct-buy card (Discord sign-in + Stripe + EPUB download) ──
function DirectBuyCard() {
  const { useState: useState_DB, useEffect: useEffect_DB } = React;
  const [user, setUser]       = useState_DB(null);
  const [paid, setPaid]       = useState_DB(false);
  const [loading, setLoading] = useState_DB(true);

  const db = window._homepageDb;

  async function refreshPaid(u) {
    if (!u || !db) { setPaid(false); return; }
    const { count, error } = await db.from('purchases')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'paid');
    if (error) { console.warn('paid check failed:', error); setPaid(false); return; }
    setPaid((count || 0) > 0);
  }

  useEffect_DB(() => {
    if (!db) { setLoading(false); return; }
    let sub;
    db.auth.getSession().then(async ({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      await refreshPaid(u);
      setLoading(false);
    });
    const { data } = db.auth.onAuthStateChange(async (_evt, session) => {
      const u = session?.user ?? null;
      setUser(u);
      await refreshPaid(u);
    });
    sub = data?.subscription;
    return () => sub?.unsubscribe?.();
  }, []);

  async function signIn(provider = 'discord') {
    if (!db) return;
    await db.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin + window.location.pathname,
        scopes: provider === 'discord' ? 'identify email guilds.join' : undefined,
      },
    });
  }

  async function signOut() {
    if (!db) return;
    await db.auth.signOut();
    setPaid(false);
  }

  function buyLink() {
    if (!user) return '#';
    const params = new URLSearchParams({ client_reference_id: user.id });
    if (user.email) params.set('prefilled_email', user.email);
    return `${STRIPE_PAYMENT_LINK}?${params}`;
  }

  async function downloadEpub(e) {
    if (e) e.preventDefault();
    if (!db || !user) return;
    const { data, error } = await db.storage
      .from(EPUB_BUCKET_NAME)
      .createSignedUrl(EPUB_OBJECT_NAME, 600, { download: 'the-unfolding.epub' });
    if (error || !data?.signedUrl) {
      console.warn('EPUB signed-url failed:', error);
      alert('Could not generate the download link. Please refresh and try again.');
      return;
    }
    window.location.href = data.signedUrl;
  }

  if (loading) {
    return (
      <div className="bl-card bl-card--direct">
        <div className="bl-card-top">
          <div className="bl-card-label">Direct — author</div>
          <div className="bl-card-price">€12.50</div>
        </div>
        <div className="bl-direct-note" style={{ opacity: 0.6 }}>Loading…</div>
      </div>
    );
  }

  // ── State: signed in + paid ──
  if (user && paid) {
    const name = user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.custom_claims?.global_name || 'you';
    return (
      <div className="bl-card bl-card--direct bl-card--owned">
        <div className="bl-card-top">
          <div className="bl-card-label">You own this</div>
          <div className="bl-card-price" style={{ color: '#7fb289' }}>✓</div>
        </div>
        <p className="bl-card-note" style={{ color: 'var(--ivory)', textTransform: 'none', letterSpacing: 0, fontSize: '0.9rem', fontFamily: 'var(--serif)' }}>
          Welcome back, {name}.
        </p>
        <div className="bl-direct-actions">
          <a href="reader.html" className="bl-direct-btn bl-direct-btn--primary">→ Open Reader</a>
          <button type="button" onClick={downloadEpub} className="bl-direct-btn">📖 Download EPUB</button>
        </div>
        <button type="button" onClick={signOut} className="bl-direct-signout">Sign out</button>
      </div>
    );
  }

  // ── State: signed in + not paid ──
  if (user && !paid) {
    const name = user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.custom_claims?.global_name || 'reader';
    return (
      <div className="bl-card bl-card--direct">
        <div className="bl-card-top">
          <div className="bl-card-label">Direct — author</div>
          <div className="bl-card-price">€12.50</div>
        </div>
        <p className="bl-direct-note">
          Hi <strong>{name}</strong> — one-time purchase, instant online access + EPUB download.
        </p>
        <div className="bl-direct-actions">
          <a href={buyLink()} className="bl-direct-btn bl-direct-btn--primary">→ Buy direct — €12.50</a>
        </div>
        <div className="bl-direct-tag">Best margin for the author · no retailer cut</div>
        <button type="button" onClick={signOut} className="bl-direct-signout">Not you? Sign out</button>
      </div>
    );
  }

  // ── State: anonymous ──
  return (
    <div className="bl-card bl-card--direct">
      <div className="bl-card-top">
        <div className="bl-card-label">Direct — author</div>
        <div className="bl-card-price">€12.50</div>
      </div>
      <p className="bl-direct-note">
        Sign in once, then buy direct. Includes <strong>online reading access</strong> for all 24 chapters and the <strong>EPUB download</strong>.
      </p>
      <div className="bl-direct-actions">
        <button type="button" onClick={() => signIn('discord')} className="bl-direct-btn bl-direct-btn--primary">
          ◎ Sign in with Discord
        </button>
      </div>
      <div className="bl-direct-tag">Best margin for the author · no retailer cut</div>
      <div className="bl-direct-providers-soon">Google &amp; Microsoft sign-in coming soon</div>
    </div>
  );
}

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

          {/* Direct-buy card — sign in + Stripe + EPUB download */}
          <DirectBuyCard />

          {/* Retailers card */}
          <div className="bl-card" style={{ animationDelay: '0.06s' }}>
            <div className="bl-card-top">
              <div className="bl-card-label">Via retailers</div>
              <div className="bl-card-price">€12.50</div>
            </div>

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
          <div className="bl-card bl-card--soon" style={{ animationDelay: '0.12s', gridColumn: '1 / -1' }}>
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

        /* ── Direct-buy card ─────────────────────────────── */
        .bl-card--direct {
          border-color: rgba(127,178,137,0.45);
          background:
            linear-gradient(180deg, rgba(127,178,137,0.05), rgba(127,178,137,0.02)),
            rgba(6,22,25,0.55);
        }
        .bl-card--direct:hover {
          border-color: rgba(127,178,137,0.7);
          box-shadow: 0 0 28px rgba(127,178,137,0.10);
        }
        .bl-card--owned {
          border-color: rgba(127,178,137,0.7);
          background:
            linear-gradient(180deg, rgba(127,178,137,0.10), rgba(127,178,137,0.04)),
            rgba(6,22,25,0.6);
        }
        .bl-direct-note {
          font-family: var(--serif);
          font-size: 0.95rem;
          color: var(--ivory);
          line-height: 1.5;
          margin: 4px 0 8px;
        }
        .bl-direct-actions {
          display: flex; flex-direction: column; gap: 8px;
          margin-top: 6px;
        }
        .bl-direct-btn {
          display: inline-flex; align-items: center; justify-content: center;
          gap: 8px;
          padding: 12px 16px;
          border: 1px solid rgba(127,178,137,0.45);
          background: rgba(127,178,137,0.06);
          color: var(--ivory);
          font-family: var(--mono); font-size: 0.7rem;
          letter-spacing: 0.18em; text-transform: uppercase;
          text-decoration: none; border-radius: 2px; cursor: pointer;
          transition: background 0.18s, border-color 0.18s, color 0.18s, transform 0.15s;
        }
        .bl-direct-btn:hover {
          background: rgba(127,178,137,0.18);
          border-color: rgba(127,178,137,0.85);
        }
        .bl-direct-btn--primary {
          background: #7fb289;
          border-color: #7fb289;
          color: #0a1f15;
        }
        .bl-direct-btn--primary:hover {
          background: #6ba17a;
          border-color: #6ba17a;
        }
        .bl-direct-tag {
          font-family: var(--mono); font-size: 0.58rem;
          letter-spacing: 0.16em; text-transform: uppercase;
          color: var(--muted); margin-top: 6px;
        }
        .bl-direct-providers-soon {
          font-family: var(--mono); font-size: 0.56rem;
          letter-spacing: 0.14em; color: var(--muted);
          margin-top: 4px; opacity: 0.7;
        }
        .bl-direct-signout {
          background: transparent; border: none; padding: 4px 0;
          margin-top: 10px;
          font-family: var(--mono); font-size: 0.56rem;
          letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--muted); cursor: pointer; text-align: left;
          transition: color 0.2s;
        }
        .bl-direct-signout:hover { color: var(--ivory); }
      `}</style>
    </section>
  );
}

window.Buy = Buy;
