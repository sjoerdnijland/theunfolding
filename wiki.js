// ── Nav scroll ───────────────────────────────────────────
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 60);
}, { passive: true });

// ── Config ────────────────────────────────────────────────
const SECTIONS = [
  { tab: 'characters', el: 'char-grid',     file: 'data/characters.json', type: 'cards'    },
  { tab: 'ships',      el: 'ship-grid',     file: 'data/ships.json',      type: 'cards'    },
  { tab: 'locations',  el: 'loc-grid',      file: 'data/locations.json',  type: 'cards'    },
  { tab: 'items',      el: 'item-grid',     file: 'data/items.json',      type: 'cards'    },
  { tab: 'factions',   el: 'fac-grid',      file: 'data/factions.json',   type: 'cards'    },
  { tab: 'biology',    el: 'bio-grid',      file: 'data/biology.json',    type: 'cards'    },
  { tab: 'lore',       el: 'lore-list',     file: 'data/lore.json',       type: 'lore'     },
  { tab: 'timeline',   el: 'timeline-list', file: 'data/timeline.json',   type: 'timeline' },
];

const TAG_LABELS = {
  char: 'Character',
  ship: 'Ship',
  loc:  'Location',
  item: 'Item / Tech',
  ai:   'AI',
  org:  'Faction / Org',
  biology: 'Biology',
};

const MAX_CHAPTER = 24;
const DEFAULT_CHAPTER = 3; // shown before user sets a chapter

// Scramble chars — deliberately alien-looking
const SCRAMBLE_CHARS = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ▓▒░╳╱╲⌇⌁⌀◈◉◎⬡⬢';

// ── State ─────────────────────────────────────────────────
let activeTab     = 'characters';
let searchQuery   = '';
let readerChapter = DEFAULT_CHAPTER;
let imagesOn      = true; // on by default

// Persist preferences
function loadChapterPref() {
  const stored = sessionStorage.getItem('unfolding_chapter');
  readerChapter = stored !== null ? parseInt(stored, 10) : DEFAULT_CHAPTER;
  const storedImg = sessionStorage.getItem('unfolding_images');
  imagesOn = storedImg === null ? true : storedImg === 'true';
}
function saveChapterPref(ch) {
  sessionStorage.setItem('unfolding_chapter', ch);
}
function saveImagesPref(val) {
  sessionStorage.setItem('unfolding_images', val);
}

// ── Scramble ──────────────────────────────────────────────
function scramble(text, seed) {
  // Deterministic scramble based on position — same text always gives same scramble
  return text.split('').map((char, i) => {
    if (char === ' ') return ' ';
    if (char === '\n') return '\n';
    const idx = (seed + i * 7 + char.charCodeAt(0) * 3) % SCRAMBLE_CHARS.length;
    return SCRAMBLE_CHARS[Math.abs(idx)];
  }).join('');
}

function isSpoiler(item) {
  const itemChapter = item.chapter ?? 1;
  return itemChapter > readerChapter;
}

