// ── Version ───────────────────────────────────────────────
const READER_VERSION = 'v163';
console.log('[reader.js] loaded', READER_VERSION);
const V3_BLOCK_MODE_ENABLED = false; // feature toggle — set true to re-enable block highlight

const IS_IOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

// ── Narration state ──────────────────────────────────────
const NARRATE_URL = 'https://sscpikfblqtmcefegrpv.supabase.co/functions/v1/narrate';

let narrationActive    = false;
let narrationParaIds   = [];
let narrationIndex     = 0;
let narrationAudio     = null;
let narrationPlaying   = false;
let narrationRAF       = null;
let narrationCache     = {};
let narrationLocked    = false;
let narrationCurrentWords = [];

// ── SFX overlay state ─────────────────────────────────────
const SFX_BASE_URL = 'assets/sfx/';
const sfxCache     = {};
const sfxPreflight = new Set();
let sfxTriggers    = [];
let sfxFired       = new Set();
let sfxVolume      = 0.60;
// Desktop ambient default: 0.18 (was reduced to 0.07 for iOS — iOS ignores audio.volume anyway)
const AMBIENT_VOL_DEFAULT = IS_IOS ? 0.07 : 0.18;

function sfxLoad(tag) {
  if (sfxCache[tag] || sfxPreflight.has(tag)) return;
  sfxPreflight.add(tag);
  const a = new Audio(SFX_BASE_URL + tag + '.mp3');
  a.preload = 'auto';
  a.addEventListener('canplaythrough', () => { sfxCache[tag] = a; sfxPreflight.delete(tag); }, { once: true });
  a.addEventListener('error', () => { sfxPreflight.delete(tag); console.warn('[SFX] File not found: assets/sfx/' + tag + '.mp3 -- drop the MP3 there to enable this effect'); }, { once: true });
}

let sfxActive = null; // currently playing SFX element

const SFX_PAUSES = { 'pause': 800, 'pause2': 1600, 'pause3': 2500, 'pause4': 3500 };

function sfxPlay(tag) {
  if (sfxActive) { sfxActive.pause(); sfxActive.currentTime = 0; sfxActive = null; }

  // [#pause] [#pause2] [#pause3] [#pause4] — pause narrator, keep background music
  if (SFX_PAUSES[tag] !== undefined) {
    if (narrationAudio && !narrationAudio.paused) {
      narrationAudio.pause();
      setTimeout(() => {
        if (narrationActive && narrationPlaying && narrationAudio) {
          narrationAudio.play().catch(() => {});
        }
      }, SFX_PAUSES[tag]);
    }
    return;
  }
  const url = SFX_BASE_URL + tag + '.mp3';
  if (IS_IOS && sfxAudio) {
    // iOS: src-swap the persistent trusted element — only reliable method
    // from non-gesture callbacks (RAF/timeupdate)
    sfxAudio.src = url;
    sfxAudio.volume = sfxVolume;
    sfxAudio.currentTime = 0;
    sfxActive = sfxAudio;
    sfxAudio.play().catch(e => console.warn('[SFX] play failed:', tag, e.name));
    sfxAudio.addEventListener('ended', () => { if (sfxActive === sfxAudio) sfxActive = null; }, { once: true });
  } else {
    const audio = new Audio(url);
    audio.volume = sfxVolume;
    sfxActive = audio;
    audio.play().catch(e => console.warn('[SFX] play failed:', tag, e.name));
    audio.addEventListener('ended', () => { if (sfxActive === audio) sfxActive = null; }, { once: true });
  }
}

function sfxStopActive() {
  if (sfxActive) {
    sfxActive.pause();
    sfxActive.currentTime = 0;
    sfxActive = null;
  }
}
let multiVoiceEnabled          = localStorage.getItem('multiVoice') !== 'off'; // default ON

function toggleMultiVoice() {
  multiVoiceEnabled = !multiVoiceEnabled;
  localStorage.setItem('multiVoice', multiVoiceEnabled ? 'on' : 'off');
  applyMultiVoiceBtn();
  // Clear cache and re-fetch current paragraph with new voice setting
  cacheClear();
  // Re-narrate from current position so the voice change takes effect immediately
  if (narrationActive) {
    if (narrationAudio) { narrationAudio.pause(); narrationAudio = null; }
    cancelAnimationFrame(narrationRAF);
    narrationLocked = false;
    narrationGoTo(narrationIndex);
  }
}

function applyMultiVoiceBtn() {
  const btn = document.getElementById('nc-voices-btn');
  if (!btn) return;
  if (multiVoiceEnabled) {
    btn.innerHTML = '<span class="nc-icon">◉</span><span class="nc-lbl">All voices</span>';
    btn.style.color = 'var(--rose)';
    btn.style.borderColor = 'var(--rose)';
  } else {
    btn.innerHTML = '<span class="nc-icon">◎</span><span class="nc-lbl">Narrator</span>';
    btn.style.color = '';
    btn.style.borderColor = '';
  }
}

// ── Ambient music ────────────────────────────────────────
let ambientAudio   = null;
let ambientFading  = new Set(); // elements currently fading out
let ambientEnabled = localStorage.getItem('ambientMusic') !== 'off';

function applyAmbientBtn() {
  const btn = document.getElementById('nc-music-btn');
  if (!btn) return;
  const lbl = ambientEnabled ? 'Music on' : 'Music off';
  btn.innerHTML = '<span class="nc-icon">♪</span><span class="nc-lbl">' + lbl + '</span>';
  btn.style.color = ambientEnabled ? 'var(--teal-bright)' : '';
  btn.style.borderColor = ambientEnabled ? 'var(--teal-soft)' : '';
}

function toggleAmbient() {
  ambientEnabled = !ambientEnabled;
  localStorage.setItem('ambientMusic', ambientEnabled ? 'on' : 'off');
  applyAmbientBtn();
  if (ambientEnabled && narrationActive) {
    const pid = narrationParaIds[narrationIndex];
    startAmbient(currentChapter, getSceneForPara(pid));
  } else {
    stopAmbientNow();
  }
}

function getSceneForPara(pid) {
  const el = document.getElementById(pid);
  if (!el) return 1;
  return parseInt(el.dataset.scene || '1', 10);
}

async function resolveAmbientTrack(chapter, scene) {
  const candidates = [
    `assets/audio/chapter-${chapter}-scene-${scene}.mp3`,
    `assets/audio/chapter-${chapter}.mp3`,
    `assets/audio/narration-ambient.mp3`,
  ];
  for (const src of candidates) {
    try {
      const res = await fetch(src, { method: 'HEAD' });
      if (res.ok) { return src; }
    } catch(_) {}
  }
  return null;
}

let ambientResolving = false;
let ambientPending   = null; // {chapter, scene} of next track to load

async function startAmbient(chapter, scene) {
  if (!ambientEnabled) return;

  // If already resolving, just queue the latest request
  if (ambientResolving) {
    ambientPending = { chapter, scene };
    return;
  }

  ambientResolving = true;
  let src;
  try {
    src = await resolveAmbientTrack(chapter || currentChapter, scene || 1);
  } finally {
    ambientResolving = false;
  }

  // If a newer request came in while we were resolving, honour that instead
  if (ambientPending) {
    const next = ambientPending;
    ambientPending = null;
    startAmbient(next.chapter, next.scene);
    return;
  }

  if (!src) return;

  // Same track already playing — nothing to do
  if (ambientAudio && ambientAudio._src === src) return;

  // Kill any in-progress fades immediately — prevents multiple tracks playing
  ambientFading.forEach(a => { a.pause(); a.volume = 0; a.src = ''; });
  ambientFading.clear();

  // Stop old track immediately
  if (ambientAudio) {
    const old = ambientAudio;
    ambientAudio = null;
    old.pause();
    old.volume = 0;
    // Note: don't set src='' on iOS — it can disrupt the active audio session
    // and cause narrationAudio to fade in/out. Just pause at volume 0.
    if (!IS_IOS) old.src = '';
  }

  const audio = new Audio(src);
  audio._src   = src;
  audio.loop   = true;
  audio.volume = 0;
  ambientAudio = audio;

  audio.play().catch(() => {});

  let v = 0;
  const fade = setInterval(() => {
    if (ambientAudio !== audio) { clearInterval(fade); return; }
    const maxV = (window._ambientMaxVol !== undefined) ? window._ambientMaxVol : AMBIENT_VOL_DEFAULT;
    v = Math.min(maxV, v + 0.005);
    audio.volume = v;
    if (v >= maxV) clearInterval(fade);
  }, 80);
}

function toggleV3Mode() {
  const isEstimate = window.V3_WORD_MODE === 'estimate';
  window.V3_WORD_MODE = isEstimate ? 'block' : 'estimate';
  const btn = document.getElementById('nc-v3mode-btn');
  if (btn) {
    btn.querySelector('.nc-lbl').textContent = isEstimate ? ' Block' : ' Words';
    btn.querySelector('.nc-icon').textContent = isEstimate ? '✦' : '≋';
  }
  // Clear cache and re-narrate current paragraph so mode takes effect immediately
  cacheClear();
  if (narrationActive && narrationIndex >= 0) {
    if (narrationAudio) { narrationAudio.pause(); narrationAudio = null; }
    cancelAnimationFrame(narrationRAF);
    narrationLocked = false;
    narrationGoTo(narrationIndex);
  }
}

// Show V3 mode button when multiVoiceEnabled and v3 characters exist
function updateV3ModeBtn() {
  // Button hidden — V3_BLOCK_MODE_ENABLED controls visibility
  const btn = document.getElementById('nc-v3mode-btn');
  if (btn) btn.style.display = (V3_BLOCK_MODE_ENABLED && multiVoiceEnabled) ? 'flex' : 'none';
}

function setAmbientVolume(v) {
  window._ambientMaxVol = v;
  if (ambientAudio) ambientAudio.volume = v;
}

function stopAmbient() {
  // Kill any lingering fade-out elements
  ambientFading.forEach(a => { a.pause(); a.volume = 0; });
  ambientFading.clear();
  if (!ambientAudio) return;
  const audio = ambientAudio;
  ambientAudio = null;
  const fade = setInterval(() => {
    audio.volume = Math.max(0, audio.volume - 0.015);
    if (audio.volume <= 0) { audio.pause(); clearInterval(fade); }
  }, 80);
}

// Hard stop: kills ambient immediately, cancels any pending resolve
function stopAmbientNow() {
  ambientPending = null;
  // Kill all fading elements too
  ambientFading.forEach(a => { a.pause(); a.volume = 0; if (!IS_IOS) a.src = ''; });
  ambientFading.clear();
  if (!ambientAudio) return;
  const audio = ambientAudio;
  ambientAudio = null;
  audio.pause();
  audio.volume = 0;
  if (!IS_IOS) audio.src = '';
}

function isEpigraphPara(pid) {
  const el = document.getElementById(pid);
  return el ? !!el.closest('.epigraph-block') : false;
}

function getNarrableParagraphs() {
  // All .para elements in current chapter, in order
  return Array.from(document.querySelectorAll('#chapter-content .para'))
    .map(el => el.dataset.paraId)
    .filter(Boolean);
}

// Silent MP3 to unlock audio on iOS Safari — must be played within a user gesture
const SILENT_MP3 = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjMyLjEwNAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAADhgCenp6enp6enp6enp6enp6enp6enp6enp6enp6enp6enp6enp6enp6enp6enp6enp6e////////////////////////////////////////////////////////////////AAAAAExhdmM1OC41NAAAAAAAAAAAAAAAACQAAAAAAAAAAw4g3QAAAAAAAAAAAAAAAAAA//tQxAADwAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';
let audioUnlocked = false;

let persistentAudio = null;    // single Audio element reused for all paragraphs (iOS trust)

function unlockAudio() {
  if (audioUnlocked) return;

  // Web Audio oscillator as dedicated Bluetooth keepalive.
  // A continuous tone at gain 0.0001 is completely inaudible but keeps the
  // BT codec active, preventing the Jabra/headset sleep/wake fade cycle.
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      const btCtx = new AC();
      const osc   = btCtx.createOscillator();
      const gain  = btCtx.createGain();
      gain.gain.value = 0.001; // inaudible but above iOS BT sleep threshold
      osc.connect(gain);
      gain.connect(btCtx.destination);
      osc.start();
      btCtx.resume().then(() => { audioUnlocked = true; }).catch(() => {});
      // Periodic ping to prevent iOS from suspending the AudioContext
      const keepAliveInterval = setInterval(() => {
        if (btCtx.state === 'suspended') btCtx.resume().catch(() => {});
      }, 500);
      // Store minimal interface for stopNarration compatibility
      persistentAudio = { _btCtx: btCtx, _interval: keepAliveInterval, pause() {}, play() { return Promise.resolve(); }, paused: false };
    }
  } catch(e) {
    // Fallback: silent looping Audio element
    persistentAudio = new Audio(SILENT_MP3);
    persistentAudio.loop = true;
    persistentAudio.volume = 0.01;
    persistentAudio.play().then(() => { audioUnlocked = true; }).catch(() => {});
  }

  // Persistent SFX element — created in same gesture, src-swapped per effect on iOS
  sfxAudio = new Audio(SILENT_MP3);
  sfxAudio.volume = sfxVolume;
  sfxAudio.play().then(() => { sfxAudio.pause(); sfxAudio.currentTime = 0; }).catch(() => {});
}

async function startNarration() {
  unlockAudio(); // must be called within user gesture, before any await

  // Force-reset any stuck state from a previous attempt (e.g. iOS suspended fetch)
  narrationLocked  = false;
  if (narrationAudio) { narrationAudio.pause(); narrationAudio = null; }
  cancelAnimationFrame(narrationRAF);
  // Ensure keepalive is running
  if (!persistentAudio) {
    unlockAudio();
  } else if (persistentAudio._btCtx) {
    // Oscillator keepalive — resume context if suspended
    if (persistentAudio._btCtx.state === 'suspended') {
      persistentAudio._btCtx.resume().catch(() => {});
    }
  } else if (persistentAudio.paused) {
    persistentAudio.play().catch(() => {});
  }
  if (sfxAudio && sfxAudio.paused && !sfxActive) {
    sfxAudio.play().then(() => { sfxAudio.pause(); }).catch(() => {});
  }

  narrationParaIds = getNarrableParagraphs();
  if (!narrationParaIds.length) return;

  narrationActive  = true;
  narrationIndex   = 0;

  const overlayEl = document.getElementById('narration-overlay');
  overlayEl.style.display = ''; // clear inline style set in HTML
  overlayEl.classList.add('active');
  document.getElementById('narration-progress').style.display = 'block';
  document.getElementById('narration-controls').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  applyAmbientBtn(); applyMultiVoiceBtn();

  await narrationGoTo(0);
}

// ── iOS visibility / tap-to-continue ────────────────────
if (IS_IOS) {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      // Page just became visible again
      if (narrationActive && narrationPlaying) {
        // Re-establish audio session with fresh gesture opportunity
        showIosTapToContinue();
      }
    }
  });
}

