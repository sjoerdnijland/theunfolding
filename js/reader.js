// ── Version ───────────────────────────────────────────────
const READER_VERSION = 'v3';
console.log('[reader.js] loaded', READER_VERSION);

// ── Narration state ──────────────────────────────────────
const NARRATE_URL = 'https://sscpikfblqtmcefegrpv.supabase.co/functions/v1/narrate';

let narrationActive    = false;
let narrationParaIds   = [];
let narrationIndex     = 0;
let narrationAudio     = null;
let narrationPlaying   = false;
let narrationAlignment = null;
let narrationRAF       = null;
let narrationCache     = {};
let narrationLocked    = false;
let narrationCurrentWords = [];
let narrationLastMaleSpeaker   = null;
let narrationLastFemaleSpeaker = null;
let narrationLastSpeaker       = null; // last named speaker regardless of gender
let multiVoiceEnabled          = localStorage.getItem('multiVoice') === 'on';

function toggleMultiVoice() {
  multiVoiceEnabled = !multiVoiceEnabled;
  localStorage.setItem('multiVoice', multiVoiceEnabled ? 'on' : 'off');
  applyMultiVoiceBtn();
  // Clear cache and re-fetch current paragraph with new voice setting
  narrationCache = {};
  narrationLastSpeaker = null;
  narrationLastMaleSpeaker = null;
  narrationLastFemaleSpeaker = null;
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
    btn.textContent = '◉ All voices';
    btn.style.color = 'var(--rose)';
    btn.style.borderColor = 'var(--rose)';
  } else {
    btn.textContent = '◎ Narrator';
    btn.style.color = '';
    btn.style.borderColor = '';
  }
}

// ── Ambient music ────────────────────────────────────────
let ambientAudio   = null;
let ambientEnabled = localStorage.getItem('ambientMusic') !== 'off';

function applyAmbientBtn() {
  const btn = document.getElementById('nc-music-btn');
  if (!btn) return;
  btn.textContent = ambientEnabled ? '♪ Music on' : '♪ Music off';
  btn.style.color = ambientEnabled ? 'var(--teal-bright)' : '';
  btn.style.borderColor = ambientEnabled ? 'var(--teal-soft)' : '';
}

function toggleAmbient() {
  ambientEnabled = !ambientEnabled;
  localStorage.setItem('ambientMusic', ambientEnabled ? 'on' : 'off');
  applyAmbientBtn(); applyMultiVoiceBtn();
  if (ambientEnabled && narrationActive) {
    const pid = narrationParaIds[narrationIndex];
    startAmbient(currentChapter, getSceneForPara(pid));
  } else {
    stopAmbient();
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
      if (res.ok) { console.log('[ambient] resolved:', src); return src; }
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
  const src = await resolveAmbientTrack(chapter || currentChapter, scene || 1);
  ambientResolving = false;

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

  // Cross-fade: fade out old, fade in new
  if (ambientAudio) {
    const old = ambientAudio;
    ambientAudio = null;
    const fadeOut = setInterval(() => {
      old.volume = Math.max(0, old.volume - 0.02);
      if (old.volume <= 0) { old.pause(); clearInterval(fadeOut); }
    }, 60);
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
    v = Math.min(0.18, v + 0.01);
    audio.volume = v;
    if (v >= 0.18) clearInterval(fade);
  }, 80);
}