// ── Boot ──────────────────────────────────────────────────
async function init() {
  loadChapterPref();
  buildSpoilerBar();
  await Promise.all(SECTIONS.map(s => loadSection(s)));
  updateTabCounts();
  renderAllTabs();

  // Deep-link: wiki.html?entry=oliver-savannen opens that entry's modal
  const entryId = new URLSearchParams(window.location.search).get('entry');
  if (entryId) {
    const slug = entryId.toLowerCase().trim();
    let found = null, foundSection = null;
    for (const section of SECTIONS) {
      const item = section.data?.find(d =>
        // 1. exact id match (preferred)
        d.id === slug ||
        // 2. normalised name match (fallback for legacy links)
        (d.name ?? d.title ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') === slug.replace(/[^a-z0-9]/g, '')
      );
      if (item) { found = item; foundSection = section; break; }
    }
    if (found) {
      switchTab(foundSection.tab);
      setTimeout(() => openModal(found), 100);
    }
  }
}

// ── Spoiler bar ───────────────────────────────────────────
function buildSpoilerBar() {
  const pills = document.getElementById('chapter-pills');
  const options = [
    { label: 'Not started', value: 0 },
    ...Array.from({ length: MAX_CHAPTER }, (_, i) => ({
      label: `Ch ${i + 1}`,
      value: i + 1,
    })),
    { label: 'Finished', value: MAX_CHAPTER },
  ];

  pills.innerHTML = options.map(o => `
    <button
      class="chapter-pill${readerChapter === o.value ? ' active' : ''}"
      data-ch="${o.value}"
      onclick="setChapter(${o.value})"
    >${o.label}</button>
  `).join('');

  // Set initial toggle state
  updateImageToggle();
  updateSpoilerHint();
}

function toggleImages() {
  imagesOn = !imagesOn;
  saveImagesPref(imagesOn);
  updateImageToggle();
  renderActiveTab();
}

function updateImageToggle() {
  const btn = document.getElementById('image-toggle-btn');
  if (!btn) return;
  if (imagesOn) {
    btn.classList.add('on');
    btn.innerHTML = `<span class="img-toggle-icon">◈</span> Images on`;
  } else {
    btn.classList.remove('on');
    btn.innerHTML = `<span class="img-toggle-icon">◈</span> Images off`;
  }
}

function setChapter(ch) {
  readerChapter = ch;
  saveChapterPref(ch);

  // Update pill active state
  document.querySelectorAll('.chapter-pill').forEach(p => {
    p.classList.toggle('active', parseInt(p.dataset.ch, 10) === ch);
  });

  updateSpoilerHint();
  renderActiveTab();
}

function updateSpoilerHint() {
  const hint = document.getElementById('spoiler-hint');
  if (readerChapter === 0) {
    hint.innerHTML = 'Showing safe entries only';
  } else if (readerChapter >= MAX_CHAPTER) {
    hint.innerHTML = 'All entries revealed';
  } else {
    hint.innerHTML = `Spoilers hidden after <em>Ch ${readerChapter}</em>`;
  }
}

// ── Load JSON ─────────────────────────────────────────────
async function loadSection(section) {
  try {
    const res    = await fetch(section.file);
    section.data = await res.json();
  } catch (e) {
    console.error(`Failed to load ${section.file}`, e);
    section.data = [];
  }
}

// ── Tabs ──────────────────────────────────────────────────
function switchTab(tabId) {
  activeTab   = tabId;
  searchQuery = '';
  document.getElementById('wiki-search-input').value = '';

  document.querySelectorAll('.wiki-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabId);
  });
  document.querySelectorAll('.wiki-section').forEach(s => {
    s.classList.toggle('active', s.id === tabId);
  });

  // Hide search bar on smashout tab (not applicable)
  const searchBar = document.querySelector('.wiki-search-bar');
  if (searchBar) searchBar.style.display = '';

  renderActiveTab();
}

// ── Search ────────────────────────────────────────────────
function handleSearch() {
  searchQuery = document.getElementById('wiki-search-input').value;
  renderActiveTab();
}

// ── Render ────────────────────────────────────────────────
function renderAllTabs() {
  SECTIONS.forEach(s => renderSection(s));
  document.querySelectorAll('.wiki-tab')[0]?.classList.add('active');
  document.querySelectorAll('.wiki-section')[0]?.classList.add('active');
}

function renderActiveTab() {
  const section = SECTIONS.find(s => s.tab === activeTab);
  if (section) renderSection(section);
}

function renderSection(section) {
  const container = document.getElementById(section.el);
  if (!container || !section.data) return;

  const q = searchQuery.trim().toLowerCase();

  // When searching, include spoiler entries but only if their name/title matches
  const filtered = section.data.filter(item => {
    if (!q) return true;
    const nameKey = item.name ?? item.title ?? '';
    if (isSpoiler(item)) {
      // Only match on name/title — don't leak spoiler content via search
      return nameKey.toLowerCase().includes(q);
    }
    return JSON.stringify(item).toLowerCase().includes(q);
  });

  if (section.type === 'cards')    renderCards(container, filtered);
  if (section.type === 'lore')     renderLore(container, filtered);
  if (section.type === 'timeline') renderTimeline(container, filtered);
}