function showIosTapToContinue() {
  // Don't show if already visible
  if (document.getElementById('ios-tap-overlay')) return;
  const el = document.createElement('div');
  el.id = 'ios-tap-overlay';
  el.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:9999',
    'display:flex', 'align-items:center', 'justify-content:center',
    'background:rgba(6,22,25,0.85)', 'backdrop-filter:blur(8px)',
    'cursor:pointer'
  ].join(';');
  el.innerHTML = '<div style="text-align:center;pointer-events:none">'
    + '<div style="font-size:2.5rem;margin-bottom:16px">▶</div>'
    + '<div style="font-family:var(--mono);font-size:0.72rem;letter-spacing:0.22em;'
    + 'text-transform:uppercase;color:var(--ivory)">Tap to continue</div>'
    + '</div>';
  el.addEventListener('click', () => {
    el.remove();
    // Fresh gesture — re-establish iOS audio session
    if (persistentAudio) {
      persistentAudio.play().catch(() => {});
    }
    if (narrationAudio && narrationPlaying) {
      narrationAudio.play().catch(() => {});
    }
  });
  document.body.appendChild(el);
}

// ── iOS visibility resume ────────────────────────────────
// When screen locks/page backgrounds, try to resume audio on return.
// Tap prompt only shown if play() explicitly fails with NotAllowedError.
if (IS_IOS) {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && narrationActive && narrationPlaying) {
      setTimeout(() => {
        if (!narrationActive || !narrationPlaying) return;
        if (ambientAudio && ambientAudio.paused && ambientEnabled) {
          ambientAudio.play().catch(() => {});
        }
        if (narrationAudio && narrationAudio.paused) {
          narrationAudio.play().catch(e => {
            if (e.name === 'NotAllowedError') showIosTapPrompt();
          });
        }
      }, 500);
    }
  });
}

function showIosTapPrompt() {
  // Only show if not already visible
  if (document.getElementById('ios-tap-prompt')) return;
  console.warn('[tapPrompt] called from:', new Error().stack.split('\n')[2]);
  const el = document.createElement('div');
  el.id = 'ios-tap-prompt';
  el.style.cssText = [
    'position:fixed;inset:0;z-index:9999',
    'display:flex;align-items:center;justify-content:center',
    'background:rgba(6,22,25,0.75);backdrop-filter:blur(8px)',
    'cursor:pointer',
  ].join(';');
  el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;gap:16px;text-align:center;padding:0 40px">'
    + '<div style="font-size:2rem">▶</div>'
    + '<div style="font-family:var(--mono);font-size:0.72rem;letter-spacing:0.22em;text-transform:uppercase;color:var(--ivory)">Tap to continue</div>'
    + '<div style="font-family:var(--serif);font-size:0.82rem;color:var(--muted);font-style:italic;max-width:260px;line-height:1.6">iOS requires a confirmation tap to keep audio playing.</div>'
    + '</div>';
  el.addEventListener('click', () => {
    el.remove();
    // Re-establish audio session with fresh gesture
    if (persistentAudio) {
      if (persistentAudio._btCtx) {
        persistentAudio._btCtx.resume().catch(() => {});
      } else {
        persistentAudio.play().catch(() => {});
      }
    }
    // Resume narration audio
    if (narrationAudio && narrationAudio.paused && narrationPlaying) {
      narrationAudio.play().catch(() => {
        // Session still not ready — retry narrationGoTo from current position
        narrationGoTo(narrationIndex);
      });
    } else if (narrationActive) {
      // Audio element may be gone — restart from current index
      narrationGoTo(narrationIndex);
    }
  }, { once: true });
  document.body.appendChild(el);
}

function stopNarration() {
  narrationActive  = false;
  narrationPlaying = false;
  narrationLocked  = false; // always reset — prevents stuck state on re-open
  if (narrationAudio) {
    narrationAudio.pause();
    narrationAudio = null;
  }
  // Stop the silent keepalive when narration session ends
  if (persistentAudio) {
    persistentAudio.pause();
    // Don't null it — reuse on next startNarration
  }
  cancelAnimationFrame(narrationRAF);

  document.getElementById('narration-overlay').classList.remove('active');
  document.getElementById('narration-progress').style.display = 'none';
  document.getElementById('narration-controls').style.display = 'none';
  document.getElementById('narration-thread').classList.remove('open');
  document.getElementById('narration-overlay').classList.remove('thread-open');
  narrationThreadOpen = false;
  document.body.style.overflow = '';
  sfxTriggers = []; sfxFired = new Set();
  sfxStopActive();
  stopAmbientNow();
  document.getElementById('narration-comment-hint').classList.remove('visible');
}

function buildSegments(plainText, charVoiceId, innerVoiceId) {
  if (!multiVoiceEnabled || (!charVoiceId && !innerVoiceId)) {
    return [{ text: plainText, voiceId: null }];
  }

  // Split on quoted dialogue AND italic inner-dialogue spans
  // Quote: "..." or \u201c...\u201d
  // Inner: *complete sentence* — detected by having a verb or ?/!
  const parts = plainText.split(/([""\u201c\u201d][^""\u201c\u201d]*[""\u201c\u201d]|\*[^*]+\*)/);
  const segs = [];

  parts.forEach(p => {
    if (!p) return;
    const clean = p.trim();
    if (!clean) return;
    const isQuote = /^[""\u201c\u201d]/.test(clean) && /[""\u201c\u201d]$/.test(clean);
    const isItalic = /^\*[^*]+\*$/.test(clean);
    const INNER_RE = /\b(is|are|was|were|have|has|had|do|does|did|will|would|could|should|must|need|want|know|think|see|feel|hear|get|go|come|make|take|put|give|look|seem|appear)\b|[?!.]$/i;
    const isInnerDialogue = isItalic && innerVoiceId && INNER_RE.test(clean);

    let voice = null;
    if (isQuote && charVoiceId) voice = charVoiceId;
    else if (isInnerDialogue) voice = innerVoiceId;

    // Strip italic markers for TTS
    const ttsText = isItalic ? clean.replace(/^\*|\*$/g, '') : clean;
    segs.push({ text: ttsText, voiceId: voice });
  });

  // Merge consecutive same-voice segments
  const merged = [];
  for (const seg of segs) {
    const last = merged[merged.length - 1];
    if (last && last.voiceId === seg.voiceId) last.text += ' ' + seg.text;
    else merged.push({ ...seg });
  }
  return merged.filter(s => s.text.trim());
}

// ── Narration audio cache — LRU, max 30 entries ──────────
// Prevents unbounded memory growth during long sessions
const CACHE_MAX = 30;
const narrationCacheKeys = []; // tracks insertion order for LRU eviction

function cacheSet(key, value) {
  if (narrationCache[key]) {
    // Refresh position
    const idx = narrationCacheKeys.indexOf(key);
    if (idx > -1) narrationCacheKeys.splice(idx, 1);
  } else if (narrationCacheKeys.length >= CACHE_MAX) {
    // Evict oldest
    const evict = narrationCacheKeys.shift();
    delete narrationCache[evict];
  }
  narrationCacheKeys.push(key);
  narrationCache[key] = value;
}

function cacheClear() {
  narrationCache = {};
  narrationCacheKeys.length = 0;
}