function stopAmbient() {
  if (!ambientAudio) return;
  const audio = ambientAudio;
  ambientAudio = null;
  const fade = setInterval(() => {
    audio.volume = Math.max(0, audio.volume - 0.015);
    if (audio.volume <= 0) { audio.pause(); clearInterval(fade); }
  }, 80);
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

async function startNarration() {
  narrationParaIds = getNarrableParagraphs();
  if (!narrationParaIds.length) return;

  narrationActive  = true;
  narrationIndex   = 0;

  document.getElementById('narration-overlay').classList.add('active');
  document.getElementById('narration-progress').style.display = 'block';
  document.getElementById('narration-controls').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  applyAmbientBtn(); applyMultiVoiceBtn();

  await narrationGoTo(0);
}

function stopNarration() {
  narrationActive  = false;
  narrationPlaying = false;
  if (narrationAudio) { narrationAudio.pause(); narrationAudio = null; }
  cancelAnimationFrame(narrationRAF);

  document.getElementById('narration-overlay').classList.remove('active');
  document.getElementById('narration-progress').style.display = 'none';
  document.getElementById('narration-controls').style.display = 'none';
  document.getElementById('narration-thread').classList.remove('open');
  narrationThreadOpen = false;
  document.body.style.overflow = '';
  stopAmbient();
  document.getElementById('narration-comment-hint').classList.remove('visible');
}

function buildSegments(plainText, charVoiceId) {
  if (!charVoiceId || !multiVoiceEnabled) return [{ text: plainText, voiceId: null }];
  const parts = plainText.split(/([""\u201c\u201d][^""\u201c\u201d]*[""\u201c\u201d])/);
  const segs = [];
  parts.forEach(p => {
    if (!p) return;
    const isQuote = /^[""\u201c\u201d]/.test(p) && /[""\u201c\u201d]$/.test(p);
    const clean   = p.trim();
    if (!clean) return;
    segs.push({ text: clean, voiceId: isQuote ? charVoiceId : null });
  });
  const merged = [];
  for (const seg of segs) {
    const last = merged[merged.length - 1];
    if (last && last.voiceId === seg.voiceId) last.text += ' ' + seg.text;
    else merged.push({ ...seg });
  }
  return merged.filter(s => s.text.trim());
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
    stopNarration();
    // Chapter finished naturally — invite to podcast
    setTimeout(() => showNarrationEndPrompt(), 800);
    return;
  }

  const pid = narrationParaIds[index];
  const total = narrationParaIds.length;

  // Counter — chapter · scene · paragraph progress
  const scene  = getSceneForPara(pid);
  const isCode = !!document.getElementById(pid)?.closest('.code-block');
  document.getElementById('narration-overlay').classList.toggle('code-mode', isCode);
  const chapterNames = { 1:'Assembly', 2:'The Startend', 3:'Doubt and Certainty' };
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

  // Pause on scene changes — including the very first scene
  if (scene !== prevScene) {
    const textEl = document.getElementById('narration-text');
    textEl.innerHTML = `<span class="narration-loading" style="opacity:0.2">✦</span>`;
    await new Promise(r => setTimeout(r, index === 0 ? 1800 : 2500));
    if (narrationIndex !== index) { narrationLocked = false; return; }
  }

  // Show comment hint if paragraph has threads
  const count = commentCounts[pid] || 0;
  const hint  = document.getElementById('narration-comment-hint');
  document.getElementById('nch-count').textContent = count;
  hint.classList.toggle('visible', count > 0);

  // Get plain text for TTS, raw markup text for italic/bold display
  const text    = getParaText(pid);
  const rawText = getRawText(pid) || text;
  if (!text) { narrationLocked = false; await narrationGoTo(index + 1); return; }

  // Stop previous audio
  if (narrationAudio) { narrationAudio.pause(); narrationAudio = null; }
  cancelAnimationFrame(narrationRAF);
  narrationPlaying = false;

  const textEl = document.getElementById('narration-text');

  // Detect speaker voice — only when multi-voice mode is on
  let speakerVoiceId = null;
  if (multiVoiceEnabled) {
    // 1. Explicit speaker tag from JSON (most reliable)
    const paraEl = document.getElementById(pid);
    const speakerTag = paraEl?.dataset.speaker;
    if (speakerTag) {
      const entry = wikiIndex[speakerTag];
      if (entry?.voice_id) speakerVoiceId = entry.voice_id;
    }
    // 2. Pattern detection fallback
    if (!speakerVoiceId) speakerVoiceId = detectSpeakerVoice(rawText);
    console.log('[voice]', speakerTag ? `tag:${speakerTag}` : 'detected:', speakerVoiceId || 'narrator');

    if (!speakerVoiceId && /["\u201c\u201d]/.test(rawText)) {
      const SAID_RE = /\b(?:said|asked|replied|whispered|continued|added|stated|called|announced|noted|insisted|scoffed|relayed|declared|muttered)\b/i;
      if (/\bshe\b/i.test(rawText) && SAID_RE.test(rawText)) {
        speakerVoiceId = narrationLastFemaleSpeaker;
      } else if (/\bhe\b/i.test(rawText) && SAID_RE.test(rawText)) {
        speakerVoiceId = narrationLastMaleSpeaker;
      } else if (/^["\u201c\u201d]/.test(rawText.trim()) && !SAID_RE.test(rawText)) {
        speakerVoiceId = narrationLastSpeaker;
      }
      if (!speakerVoiceId && /^CIX\s+WEAVER:/i.test(rawText.trim())) {
        const gary = wikiIndex['gary'] || wikiIndex['weaver'] || wikiIndex['cix weaver'];
        if (gary && gary.voice_id) speakerVoiceId = gary.voice_id;
      }
    }

    if (speakerVoiceId) {
      const femaleVoices = new Set(Object.values(wikiIndex)
        .filter(e => ['astrid-vilde','ionie-jia','joana-perera','sarah-farley','kirsten-strand',
          'lena-hague','stacey-kiran','eva-bellamy','lysanne-sutherland','alani-jimenez',
          'ines-martel','nabiha-al-fahim','læsa'].includes(e.id))
        .map(e => e.voice_id).filter(Boolean));
      if (femaleVoices.has(speakerVoiceId)) narrationLastFemaleSpeaker = speakerVoiceId;
      else narrationLastMaleSpeaker = speakerVoiceId;
      if (detectSpeakerVoice(rawText)) narrationLastSpeaker = speakerVoiceId;
    }
  } // end multiVoiceEnabled

  // ── Segment-based fetch: narrator for prose, character for quoted dialogue ──
  const segments = buildSegments(text, speakerVoiceId);
  const cacheKey = READER_VERSION + '|' + pid + '|' + segments.map(s => (s.voiceId||'n')+':'+s.text.slice(0,20)).join('|');

  let data = narrationCache[cacheKey];
  if (!data) {
    textEl.innerHTML = `<span class="narration-loading">the stone is listening…</span>`;
    try {
      if (segments.length === 1) {
        // Single segment — normal fetch
        const seg = segments[0];
        const res = await fetch(NARRATE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_KEY}` },
          body: JSON.stringify({ text: seg.text, ...(seg.voiceId ? { voiceId: seg.voiceId } : {}) })
        });
        data = await res.json();
        if (data.error) throw new Error(data.error);
      } else {
        // Multiple segments — fetch each and stitch alignment
        const results = await Promise.all(segments.map(seg =>
          fetch(NARRATE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_KEY}` },
            body: JSON.stringify({ text: seg.text, ...(seg.voiceId ? { voiceId: seg.voiceId } : {}) })
          }).then(r => r.json())
        ));
        // Stitch audio and alignment
        data = stitchSegments(results);
        if (data.error) throw new Error(data.error);
      }
      narrationCache[cacheKey] = data;
    } catch(e) {
      textEl.innerHTML = `<span class="narration-loading">Could not load audio — ${e.message}</span>`;
      narrationLocked = false;
      return;
    }
  }

  narrationAlignment = data.alignment;

  // Build word spans from alignment
  const words = buildWordTimings(text, data.alignment);

  function clean(w) {
    return w.toLowerCase().replace(/[^a-z0-9''\-]/g, '');
  }

  // Build display directly from rawText — preserves \n and markup formatting
  // Uses alignment words only for timing, keyed by sequence position
  function buildDisplayTokens(raw, timingWords) {
    const tokens = [];
    // Split rawText into segments: markup spans, newlines, plain text
    const parts = raw.split(/(\*\*[^*]+?\*\*|\*[^*]+?\*|~~[^~]+?~~|\n)/);
    let wordIdx = 0;

    parts.forEach(part => {
      if (!part) return;
      if (part === '\n') { tokens.push({ type: 'br' }); return; }

      let fmt = '';
      let content = part;
      if (/^\*\*[^*]+?\*\*$/.test(part))  { fmt = 'nw-bold';   content = part.slice(2,-2); }
      else if (/^\*[^*]+?\*$/.test(part)) { fmt = 'nw-italic'; content = part.slice(1,-1); }
      else if (/^~~[^~]+?~~$/.test(part)) { fmt = 'nw-smcaps'; content = part.slice(2,-2); }

      const rawWords = content.split(/(\s+)/);
      rawWords.forEach(rw => {
        if (/^\s+$/.test(rw)) {
          tokens.push({ type: 'space' });
        } else if (rw) {
          const timing = timingWords[wordIdx] || { start: 0, end: 0 };
          tokens.push({ type: 'word', text: rw, fmt, start: timing.start, end: timing.end, idx: wordIdx });
          wordIdx++;
        }
      });
    });
    return tokens;
  }

  const displayTokens     = isCode
    // For code blocks: show raw text as-is, just split into words for timing
    ? words.map((w, i) => ({ type: 'word', text: w.text, fmt: '', start: w.start, end: w.end, idx: i }))
    : buildDisplayTokens(rawText, words);
  narrationCurrentWords   = displayTokens.filter(t => t.type === 'word');

  // For code blocks: show TRANSMISSION label above word highlights
  if (isCode) {
    textEl.innerHTML = `<div style="font-family:var(--mono);font-size:0.62rem;letter-spacing:0.35em;color:var(--teal-soft);margin-bottom:28px;text-align:center;opacity:0.7">◉ TRANSMISSION</div>`
      + displayTokens.map(t => `<span class="nw" id="nw-${t.idx}">${escHtml(t.text)}</span> `).join('');
  } else {
    textEl.innerHTML = displayTokens.map(t => {
      if (t.type === 'br')    return '<br>';
      if (t.type === 'space') return ' ';
      return `<span class="nw ${t.fmt}" id="nw-${t.idx}">${escHtml(t.text)}</span>`;
    }).join('');
  }

  // Create audio from base64
  const audioBlob = base64ToBlob(data.audio, 'audio/mpeg');
  const audioUrl  = URL.createObjectURL(audioBlob);
  narrationAudio  = new Audio(audioUrl);
  narrationPlaying = true;

  document.getElementById('nc-play-btn').textContent = '⏸ Pause';

  // Prefetch next paragraph quietly
  prefetchNext(index + 1);

  // Start playback + karaoke sync
  narrationLocked = false; // unlock — audio is playing, navigation is safe again
  narrationAudio.play();
  narrationAudio.addEventListener('ended', () => {
    cancelAnimationFrame(narrationRAF);
    setTimeout(() => narrationGoTo(index + 1), 1200);
  });

  function syncWords() {
    if (!narrationAudio || narrationAudio.paused) return;
    const t   = narrationAudio.currentTime;
    const dur = narrationAudio.duration || 9999;

    // Update progress bar
    const pct = dur ? (t / dur) * 100 : 0;
    document.getElementById('narration-progress-bar').style.width = pct + '%';

    // Find current word — last word whose start <= t
    let currentIdx = -1;
    for (let i = 0; i < narrationCurrentWords.length; i++) {
      if (narrationCurrentWords[i].start <= t) currentIdx = i;
      else break;
    }

    narrationCurrentWords.forEach((w, i) => {
      const el = document.getElementById('nw-' + w.idx);
      if (!el) return;
      if (i < currentIdx) {
        el.className = `nw ${w.fmt || ''} spoken`;
      } else if (i === currentIdx) {
        el.className = `nw ${w.fmt || ''} current`;
        if (window.innerWidth > 768) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        el.className = `nw ${w.fmt || ''}`;
      }
    });

    narrationRAF = requestAnimationFrame(syncWords);
  }
  narrationRAF = requestAnimationFrame(syncWords);
}

