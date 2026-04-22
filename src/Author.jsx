// Author + Footer
function Author() {
  return (
    <section id="author" className="author">
      <div className="container">
        <div className="author-grid">
          <div className="author-portrait">
            <div className="portrait-frame">
              <img src="assets/author-sjoerd.webp" alt="Stuart Nyland" className="portrait-img" />
              <span className="pp-caption">Stuart Nyland</span>
            </div>
          </div>
          <div className="author-body">
            <span className="mono-label">VI / The Author</span>
            <h2 className="section-title">S. Nyland</h2>
            <p className="author-lede">
              Stuart Nyland (born Sjoerd Nijland, 22 August 1985, in the Netherlands)
            </p>
            <p className="author-body-text">
              He writes at the edge of the genre, where psychological interiors are built
              as carefully as starships, and where the largest thing in a room is always
              the thing nobody is saying. Before this book, he worked in (and occasionally
              against) technology.
            </p>

            <div className="editors">
              <span className="mono-label muted">Editorial by</span>
              <p className="editors-line">
                <a className="editor-link" href="https://reedsy.com/laura-josephsen" target="_blank" rel="noopener">
                  <span className="ed-name">Laura Josephsen</span>
                  <span className="ed-role">Principal Editor</span>
                </a>
                <span className="ed-sep">·</span>
                <a className="editor-link" href="https://www.linkedin.com/in/james-allan-lloyd/" target="_blank" rel="noopener">
                  <span className="ed-name">James Allan Lloyd</span>
                  <span className="ed-role">Contributing Editor</span>
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .author { padding: 140px 0 0; }
        .author-grid {
          display: grid;
          grid-template-columns: 260px 1fr;
          gap: 72px;
          align-items: start;
          margin-bottom: 100px;
        }
        .portrait-frame {
          aspect-ratio: 3/4;
          max-width: 240px;
          border: 1px solid var(--line-strong);
          position: relative;
          overflow: hidden;
          background: var(--ink-2);
          opacity: 0.82;
        }
        .portrait-img {
          width: 100%; height: 100%;
          object-fit: cover;
          filter: grayscale(1) contrast(0.92) brightness(0.88) sepia(0.15);
          transition: filter 0.6s ease, transform 0.8s ease, opacity 0.5s;
          opacity: 0.85;
          mix-blend-mode: luminosity;
        }
        .portrait-frame:hover { opacity: 1; }
        .portrait-frame:hover .portrait-img {
          filter: grayscale(0.4) contrast(1) brightness(0.95) sepia(0.1);
          opacity: 1;
        }
        .portrait-frame::before {
          /* grain */
          content: ""; position: absolute; inset: 0;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.6 0'/></filter><rect width='200' height='200' filter='url(%23n)'/></svg>");
          opacity: 0.28;
          mix-blend-mode: overlay;
          pointer-events: none;
          z-index: 3;
        }
        .portrait-frame::after {
          content: ""; position: absolute; inset: 0;
          background:
            radial-gradient(ellipse at center, transparent 50%, rgba(6,22,25,0.55) 100%),
            linear-gradient(180deg, rgba(45,91,102,0.08) 0%, transparent 30%, transparent 55%, rgba(6,22,25,0.85));
          pointer-events: none;
          z-index: 2;
        }
        .pp-caption {
          position: absolute; bottom: 14px; left: 14px; right: 14px;
          font-family: var(--mono); font-size: 0.64rem;
          letter-spacing: 0.18em; color: var(--ivory-2);
          text-transform: uppercase;
          z-index: 4;
        }

        .author-body .section-title { margin: 12px 0 28px; font-size: 4rem; }
        .author-lede {
          font-family: var(--serif); font-size: 1.3rem;
          color: var(--ivory); line-height: 1.5;
          margin: 0 0 20px; font-weight: 300;
        }
        .author-lede em { color: var(--rose); font-style: italic; }
        .author-body-text {
          font-family: var(--serif); font-size: 1.1rem;
          color: var(--ivory-2); line-height: 1.7;
          margin: 0 0 32px; font-weight: 300;
        }
        .author-links { display: flex; flex-direction: column; gap: 8px; }
        .auth-link {
          display: inline-flex; align-items: center; gap: 10px;
          padding: 12px 0; border-bottom: 1px solid var(--line);
          font-family: var(--mono); font-size: 0.82rem;
          color: var(--ivory); transition: all 0.2s;
        }
        .auth-link:hover { color: var(--rose); border-color: var(--rose); padding-left: 8px; }
        .auth-link-k { color: var(--rose); }

        .editors { margin-top: 24px; padding-top: 24px; border-top: 1px dashed var(--line); }
        .editors .mono-label { display: block; margin-bottom: 14px; opacity: 0.7; }
        .editors-line { display: flex; flex-wrap: wrap; gap: 14px 18px; align-items: baseline; margin: 0; font-family: var(--serif); }
        .editor-link { display: inline-flex; flex-direction: column; gap: 2px; padding: 4px 0; border-bottom: 1px solid transparent; transition: all 0.2s; }
        .editor-link:hover { border-color: var(--rose); }
        .editor-link:hover .ed-name { color: var(--rose); }
        .ed-name { font-family: var(--serif); font-size: 1.05rem; color: var(--ivory); font-style: italic; font-weight: 400; letter-spacing: 0.01em; transition: color 0.2s; }
        .ed-role { font-family: var(--mono); font-size: 0.62rem; letter-spacing: 0.18em; color: var(--muted); text-transform: uppercase; }
        .ed-sep { color: var(--line-strong); font-family: var(--serif); font-size: 1.2rem; align-self: center; }

        .newsletter {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 60px;
          align-items: center;
          padding: 48px;
          border: 1px solid var(--line-strong);
          background: linear-gradient(135deg, rgba(45,91,102,0.2), rgba(233,74,124,0.08));
        }
        .nl-copy h3 { font-size: 2.4rem; margin: 14px 0 10px; line-height: 1.1; }
        .nl-copy p { font-family: var(--serif); font-size: 1.1rem; color: var(--ivory-2); margin: 0; font-style: italic; }
        .nl-form { display: flex; gap: 10px; }
        .nl-form input {
          flex: 1;
          background: transparent; border: 0; border-bottom: 1px solid var(--line-strong);
          color: var(--ivory); font-family: var(--serif); font-size: 1.1rem;
          padding: 12px 0;
        }
        .nl-form input:focus { outline: 0; border-bottom-color: var(--rose); }

        @media (max-width: 820px) {
          .author-grid { grid-template-columns: 1fr; gap: 32px; }
          .newsletter { grid-template-columns: 1fr; gap: 24px; padding: 28px; }
          .portrait-frame { max-width: 280px; }
        }
      `}</style>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <div className="nav-logo" style={{ marginBottom: 14 }}>
              <span className="dot" />
              <span>THE UNFOLDING</span>
            </div>
            <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '1.05rem', color: 'var(--ivory-2)', maxWidth: 360 }}>
              Some things in this story read back.<br/>
              You were warned. But you will read it anyway.
            </p>
          </div>
          <div>
            <h4>The Book</h4>
            <a href="index.html#synopsis">Synopsis</a>
            <a href="index.html#excerpt">First Chapter</a>
            <a href="index.html#buy">Pre-order</a>
          </div>
          <div>
            <h4>Community</h4>
            <a href="wiki.html">Wiki</a>
            <a href="https://discord.gg/45bwdn8J" target="_blank" rel="noopener">Discord</a>
          </div>

        </div>
        <div className="footer-bottom">
          <span>© 2026 STUART NYLAND · ALL RIGHTS, QUIETLY, RESERVED.</span>
          <span>UNFOLDING.IO</span>
        </div>
      </div>
    </footer>
  );
}

window.Author = Author;
window.SiteFooter = SiteFooter;