async function narrationGoTo(index) {
  // Hard-stop any currently playing audio immediately
  if (narrationAudio) {
    narrationAudio.pause();
    narrationAudio = null;
  }
  cancelAnimationFrame(narrationRAF);

  // Lock — prevent re-entry
  if (narrationLocked) return;
  narrationLocked = true;

  narrationIndex = index;
  if (index >= narrationParaIds.length) {
    narrationLocked = false;
    // Chapter finished — show end card INSIDE the overlay, don't close it
    showNarrationChapterEnd();
    return;
  }

  const pid = narrationParaIds[index];
  const total = narrationParaIds.length;

  // Counter — chapter · scene · paragraph progress
  const scene  = getSceneForPara(pid);
  const isCode = !!document.getElementById(pid)?.closest('.code-block');
  // Note: code-mode class applied later, after scene pause, to avoid flicker
  const chName = chapterNames[currentChapter] || `Chapter ${currentChapter}`;
  document.getElementById('narration-counter').innerHTML =
    `<span style="color:var(--rose);letter-spacing:0.22em">CH. ${currentChapter}</span>`
    + `<span style="color:var(--line-strong);margin:0 10px">·</span>`
    + `<span style="color:var(--teal-soft)">${chName}</span>`
    + `<span style="color:var(--line-strong);margin:0 10px">·</span>`
    + `<span>Scene ${scene}</span>`
    + `<span style="color:var(--line-strong);margin:0 10px">·</span>`
    + `<span style="color:var(--muted)">${index + 1} / ${narrationParaIds.length}</span>`;

  // Refresh thread sidebar if open
  if (narrationThreadOpen) {
    document.getElementById('nt-preview').textContent = getParaText(narrationParaIds[index] || '').slice(0, 120) + '…';
    if (narrationParaIds[index]) loadNarrationComments(narrationParaIds[index]);
  }

  const prevScene = index > 0 ? getSceneForPara(narrationParaIds[index - 1]) : -1;
  startAmbient(currentChapter, scene);

  // Declare textEl here so it's in scope for everything below
  const textEl = document.getElementById('narration-text');
  // Clear and force reflow — prevents iOS GPU compositing old content behind new
  textEl.innerHTML = '';
  void textEl.offsetHeight; // forces layout flush, clears iOS composite layer
  // Keep BT oscillator alive on every paragraph change
  if (IS_IOS && persistentAudio?._btCtx?.state === 'suspended') {
    persistentAudio._btCtx.resume().catch(() => {});
  }

  // Pause on scene changes — atmospheric beat.
  // Shorter if audio is already cached (no real wait needed).
  if (scene !== prevScene) {
    const nextCacheKey = READER_VERSION + '|' + pid + '|'; // prefix check
    const isCached = Object.keys(narrationCache).some(k => k.startsWith(nextCacheKey));
    const pauseMs = index === 0 ? 800 : (isCached ? 400 : 800);
    textEl.innerHTML = `<span class="narration-loading" style="opacity:0.25">✦</span>`;
    await new Promise(r => setTimeout(r, pauseMs));
    if (narrationIndex !== index) { narrationLocked = false; return; }
  }

  // Show comment hint if paragraph has threads
  const count = commentCounts[pid] || 0;
  const hint  = document.getElementById('narration-comment-hint');
  document.getElementById('nch-count').textContent = count;
  hint.classList.toggle('visible', count > 0);

  // Get plain text for TTS, raw markup text for italic/bold display
  let text    = getParaText(pid);
  let rawText = getRawText(pid) || text;
  if (!text) { narrationLocked = false; await narrationGoTo(index + 1); return; }

  /// Normalise newlines to spaces in TTS text only.
  // ElevenLabs adds unmeasured silence for newlines that the alignment timestamps
  // do not reflect, causing karaoke to run ahead on multi-line paragraphs.
  // rawText keeps newlines so buildDisplayTokens still emits br tokens.
  text = text.split('\n').join(' ').replace(/  +/g, ' ').trim();

  // Strip v3 emotion tags from display text (e.g. [sigh], [whispers], [excited])
  // These are processed by ElevenLabs v3 but should not appear to the reader.
  rawText = rawText.replace(/\[(?!#)[a-zA-Z][a-zA-Z0-9 _-]*\]/gi, '').trim();

  // Convert [#pause] tags: strip from rawText (display), convert in text (TTS).
  // rawText drives karaoke display — pause tags must be removed, not replaced.
  rawText = rawText
    .replace(/\[#pause4\]/g, ' ')
    .replace(/\[#pause3\]/g, ' ')
    .replace(/\[#pause2\]/g, ' ')
    .replace(/\[#pause\]/g,  ' ');
  // text drives TTS — inject silence via comma sequences (more reliable than dots)
  text = text
    .replace(/\[#pause4\]/g, ',,,, ')
    .replace(/\[#pause3\]/g, ',,, ')
    .replace(/\[#pause2\]/g, ',, ')
    .replace(/\[#pause\]/g,  ', ');

  // Epigraph: double all pause characters for a slower, more deliberate delivery
  if (isEpigraphPara(pid)) {
    text = text
      .replace(/\.\s/g,  '.   ')
      .replace(/\?\s/g,  '?   ')
      .replace(/!\s/g,   '!   ')
      .replace(/…/g,     '…   ')
      .replace(/,\s/g,   ',   ');
  }

    // Declare isTranscriptPara early — used by SFX parser and prefix strip below
  const paraEl2 = document.getElementById(pid);
  const isTranscriptPara = paraEl2?.dataset.transcript === 'true';

  // ── Parse and strip SFX tags [#tag-name] ─────────────────
  // Record position (afterWordIdx) and remove from both text and rawText
  // so the narrator never speaks the tag text.
  const SFX_TAG_RE = /\[#([a-z0-9_-]+)\]/g;
  sfxTriggers = [];
  sfxFired    = new Set();

  function parseSfxTags(str) {
    const triggers = [];
    let wordCount = 0, lastIdx = 0, out = '';
    for (const m of str.matchAll(SFX_TAG_RE)) {
      const before = str.slice(lastIdx, m.index);
      out += before;
      wordCount += before.trim().split(/\s+/).filter(Boolean).length;
      triggers.push({ afterWordIdx: wordCount - 1, tag: m[1] });
      sfxLoad(m[1]); // preload immediately
      lastIdx = m.index + m[0].length;
    }
    out += str.slice(lastIdx);
    return { out: out.trim(), triggers };
  }

  // Parse SFX tags from rawText (data-raw) — it always has original text.
  // getParaText reads innerText which no longer has [#tag] since renderChapter strips them.
  // rawText comes from getRawText(data-raw) which is set before any stripping.
  const sfxParsed = parseSfxTags(rawText);
  sfxTriggers = sfxParsed.triggers;
  // Strip tags from both text and rawText before TTS/display
  rawText = sfxParsed.out;
  text    = text.replace(SFX_TAG_RE, '').trim();

  // Strip ALL-CAPS SPEAKER: prefix ONLY for transcript-flagged paragraphs.
  // Gated on isTranscriptPara to avoid stripping headings like PARTICIPANTS:
  // which are not speaker labels but structural headings.
  // Uses space (not \s) after colon to avoid matching colon+newline.
  const TRANSCRIPT_PREFIX_RE = /^[A-Z][A-Z0-9 ·]+: /;
  if (isTranscriptPara) {
    const rawPrefixMatch = rawText.match(TRANSCRIPT_PREFIX_RE);
    if (rawPrefixMatch) rawText = rawText.slice(rawPrefixMatch[0].length);
    const textPrefixMatch = text.match(TRANSCRIPT_PREFIX_RE);
    if (textPrefixMatch) text = text.slice(textPrefixMatch[0].length);
  }

  // For transcript paragraphs, extract and preserve the speaker label
  // so it can be shown above the karaoke text in the narration overlay.
  let transcriptSpeakerLabel = '';
  if (isTranscriptPara) {
    // Extract the prefix from the original data-raw before stripping
    const TPRE2 = /^([A-Z][A-Z0-9 ·]+):\s+/;
    const rawOrig = paraEl2?.dataset.raw || '';
    const tm = rawOrig.match(TPRE2);
    if (tm) transcriptSpeakerLabel = tm[1];
  }

  // Stop previous audio and any active SFX
  if (narrationAudio) { narrationAudio.pause(); narrationAudio = null; }
  sfxStopActive();
  cancelAnimationFrame(narrationRAF);
  narrationPlaying = false;

  // Detect speaker voice — only when multi-voice mode is on
  let speakerVoiceId = null;
  let innerVoiceId   = null;
  if (multiVoiceEnabled) {
    // 1. Explicit speaker tag from JSON (most reliable)
    const paraEl = document.getElementById(pid);
    const speakerTag = paraEl?.dataset.speaker;
    const innerTag   = paraEl?.dataset.innerVoice;
    if (speakerTag) {
      const entry = wikiById[speakerTag];
      if (entry?.voice_id) speakerVoiceId = entry.voice_id;
    }
    // Inner voice for italic inner dialogue (assigns to outer let, no shadow)
    if (innerTag) {
      const entry = wikiById[innerTag];
      if (entry?.voice_id) innerVoiceId = entry.voice_id;
    }
    // 2. Pattern detection fallback
    if (!speakerVoiceId) speakerVoiceId = detectSpeakerVoice(rawText);

  } // end multiVoiceEnabled

  // ── Segment-based fetch: narrator for prose, character for quoted dialogue ──
  // For transcript paragraphs the entire text is the character's speech —
  // force a single segment with their voice, bypassing quote detection.
  let segments;
  if (isTranscriptPara && speakerVoiceId) {
    // Strip embedded curly/smart quotes from transcript TTS text.
    // ElevenLabs treats "word" mid-sentence as nested dialogue, causing prosody resets.
    // Straight apostrophe quotes are kept as they're less likely to trigger this.
    const transcriptText = text.replace(/[“”„‟]/g, '').replace(/  +/g, ' ').trim();
    segments = [{ text: transcriptText, voiceId: speakerVoiceId }];
  } else {
    // buildSegments needs rawText (has *asterisks* intact) to detect inner-voice
    // italic spans. It already strips asterisks from ttsText before sending to TTS.
    segments = buildSegments(rawText, speakerVoiceId, innerVoiceId);
  }
  const isStitched = segments.length > 1;

  // pause_before: cinematic pause before this paragraph (set in chapter JSON)
  const pauseBeforeMs = parseInt(document.getElementById(pid)?.dataset.pauseBefore || '0', 10);
  // On iOS: don't await — it orphans the audio session causing tap prompts.
  // Instead we pass the delay to the audio playback start (play-delay approach).
  // On desktop: await is fine.
  if (!IS_IOS && pauseBeforeMs > 0) {
    await new Promise(r => setTimeout(r, pauseBeforeMs));
  }

  // Check for narrator model override (e.g. "v3" for narrator v3 paragraphs)
  const narratorModelOverride = document.getElementById(pid)?.dataset.narratorModel || null;
  console.log('[narrator-model] pid:', pid, 'override:', narratorModelOverride);

  const modelSuffix = narratorModelOverride ? '|' + narratorModelOverride : '';
  const cacheKey   = READER_VERSION + '|' + pid + modelSuffix + '|' + segments.map(s => (s.voiceId||'n')+':'+s.text.slice(0,20)).join('|');

  let data = narrationCache[cacheKey];
  if (!data) {
    // Only flash loading text on first load or if fetch takes >400ms.
    // Mid-session: keep previous text visible to avoid jarring flicker.
    const isFirstLoad = index === 0;
    let loadingShown = false;
    const loadingTimer = isFirstLoad ? null : setTimeout(() => {
      loadingShown = true;
      textEl.innerHTML = `<span class="narration-loading" style="opacity:0.5">✦</span>`;
    }, 400);
    if (isFirstLoad) {
      textEl.innerHTML = `<span class="narration-loading">the stone is listening…</span>`;
      loadingShown = true;
    }
    // Fetch with 25s timeout — prevents iOS Safari from hanging when the
    // browser is backgrounded or the screen locks mid-fetch.
    function narrateFetch(body) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      console.log('[narrate] fetching', body.text ? body.text.slice(0,40) : '?');
      return fetch(NARRATE_URL, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPA_KEY },
        body: JSON.stringify(body)
      }).then(r => {
        console.log('[narrate] response', r.status);
        return r.json();
      }).catch(e => {
        console.warn('[narrate] fetch error:', e.name, e.message);
        throw e;
      }).finally(() => clearTimeout(t));
    }

    try {
      if (segments.length === 1) {
        const seg = segments[0];
        const modelOverride = !seg.voiceId && narratorModelOverride
          ? { model: narratorModelOverride === 'v3' ? 'eleven_v3' : 'eleven_turbo_v2_5' }
          : {};
        data = await narrateFetch(Object.assign({ text: seg.text }, seg.voiceId ? { voiceId: seg.voiceId } : {}, modelOverride));
        if (data.error) throw new Error(data.error);
      } else {
        // Multiple segments — fetch each and stitch alignment
        const results = await Promise.all(
          segments.map(seg =>
            narrateFetch(Object.assign({ text: seg.text }, seg.voiceId ? { voiceId: seg.voiceId } : {}, !seg.voiceId && narratorModelOverride ? { model: narratorModelOverride === 'v3' ? 'eleven_v3' : 'eleven_turbo_v2_5' } : {}))
              .catch(e => ({ error: e.message }))
          )
        );
        const anyFailed = results.some(r => r.error);
        if (anyFailed) {
          data = await narrateFetch({ text, ...(narratorModelOverride ? { model: narratorModelOverride === 'v3' ? 'eleven_v3' : 'eleven_turbo_v2_5' } : {}) });
        } else {
          data = stitchSegments(results);
        }
        if (data.error) throw new Error(data.error);
      }
      cacheSet(cacheKey, data);
    } catch(e) {
      if (loadingTimer) clearTimeout(loadingTimer);
      console.warn('[narrate] caught:', e.name, e.message);
      const isTimeout = e.name === 'AbortError' || e.message.includes('abort') || e.message.includes('abort');
      narrationLocked = false; // always unlock on error
      textEl.innerHTML = `<div style="text-align:center;padding:20px 0">
          <div style="font-family:var(--mono);font-size:0.65rem;letter-spacing:0.18em;color:var(--muted);margin-bottom:20px">${isTimeout ? '⟳ Connection timed out' : '⚠ Could not load audio'}</div>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
            <button onclick="narrationGoTo(${index})" style="background:rgba(233,74,124,0.12);border:1px solid var(--rose);color:var(--rose);font-family:var(--mono);font-size:0.65rem;letter-spacing:0.15em;padding:10px 20px;cursor:pointer;border-radius:2px">↺ Retry</button>
            <button onclick="narrationGoTo(${index + 1})" style="background:transparent;border:1px solid var(--line-strong);color:var(--muted);font-family:var(--mono);font-size:0.65rem;letter-spacing:0.12em;padding:10px 16px;cursor:pointer;border-radius:2px">Skip →</button>
            <button onclick="stopNarration()" style="background:transparent;border:none;color:var(--muted);font-family:var(--mono);font-size:0.65rem;padding:10px 12px;cursor:pointer">✕</button>
          </div>
        </div>`;
      return;
    }
    if (loadingTimer) clearTimeout(loadingTimer);
  }


  // For stitched paragraphs, build word timings using per-segment alignment
  // Narrator segments use their own accurate timestamps
  // Character segments don't need timing (they use position-based range highlighting)
  let words;
  if (isStitched && data.segmentMeta?.length) {
    words = buildWordTimingsFromSegments(text, segments, data.segmentMeta);
  } else {
    words = buildWordTimings(text, data.alignment);
  }

  function clean(w) {
    return w.toLowerCase().replace(/[^a-z0-9''\-]/g, '');
  }

  // Build display tokens from the plain TTS text (same word split as ElevenLabs
  // alignment) so word indices ALWAYS match timing data — no drift after italic.
  // Format (bold/italic/smcaps) is determined by building a character-offset map
  // from rawText markup spans, then checking where each plain word falls.
  function buildDisplayTokens(raw, timingWords) {
    const tokens = [];

    // 1. Build a position→fmt map from rawText markup spans.
    //    We walk rawText and record the plain-text char range each span covers.
    let plainOffset = 0; // position in the stripped plain text
    const fmtRanges = []; // [{start, end, fmt}] in plain-text coords
    const markupRe = /(\*\*[^*]+?\*\*|\*[^*]+?\*|~~[^~]+?~~|\n)/g;
    let lastIndex = 0;
    let match;
    while ((match = markupRe.exec(raw)) !== null) {
      // plain text before this span
      const before = raw.slice(lastIndex, match.index);
      plainOffset += before.replace(/\n/g, '').length; // \n → 0 plain chars
      const span = match[0];
      if (span === '\n') {
        // newline: record a break at this position
        fmtRanges.push({ start: plainOffset, end: plainOffset, fmt: 'br' });
      } else {
        let inner = span, fmt = '';
        if (span.startsWith('**'))      { inner = span.slice(2,-2); fmt = 'nw-bold'; }
        else if (span.startsWith('*'))  { inner = span.slice(1,-1); fmt = 'nw-italic'; }
        else if (span.startsWith('~~')) { inner = span.slice(2,-2); fmt = 'nw-smcaps'; }
        fmtRanges.push({ start: plainOffset, end: plainOffset + inner.length, fmt });
        plainOffset += inner.length;
      }
      lastIndex = match.index + span.length;
    }
    // after last span
    // (no need — we only need the ranges we already recorded)

    // 2. Insert <br> tokens at newline positions in the plain text.
    //    Collect positions where a \n falls in plain coords.
    const brPositions = new Set(fmtRanges.filter(r => r.fmt === 'br').map(r => r.start));

    // 3. Walk plain text word-by-word (same split as TTS alignment)
    //    and annotate each with its format.
    function getFmt(charStart, charEnd) {
      for (const r of fmtRanges) {
        if (r.fmt === 'br') continue;
        if (charStart >= r.start && charEnd <= r.end) return r.fmt;
        // partial overlap → prefer italic over nothing
        if (charStart < r.end && charEnd > r.start) return r.fmt;
      }
      return '';
    }

    // Walk character by character to build word tokens (preserves br positions)
    let word = '', wordStart = -1;
    let charPos = 0;
    const plain = raw
      .replace(/\*\*([^*]+?)\*\*/g, '$1')
      .replace(/\*([^*]+?)\*/g, '$1')
      .replace(/~~([^~]+?)~~/g, '$1');
    let wordIdx = 0;

    // Normalise a word for matching against timingWords
    const normWord = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const PUNCT_ONLY = /^[^\p{L}\p{N}]+$/u;

    const pushWord = () => {
      if (!word) return;
      const timing = timingWords[wordIdx] || { start: 0, end: 0 };

      // If this display word is pure punctuation (e.g. em-dash —, ellipsis …)
      // and the current timingWord doesn't match it (ElevenLabs omitted it from
      // alignment), reuse the previous word's end time and do NOT advance wordIdx.
      // This prevents a 1-word drift per omitted punctuation token.
      let usedIdx = wordIdx;
      if (PUNCT_ONLY.test(word)) {
        const twNorm = normWord(timing.text || '');
        const wNorm  = normWord(word);
        if (twNorm !== wNorm) {
          // timing slot belongs to the next real word — borrow timing, don't consume
          const prevTiming = tokens.filter(t => t.type === 'word').slice(-1)[0];
          const punctTiming = prevTiming
            ? { start: prevTiming.end, end: prevTiming.end }
            : { start: timing.start, end: timing.start };
          tokens.push({ type: 'word', text: word, fmt: getFmt(wordStart, wordStart + word.length),
                        start: punctTiming.start, end: punctTiming.end, idx: wordIdx,
                        blockHighlight: timing.blockHighlight || false });
          word = ''; wordStart = -1;
          return; // do NOT increment wordIdx
        }
      }

      tokens.push({ type: 'word', text: word, fmt: getFmt(wordStart, wordStart + word.length),
                    start: timing.start, end: timing.end, idx: usedIdx,
                    blockHighlight: timing.blockHighlight || false });
      wordIdx++;
      word = ''; wordStart = -1;
    };

    for (let i = 0; i < plain.length; i++) {
      const ch = plain[i];
      // Insert <br> before the word starting at this position
      if (brPositions.has(charPos) && !word) {
        tokens.push({ type: 'br' });
      }
      if (ch === ' ' || ch === '\t') {
        pushWord();
        tokens.push({ type: 'space' });
      } else if (ch === '\n') {
        pushWord();
        tokens.push({ type: 'br' });
      } else {
        if (wordStart === -1) wordStart = charPos;
        word += ch;
      }
      charPos++;
    }
    pushWord();
    return tokens;
  }

  const displayTokens     = isCode
    // For code blocks: show raw text as-is, just split into words for timing
    ? words.map((w, i) => ({ type: 'word', text: w.text, fmt: '', start: w.start, end: w.end, idx: i, blockHighlight: w.blockHighlight || false }))
    : buildDisplayTokens(rawText, words);
  narrationCurrentWords   = displayTokens.filter(t => t.type === 'word');

  // Precompute which word indices (in narrationCurrentWords) belong to character segments
  // Key insight: normalise BOTH sides identically — strip all quote chars via norm()
  // This means "The (display) and "The (segment) both → "the", so matching is always correct
  const charWordRanges = [];
  if (isStitched && narrationCurrentWords.length) {
    const norm = w => w.replace(/["""'\u201c\u201d]/g, '').replace(/[^a-z0-9\u00e0-\u00ff]/gi, '').toLowerCase();
    const normDisplay = narrationCurrentWords.map(w => norm(w.text));

    let searchFrom = 0;
    for (const seg of segments) {
      // segWords: non-empty only, for matching
      const segWordsAll  = seg.text.split(/\s+/).filter(Boolean).map(norm);
      const segWords     = segWordsAll.filter(Boolean);
      if (!segWords.length) continue;

      // Find matchStart
      let matchStart = -1;
      outer: for (let i = searchFrom; i < normDisplay.length; i++) {
        if (normDisplay[i] === segWords[0]) {
          let si = 1;
          for (let di = i + 1; di < normDisplay.length && si < Math.min(4, segWords.length); di++) {
            if (normDisplay[di] === '') continue; // skip empty display words
            if (normDisplay[di] !== segWords[si]) continue outer;
            si++;
          }
          matchStart = i;
          break;
        }
      }

      // Calculate matchEnd by walking display from matchStart,
      // consuming display words until we've matched all non-empty seg words
      let matchEnd;
      if (matchStart === -1) {
        matchEnd = searchFrom + segWordsAll.length - 1;
      } else {
        let di = matchStart, consumed = 0;
        const target = segWords.length;
        while (di < normDisplay.length && consumed < target) {
          if (normDisplay[di] !== '') consumed++;
          di++;
        }
        // di is now one past the last consumed — step back
        matchEnd = Math.min(di - 1, narrationCurrentWords.length - 1);
      }

      if (seg.voiceId && matchStart !== -1) {
        charWordRanges.push({ start: matchStart, end: matchEnd, voice: seg.voiceId });
      }
      searchFrom = matchEnd + 1;
    }
  }

  function getCharVoiceForWord(idx) {
    for (const r of charWordRanges) {
      if (idx >= r.start && idx <= r.end) return r.voice;
    }
    return null;
  }

  // Character label element — shows who's speaking during character voice
  let charLabel = document.getElementById('narration-char-label');
  if (!charLabel) {
    charLabel = document.createElement('div');
    charLabel.id = 'narration-char-label';
    charLabel.style.cssText = `
      position:absolute; top: 16px; right: 20px;
      font-family:var(--mono); font-size:0.6rem; letter-spacing:0.22em;
      text-transform:uppercase; color:var(--rose); opacity:0;
      transition:opacity 0.3s; pointer-events:none;
    `;
    document.getElementById('narration-overlay').appendChild(charLabel);
  }
  charLabel.style.opacity = '0';

  // For code blocks: show TRANSMISSION label above word highlights
  // Transcript speaker label shown above karaoke text in narration overlay
  const transcriptLabelHtml = transcriptSpeakerLabel
    ? `<div style="font-family:var(--mono);font-size:0.62rem;letter-spacing:0.32em;text-transform:uppercase;color:#6ecfde;margin-bottom:24px;text-align:center;display:flex;align-items:center;justify-content:center;gap:12px">
        <span style="display:inline-block;width:28px;height:1px;background:#4a9aaa;opacity:0.6"></span>
        <span style="display:inline-flex;align-items:center;gap:7px">
          <span class="tx-dot" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#6ecfde;box-shadow:0 0 8px #6ecfde;animation:txPulse 1.4s ease-in-out infinite"></span>
          ${escHtml(transcriptSpeakerLabel)}
        </span>
        <span style="display:inline-block;width:28px;height:1px;background:#4a9aaa;opacity:0.6"></span>
      </div>
      <style>.tx-dot{} @keyframes txPulse{0%,100%{opacity:0.4;transform:scale(0.85)}50%{opacity:1;transform:scale(1.2)}}</style>`
    : '';

  // Apply code-mode now — after any scene pause, so overlay doesn't flicker mid-transition
  document.getElementById('narration-overlay').classList.toggle('code-mode', isCode);

  if (isCode) {
    textEl.innerHTML = `<div style="font-family:var(--mono);font-size:0.62rem;letter-spacing:0.35em;color:var(--teal-soft);margin-bottom:28px;text-align:center;opacity:0.7">◉ TRANSMISSION</div>`
      + displayTokens.map(t => `<span class="nw" id="nw-${t.idx}">${escHtml(t.text)}</span> `).join('');
  } else {
    textEl.innerHTML = transcriptLabelHtml + displayTokens.map(t => {
      if (t.type === 'br')    return '<br>';
      if (t.type === 'space') return ' ';
      return `<span class="nw ${t.fmt}" id="nw-${t.idx}">${escHtml(t.text)}</span>`;
    }).join('');
  }

  prefetchNext(index + 1);
  narrationLocked = false;
  narrationPlaying = true;
  document.getElementById('nc-play-btn').innerHTML = '<span class="nc-icon">\u23f8</span><span class="nc-lbl">Pause</span>';
  if (typeof updateV3ModeBtn === 'function') updateV3ModeBtn();

  // Guard: only ONE advance per paragraph
  let advanced = false;
  function advance() {
    if (advanced) return;
    advanced = true;
    cancelAnimationFrame(narrationRAF);
    if (narrationAudio) narrationAudio.removeEventListener('timeupdate', updateKaraoke);
    narrationCurrentWords.forEach(w => {
      const el = document.getElementById('nw-' + w.idx);
      if (el) el.className = 'nw ' + (w.fmt || '') + ' spoken';
    });
    setTimeout(() => { if (narrationActive) narrationGoTo(index + 1); }, 80);
  }

  if (IS_IOS && isStitched && data.segmentMeta && data.segmentMeta.length > 1) {
    // iOS: play each segment as a separate Audio element to avoid
    // MP3 frame-boundary currentTime reset in concatenated blobs.
    const fullBytes = atob(data.audio);
    const segMeta = data.segmentMeta;
    let segTimeBase = 0;

    function playSegment(si) {
      if (!narrationActive || advanced) return;
      if (si >= segMeta.length) { advance(); return; }
      const meta = segMeta[si];
      const bytes = fullBytes.slice(meta.byteStart, meta.byteEnd);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([arr], { type: 'audio/mpeg' }));
      const audio = new Audio(url);
      narrationAudio = audio;
      // For v3 segments, get real duration from loadedmetadata and update timing
      if (!meta.alignment || !meta.alignment.characters) {
        audio.addEventListener('loadedmetadata', () => {
          if (isFinite(audio.duration) && audio.duration > 0) {
            meta._realDur = audio.duration;
            // Rebuild word timings with actual duration
            const alignHint = { _audioDur: audio.duration };
            const segWords = buildWordTimings(segments[si]?.text || '', alignHint);
            // Update only the words for this segment in narrationCurrentWords
            let segWordIdx = 0;
            narrationCurrentWords.forEach(w => {
              if (w.segIdx === si && segWordIdx < segWords.length) {
                const sw = segWords[segWordIdx++];
                w.start = sw.start + (meta.timeOffset || 0);
                w.end   = sw.end   + (meta.timeOffset || 0);
              }
            });
          }
        }, { once: true });
      }

      const base = segTimeBase;
      const lastSegEnds = segMeta[segMeta.length-1].alignment && segMeta[segMeta.length-1].alignment.character_end_times_seconds;
      const totalDur = segMeta[segMeta.length-1].timeOffset + (lastSegEnds && lastSegEnds.length ? lastSegEnds[lastSegEnds.length-1] : 0);

      function segUpdate() {
        if (!narrationActive || advanced || narrationAudio !== audio) return;
        if (audio.paused) return;
        const t = audio.currentTime + base;
        document.getElementById('narration-progress-bar').style.width = (totalDur > 0 ? Math.min(100, t/totalDur*100) : 0) + '%';
        const LOOKAHEAD = 0.08;
        let ci = -1;
        for (let i = 0; i < narrationCurrentWords.length; i++) {
          if (narrationCurrentWords[i].start <= t + LOOKAHEAD) ci = i;
          else break;
        }
        narrationCurrentWords.forEach((w, i) => {
          const el = document.getElementById('nw-' + w.idx);
          if (!el) return;
          const isCh = !!getCharVoiceForWord(i);
          if (i < ci)       el.className = 'nw '+(w.fmt||'')+' spoken'  +(isCh?' char-voice':'');
          else if (i === ci) el.className = 'nw '+(w.fmt||'')+' current' +(isCh?' char-voice':'');
          else               el.className = 'nw '+(w.fmt||'')            +(isCh?' char-voice':'');
        });
        const cv = getCharVoiceForWord(ci);
        if (cv) { const e2 = Object.values(wikiById).find(e => e.voice_id===cv); if(e2){charLabel.textContent='\u25cf '+e2.name.split(' ')[0];charLabel.style.opacity='1';} }
        else charLabel.style.opacity = '0';
        for (const tr of sfxTriggers) { const k=tr.afterWordIdx+':'+tr.tag; if(!sfxFired.has(k)&&ci>tr.afterWordIdx){sfxFired.add(k);sfxPlay(tr.tag);} }
      }

      audio.addEventListener('timeupdate', segUpdate);
      (function raf() { if (!narrationActive||advanced||narrationAudio!==audio) return; segUpdate(); narrationRAF=requestAnimationFrame(raf); })();

      audio.addEventListener('ended', () => {
        cancelAnimationFrame(narrationRAF);
        audio.removeEventListener('timeupdate', segUpdate);
        URL.revokeObjectURL(url);
        const se = meta.alignment && meta.alignment.character_end_times_seconds;
        segTimeBase += se && se.length ? se[se.length-1] : (meta.byteEnd-meta.byteStart)/16000;
        playSegment(si + 1);
      });
    {
        const iosDelay = (si === 0) ? pauseBeforeMs : 0;
        const doSegPlay = () => audio.play().catch(e => {
          console.warn('[seg'+si+'] play:', e.name);
          if (IS_IOS && e.name === 'NotAllowedError') showIosTapPrompt();
        });
        if (iosDelay > 0) setTimeout(doSegPlay, iosDelay); else doSegPlay();
      }
      // Proactive check: only show tap prompt if audio truly never started
      // (currentTime still 0 after 2s) — avoids false positives mid-paragraph
      // Proactive check removed — only play() NotAllowedError triggers tap prompt
    }
    playSegment(0);

  } else {
    // Desktop/single-segment or non-stitched: standard blob playback
    const audioBlob = base64ToBlob(data.audio, 'audio/mpeg');
    const audioUrl  = URL.createObjectURL(audioBlob);
    narrationAudio  = new Audio(audioUrl);
    // Get real audio duration for v3 segments and rebuild word timings
    narrationAudio.addEventListener('loadedmetadata', () => {
      const realDur = narrationAudio.duration;
      if (realDur && isFinite(realDur) && data.segmentMeta) {
        // Rebuild timings for any v3 segments using actual duration
        let needsRebuild = false;
        data.segmentMeta.forEach(meta => {
          if (!meta.alignment || !meta.alignment.characters) {
            meta._realDur = realDur;
            needsRebuild = true;
          }
        });
        if (needsRebuild) {
          const newWords = isStitched
            ? buildWordTimingsFromSegments(text, segments, data.segmentMeta)
            : buildWordTimings(text, { _audioDur: realDur });
          const newTokens = buildDisplayTokens(rawText, newWords);
          narrationCurrentWords = newTokens.filter(t => t.type === 'word');
        }
      }
    }, { once: true });
    narrationAudio.addEventListener('timeupdate', updateKaraoke);
    narrationAudio.addEventListener('ended', () => { URL.revokeObjectURL(audioUrl); advance(); });

    // Stall guard: iOS sometimes doesn't fire 'ended' when audio finishes.
    // Poll duration vs currentTime — only triggers if truly at end, respects user pause.
    const stallAudio = narrationAudio;
    function stallCheck() {
      if (!narrationActive || advanced) return;
      if (stallAudio !== narrationAudio) return;
      if (!narrationPlaying) { setTimeout(stallCheck, 1000); return; } // user paused — wait
      const dur = stallAudio.duration;
      const ct  = stallAudio.currentTime;
      if (!isNaN(dur) && dur > 0 && ct >= dur - 0.15) { advance(); return; }
      setTimeout(stallCheck, 500);
    }
    setTimeout(stallCheck, 1000);
    narrationAudio.addEventListener('pause', () => {
      if (!narrationPlaying || !narrationActive || advanced) return;
      // Only auto-resume if audio had actually started — not during initial load or play-delay
      if (!narrationAudio || narrationAudio.currentTime === 0) return;
      setTimeout(() => {
        if (!narrationPlaying || !narrationActive || advanced) return;
        if (narrationAudio && narrationAudio.paused && narrationAudio.currentTime > 0) {
          narrationAudio.play().catch(() => {});
        }
      }, 300);
    });
  {
    const iosDelay = IS_IOS ? pauseBeforeMs : 0;
    const doPlay = () => narrationAudio.play().catch(e => {
      console.warn('[narrate] play:', e.name);
      if (IS_IOS && e.name === 'NotAllowedError') showIosTapPrompt();
    });
    if (iosDelay > 0) setTimeout(doPlay, iosDelay); else doPlay();
  }
    // Proactive check for iOS: only show if audio truly never started
    // Proactive check removed — only play() NotAllowedError triggers tap prompt
  }

  function updateKaraoke() {
    if (!narrationAudio || !narrationActive) return;
    if (narrationAudio.paused) return;
    const t   = narrationAudio.currentTime;
    const dur = narrationAudio.duration || 9999;

    const pct = dur ? (t / dur) * 100 : 0;
    document.getElementById('narration-progress-bar').style.width = pct + '%';

    // Find current word — with small lookahead to compensate for ElevenLabs timing offset
    // Use 80ms lookahead so highlight fires slightly before the word is spoken
    const LOOKAHEAD = 0.08;
    let currentIdx = -1;
    for (let i = 0; i < narrationCurrentWords.length; i++) {
      if (narrationCurrentWords[i].start <= t + LOOKAHEAD) currentIdx = i;
      else break;
    }

    // Fire SFX triggers — after the trigger word has been passed
    for (const trigger of sfxTriggers) {
      const key = trigger.afterWordIdx + ':' + trigger.tag;
      if (!sfxFired.has(key) && currentIdx > trigger.afterWordIdx) {
        sfxFired.add(key);
        sfxPlay(trigger.tag);
      }
    }

    if (isStitched && charWordRanges.length) {
      // Mixed narrator/character paragraph:
      // - Narrator words: word-level karaoke (precise timing from first segment)
      // - Character words: entire segment lit as one block when first word reached
      // Find which char range is currently active (first word of range has been passed)
      const activeCharVoice = getCharVoiceForWord(currentIdx);

      // Update character label
      if (activeCharVoice) {
        const entry = Object.values(wikiById).find(e => e.voice_id === activeCharVoice);
        if (entry) {
          charLabel.textContent = '◉ ' + entry.name.split(' ')[0];
          charLabel.style.opacity = '1';
        }
      } else {
        charLabel.style.opacity = '0';
      }

      // Check if current word is a v3 block-highlight word (end===9999 = no alignment)
      // If so, find the full contiguous block and mark all of them current
      const isBlockWord = currentIdx >= 0 && !!narrationCurrentWords[currentIdx]?.blockHighlight;
      let blockStart = currentIdx, blockEnd = currentIdx;
      if (isBlockWord) {
        while (blockStart > 0 && narrationCurrentWords[blockStart - 1]?.blockHighlight) blockStart--;
        while (blockEnd < narrationCurrentWords.length - 1 && narrationCurrentWords[blockEnd + 1]?.blockHighlight) blockEnd++;
      }

      narrationCurrentWords.forEach((w, i) => {
        const el = document.getElementById('nw-' + w.idx);
        if (!el) return;
        const wordVoice = getCharVoiceForWord(i);
        const isChar    = !!wordVoice;

        if (isBlockWord && i >= blockStart && i <= blockEnd) {
          // Entire v3 block lit as current
          el.className = `nw ${w.fmt || ''} current${isChar ? ' char-voice' : ''}`;
          if (i === blockStart && window.innerWidth > 768) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else if (i < currentIdx) {
          el.className = `nw ${w.fmt || ''} spoken${isChar ? ' char-voice' : ''}`;
        } else if (i === currentIdx) {
          el.className = `nw ${w.fmt || ''} current${isChar ? ' char-voice' : ''}`;
          if (window.innerWidth > 768) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
          el.className = `nw ${w.fmt || ''}${isChar ? ' char-voice' : ''}`;
        }
      });

    } else {
      // Single-voice paragraph (narrator or single character).
      // If it's a character voice, show label + char-voice colour throughout.
      const singleVoice = segments.length === 1 ? segments[0].voiceId : null;
      if (singleVoice) {
        const entry = Object.values(wikiById).find(e => e.voice_id === singleVoice);
        if (entry) {
          charLabel.textContent = '◉ ' + entry.name.split(' ')[0];
          charLabel.style.opacity = '1';
        }
      } else {
        charLabel.style.opacity = '0';
      }
      const isBlockSingle = currentIdx >= 0 && !!narrationCurrentWords[currentIdx]?.blockHighlight;
      narrationCurrentWords.forEach((w, i) => {
        const el = document.getElementById('nw-' + w.idx);
        if (!el) return;
        const isChar = !!singleVoice;
        if (isBlockSingle && w.blockHighlight) {
          el.className = `nw ${w.fmt || ''} current${isChar ? ' char-voice' : ''}`;
        } else if (i < currentIdx) {
          el.className = `nw ${w.fmt || ''} spoken${isChar ? ' char-voice' : ''}`;
        } else if (i === currentIdx) {
          el.className = `nw ${w.fmt || ''} current${isChar ? ' char-voice' : ''}`;
          if (window.innerWidth > 768) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
          el.className = `nw ${w.fmt || ''}${isChar ? ' char-voice' : ''}`;
        }
      });
    }

  }
  function syncWords() {
    if (!narrationAudio || !narrationActive) return;
    updateKaraoke();
    narrationRAF = requestAnimationFrame(syncWords);
  }
  narrationRAF = requestAnimationFrame(syncWords);
}

function narrationTogglePlay() {
  if (!narrationAudio) return;
  if (narrationAudio.paused) {
    narrationAudio.play().catch(e => console.warn('Audio resume failed:', e));
    narrationPlaying = true;
    document.getElementById('nc-play-btn').innerHTML = '<span class="nc-icon">⏸</span><span class="nc-lbl">Pause</span>';
    // Also resume background music from where it was
    if (ambientEnabled && ambientAudio && ambientAudio.paused) ambientAudio.play().catch(() => {});
    // Resume karaoke sync using stored word timings
    function resumeSync() {
      if (!narrationAudio || narrationAudio.paused) return;
      const t   = narrationAudio.currentTime;
      const dur = narrationAudio.duration || 9999;
      const pct = dur ? (t / dur) * 100 : 0;
      document.getElementById('narration-progress-bar').style.width = pct + '%';

      let currentIdx = -1;
      for (let i = 0; i < narrationCurrentWords.length; i++) {
        if (narrationCurrentWords[i].start <= t + 0.08) currentIdx = i;
        else break;
      }
      narrationCurrentWords.forEach((w, i) => {
        const el = document.getElementById('nw-' + w.idx);
        if (!el) return;
        if (i < currentIdx)        el.className = `nw ${w.fmt || ''} spoken`;
        else if (i === currentIdx) el.className = `nw ${w.fmt || ''} current`;
        else                       el.className = `nw ${w.fmt || ''}`;
      });
      narrationRAF = requestAnimationFrame(resumeSync);
    }
    narrationRAF = requestAnimationFrame(resumeSync);
  } else {
    narrationAudio.pause();
    narrationPlaying = false;
    cancelAnimationFrame(narrationRAF);
    document.getElementById('nc-play-btn').innerHTML = '<span class="nc-icon">▶</span><span class="nc-lbl">Play</span>';
    // Also pause background music at current position
    if (ambientAudio && !ambientAudio.paused) ambientAudio.pause();
  }
}

function narrationPrev() {
  if (narrationLocked) return;
  if (narrationIndex > 0) narrationGoTo(narrationIndex - 1);
}

function narrationNext() {
  if (narrationLocked) return;
  narrationGoTo(narrationIndex + 1);
}

async function startNarrationFrom(pid) {
  unlockAudio(); // must be within user gesture
  narrationLocked = false; // reset any stuck state
  narrationParaIds = getNarrableParagraphs();
  const idx = narrationParaIds.indexOf(pid);
  narrationIndex = idx >= 0 ? idx : 0;
  narrationActive = true;

  const overlayEl2 = document.getElementById('narration-overlay');
  overlayEl2.style.display = ''; // clear inline style
  overlayEl2.classList.add('active');
  document.getElementById('narration-progress').style.display = 'block';
  document.getElementById('narration-controls').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  applyAmbientBtn(); applyMultiVoiceBtn();

  await narrationGoTo(narrationIndex);
}

let narrationThreadOpen = false;

function narrationToggleThread() {
  narrationThreadOpen = !narrationThreadOpen;
  const sidebar  = document.getElementById('narration-thread');
  const overlay  = document.getElementById('narration-overlay');
  const btn      = document.getElementById('nc-thread-btn');
  sidebar.classList.toggle('open', narrationThreadOpen);
  overlay.classList.toggle('thread-open', narrationThreadOpen);
  if (btn) btn.style.color = narrationThreadOpen ? 'var(--teal-bright)' : '';

  if (narrationThreadOpen) {
    const pid = narrationParaIds[narrationIndex];
    if (!pid) return;
    // Show preview
    document.getElementById('nt-preview').textContent = getParaText(pid).slice(0, 120) + '…';
    // Load comments into narration sidebar
    loadNarrationComments(pid);
  }
}

async function loadNarrationComments(pid) {
  const list = document.getElementById('nt-comments');
  const form = document.getElementById('nt-form');
  list.innerHTML = `<div style="font-family:var(--mono);font-size:0.72rem;color:var(--muted);text-align:center;padding:20px">Loading…</div>`;

  const { data } = await db.from('comments')
    .select('*')
    .eq('chapter', currentChapter)
    .eq('paragraph_id', pid)
    .order('created_at', { ascending: true });

  if (!data?.length) {
    list.innerHTML = `<div class="no-comments">No threads yet.<br/>Be the first to leave a note.</div>`;
  } else {
    list.innerHTML = data.map(c => {
      const avatarUrl = (c.avatar_url && c.avatar_url.startsWith('http')) ? c.avatar_url : '';
      return `<div class="comment-item">
        <div class="comment-head">
          <img class="c-avatar" src="${avatarUrl}" onerror="this.style.display='none'" alt="${c.display_name || ''}"/>
          <span class="c-name">${c.display_name || 'Anonymous'}</span>
          <span class="c-time">${timeAgo(c.created_at)}</span>
        </div>
        <div class="c-body">${escHtml(c.body)}</div>
      </div>`;
    }).join('');
    list.scrollTop = list.scrollHeight;
  }

  // Comment form
  if (!currentUser) {
    form.innerHTML = `<div class="cf-login"><span>Sign in to comment</span>
      <button class="auth-btn" onclick="signIn()">◎ Sign in with Discord</button></div>`;
  } else {
    form.innerHTML = `
      <textarea class="cf-textarea" id="nt-text" placeholder="Add a note…" maxlength="2000" style="min-height:64px"></textarea>
      <div class="cf-footer">
        <span class="cf-hint">Max 2000 chars</span>
        <button class="cf-submit" onclick="submitNarrationComment('${pid}')">Post</button>
      </div>`;
  }
}

async function submitNarrationComment(pid) {
  const textarea = document.getElementById('nt-text');
  const body = textarea?.value.trim();
  if (!body || !currentUser) return;
  const meta = currentUser.user_metadata;
  const displayName = meta?.custom_claims?.global_name || meta?.full_name || meta?.name || 'Reader';
  const { error } = await db.from('comments').insert({
    chapter: currentChapter, paragraph_id: pid,
    user_id: currentUser.id, display_name: displayName,
    avatar_url: getAvatarUrl(meta), body
  });
  if (!error) {
    commentCounts[pid] = (commentCounts[pid] || 0) + 1;
    loadNarrationComments(pid);
    // Update comment hint bubble
    document.getElementById('nch-count').textContent = commentCounts[pid];
    document.getElementById('narration-comment-hint').classList.add('visible');
  }
}

const prefetchInFlight = new Set();

async function prefetchNext(index) {
  if (index >= narrationParaIds.length) return;
  const pid     = narrationParaIds[index];
  let text    = getParaText(pid);
  let rawText = getRawText(pid) || text;
  if (!text) return;
  // Normalise newlines (matches narrationGoTo for cache key consistency)
  text = text.split('\n').join(' ').replace(/  +/g, ' ').trim();

  // Strip v3 emotion tags from display text (e.g. [sigh], [whispers], [excited])
  // These are processed by ElevenLabs v3 but should not appear to the reader.
  rawText = rawText.replace(/\[(?!#)[a-zA-Z][a-zA-Z0-9 _-]*\]/gi, '').trim();

  // Convert [#pause] tags: strip from rawText (display), convert in text (TTS).
  // rawText drives karaoke display — pause tags must be removed, not replaced.
  rawText = rawText
    .replace(/\[#pause4\]/g, ' ')
    .replace(/\[#pause3\]/g, ' ')
    .replace(/\[#pause2\]/g, ' ')
    .replace(/\[#pause\]/g,  ' ');
  // text drives TTS — inject silence via comma sequences (more reliable than dots)
  text = text
    .replace(/\[#pause4\]/g, ',,,, ')
    .replace(/\[#pause3\]/g, ',,, ')
    .replace(/\[#pause2\]/g, ',, ')
    .replace(/\[#pause\]/g,  ', ');

  // Epigraph: double all pause characters for a slower, more deliberate delivery
  if (isEpigraphPara(pid)) {
    text = text
      .replace(/\.\s/g,  '.   ')
      .replace(/\?\s/g,  '?   ')
      .replace(/!\s/g,   '!   ')
      .replace(/…/g,     '…   ')
      .replace(/,\s/g,   ',   ');
  }
    // Strip v3 emotion tags from display (rawText) — keep in TTS text for v3 voices
  rawText = rawText.replace(/\[(?!#)[a-zA-Z][a-zA-Z0-9 _-]*\]/gi, '').trim();

  // Convert [#pause] tags: comma sequences in TTS text (silence), stripped from rawText
  text = text
    .replace(/\[#pause4\]/g, ',,,, ')
    .replace(/\[#pause3\]/g, ',,, ')
    .replace(/\[#pause2\]/g, ',, ')
    .replace(/\[#pause\]/g,  ', ');
  // Strip all SFX tags
  text    = text.replace(/\[#[a-z0-9_-]+\]/g, '').replace(/\[(?!#)[a-zA-Z][a-zA-Z0-9 _-]*\]/gi, '').trim();
  rawText = rawText.replace(/\[#[a-z0-9_-]+\]/g, '').replace(/\[(?!#)[a-zA-Z][a-zA-Z0-9 _-]*\]/gi, '').trim();
  // Strip ALL-CAPS SPEAKER: prefix (same as narrationGoTo) for cache key match
  const _prefixRe = /^[A-Z][A-Z0-9 ]+:\s+/;
  const _pm = text.match(_prefixRe);
  if (_pm) {
    text = text.slice(_pm[0].length);
    const _rpm = rawText.match(_prefixRe);
    if (_rpm) rawText = rawText.slice(_rpm[0].length);
  }
  const charVoice  = multiVoiceEnabled ? detectSpeakerVoice(rawText) : null;
  const segments   = buildSegments(text, charVoice, null);
  const modelSuffix = narratorModelOverride ? '|' + narratorModelOverride : '';
  const cacheKey   = READER_VERSION + '|' + pid + modelSuffix + '|' + segments.map(s => (s.voiceId||'n')+':'+s.text.slice(0,20)).join('|');
  if (narrationCache[cacheKey] || prefetchInFlight.has(cacheKey)) return;
  prefetchInFlight.add(cacheKey);
  try {
    let data;
    const pfFetch = async (body) => {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 20000);
      const res = await fetch(NARRATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_KEY}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      return res.json();
    };
    if (segments.length === 1) {
      const seg = segments[0];
      data = await pfFetch({ text: seg.text, ...(seg.voiceId ? { voiceId: seg.voiceId } : {}) });
    } else {
      const results = await Promise.all(segments.map(seg =>
        pfFetch({ text: seg.text, ...(seg.voiceId ? { voiceId: seg.voiceId } : {}) })
          .catch(e => ({ error: e.message }))
      ));
      data = results.some(r => r.error) ? null : stitchSegments(results);
    }
    if (data && !data.error) cacheSet(cacheKey, data);
  } catch(_) {}
  finally { prefetchInFlight.delete(cacheKey); }
}

// ── Helpers ──────────────────────────────────────────────
function buildWordTimingsFromSegments(fullText, segments, segmentMeta) {
  // For each segment, build word timings using that segment's own alignment + timeOffset
  // This gives narrator segments accurate timing regardless of stitching drift
  const allWords = [];

  segments.forEach((seg, si) => {
    const meta    = segmentMeta[si];
    if (!meta) return;
    const isBlock = !meta.alignment || !meta.alignment.characters;
    const alignWithHint = isBlock
      ? { _audioDur: (meta.byteEnd - meta.byteStart) / 16000 } // will be overridden by real duration from loadedmetadata
      : meta.alignment;
    const segWords = buildWordTimings(seg.text, alignWithHint);
    // In estimate mode, use real spread timing (no blockHighlight)
    const useBlock = isBlock && V3_BLOCK_MODE_ENABLED && window.V3_WORD_MODE !== 'estimate';
    segWords.forEach(w => {
      allWords.push({
        ...w,
        start:          w.start + meta.timeOffset,
        end:            useBlock ? 9999 : w.end + meta.timeOffset,
        segVoice:       seg.voiceId || null,
        blockHighlight: useBlock,
      });
    });
  });

  return allWords;
}

function buildWordTimings(text, alignment) {
  // v3 plain endpoint returns no alignment.
  // V3_WORD_MODE: 'estimate' = per-word estimated timing (default), 'block' = whole segment
  if (!alignment || !alignment.characters) {
    if (window.V3_WORD_MODE === 'estimate') {
      const PAUSE_DURS = { 'pause': 0.6, 'pause2': 1.2, 'pause3': 2.0, 'pause4': 3.0 };
      const totalDur = alignment?._audioDur || 0;

      // Split on [#pause] tags
      const parts = text.split(/(\[#pause\d*\])/);
      const entries = [];
      let pendingPause = 0;
      parts.forEach(part => {
        const m = part.match(/\[#(pause\d*)\]/);
        if (m) { pendingPause += PAUSE_DURS[m[1]] || 0.6; return; }
        part.split(/\s+/).filter(Boolean).forEach((w, i) => {
          entries.push({ text: w, pauseBefore: i === 0 ? pendingPause : 0 });
          pendingPause = 0;
        });
      });
      if (!entries.length) return [];

      // Independent per-word duration based on its own properties
      // Errors don't compound — each word is estimated on its own merit, then all scaled to fit
      function wordBaseDur(w) {
        const syllables = Math.max(1, (w.match(/[aeiouyAEIOUY]+/g)||[]).length);
        const letters   = w.replace(/[^a-zA-Z]/g, '');
        let dur = syllables * 0.18 + Math.max(0, letters.length - 4) * 0.02;
        if (/[.!?]["']?$/.test(w))      dur += 0.32;
        else if (/…$/.test(w))           dur += 0.25;
        else if (/,["']?$/.test(w))      dur += 0.13;
        else if (/[;:]$/.test(w))        dur += 0.18;
        return dur;
      }

      const totalPause    = entries.reduce((s, e) => s + e.pauseBefore, 0);
      const rawSpeechDur  = entries.reduce((s, e) => s + wordBaseDur(e.text), 0);
      const availSpeech   = Math.max((totalDur || rawSpeechDur) - totalPause, entries.length * 0.15);
      const scale         = availSpeech / rawSpeechDur;

      let t = 0;
      return entries.map(e => {
        t += e.pauseBefore;
        const dur   = wordBaseDur(e.text) * scale;
        const GAP = 0.02; // v3 inter-word micro-gap
        const entry = { text: e.text, start: parseFloat(t.toFixed(3)), end: parseFloat((t + dur).toFixed(3)) };
        t += dur + GAP;
        return entry;
      });
    }
    return text.split(/\s+/).filter(Boolean).map(w => ({ text: w, start: 0, end: 9999, blockHighlight: true }));
  }
  const chars      = alignment.characters || [];
  const startTimes = alignment.character_start_times_seconds || [];
  const endTimes   = alignment.character_end_times_seconds   || [];

  const words = [];
  let word = '', wordStart = 0, wordEnd = 0;
  let pendingBreak = false; // track \n for line break display

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];

    // Note: no inTag skipping — we don't use SSML and transmission text
    // has literal < > that should be treated as regular characters.

    if (c === '\n') {
      if (word) {
        words.push({ text: word, start: wordStart, end: wordEnd, space: true, br: true });
        word = '';
      } else {
        pendingBreak = true;
      }
    } else if (c === ' ') {
      if (word) {
        words.push({ text: word, start: wordStart, end: wordEnd, space: true, br: pendingBreak });
        word = '';
        pendingBreak = false;
      }
    } else {
      if (!word) wordStart = startTimes[i] || 0;
      word   += c;
      wordEnd = endTimes[i] || 0;
    }
  }
  if (word) words.push({ text: word, start: wordStart, end: wordEnd, space: false, br: pendingBreak });

  // Merge tokens that start with an apostrophe into the preceding word.
  // ElevenLabs occasionally splits contractions: ["let", "'s"] or ["don", "'t"].
  // Merging keeps word count in sync with the display text.
  const merged = [];
  for (const w of words) {
    if (/^['‘’ʼ]/.test(w.text) && merged.length > 0) {
      const prev = merged[merged.length - 1];
      prev.text += w.text;
      prev.end   = w.end;
      prev.space = w.space;
      prev.br    = prev.br || w.br;
    } else {
      merged.push(w);
    }
  }

  return merged;
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

// ── Main app ─────────────────────────────────────────────
const SUPA_URL = 'https://sscpikfblqtmcefegrpv.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzY3Bpa2ZibHF0bWNlZmVncnB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNzUzMzgsImV4cCI6MjA5Mjk1MTMzOH0.I9qzVnzmiYxwZ6RPLV7KWva8P9L0Q1MHFqgmlmr3g0g';
const { createClient } = supabase;
const db = createClient(SUPA_URL, SUPA_KEY);

// ── State ────────────────────────────────────────────────
let currentChapter   = 1;
let currentParaId    = null;
let currentUser      = null;
let wikiIndex        = {};   // name/alias → entry
let wikiById         = {};   // id → entry  (for speaker tag lookups)
let commentCounts    = {};   // paragraphId → count

// ── Chapters — loaded from data/chapters/chapter-N.json ──
const CHAPTER_COUNT = 5;
window.V3_WORD_MODE = 'estimate'; // default: word-by-word for v3 voices

const chapterNames  = { 1:'Assembly', 2:'The Startend', 3:'Doubt and Certainty', 4:'The Grid', 5:'Two Courses' }; // increment as you add files

async function loadChapter(n) {
  currentChapter = n;
  currentParaId  = null;
  cacheClear();
  renderChapterPills();
  closeSidebar();

  const el = document.getElementById('chapter-content');
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:50vh;font-family:var(--serif);font-style:italic;color:var(--muted)">Loading…</div>`;

  let ch;
  try {
    const res = await fetch(`data/chapters/chapter-${n}.json`);
    ch = await res.json();
  } catch(e) {
    el.innerHTML = `<div style="text-align:center;padding:80px;font-family:var(--serif);font-style:italic;color:var(--muted)">Chapter not found.</div>`;
    return;
  }

  await loadCommentCounts(n);
  preloadChapterSfx(ch);
  renderChapter(ch);
  // Inject end card into reader (reading mode — narration has its own)
  injectReaderEndCard(n, ch.title);
}

function continueToNextChapter(n) {
  if (narrationActive) {
    // Narration mode: load chapter then start narration automatically
    stopNarration();
    loadChapter(n).then(() => startNarration());
  } else {
    // Reading mode: just load the chapter
    loadChapter(n);
  }
}

function injectReaderEndCard(n, chapterTitle) {
  const el = document.getElementById('chapter-content');
  if (!el) return;
  // Remove any existing end card first (narration may have added one already)
  el.querySelectorAll('.chapter-end-card').forEach(c => c.remove());
  const hasNext = n < CHAPTER_COUNT;
  const card = document.createElement('div');
  card.className = 'chapter-end-card visible';
  card.style.cssText = 'margin: 80px auto 40px; text-align:center;';
  card.innerHTML = `
    <div class="cec-label">Chapter ${n} complete</div>
    <div class="cec-title">${chapterTitle || ''}</div>
    <div class="cec-sub">Vera and Milo are ready to discuss it.</div>
    <div class="cec-actions">
      <button class="cec-btn secondary" onclick="openPodcastPanel()">🎙 Decoded — AI podcast review</button>
      ${hasNext ? `<button class="cec-btn primary" onclick="continueToNextChapter(${n + 1})">Continue to Chapter ${n + 1} →</button>` : `
      <a href="index.html#buy" class="cec-btn primary">Buy the eBook →</a>
      <a href="https://www.goodreads.com/book/show/251501817-the-unfolding" class="cec-btn secondary" target="_blank" rel="noopener">★ Add on Goodreads</a>`}
    </div>`;
  el.appendChild(card);
}

function renderChapterPills() {
  const el = document.getElementById('chapter-pills');
  if (CHAPTER_COUNT <= 8) {
    // Pills for small chapter count
    el.innerHTML = Array.from({ length: CHAPTER_COUNT }, (_, i) => i + 1).map(n => `
      <button class="cp-btn ${n === currentChapter ? 'active' : ''}" onclick="loadChapter(${n})">
        Ch. ${n}
      </button>`).join('');
  } else {
    // Compact dropdown for many chapters
    const opts = Array.from({ length: CHAPTER_COUNT }, (_, i) => i + 1)
      .map(n => `<option value="${n}" ${n === currentChapter ? 'selected' : ''}>Chapter ${n}</option>`)
      .join('');
    el.innerHTML = `<select class="cp-select" onchange="loadChapter(+this.value)" title="Jump to chapter">${opts}</select>`;
  }
}

// ── Wiki index builder ───────────────────────────────────
const DATA_FILES = [
  'data/characters.json','data/ships.json','data/locations.json',
  'data/items.json','data/factions.json','data/biology.json','data/lore.json'
];

async function buildWikiIndex() {
  const all = await Promise.all(DATA_FILES.map(f => fetch(f).then(r => r.json()).catch(() => [])));
  all.flat().forEach(entry => {
    const names = [entry.name || entry.title];
    if (entry.aliases) names.push(...entry.aliases.split(',').map(a => a.trim()));
    names.filter(Boolean).forEach(n => {
      wikiIndex[n.toLowerCase()] = entry;
    });
    if (entry.id) wikiById[entry.id] = entry;
  });
}

// ── Auth ─────────────────────────────────────────────────
async function initAuth() {
  // First try to get session from URL hash (OAuth callback)
  const { data: { session: hashSession } } = await db.auth.getSession();

  // If no session yet, try exchanging the hash params manually
  if (!hashSession && window.location.hash.includes('access_token')) {
    const params = new URLSearchParams(window.location.hash.replace(/^#+/, ''));
    const access_token  = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (access_token && refresh_token) {
      await db.auth.setSession({ access_token, refresh_token });
    }
  }

  const { data: { session } } = await db.auth.getSession();
  currentUser = session?.user ?? null;
  renderAuthArea();

  // Clean the URL without reloading
  if (window.location.hash.includes('access_token')) {
    history.replaceState(null, '', window.location.pathname);
  }

  db.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user ?? null;
    renderAuthArea();
    if (currentParaId) renderCommentForm();

    // Auto-join Discord server on sign-in
    if (_event === 'SIGNED_IN' && session?.provider_token) {
      try {
        await fetch('https://sscpikfblqtmcefegrpv.supabase.co/functions/v1/discord-join', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ provider_token: session.provider_token }),
        });
      } catch(e) {
        console.warn('Discord join failed:', e);
      }
    }
  });
}

function getAvatarUrl(meta) {
  return meta?.avatar_url || meta?.picture || '';
}

function renderAuthArea() {
  const el = document.getElementById('auth-area');
  if (currentUser) {
    const meta = currentUser.user_metadata;
    const name   = meta?.custom_claims?.global_name || meta?.full_name || meta?.name || 'Reader';
    const avatar = getAvatarUrl(meta);
    el.innerHTML = `
      ${avatar ? `<img class="auth-avatar" src="${avatar}" alt="${name}"/>` : ''}
      <span class="auth-name">${name}</span>
      <button class="auth-btn" onclick="signOut()">Sign out</button>`;
  } else {
    el.innerHTML = `<button class="auth-btn" onclick="signIn()">◎ Sign in with Discord</button>`;
  }
}

async function signIn() {
  await db.auth.signInWithOAuth({
    provider: 'discord',
    options: {
      redirectTo: window.location.origin + window.location.pathname,
      scopes: 'identify email guilds.join'
    }
  });
}

async function signOut() {
  await db.auth.signOut();
}

function preloadChapterSfx(ch) {
  // Scan all paragraph texts for [#tag] and preload them before narration starts
  const SFX_SCAN_RE = /\[#([a-z0-9_-]+)\]/g;
  const tags = new Set();
  (ch.sections || []).forEach(sec => {
    (sec.paragraphs || []).forEach(p => {
      const t = typeof p === 'string' ? p : (p.text || '');
      for (const m of t.matchAll(SFX_SCAN_RE)) tags.add(m[1]);
    });
  });
  tags.forEach(tag => sfxLoad(tag));
  if (tags.size) console.log('[SFX] Preloading ' + tags.size + ' effect(s):', [...tags].join(', '));
}

function renderChapter(ch) {
  const el = document.getElementById('chapter-content');

  let paraIndex = 0;
  let sceneIndex = 1;
  let prevSecType = null; // track previous section type for scene transitions
  let html = `
    <div class="ch-hero">
      <div class="ch-eyebrow">Chapter ${currentChapter}</div>
      <h1 class="ch-title">${ch.title}</h1>
      <p class="ch-subtitle">${ch.subtitle}</p>
      <div class="ch-narrate-wrap">
        <button class="ch-narrate-btn ch-narrate-btn--icon" onclick="startNarration()" id="ch-narrate-btn" aria-label="Start narration">
          <span class="ch-narrate-ring"></span>
          <span class="ch-narrate-ring ch-narrate-ring--2"></span>
          <span class="ch-narrate-icon">▶</span>
        </button>
        <p class="ch-narrate-hint">Immersive · Full cast</p>
      </div>
    </div>`;

  ch.sections.forEach((sec) => {

    // ── Uplink interlude ──
    if (sec.type === 'uplink') {
      sceneIndex++; // uplinks count as scene breaks for audio purposes
      const isTemporalOrientation = (sec.heading || '').toLowerCase().includes('temporal');
      const isAssets = sec.subtype === 'assets';
      const labelHtml = isTemporalOrientation
        ? `<a href="wiki.html?entry=time-system" target="_blank" rel="noopener">${sec.heading}</a>`
        : (sec.heading || 'UPLINK');

      const headingPid  = `ch${currentChapter}-p${paraIndex}`;
      const headingText = sec.heading || 'UPLINK';
      paraIndex++;

      const headingPara = `
        <p class="para uplink-heading-para"
           id="${headingPid}"
           data-para-id="${headingPid}"
           data-comment-count="0"
           data-scene="${sceneIndex}"
           data-raw="${escAttr(headingText)}"
           onclick="selectPara('${headingPid}', this)">
          <span class="para-toolbar">
            <button class="pt-btn" onclick="event.stopPropagation();openThread('${headingPid}')">💬 Thread</button>
            <button class="pt-btn pt-narrate" onclick="event.stopPropagation();startNarrationFrom('${headingPid}')">▶ Narrate</button>
          </span>
          ${labelHtml}
        </p>`;

      const parasHtml = sec.paragraphs.map(paraItem => {
        const text   = typeof paraItem === 'string' ? paraItem : paraItem.text;
        const speakerTag   = typeof paraItem === 'object' ? paraItem.speaker     || null : null;
        const innerVoiceTag = typeof paraItem === 'object' ? paraItem.inner_voice  || null : null;
        const pauseBefore   = typeof paraItem === 'object' ? paraItem.pause_before || 0    : 0;
        const narratorModel = typeof paraItem === 'object' ? (paraItem.narrator || sec.narrator || null) : (sec.narrator || null);
        const pid   = `ch${currentChapter}-p${paraIndex}`;
        const count = commentCounts[pid] || 0;
        const displayText = text.replace(/\[#[a-z0-9_-]+\]/g, '').replace(/\[(?!#)[a-zA-Z][a-zA-Z0-9 _-]*\]/gi, '').trim();
        const linked = autoLink(parseMarkup(displayText));
        paraIndex++;

        // Level 1 (system): all-caps e.g. **SOL SYSTEM**, **YREUS SYSTEM**, **MAIREE**
        // Level 2 (subset): mixed-case bold-only e.g. **En Route to Mairee**, **In Orbit**
        const trimmed = text.trim();
        const isLevel1 = isAssets && /^\*\*[A-Z][A-Z\s&·]+\*\*$/.test(trimmed);
        const isLevel2 = isAssets && !isLevel1 && /^\*\*[A-Z][a-zA-Z\s'·]+\*\*$/.test(trimmed);

        if (isLevel1) {
          return `<div class="uplink-section-divider uplink-s1" id="${pid}" data-para-id="${pid}" data-raw="${escAttr(text)}" data-speaker="${speakerTag||''}" data-comment-count="${count}">${parseMarkup(text)}</div>`;
        }
        if (isLevel2) {
          return `<div class="uplink-section-divider uplink-s2" id="${pid}" data-para-id="${pid}" data-raw="${escAttr(text)}" data-speaker="${speakerTag||''}" data-comment-count="${count}">${parseMarkup(text)}</div>`;
        }

        // Transcript paragraphs: extract SPEAKER: prefix and show as styled label
        const isTranscript = typeof paraItem === 'object' && paraItem.transcript === true;
        const TPRE = /^([A-Z][A-Z0-9 ·]+):\s+/;
        let displayHtml = linked;
        let transcriptLabel = '';
        if (isTranscript) {
          const m = text.match(TPRE);
          if (m) {
            transcriptLabel = `<span class="transcript-speaker">${m[1]}</span>`;
            // Display text without the prefix
            const speechText = text.slice(m[0].length);
            displayHtml = autoLink(parseMarkup(speechText));
          }
        }

        return `
          <p class="para${count > 0 ? ' has-comments' : ''}${isTranscript ? ' transcript-para' : ''}"
             id="${pid}"
             data-para-id="${pid}"
             data-comment-count="${count}"
             data-scene="${sceneIndex}"
             data-raw="${escAttr(text)}"
             data-speaker="${speakerTag || ''}" 
             data-inner-voice="${innerVoiceTag || ''}" 
             data-transcript="${isTranscript ? 'true' : ''}"
             ${pauseBefore ? `data-pause-before="${pauseBefore}"` : ''}
             ${narratorModel ? `data-narrator-model="${narratorModel}"` : ''}
             onclick="selectPara('${pid}', this)">
            <span class="para-toolbar">
              <button class="pt-btn" onclick="event.stopPropagation();lookupSelection('${pid}')">🔍 Look up</button>
              <button class="pt-btn" onclick="event.stopPropagation();openThread('${pid}')">💬 Thread${count > 0 ? ` (${count})` : ''}</button>
              <button class="pt-btn pt-narrate" onclick="event.stopPropagation();startNarrationFrom('${pid}')">▶ Narrate</button>
            </span>
            ${transcriptLabel}${displayHtml}
          </p>`;
      }).join('');

      html += `<div class="uplink-block${isAssets ? ' uplink-assets' : ''}">
        ${headingPara}
        ${parasHtml}
      </div>`;
      prevSecType = 'uplink';
      return;
    }

    // ── Scene break ──
    if (sec.type === 'scene-break') {
      html += `<div class="scene-break"><span>✦</span><span>✦</span><span>✦</span></div>`;
      sceneIndex++;
      prevSecType = 'scene-break';
      return;
    }
    if (sec.type === 'epigraph') {
      const parasHtml = sec.paragraphs.map(paraItem => {
        const text   = typeof paraItem === 'string' ? paraItem : paraItem.text;
        const speakerTag   = typeof paraItem === 'object' ? paraItem.speaker     || null : null;
        const innerVoiceTag = typeof paraItem === 'object' ? paraItem.inner_voice  || null : null;
        const pauseBefore   = typeof paraItem === 'object' ? paraItem.pause_before || 0    : 0;
        const narratorModel = typeof paraItem === 'object' ? (paraItem.narrator || sec.narrator || null) : (sec.narrator || null);
        const pid   = `ch${currentChapter}-p${paraIndex}`;
        const count = commentCounts[pid] || 0;
        const displayText = text.replace(/\[#[a-z0-9_-]+\]/g, '').replace(/\[(?!#)[a-zA-Z][a-zA-Z0-9 _-]*\]/gi, '').trim();
        const linked = autoLink(parseMarkup(displayText));
        paraIndex++;
        return `
          <p class="para epigraph-para${count > 0 ? ' has-comments' : ''}"
             id="${pid}"
             data-para-id="${pid}"
             data-comment-count="${count}"
             data-scene="${sceneIndex}"
             data-raw="${escAttr(text)}"
             data-speaker="${speakerTag || ''}" 
             data-inner-voice="${innerVoiceTag || ''}"
             ${pauseBefore ? `data-pause-before="${pauseBefore}"` : ''}
             ${narratorModel ? `data-narrator-model="${narratorModel}"` : ''}
             onclick="selectPara('${pid}', this)">
            <span class="para-toolbar">
              <button class="pt-btn" onclick="event.stopPropagation();lookupSelection('${pid}')">🔍 Look up</button>
              <button class="pt-btn" onclick="event.stopPropagation();openThread('${pid}')">💬 Thread${count > 0 ? ` (${count})` : ''}</button>
              <button class="pt-btn pt-narrate" onclick="event.stopPropagation();startNarrationFrom('${pid}')">▶ Narrate</button>
            </span>
            ${linked}
          </p>`;
      }).join('');
      html += `<div class="epigraph-block">${parasHtml}</div>`;
      sceneIndex++;
      prevSecType = 'epigraph';
      return;
    }

    // ── Code / transmission block ──
    if (sec.type === 'code') {
      const parasHtml = sec.paragraphs.map(paraItem => {
        const text   = typeof paraItem === 'string' ? paraItem : paraItem.text;
        const speakerTag   = typeof paraItem === 'object' ? paraItem.speaker     || null : null;
        const innerVoiceTag = typeof paraItem === 'object' ? paraItem.inner_voice  || null : null;
        const pauseBefore   = typeof paraItem === 'object' ? paraItem.pause_before || 0    : 0;
        const narratorModel = typeof paraItem === 'object' ? (paraItem.narrator || sec.narrator || null) : (sec.narrator || null);
        const pid   = `ch${currentChapter}-p${paraIndex}`;
        const count = commentCounts[pid] || 0;
        paraIndex++;
        return `
          <p class="para"
             id="${pid}"
             data-para-id="${pid}"
             data-comment-count="${count}"
             data-scene="${sceneIndex}"
             data-raw="${escAttr(text)}"
             data-speaker="${speakerTag || ''}" 
             data-inner-voice="${innerVoiceTag || ''}" 
             onclick="selectPara('${pid}', this)">
            <span class="para-toolbar">
              <button class="pt-btn" onclick="event.stopPropagation();openThread('${pid}')">💬 Thread${count > 0 ? ` (${count})` : ''}</button>
              <button class="pt-btn pt-narrate" onclick="event.stopPropagation();startNarrationFrom('${pid}')">▶ Narrate</button>
            </span>
            ${autoLink(parseMarkup(text.replace(/</g,'&lt;').replace(/>/g,'&gt;')))}
          </p>`;
      }).join('');
      html += `<div class="code-block">${parasHtml}</div>`;
      return;
    }
    // If coming from an uplink, that already incremented sceneIndex on entry.
    // The prose after it is a new scene — but epigraph already incremented on exit,
    // so only increment when transitioning FROM an uplink.
    if (prevSecType === 'uplink') {
      sceneIndex++;
    }
    prevSecType = 'prose';
    if (sec.heading) {
      const isLocation = sec.heading.includes('·') || /[A-Z]{2,}/.test(sec.heading);
      html += isLocation
        ? `<div class="ch-location-head">${sec.heading}</div>`
        : `<div class="ch-divider"></div><h3 class="ch-section-head">${sec.heading}</h3>`;
    }

    sec.paragraphs.forEach((paraItem, pi) => {
      const text = typeof paraItem === 'string' ? paraItem : paraItem.text;
      const speakerTag   = typeof paraItem === 'object' ? (paraItem.speaker    || '') : '';
      const innerVoiceTag = typeof paraItem === 'object' ? (paraItem.inner_voice || '') : '';
      const pid   = `ch${currentChapter}-p${paraIndex}`;
      const count = commentCounts[pid] || 0;
      const isFirst = paraIndex === 0;
      const displayText = text.replace(/\[#[a-z0-9_-]+\]/g, '').replace(/\[(?!#)[a-zA-Z][a-zA-Z0-9 _-]*\]/gi, '').trim();
      const linked  = autoLink(parseMarkup(displayText));
      paraIndex++;
      html += `
        <p class="para${isFirst ? ' drop-cap' : ''}${count > 0 ? ' has-comments' : ''}"
           id="${pid}"
           data-para-id="${pid}"
           data-comment-count="${count}"
           data-scene="${sceneIndex}"
           data-raw="${escAttr(text)}"
           data-speaker="${speakerTag || ''}" 
           data-inner-voice="${innerVoiceTag || ''}" 
           onclick="selectPara('${pid}', this)">
          <span class="para-toolbar">
            <button class="pt-btn" onclick="event.stopPropagation();lookupSelection('${pid}')">🔍 Look up</button>
            <button class="pt-btn" onclick="event.stopPropagation();openThread('${pid}')">💬 Thread${count > 0 ? ` (${count})` : ''}</button>
              <button class="pt-btn pt-narrate" onclick="event.stopPropagation();startNarrationFrom('${pid}')">▶ Narrate</button>
          </span>
          ${linked}
        </p>`;
    });
  });

  el.innerHTML = html;
  applyFontSize();

  // Chapter-end card with podcast invite
  const endCard = document.createElement('div');
  endCard.className = 'chapter-end-card visible';
  const hasNext = currentChapter < CHAPTER_COUNT;
  endCard.innerHTML = `
    <div class="cec-label">Chapter ${currentChapter} complete</div>
    <div class="cec-title">${ch.title}</div>
    <div class="cec-sub">Vera and Milo are ready to discuss it.</div>
    <div class="cec-actions">
      <button class="cec-btn secondary" onclick="openPodcastPanel()">🎙 Decoded — AI podcast review</button>
      ${hasNext ? `<button class="cec-btn primary" onclick="loadChapter(${currentChapter + 1})">Continue to Chapter ${currentChapter + 1} →</button>` : ''}
    </div>`;
  // Remove any existing reader end card to avoid duplicates
  document.getElementById('chapter-content')?.querySelectorAll('.chapter-end-card').forEach(c => c.remove());
  el.appendChild(endCard);

  // Show the FAB
  document.getElementById('podcast-fab').classList.add('visible');
}

// ── Markup parser (*italic*, **bold**, ~~small caps~~, \n breaks) ──
function parseMarkup(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/~~(.+?)~~/g, '<span style="font-variant:small-caps;letter-spacing:0.06em">$1</span>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

// ── Auto wiki linking ────────────────────────────────────
function autoLink(text) {
  // Sort by length descending so longer names match first
  const names = Object.keys(wikiIndex).sort((a, b) => b.length - a.length);
  let result  = text;
  const placeholders = [];

  names.forEach(name => {
    if (name.length < 4) return; // skip very short words
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![\\w-])(${escaped})(?![\\w-])`, 'gi');
    result = result.replace(re, (match) => {
      const idx = placeholders.length;
      placeholders.push(`<span class="wiki-link" onclick="event.stopPropagation();openWikiPopup('${encodeURIComponent(name)}')" title="Wiki: ${match}">${match}</span>`);
      return `\x00${idx}\x00`;
    });
  });

  // Restore placeholders
  result = result.replace(/\x00(\d+)\x00/g, (_, i) => placeholders[+i]);
  return result;
}

// ── Para selection ───────────────────────────────────────
function selectPara(pid, el) {
  // Deactivate previous
  document.querySelectorAll('.para.active').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  currentParaId = pid;
  openThread(pid);
}

function openThread(pid) {
  currentParaId = pid;
  document.getElementById('sb-empty').style.display = 'none';
  document.getElementById('sb-panel').classList.add('visible');

  // Preview text
  const paraEl = document.getElementById(pid);
  const raw    = getParaText(pid).slice(0, 120) + '…';
  document.getElementById('sb-para-preview').textContent = raw;

  loadComments(pid);
  renderCommentForm();

  // Mobile: open sidebar
  document.getElementById('reader-sidebar').classList.add('open');
}

function closeSidebar() {
  document.getElementById('sb-empty').style.display = '';
  document.getElementById('sb-panel').classList.remove('visible');
  document.getElementById('reader-sidebar').classList.remove('open');
  document.querySelectorAll('.para.active').forEach(p => p.classList.remove('active'));
  currentParaId = null;
}

// ── Comments ─────────────────────────────────────────────
async function loadCommentCounts(chapter) {
  const { data } = await db.from('comments')
    .select('paragraph_id')
    .eq('chapter', chapter);
  commentCounts = {};
  (data || []).forEach(r => {
    commentCounts[r.paragraph_id] = (commentCounts[r.paragraph_id] || 0) + 1;
  });
}

async function loadComments(pid) {
  const list = document.getElementById('comments-list');
  list.innerHTML = `<div style="font-family:var(--mono);font-size:0.72rem;color:var(--muted);text-align:center;padding:20px">Loading…</div>`;

  const { data, error } = await db.from('comments')
    .select('*')
    .eq('chapter', currentChapter)
    .eq('paragraph_id', pid)
    .order('created_at', { ascending: true });

  if (error || !data?.length) {
    list.innerHTML = `<div class="no-comments">No threads yet.<br/>Be the first to leave a note.</div>`;
    return;
  }

  list.innerHTML = data.map(c => {
    const avatarUrl = (c.avatar_url && c.avatar_url.startsWith('http')) ? c.avatar_url : '';
    return `
    <div class="comment-item" id="c-${c.id}">
      <div class="comment-head">
        <img class="c-avatar" src="${avatarUrl}" alt="${c.display_name || 'Reader'}"
          onerror="this.style.display='none'"/>
        <span class="c-name">${c.display_name || 'Anonymous'}</span>
        <span class="c-time">${timeAgo(c.created_at)}</span>
        ${currentUser?.id === c.user_id ? `<button class="c-delete" onclick="deleteComment('${c.id}','${pid}')" title="Delete">✕</button>` : ''}
      </div>
      <div class="c-body">${escHtml(c.body)}</div>
    </div>`;
  }).join('');

  list.scrollTop = list.scrollHeight;
}

function renderCommentForm() {
  const el = document.getElementById('comment-form');
  if (!currentParaId) { el.innerHTML = ''; return; }

  if (!currentUser) {
    el.innerHTML = `
      <div class="cf-login">
        <span>Sign in to join the thread</span>
        <button class="auth-btn" onclick="signIn()">◎ Sign in with Discord</button>
      </div>`;
    return;
  }

  el.innerHTML = `
    <textarea class="cf-textarea" id="cf-text" placeholder="Add a note to this paragraph…" maxlength="2000"></textarea>
    <div class="cf-footer">
      <span class="cf-hint">Max 2000 chars</span>
      <button class="cf-submit" id="cf-btn" onclick="submitComment()">Post</button>
    </div>`;
}

async function submitComment() {
  const textarea = document.getElementById('cf-text');
  const btn      = document.getElementById('cf-btn');
  const body     = textarea.value.trim();
  if (!body || !currentUser || !currentParaId) return;

  btn.disabled   = true;
  btn.textContent = 'Posting…';

  const meta = currentUser.user_metadata;
  const displayName = meta?.custom_claims?.global_name || meta?.full_name || meta?.name || 'Reader';
  const { error } = await db.from('comments').insert({
    chapter:      currentChapter,
    paragraph_id: currentParaId,
    user_id:      currentUser.id,
    display_name: displayName,
    avatar_url:   getAvatarUrl(meta),
    body
  });

  if (error) {
    const msg = error.message?.includes('Rate limit')
      ? 'Slow down — max 5 comments per 10 minutes.'
      : 'Error posting comment. Try again.';
    toast(msg);
    btn.disabled = false; btn.textContent = 'Post';
    return;
  }

  textarea.value = '';
  btn.disabled = false; btn.textContent = 'Post';
  commentCounts[currentParaId] = (commentCounts[currentParaId] || 0) + 1;

  // Update bubble on paragraph
  const paraEl = document.getElementById(currentParaId);
  if (paraEl) {
    paraEl.classList.add('has-comments');
    paraEl.dataset.commentCount = commentCounts[currentParaId];
    // Refresh thread button label
    const tBtn = paraEl.querySelector('.pt-btn:last-child');
    if (tBtn) tBtn.textContent = `💬 Thread (${commentCounts[currentParaId]})`;
  }

  loadComments(currentParaId);
}

async function deleteComment(id, pid) {
  await db.from('comments').delete().eq('id', id);
  commentCounts[pid] = Math.max(0, (commentCounts[pid] || 1) - 1);
  const paraEl = document.getElementById(pid);
  if (paraEl) {
    paraEl.dataset.commentCount = commentCounts[pid];
    if (commentCounts[pid] === 0) paraEl.classList.remove('has-comments');
  }
  loadComments(pid);
}

// ── Wiki popup ───────────────────────────────────────────
function openWikiPopup(encodedName) {
  const name  = decodeURIComponent(encodedName).toLowerCase();
  const entry = wikiIndex[name];
  if (!entry) return;

  const TAG_LABELS = { char:'Character', ship:'Ship', loc:'Location', item:'Item / Tech', ai:'AI', org:'Faction / Org', biology:'Biology', lore:'Lore' };
  const popup = document.getElementById('wiki-popup');
  popup.innerHTML = `
    <div class="wp-head">
      <div>
        <div class="wp-tag">${TAG_LABELS[entry.tag] || entry.tag || 'Entry'}</div>
        <div class="wp-title">${entry.name || entry.title}</div>
        ${entry.role ? `<div class="wp-role">${entry.role}</div>` : ''}
      </div>
      <button class="wp-close" onclick="closeWikiPopup()">✕</button>
    </div>
    <div class="wp-body">
      <p class="wp-desc">${entry.desc || entry.content || ''}</p>
      <div class="wp-meta">
        ${entry.affil ? `<span class="wp-chip">${entry.affil}</span>` : ''}
        ${entry.aliases ? `<span class="wp-chip">aka ${entry.aliases}</span>` : ''}
      </div>
      ${entry.id ? `<a class="wp-full-link" href="wiki.html?entry=${entry.id}" target="_blank">Full entry in wiki →</a>` : ''}
    </div>`;

  document.getElementById('wiki-overlay').classList.add('open');
}

function closeWikiPopup(e) {
  if (e && e.target !== document.getElementById('wiki-overlay')) return;
  document.getElementById('wiki-overlay').classList.remove('open');
}

function stitchSegments(results) {
  for (const r of results) if (r.error) return { error: r.error };

  let allBytes = [];
  const stitchedAlignment = { characters: [], character_start_times_seconds: [], character_end_times_seconds: [] };
  const segmentMeta = []; // per-segment: { timeOffset, byteStart, byteEnd, alignment }
  let timeOffset = 0;
  let byteStart  = 0;

  for (const r of results) {
    if (!r.audio) continue;
    const binary    = atob(r.audio);
    const byteCount = binary.length;
    for (let i = 0; i < byteCount; i++) allBytes.push(binary.charCodeAt(i));

    const chars  = r.alignment?.characters || [];
    const starts = r.alignment?.character_start_times_seconds || [];
    const ends   = r.alignment?.character_end_times_seconds   || [];

    // Use actual audio duration from alignment timestamps — more accurate than
    // byte-based estimation which assumes fixed bitrate (ElevenLabs varies).
    // Fall back to byte estimate only if alignment is empty.
    const segEnds = r.alignment?.character_end_times_seconds || [];
    const alignDuration = segEnds.length > 0 ? Math.max(...segEnds) : 0;
    const byteDuration   = byteCount / 16000; // 128kbps fallback
    // Add small padding (80ms) to ensure no overlap at segment boundary
    const segDuration = (alignDuration > 0 ? alignDuration : byteDuration) + 0.08;

    segmentMeta.push({ timeOffset, byteStart, byteEnd: byteStart + byteCount, alignment: r.alignment });

    chars.forEach((c, i) => {
      stitchedAlignment.characters.push(c);
      stitchedAlignment.character_start_times_seconds.push((starts[i] || 0) + timeOffset);
      stitchedAlignment.character_end_times_seconds.push((ends[i]   || 0) + timeOffset);
    });
    timeOffset += segDuration;
    byteStart  += byteCount;
  }

  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < allBytes.length; i += chunkSize) {
    binary += String.fromCharCode(...allBytes.slice(i, i + chunkSize));
  }

  return { audio: btoa(binary), alignment: stitchedAlignment, segmentMeta };
}

function detectSpeakerVoice(text) {
  if (!text) return null;

  const SAID = 'said|asked|replied|whispered|called|snapped|muttered|shouted|added|answered|continued|growled|breathed|laughed|hissed|barked|pleaded|ordered|announced|warned|began|finished|interrupted|noted|insisted|admitted|confirmed|agreed|protested|scoffed|relayed|stated|explained|pressed|urged|offered|suggested|demanded|declared|echoed|conceded|countered|managed|spat|drawled|murmured|responded|cut in|bit out';
  const ACT  = 'scratched|leaned|crossed|turned|looked|nodded|shook|stepped|stood|sat|walked|ran|opened|closed|grabbed|pulled|pushed|reached|glanced|stared|smiled|frowned|sighed|paused|hesitated|squinted|raised|lowered|gripped|tapped|stretched|cleared|narrowed|rubbed|twitched|flinched|shrugged|jerked|spun|swallowed|blinked|stiffened|staggered';

  if (!/["\u201c\u201d]/.test(text)) return null;

  const NAME = '([A-Z][a-z\u00e0-\u00ff]+(?:[\\s-][A-Z][a-z]+)?)';
  const VERB = '(?:' + SAID + ')';
  const ACTL = '(?:' + ACT  + ')';
  const QA   = '["\u201c\u201d]';
  const NQ   = '[^"\u201c\u201d]';

  const patterns = [
    // "dialogue," Name verb — comma after closing quote
    new RegExp(QA + NQ + '+' + QA + '\\s*,?\\s*' + NAME + '\\s+' + VERB, 'i'),
    // "dialogue," Name verb — comma inside closing quote
    new RegExp(QA + NQ + '*,' + QA + '\\s*' + NAME + '\\s+' + VERB, 'i'),
    // Name verb: "dialogue"
    new RegExp('^' + NAME + '\\s+' + VERB + '[,:]?\\s*' + QA, 'i'),
    // Name action... "dialogue"
    new RegExp('^' + NAME + '\\s+' + ACTL + '[^.]*\\.\\s*' + QA, 'i'),
    // Name's [noun]... "dialogue" — e.g. Astrid's fingernails... "dialogue"
    new RegExp('^' + NAME + "'s\\s+[a-z].*\\.\\s*" + QA, 'i'),
    // Name's voice/tone
    new RegExp(NAME + "'s\\s+(?:voice|tone|words)", 'i'),
    // "dialogue" verb Name
    new RegExp(QA + NQ + '+' + QA + '\\s+' + VERB + '\\s+' + NAME, 'i'),
  ];

  // Check named patterns first
  for (const pat of patterns) {
    const m = text.match(pat);
    if (!m) continue;
    const raw   = m[1].trim();
    const lower = raw.toLowerCase();
    // Skip pronouns and multi-word pronoun phrases like "she finally"
    if (/^(she|he|her|him|they|it)(\s|$)/i.test(lower)) continue;
    const entry = wikiIndex[lower];
    if (entry && entry.voice_id) return entry.voice_id;
    const last   = lower.split(/\s+/).pop();
    const byLast = wikiIndex[last];
    if (byLast && byLast.voice_id) return byLast.voice_id;
  }
  return null;
}

function getParaText(pid) {
  const el = document.getElementById(pid);
  if (!el) return '';
  const clone = el.cloneNode(true);
  const toolbar = clone.querySelector('.para-toolbar');
  if (toolbar) toolbar.remove();
  // Remove transcript speaker label — it's display-only, not part of TTS text
  const txLabel = clone.querySelector('.transcript-speaker');
  if (txLabel) txLabel.remove();
  let text = clone.innerText.trim();
  // Note: SFX tags [#tag] are NOT stripped here — narrationGoTo needs them
  // to register triggers before stripping. They are stripped after parseSfxTags.
  // Strip transmission wrapper chars for TTS — < YREUS | ERROR /> → YREUS ERROR
  if (el.closest('.code-block')) {
    text = text
      .replace(/^<\s*/g, '')       // leading <
      .replace(/\s*\/>$/g, '')     // trailing />
      .replace(/^\/\*\s*/g, '')    // leading /*
      .replace(/\s*\*\/$/g, '')    // trailing */
      .replace(/\|/g, ',')         // | → pause comma
      .replace(/·/g, ',')          // · → pause comma
      .replace(/\s+/g, ' ')
      .trim();
  }
  return text;
}
function lookupSelection(pid) {
  const selection = window.getSelection()?.toString().trim();
  const paraText  = getParaText(pid);
  const word = selection || paraText.split(' ')[0] || '';
  if (!word) return;
  showLookupPopup(word, paraText);
}

function showLookupPopup(word, paraText) {
  const popup = document.getElementById('lookup-popup');
  const clean     = word.replace(/[^a-zA-Z0-9\s\-']/g, '');
  const cleanPara = (paraText || clean).trim();
  popup.innerHTML = `
    <div class="lp-word">"${clean}"</div>
    <div class="lp-actions">
      <a class="lp-btn" href="https://www.merriam-webster.com/dictionary/${encodeURIComponent(clean)}" target="_blank" rel="noopener">📖 Merriam-Webster</a>
      <a class="lp-btn" href="https://translate.google.com/?sl=en&text=${encodeURIComponent(cleanPara)}" target="_blank" rel="noopener">🌍 Google Translate — full paragraph</a>
      <a class="lp-btn" href="https://www.deepl.com/translator#en/nl/${encodeURIComponent(cleanPara)}" target="_blank" rel="noopener">🔵 DeepL — full paragraph</a>
      <button class="lp-btn" onclick="closeLookup()">✕ Close</button>
    </div>`;

  popup.style.top  = '50%';
  popup.style.left = '50%';
  popup.style.transform = 'translate(-50%, -50%)';
  popup.classList.add('open');
}

function closeLookup() {
  document.getElementById('lookup-popup').classList.remove('open');
}

// Click outside to close lookup
document.addEventListener('click', (e) => {
  const popup = document.getElementById('lookup-popup');
  if (popup.classList.contains('open') && !popup.contains(e.target)) closeLookup();
});

// Keyboard: Escape closes popups
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeWikiPopup();
    closeLookup();
    closeSidebar();
    closePodcastPanel();
  }
});

// ── Wiki hints toggle ────────────────────────────────────
let wikiHintsOn = false;
document.body.classList.remove('wiki-hints-on');
localStorage.removeItem('wikiHints');

function applyWikiHints() {
  document.body.classList.toggle('wiki-hints-on', wikiHintsOn);
  const btn = document.getElementById('hints-btn');
  if (btn) {
    btn.textContent = wikiHintsOn ? '◈ Hints on' : '◈ Hints';
    btn.style.color = wikiHintsOn ? 'var(--teal-bright, #4a9aaa)' : '';
    btn.style.borderColor = wikiHintsOn ? 'var(--teal-soft)' : '';
  }
}

function toggleWikiHints() {
  wikiHintsOn = !wikiHintsOn;
  localStorage.setItem('wikiHints', wikiHintsOn ? 'on' : 'off');
  applyWikiHints();
}

// ── Podcast panel ────────────────────────────────────────
function openPodcastPanel() {
  const panel  = document.getElementById('podcast-panel');
  const iframe = document.getElementById('podcast-iframe');
  if (iframe.src === 'about:blank' || !iframe.src.includes(`chapter=${currentChapter}`)) {
    iframe.src = `podcast-player.html?chapter=${currentChapter}`;
  }
  panel.classList.add('open');
  if (narrationActive && narrationAudio && !narrationAudio.paused) {
    narrationTogglePlay();
  }
}

function closePodcastPanel() {
  document.getElementById('podcast-panel').classList.remove('open');
}

function showNarrationChapterEnd() {
  // Build the end card HTML (same as injectReaderEndCard)
  const n = currentChapter;
  const hasNext = n < CHAPTER_COUNT;
  const card = document.createElement('div');
  card.className = 'chapter-end-card visible';
  card.innerHTML = `
    <div class="cec-label">Chapter ${n} complete</div>
    <div class="cec-title">${chapterNames[n] || ''}</div>
    <div class="cec-sub">Vera and Milo are ready to discuss it.</div>
    <div class="cec-actions">
      <button class="cec-btn secondary" onclick="openPodcastPanel()">🎙 Decoded — AI podcast review</button>
      ${hasNext
        ? `<button class="cec-btn primary" onclick="continueToNextChapter(${n + 1})">Continue to Chapter ${n + 1} →</button>`
        : `<a href="index.html#buy" class="cec-btn primary">Buy the eBook →</a>
           <a href="https://www.goodreads.com/book/show/251501817-the-unfolding" class="cec-btn secondary" target="_blank" rel="noopener">★ Add on Goodreads</a>`}
    </div>`;

  // Show inside the narration overlay text area
  const textEl = document.getElementById('narration-text');
  if (textEl) {
    textEl.innerHTML = '';
    textEl.appendChild(card);
  }

  // Also update the reader end card for when overlay closes
  injectReaderEndCard(n, chapterNames[n] || '');

  // Show the podcast FAB
  document.getElementById('podcast-fab').classList.add('visible');
}

function narrationOpenPodcast() {
  stopNarration();
  openPodcastPanel();
}

async function narrationContinueNext() {
  const next = currentChapter + 1;
  // Close overlay cleanly, load chapter, then auto-start narration
  stopNarration();
  await loadChapter(next);
  // Small delay to let chapter render
  setTimeout(() => startNarration(), 400);
}

// Keep old name as alias for toast-based usage (e.g. from chapter-end-card)
function showNarrationEndPrompt() {
  showNarrationChapterEnd();
}

// Close panel on Escape (add to existing keydown handler)
const FONT_SIZES = [0.95, 1.05, 1.18, 1.32, 1.48]; // rem steps
let fontSizeIdx = parseInt(localStorage.getItem('readerFontSize') ?? '2', 10);

function applyFontSize() {
  const size = FONT_SIZES[fontSizeIdx];
  document.querySelectorAll('.para').forEach(p => {
    // Uplink paras scale at 72% of prose size to keep visual distinction
    const isUplink = p.closest('.uplink-block');
    p.style.fontSize = (isUplink ? Math.max(0.75, size * 0.72) : size) + 'rem';
  });
}

function changeFontSize(dir) {
  fontSizeIdx = Math.max(0, Math.min(FONT_SIZES.length - 1, fontSizeIdx + dir));
  localStorage.setItem('readerFontSize', fontSizeIdx);
  applyFontSize();
}

// ── Utilities ────────────────────────────────────────────
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;');
}
function getRawText(pid) {
  // Returns the original markup text (with *asterisks*) for narration italic parsing
  const el = document.getElementById(pid);
  return el ? (el.dataset.raw || '') : '';
}

function toast(msg, duration = 3000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), duration);
}

// ── Init ─────────────────────────────────────────────────
async function init() {
  applyWikiHints();
  await Promise.all([buildWikiIndex(), initAuth()]);
  await loadChapter(1);
}

init();
