/**
 * The Unfolding — Analytics Tracker
 * Drop this script in index.html and reader.html
 * It logs events to Supabase: analytics_events table
 * 
 * SQL to create the table (run once in Supabase SQL editor):
 * 
 * create table analytics_events (
 *   id uuid default gen_random_uuid() primary key,
 *   ts timestamptz default now(),
 *   event text not null,
 *   page text,
 *   meta jsonb
 * );
 * create index on analytics_events(event);
 * create index on analytics_events(ts);
 * alter table analytics_events enable row level security;
 * create policy "insert only" on analytics_events for insert with check (true);
 * create policy "read for service role" on analytics_events for select using (false);
 */

(function() {
  const SUPA_URL = 'https://sscpikfblqtmcefegrpv.supabase.co';
  const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzY3Bpa2ZibHF0bWNlZmVncnB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNzUzMzgsImV4cCI6MjA5Mjk1MTMzOH0.I9qzVnzmiYxwZ6RPLV7KWva8P9L0Q1MHFqgmlmr3g0g';
  const PAGE    = window.location.pathname.replace(/\/$/, '').split('/').pop() || 'index';

  function track(event, meta) {
    fetch(`${SUPA_URL}/rest/v1/analytics_events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ event, page: PAGE, meta: meta || null }),
    }).catch(() => {}); // silent fail
  }

  window._track = track;

  // ── Auto-track page view ───────────────────────────────────
  track('page_view');

  // ── Index page tracking ───────────────────────────────────
  if (PAGE === 'index' || PAGE === '') {
    // Wait for React to mount
    setTimeout(() => {
      // "Read the First Chapter" button
      document.querySelectorAll('a[href="reader.html"], a[href*="reader"]').forEach(el => {
        el.addEventListener('click', () => track('click_read_chapter'), { once: true });
      });

      // Buy buttons — track by href destination
      document.querySelectorAll('a[href*="kobo"], a[href*="bol.com"], a[href*="bookmundo"]').forEach(el => {
        el.addEventListener('click', () => {
          const dest = el.href.includes('kobo') ? 'kobo'
                     : el.href.includes('bol.com') ? 'bol'
                     : 'bookmundo';
          track('click_buy', { dest });
        }, { once: true });
      });

      // Generic buy CTA (if they click the buy section CTA)
      document.querySelectorAll('[onclick*="buy"], a[href="#buy"]').forEach(el => {
        el.addEventListener('click', () => track('click_buy_cta'), { once: true });
      });
    }, 1500);
  }

  // ── Reader page tracking ──────────────────────────────────
  if (PAGE === 'reader') {
    // Discord sign-in click
    document.addEventListener('click', e => {
      const el = e.target.closest('a[href*="discord"], button[onclick*="discord"]');
      if (el) track('click_discord');
    });

    // Chapter read depth — track scroll % per chapter
    // Fires at 25%, 50%, 75%, 100% depth
    let lastChapter = null;
    let firedDepths = {};

    function getReadDepth() {
      const content = document.getElementById('chapter-content');
      if (!content) return 0;
      const rect = content.getBoundingClientRect();
      const total = content.offsetHeight;
      const scrolled = window.scrollY + window.innerHeight - rect.top - window.scrollY;
      return Math.min(100, Math.max(0, Math.round((scrolled / total) * 100)));
    }

    function onScroll() {
      const ch = window._currentChapter || 1;
      if (ch !== lastChapter) {
        firedDepths = {};
        lastChapter = ch;
        track('chapter_start', { chapter: ch });
      }
      const depth = getReadDepth();
      [25, 50, 75, 100].forEach(milestone => {
        if (depth >= milestone && !firedDepths[milestone]) {
          firedDepths[milestone] = true;
          track('chapter_depth', { chapter: ch, depth: milestone });
        }
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });

    // Narration starts
    const origStart = window.startNarration;
    if (typeof origStart === 'function') {
      window.startNarration = function() {
        track('narration_start', { chapter: window._currentChapter || 1 });
        return origStart.apply(this, arguments);
      };
    }
  }
})();
