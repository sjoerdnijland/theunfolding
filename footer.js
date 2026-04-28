// Shared footer — single source of truth for all non-React pages.
// Keep in sync with SiteFooter in src/Author.jsx.
(function () {
  const el = document.getElementById('site-footer');
  if (!el) return;
  el.innerHTML = `
    <footer>
      <div class="container">
        <div class="footer-grid">
          <div>
            <div class="nav-logo" style="margin-bottom:14px">
              <span class="dot"></span>
              <span>THE UNFOLDING</span>
            </div>
            <p style="font-family:var(--serif);font-style:italic;font-size:1.05rem;color:var(--ivory-2);max-width:360px">
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
            <a href="reader.html" target="_blank" rel="noopener">Read</a>
            <a href="https://discord.gg/MWejqk8a" target="_blank" rel="noopener">Discord</a>
          </div>

        </div>
        <div class="footer-bottom">
          <span>© 2026 STUART NYLAND · ALL RIGHTS, QUIETLY, RESERVED.</span>
          <span>UNFOLDING.IO</span>
        </div>
      </div>
    </footer>`;
})();