function updateTabCounts() {
  const total = SECTIONS.reduce((n, s) => n + (s.data?.length || 0), 0);
  document.getElementById('entry-count').textContent = total + ' entries';
}

// ── Card render ───────────────────────────────────────────
function renderCards(container, items) {
  if (items.length === 0) {
    container.innerHTML = emptyState();
    return;
  }
  container.innerHTML = items.map((item, i) => {
    const spoiler  = isSpoiler(item);
    const tag      = TAG_LABELS[item.tag] || item.tag;
    const ch       = item.chapter ?? 1;
    const bgStyle  = (item.image && imagesOn) ? `style="--card-bg: url('${item.image}')"` : '';
    const bgClass  = (item.image && imagesOn) ? ' has-image' : '';

    if (spoiler) {
      const scrambledPreview = scramble(item.desc.substring(0, 100), i * 13);
      const scrambledMeta    = scramble(item.role, i * 7);
      return `
        <div class="wiki-card is-spoiler${bgClass}" ${bgStyle}>
          <div class="card-inner">
            <span class="spoiler-chapter-badge">Ch ${ch}</span>
            <span class="card-tag tag-${item.tag}">${tag}</span>
            <h3>${item.name ?? item.title}</h3>
            <p class="card-preview scrambled-text">${scrambledPreview}…</p>
            <div class="card-meta scrambled-text">${scrambledMeta}</div>
            <div class="spoiler-lock">
              <span class="spoiler-lock-icon">◉</span>
              Unlocks at chapter ${ch}
            </div>
          </div>
        </div>`;
    }

    const safeItem = JSON.stringify(item).replace(/"/g, '&quot;');
    const preview  = (item.appearance || item.desc).substring(0, 100);
    return `
      <div class="wiki-card${bgClass}" ${bgStyle} onclick="openModal(${safeItem})">
        <div class="card-inner">
          <span class="card-tag tag-${item.tag}">${tag}</span>
          <h3>${item.name ?? item.title}</h3>
          <p class="card-preview">${preview}…</p>
          <div class="card-meta">${item.role}</div>
        </div>
      </div>`;
  }).join('');
}

// ── Lore render ───────────────────────────────────────────
function renderLore(container, items) {
  if (items.length === 0) {
    container.innerHTML = emptyState();
    return;
  }
  container.innerHTML = items.map((item, i) => {
    const spoiler = isSpoiler(item);
    const ch      = item.chapter ?? 1;

    if (spoiler) {
      const scrambledContent = scramble((item.content || '').substring(0, 180), i * 11);
      return `
        <div class="lore-block is-spoiler">
          <span class="spoiler-chapter-badge">Ch ${ch}</span>
          <h3>${item.title}</h3>
          <p class="scrambled-text">${scrambledContent}…</p>
          <div class="spoiler-lock" style="margin-top:10px">
            <span class="spoiler-lock-icon">◉</span>
            Unlocks at chapter ${ch}
          </div>
        </div>`;
    }

    // ── Time System — bespoke visual layout ──
    if (item.id === 'time-system' && item.units) {
      const rows = item.units.map((u, idx) => {
        const barW = Math.round(4 + (idx / (item.units.length - 1)) * 96);
        return `
          <div class="ts-row">
            <div class="ts-symbol">${u.symbol}</div>
            <div class="ts-bar-wrap">
              <div class="ts-bar" style="width:${barW}%"></div>
            </div>
            <div class="ts-name">${u.name}</div>
            <div class="ts-duration">${u.duration}</div>
            <div class="ts-ratio">${u.ratio}</div>
            <div class="ts-note">${u.note}</div>
          </div>`;
      }).join('');

      return `
        <div class="lore-block lore-time-system">
          <h3>${item.title}</h3>
          <p class="ts-intro">${item.content}</p>
          <div class="ts-grid">
            <div class="ts-header">
              <div class="ts-symbol">—</div>
              <div class="ts-bar-wrap"></div>
              <div class="ts-name">Unit</div>
              <div class="ts-duration">Duration</div>
              <div class="ts-ratio">Equals</div>
              <div class="ts-note">Sensation</div>
            </div>
            ${rows}
          </div>
        </div>`;
    }

    return `
      <div class="lore-block">
        <h3>${item.title}</h3>
        <p>${item.content}</p>
        ${item.link ? `<a href="${item.link}" class="lore-link-btn" target="_blank" rel="noopener">${item.linkLabel || 'Open →'}</a>` : ''}
      </div>`;
  }).join('');
}

// ── Timeline render ───────────────────────────────────────
function renderTimeline(container, items) {
  if (items.length === 0) {
    container.innerHTML = emptyState();
    return;
  }
  container.innerHTML = items.map((item, i) => {
    const spoiler = isSpoiler(item);
    const ch      = item.chapter ?? 1;

    if (spoiler) {
      const scrambledTitle = scramble(item.title, i * 5);
      const scrambledTime  = scramble(item.time,  i * 3);
      const scrambledDesc  = scramble(item.desc,  i * 9);
      return `
        <div class="t-event is-spoiler">
          <div class="t-time scrambled-text">${scrambledTime}</div>
          <h4 class="scrambled-text">${scrambledTitle}</h4>
          <p class="scrambled-text">${scrambledDesc}</p>
          <div class="spoiler-lock" style="margin-top:6px">
            <span class="spoiler-lock-icon">◉</span>
            Unlocks at chapter ${ch}
          </div>
        </div>`;
    }

    return `
      <div class="t-event">
        <div class="t-time">${item.time}</div>
        <h4>${item.title}</h4>
        <p>${item.desc}</p>
      </div>`;
  }).join('');
}

function emptyState() {
  return `<div class="wiki-empty">
    <p>No entries match <em>"${searchQuery}"</em>.</p>
    <p class="dim">Try a different word. Some things in this story read back.</p>
  </div>`;
}

// ── Modal ─────────────────────────────────────────────────
function openModal(item) {
  if (isSpoiler(item)) return;

  const content = document.getElementById('modal-content');
  const imgHtml = (item.image && imagesOn)
    ? `<div class="modal-img-hero" style="background-image:url('${item.image}')"></div>`
    : '';

  content.innerHTML = `
    ${imgHtml}
    <div class="modal-body">
      <span class="card-tag tag-${item.tag}">${TAG_LABELS[item.tag] || item.tag}</span>
      <h2 class="modal-title">${item.name ?? item.title}</h2>
      <dl class="modal-dl">
        <dt>Role</dt>        <dd>${item.role}</dd>
        <dt>Affiliation</dt> <dd>${item.affil ?? '—'}</dd>
        ${item.aliases ? `<dt>Also known as</dt><dd>${item.aliases}</dd>` : ''}
      </dl>
      ${item.appearance ? `
        <div class="modal-appearance">
          <span class="modal-section-label">Appearance</span>
          <p>${item.appearance}</p>
        </div>` : ''}
      <div class="modal-desc">${item.desc}</div>
    </div>
  `;
  document.getElementById('detail-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('detail-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

document.getElementById('detail-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

// ── Cross-tab navigation from map ─────────────────────────
window.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'open-entry') return;
  const slug = e.data.entryId;
  for (const section of SECTIONS) {
    const item = section.data?.find(d =>
      d.id === slug ||
      (d.name ?? d.title ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') === slug.replace(/[^a-z0-9]/g, '')
    );
    if (item) {
      switchTab(section.tab);
      setTimeout(() => openModal(item), 80);
      window.focus();
      // Tell the map we handled it so it stops retrying
      if (e.source) e.source.postMessage({ type: 'entry-opened', entryId: slug }, '*');
      break;
    }
  }
});
init();