function narrationTogglePlay() {
  if (!narrationAudio) return;
  if (narrationAudio.paused) {
    narrationAudio.play();
    narrationPlaying = true;
    document.getElementById('nc-play-btn').textContent = '⏸ Pause';
    // Resume karaoke sync using stored word timings
    function resumeSync() {
      if (!narrationAudio || narrationAudio.paused) return;
      const t   = narrationAudio.currentTime;
      const dur = narrationAudio.duration || 9999;
      const pct = dur ? (t / dur) * 100 : 0;
      document.getElementById('narration-progress-bar').style.width = pct + '%';

      let currentIdx = -1;
      for (let i = 0; i < narrationCurrentWords.length; i++) {
        if (narrationCurrentWords[i].start <= t) currentIdx = i;
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
    document.getElementById('nc-play-btn').textContent = '▶ Play';
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
  narrationParaIds = getNarrableParagraphs();
  const idx = narrationParaIds.indexOf(pid);
  narrationIndex = idx >= 0 ? idx : 0;
  narrationActive = true;

  document.getElementById('narration-overlay').classList.add('active');
  document.getElementById('narration-progress').style.display = 'block';
  document.getElementById('narration-controls').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  applyAmbientBtn(); applyMultiVoiceBtn();

  await narrationGoTo(narrationIndex);
}

let narrationThreadOpen = false;

function narrationToggleThread() {
  narrationThreadOpen = !narrationThreadOpen;
  const sidebar = document.getElementById('narration-thread');
  const btn     = document.getElementById('nc-thread-btn');
  sidebar.classList.toggle('open', narrationThreadOpen);
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

async function prefetchNext(index) {
  if (index >= narrationParaIds.length) return;
  const pid     = narrationParaIds[index];
  const text    = getParaText(pid);
  const rawText = getRawText(pid) || text;
  if (!text) return;
  const charVoice  = multiVoiceEnabled ? detectSpeakerVoice(rawText) : null;
  const segments   = buildSegments(text, charVoice);
  const cacheKey   = READER_VERSION + '|' + pid + '|' + segments.map(s => (s.voiceId||'n')+':'+s.text.slice(0,20)).join('|');
  if (narrationCache[cacheKey]) return;
  try {
    let data;
    if (segments.length === 1) {
      const seg = segments[0];
      const res = await fetch(NARRATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_KEY}` },
        body: JSON.stringify({ text: seg.text, ...(seg.voiceId ? { voiceId: seg.voiceId } : {}) })
      });
      data = await res.json();
    } else {
      const results = await Promise.all(segments.map(seg =>
        fetch(NARRATE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_KEY}` },
          body: JSON.stringify({ text: seg.text, ...(seg.voiceId ? { voiceId: seg.voiceId } : {}) })
        }).then(r => r.json())
      ));
      data = stitchSegments(results);
    }
    if (!data.error) narrationCache[cacheKey] = data;
  } catch(_) {}
}

