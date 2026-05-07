/**
 * The Unfolding — Analytics Tracker
 * <script src="js/analytics.js"></script> in index.html and reader.html
 */
(function() {
  const SUPA_URL = 'https://sscpikfblqtmcefegrpv.supabase.co';
  const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzY3Bpa2ZibHF0bWNlZmVncnB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNzUzMzgsImV4cCI6MjA5Mjk1MTMzOH0.I9qzVnzmiYxwZ6RPLV7KWva8P9L0Q1MHFqgmlmr3g0g';
  const PAGE = window.location.pathname.replace(/\/$/, '').split('/').pop().replace(/\.html$/, '') || 'index';

  function track(event, meta) {
    fetch(SUPA_URL + '/rest/v1/analytics_events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPA_KEY,
        'Authorization': 'Bearer ' + SUPA_KEY,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ event: event, page: PAGE, meta: meta || null }),
    }).catch(function() {});
  }

  window._track = track;

  // ── Page view ─────────────────────────────────────────────
  track('page_view', { url: window.location.pathname });

  // ── Index page — event delegation (works regardless of React timing) ──
  if (PAGE === 'index' || PAGE === '' || PAGE === 'index.html') {
    document.addEventListener('click', function(e) {
      var el = e.target.closest('a, button');
      if (!el) return;
      var href = el.href || el.getAttribute('onclick') || el.getAttribute('data-href') || '';
      var text = (el.textContent || '').toLowerCase().trim();

      // Read chapter button
      if (href.includes('reader.html') || href.includes('reader') ||
          text.includes('read') && text.includes('chapter')) {
        track('click_read_chapter');
      }

      // Buy buttons by URL
      if (href.includes('kobo'))       track('click_buy', { dest: 'kobo' });
      if (href.includes('bol.com'))    track('click_buy', { dest: 'bol' });
      if (href.includes('bookmundo'))  track('click_buy', { dest: 'bookmundo' });

      // Buy CTA / scroll to buy
      if (href.includes('#buy') || (text.includes('buy') && text.includes('ebook'))) {
        track('click_buy_cta');
      }
    });
  }

  // ── Reader page ───────────────────────────────────────────
  if (PAGE === 'reader' || PAGE === 'reader.html') {

    // Discord click — event delegation
    document.addEventListener('click', function(e) {
      var el = e.target.closest('a, button');
      if (!el) return;
      var href = el.href || '';
      var text = (el.textContent || '').toLowerCase();
      if (href.includes('discord') || text.includes('discord')) {
        track('click_discord');
      }
    });

    // Scroll depth — check every 2s, fire milestones once per chapter
    var lastChapter = null;
    var firedDepths = {};

    function getCurrentChapter() {
      // Read from reader.js global
      return window.currentChapter || 1;
    }

    function getScrollDepth() {
      var content = document.getElementById('chapter-content');
      if (!content) return 0;
      var contentBottom = content.getBoundingClientRect().bottom + window.scrollY;
      var contentTop    = content.getBoundingClientRect().top    + window.scrollY;
      var contentHeight = contentBottom - contentTop;
      if (contentHeight <= 0) return 0;
      var scrolled = window.scrollY + window.innerHeight - contentTop;
      return Math.min(100, Math.max(0, Math.round((scrolled / contentHeight) * 100)));
    }

    setInterval(function() {
      var ch = getCurrentChapter();
      if (ch !== lastChapter) {
        firedDepths = {};
        lastChapter = ch;
        track('chapter_start', { chapter: ch });
      }
      var depth = getScrollDepth();
      [25, 50, 75, 100].forEach(function(milestone) {
        if (depth >= milestone && !firedDepths[milestone]) {
          firedDepths[milestone] = true;
          track('chapter_depth', { chapter: ch, depth: milestone });
        }
      });
    }, 2000);

    // Patch narration functions after reader.js loads
    function patchNarration() {
      if (window.startNarration && !window.startNarration._tracked) {
        var origStart = window.startNarration;
        window.startNarration = function() {
          track('narration_play', { chapter: getCurrentChapter() });
          return origStart.apply(this, arguments);
        };
        window.startNarration._tracked = true;
      }

      if (window.stopNarration && !window.stopNarration._tracked) {
        var origStop = window.stopNarration;
        window.stopNarration = function() {
          // Track how far they got (paragraph index out of total)
          var idx   = window.narrationIndex || 0;
          var total = window.narrationParaIds ? window.narrationParaIds.length : 0;
          var pct   = total > 0 ? Math.round((idx / total) * 100) : 0;
          track('narration_stop', {
            chapter: getCurrentChapter(),
            para: idx,
            total: total,
            pct: pct
          });
          return origStop.apply(this, arguments);
        };
        window.stopNarration._tracked = true;
      }

      if (window.narrationTogglePlay && !window.narrationTogglePlay._tracked) {
        var origToggle = window.narrationTogglePlay;
        window.narrationTogglePlay = function() {
          // Detect if this is a pause or resume
          var wasPaused = window.narrationPlaying === false;
          var result = origToggle.apply(this, arguments);
          track(wasPaused ? 'narration_resume' : 'narration_pause', {
            chapter: getCurrentChapter(),
            para: window.narrationIndex || 0
          });
          return result;
        };
        window.narrationTogglePlay._tracked = true;
      }
    }

    document.addEventListener('DOMContentLoaded', patchNarration);
    setTimeout(patchNarration, 500);
    setTimeout(patchNarration, 1500); // extra safety
  }

})();
