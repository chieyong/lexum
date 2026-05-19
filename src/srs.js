import { supa } from './constants.js';

export const SRS = (() => {
  const KEY = 'mesmots_progress';
  const INTERVALS = [0, 5, 30, 1440, 4320, 10080, 43200];

  // ── localStorage (altijd gebruikt als snelle cache) ──
  function load()  {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  }
  function save(p) { localStorage.setItem(KEY, JSON.stringify(p)); }

  // ── Supabase sync ────────────────────────────────────
  // Laad voortgang van Supabase en merge met localStorage
  async function loadFromSupabase() {
    try {
      const { data, error } = await supa.rpc('get_progress');
      if (error || !data) return;
      const local = load();
      // Supabase wint als lastSeen nieuwer is
      Object.entries(data).forEach(([id, remote]) => {
        const loc = local[id];
        if (!loc || remote.lastSeen > loc.lastSeen) {
          local[id] = remote;
        }
      });
      save(local);
    } catch(e) { console.warn('SRS sync mislukt:', e); }
  }

  // Push één kaart naar Supabase (fire-and-forget)
  function pushToSupabase(id, c) {
    if (!Auth.getProfile()) return;
    // Gebruik then() want supa.rpc() geeft een thenable terug, geen echte Promise
    supa.rpc('upsert_progress', {
      p_card_id:       id,
      p_level:         c.level,
      p_next_due:      c.nextDue ? new Date(c.nextDue).toISOString() : null,
      p_last_seen:     c.lastSeen ? new Date(c.lastSeen).toISOString() : null,
      p_times_correct: c.timesCorrect,
      p_times_seen:    c.timesSeen,
    }).then(({ error }) => {
      if (error) console.warn('Push progress mislukt:', error);
    });
  }

  function getCard(id) {
    return load()[id] || { level: 0, nextDue: 0, lastSeen: 0, timesCorrect: 0, timesSeen: 0 };
  }

  function updateCard(id, rating) {
    const p = load();
    const c = p[id] || { level: 0, nextDue: 0, lastSeen: 0, timesCorrect: 0, timesSeen: 0 };
    const now = Date.now();
    c.lastSeen = now;
    c.timesSeen++;
    if (rating === 'good')        { c.level = Math.min(c.level + 1, INTERVALS.length - 1); c.timesCorrect++; }
    else if (rating === 'doubt')  { c.level = Math.max(0, Math.floor(c.level)); }
    else                          { c.level = Math.max(0, c.level - 2); }
    c.nextDue = now + (INTERVALS[c.level] || 0) * 60000;
    p[id] = c;
    save(p);
    pushToSupabase(id, c); // async, blokkeert niet
    return c;
  }

  function sortByPriority(cards) {
    const p = load();
    const now = Date.now();
    return [...cards].sort((a, b) => {
      const pa = p[a._srsId] || { nextDue: 0, level: 0 };
      const pb = p[b._srsId] || { nextDue: 0, level: 0 };
      const aDue = pa.nextDue <= now, bDue = pb.nextDue <= now;
      if (aDue && !bDue) return -1;
      if (!aDue && bDue) return 1;
      if (aDue && bDue) return pa.level - pb.level;
      return pa.nextDue - pb.nextDue;
    });
  }

  function getStats() {
    const entries = Object.values(load());
    const days = new Set();
    entries.forEach(e => {
      if (e.lastSeen) {
        const d = new Date(e.lastSeen);
        days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
      }
    });
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (days.has(key)) streak++;
      else if (i > 0) break;
    }
    // Days practiced this calendar week (Mon–Sun)
    const now = new Date();
    const dayOfWeek = (now.getDay() + 6) % 7; // 0=Mon … 6=Sun
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek);
    weekStart.setHours(0, 0, 0, 0);
    const thisWeek = [...days].filter(key => {
      const [y, m, d] = key.split('-').map(Number);
      return new Date(y, m, d) >= weekStart;
    }).length;

    const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
    const today_count = entries.filter(e => {
      if (!e.lastSeen) return false;
      const d = new Date(e.lastSeen);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` === todayStr;
    }).length;

    return {
      todayCount: today_count,
      mastered: entries.filter(e => e.level >= 4).length,
      streak,
      thisWeek,
    };
  }

  function loadAllProgress() { return load(); }
  return { getCard, updateCard, sortByPriority, getStats, loadFromSupabase, loadAllProgress };
})();