// ── Helpers ──────────────────────────────────────────────
function buildWordTimings(text, alignment) {
  const chars      = alignment.characters || [];
  const startTimes = alignment.character_start_times_seconds || [];
  const endTimes   = alignment.character_end_times_seconds   || [];

  const words = [];
  let word = '', wordStart = 0, wordEnd = 0;
  let inTag = false;
  let pendingBreak = false; // track \n for line break display

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];

    if (c === '<') { inTag = true; continue; }
    if (c === '>') { inTag = false; continue; }
    if (inTag) continue;

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
  return words;
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
let commentCounts    = {};   // paragraphId → count

// ── Chapters — loaded from data/chapters/chapter-N.json ──
const CHAPTER_COUNT = 3; // increment as you add files

async function loadChapter(n) {
  currentChapter = n;
  currentParaId  = null;
  narrationCache = {};
  narrationLastMaleSpeaker   = null;
  narrationLastFemaleSpeaker = null;
  narrationLastSpeaker       = null;
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
  renderChapter(ch);
}

function renderChapterPills() {
  const el = document.getElementById('chapter-pills');
  el.innerHTML = Array.from({ length: CHAPTER_COUNT }, (_, i) => i + 1).map(n => `
    <button class="cp-btn ${n === currentChapter ? 'active' : ''}" onclick="loadChapter(${n})">
      Ch. ${n}
    </button>`).join('');
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

function renderChapter(ch) {
  const el = document.getElementById('chapter-content');

  let paraIndex = 0;
  let sceneIndex = 1;
  let prevSecType = null; // track previous section type for scene transitions
  let html = `
    <div class="ch-eyebrow">Chapter ${currentChapter}</div>
    <h1 class="ch-title">${ch.title}</h1>
    <p class="ch-subtitle">${ch.subtitle}</p>`;

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
        const speakerTag = typeof paraItem === 'object' ? paraItem.speaker || null : null;
        const pid   = `ch${currentChapter}-p${paraIndex}`;
        const count = commentCounts[pid] || 0;
        const linked = autoLink(parseMarkup(text));
        paraIndex++;

        // Level 1 (system): all-caps e.g. **SOL SYSTEM**, **YREUS SYSTEM**, **MAIREE**
        // Level 2 (subset): mixed-case bold-only e.g. **En Route to Mairee**, **In Orbit**
        const trimmed = text.trim();
        const isLevel1 = isAssets && /^\*\*[A-Z][A-Z\s&·]+\*\*$/.test(trimmed);
        const isLevel2 = isAssets && !isLevel1 && /^\*\*[A-Z][a-zA-Z\s'·]+\*\*$/.test(trimmed);

        if (isLevel1) {
          return `<div class="uplink-section-divider uplink-s1" id="${pid}" data-para-id="${pid}" data-comment-count="${count}">${parseMarkup(text)}</div>`;
        }
        if (isLevel2) {
          return `<div class="uplink-section-divider uplink-s2" id="${pid}" data-para-id="${pid}" data-comment-count="${count}">${parseMarkup(text)}</div>`;
        }

        return `
          <p class="para${count > 0 ? ' has-comments' : ''}"
             id="${pid}"
             data-para-id="${pid}"
             data-comment-count="${count}"
             data-scene="${sceneIndex}"
             data-raw="${escAttr(text)}"
             data-speaker="${speakerTag || ''}" 
             onclick="selectPara('${pid}', this)">
            <span class="para-toolbar">
              <button class="pt-btn" onclick="event.stopPropagation();lookupSelection('${pid}')">🔍 Look up</button>
              <button class="pt-btn" onclick="event.stopPropagation();openThread('${pid}')">💬 Thread${count > 0 ? ` (${count})` : ''}</button>
              <button class="pt-btn pt-narrate" onclick="event.stopPropagation();startNarrationFrom('${pid}')">▶ Narrate</button>
            </span>
            ${linked}
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
        const speakerTag = typeof paraItem === 'object' ? paraItem.speaker || null : null;
        const pid   = `ch${currentChapter}-p${paraIndex}`;
        const count = commentCounts[pid] || 0;
        const linked = autoLink(parseMarkup(text));
        paraIndex++;
        return `
          <p class="para epigraph-para${count > 0 ? ' has-comments' : ''}"
             id="${pid}"
             data-para-id="${pid}"
             data-comment-count="${count}"
             data-scene="${sceneIndex}"
             data-raw="${escAttr(text)}"
             data-speaker="${speakerTag || ''}" 
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
        const speakerTag = typeof paraItem === 'object' ? paraItem.speaker || null : null;
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
             onclick="selectPara('${pid}', this)">
            <span class="para-toolbar">
              <button class="pt-btn" onclick="event.stopPropagation();openThread('${pid}')">💬 Thread${count > 0 ? ` (${count})` : ''}</button>
              <button class="pt-btn pt-narrate" onclick="event.stopPropagation();startNarrationFrom('${pid}')">▶ Narrate</button>
            </span>
            ${escHtml(text)}
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

    sec.paragraphs.forEach((text, pi) => {
      const pid   = `ch${currentChapter}-p${paraIndex}`;
      const count = commentCounts[pid] || 0;
      const isFirst = paraIndex === 0;
      const linked  = autoLink(parseMarkup(text));
      paraIndex++;
      html += `
        <p class="para${isFirst ? ' drop-cap' : ''}${count > 0 ? ' has-comments' : ''}"
           id="${pid}"
           data-para-id="${pid}"
           data-comment-count="${count}"
           data-scene="${sceneIndex}"
           data-raw="${escAttr(text)}"
           data-speaker="${speakerTag || ''}" 
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
  endCard.innerHTML = `
    <div class="cec-label">Chapter ${currentChapter} complete</div>
    <div class="cec-title">${ch.title}</div>
    <div class="cec-sub">Vera and Milo are ready to discuss it.</div>
    <button class="cec-btn" onclick="openPodcastPanel()">🎙 Listen to the AI podcast review</button>`;
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
  let timeOffset = 0;

  for (const r of results) {
    if (!r.audio) continue;
    const binary = atob(r.audio);
    const byteCount = binary.length;
    for (let i = 0; i < byteCount; i++) allBytes.push(binary.charCodeAt(i));

    const chars  = r.alignment?.characters || [];
    const starts = r.alignment?.character_start_times_seconds || [];
    const ends   = r.alignment?.character_end_times_seconds   || [];

    // Estimate segment duration from alignment end times
    // Use max end time rather than last (more reliable)
    let maxEnd = 0;
    ends.forEach(e => { if (e > maxEnd) maxEnd = e; });
    const segDuration = maxEnd > 0 ? maxEnd + 0.15 : (byteCount / 16000); // fallback: ~128kbps mp3

    chars.forEach((c, i) => {
      stitchedAlignment.characters.push(c);
      stitchedAlignment.character_start_times_seconds.push((starts[i] || 0) + timeOffset);
      stitchedAlignment.character_end_times_seconds.push((ends[i]   || 0) + timeOffset);
    });
    timeOffset += segDuration;
  }

  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < allBytes.length; i += chunkSize) {
    binary += String.fromCharCode(...allBytes.slice(i, i + chunkSize));
  }

  return { audio: btoa(binary), alignment: stitchedAlignment };
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
  let text = clone.innerText.trim();
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

function showNarrationEndPrompt() {
  // Show a toast-style prompt from the bottom
  const el = document.getElementById('toast');
  el.innerHTML = `Chapter complete. <button onclick="openPodcastPanel()" style="background:transparent;border:none;color:var(--teal-bright);font-family:var(--mono);font-size:inherit;cursor:pointer;text-decoration:underline;padding:0;margin-left:4px">🎙 Listen to the AI review →</button>`;
  el.classList.remove('hidden');
  el.style.pointerEvents = 'auto';
  // Auto-hide after 8 seconds
  clearTimeout(el._podcastTimer);
  el._podcastTimer = setTimeout(() => {
    el.classList.add('hidden');
    el.style.pointerEvents = '';
    el.innerHTML = '';
  }, 8000);
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
