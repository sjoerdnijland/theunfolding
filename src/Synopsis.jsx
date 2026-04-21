// Synopsis — with Astrid prologue quote and imagery
function Synopsis() {
  return (
    <section id="synopsis" className="synopsis">
      <div className="container-narrow">
        <div className="section-head">
          <span className="mono-label">I / The Pitch</span>
          <h2 className="section-title">
            A <em>small-large</em> story.<br/>
            Intimate as a whisper.<br/>
            Vast as a supernova.
          </h2>
        </div>

        <div className="synopsis-body">
          <p className="lede">
            <span className="lede-mark">"</span>
            Imagine that every step you take sends a signal to every tree, every shrub, every parasite.
            <span className="lede-highlight"> Vibration. Heat. Flesh. Delicious. </span>
            Is it dead yet? Can we eat it now?
            <span className="lede-mark">"</span>
          </p>

          <div className="welcome-line">
            <span className="welcome-hand">Welcome to Mairee.</span>
          </div>

          <div className="syn-grid">
            <div className="syn-col drop-cap">
              <p>
                Beautiful and terrible in equal measure. Visceral.
                Haptic. Grand in its ambitions and devastating in its intimacies.
              </p>
              <p>
                The author asks something of the reader. And by the time they understand the question,
                they may no longer be the same person. Before the last page, something will be planted
                in them. It will sit with them long enough to digest them.
              </p>
            </div>
            <aside className="syn-aside">
              <div className="aside-block"><span className="mono-label muted">Genre</span><p>Psychedelic space opera</p></div>
              <div className="aside-block"><span className="mono-label muted">Audience</span><p>Young Adult / Adult · 14+</p></div>
              <div className="aside-block"><span className="mono-label muted">Length</span><p>Book I of the saga. 275 pages.</p></div>
              <div className="aside-block"><span className="mono-label muted">Comparable</span><p>LOST · Station Eleven · Annihilation · Battlestar Galactica</p></div>
            </aside>
          </div>

          <div className="warning-block">
            <p>Read carefully, and you'll notice that some things in this story read back.</p>
            <p className="warn-2"><em>You were warned. But you will read it anyway.</em></p>
            <p className="warn-3">That's how it starts. That's how it <span className="rose-word">unfolds</span>.</p>
          </div>
        </div>
      </div>

      {/* Themes */}
      <div className="container themes-wrap">
        <div className="themes-grid">
          <ThemeCard label="Theme I" title="Self-Transcendence"
            body="Everyone eventually faces a moment where their world unfolds. A career ends, a relationship breaks, a belief system collapses. This book is a companion for the void." />
          <ThemeCard label="Theme II" title="Mystery"
            body="Things unfold. Slowly. Then all at once. What appears is never quite what you thought you were looking at. The reader is an accomplice." />
          <ThemeCard label="Theme III" title="Intimacy"
            body="Most sci-fi offers a big experience — explosions, empires. The Unfolding is small-large. A secret whispered in the dark. As vast as a supernova blowing through the universe." />
        </div>
      </div>

      {/* Commander's oath */}
      <div className="container-narrow oath">
        <p className="oath-line">
          <span className="hand oath-hand">"The void cannot claim what the heart holds."</span>
        </p>
        <p className="oath-attr">— Commander Astrid Vilde, Freya Homestead</p>
      </div>

      <style>{`
        .synopsis { padding: 160px 0 80px; position: relative; }
        .section-head { margin-bottom: 72px; }
        .section-title { margin-top: 18px; line-height: 1.05; font-weight: 300; }
        .section-title em { color: var(--rose); font-style: italic; }
        .lede { font-family: var(--serif); font-size: clamp(1.4rem, 2.4vw, 2rem); line-height: 1.4; font-style: italic; color: var(--ivory-2); margin: 0 0 48px; padding-left: 24px; border-left: 1px solid var(--rose); font-weight: 300; }
        .lede-mark { font-size: 1.6em; color: var(--rose); line-height: 0; vertical-align: -0.3em; opacity: 0.6; }
        .lede-highlight { color: var(--rose-soft); font-style: normal; font-weight: 400; }
        .welcome-line { text-align: center; margin: 72px 0; position: relative; }
        .welcome-hand { font-family: 'Chiller', 'Caveat', cursive; font-size: clamp(4.5rem, 9vw, 7.5rem); color: var(--rose); letter-spacing: 0.03em; display: inline-block; text-shadow: 0 4px 40px rgba(233,74,124,0.5); line-height: 1; }
        .welcome-line::before, .welcome-line::after { content: ""; position: absolute; top: 50%; width: 25%; height: 1px; background: linear-gradient(to right, transparent, var(--line-strong), transparent); }
        .welcome-line::before { left: 0; } .welcome-line::after { right: 0; transform: scaleX(-1); }

        .syn-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 60px; margin-bottom: 72px; }
        .syn-col p { font-family: var(--serif); font-size: 1.15rem; line-height: 1.7; color: var(--ivory-2); margin: 0 0 1.2em; }
        .syn-col strong { color: var(--rose); font-weight: 500; }
        .syn-aside { border-left: 1px solid var(--line); padding-left: 28px; display: flex; flex-direction: column; gap: 24px; }
        .aside-block p { margin: 6px 0 0; font-family: var(--serif); font-size: 1.05rem; color: var(--ivory); }

        .warning-block { text-align: center; padding: 48px 24px; margin-top: 40px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
        .warning-block p { font-family: var(--serif); font-size: clamp(1.1rem, 2vw, 1.4rem); margin: 0 0 8px; color: var(--ivory-2); font-weight: 300; }
        .warn-2 em { color: var(--rose-soft); } .warn-3 { font-style: italic; }
        .rose-word { color: var(--rose); font-style: italic; }

        .themes-wrap { margin-top: 100px; }
        .themes-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }

        .oath { text-align: center; margin-top: 120px; }
        .oath-line { margin: 0; }
        .oath-hand { font-family: 'Chiller'; font-size: clamp(2.2rem, 4vw, 3.2rem); color: var(--ivory); font-style: italic; }
        .oath-attr { font-family: var(--mono); font-size: 0.76rem; letter-spacing: 0.2em; color: var(--muted); text-transform: uppercase; margin-top: 18px; }

        @media (max-width: 820px) {
          .syn-grid { grid-template-columns: 1fr; gap: 32px; }
          .syn-aside { border-left: 0; padding-left: 0; border-top: 1px solid var(--line); padding-top: 28px; flex-direction: row; flex-wrap: wrap; gap: 28px; }
          .aside-block { min-width: 140px; }
          .themes-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </section>
  );
}

function ThemeCard({ label, title, body }) {
  return (
    <div className="theme-card">
      <span className="mono-label">{label}</span>
      <h3>{title}</h3>
      <p>{body}</p>
      <style>{`
        .theme-card { padding: 36px 28px; background: linear-gradient(180deg, rgba(45,91,102,0.15), rgba(45,91,102,0.03)); border: 1px solid var(--line); border-radius: 2px; transition: all 0.3s ease; }
        .theme-card:hover { border-color: var(--rose); transform: translateY(-4px); }
        .theme-card h3 { margin: 16px 0; color: var(--ivory); }
        .theme-card p { font-size: 0.95rem; color: var(--muted); line-height: 1.6; margin: 0; }
      `}</style>
    </div>
  );
}

window.Synopsis = Synopsis;
