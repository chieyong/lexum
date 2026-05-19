import { supa } from './constants.js';

export const Dashboard = (() => {
  let _children      = [];  // [{child_user_id, child_name, ...summary}]
  let _activeIdx     = 0;
  let _progress      = []; // kaartdata van actief kind (gefilterd op taal)
  let _progressAll   = []; // alle kaartdata van actief kind (ongefilterd)
  let _chartInst     = null;

  const LEVEL_LABELS = ['Nieuw','Level 1','Level 2','Level 3','Level 4','Level 5','Geleerd'];
  const LEVEL_COLORS = ['#444','#6b7a8d','#5b8fa8','#4a9e7a','#3db87a','#b4ff50','#b4ff50'];

  async function load() {
    if (!Auth.isParent()) return;

    const dash = document.getElementById('parent-dashboard');
    if (dash) dash.style.display = '';

    _showLoading(true);

    try {
      // Haal kinderoverzicht op
      const { data, error } = await supa.rpc('get_children_summary');
      if (error) throw error;

      _children = data || [];

      if (_children.length === 0) {
        _showLoading(false);
        document.getElementById('dashboard-empty').style.display = '';
        return;
      }

      // Bouw kind-tabs
      _renderChildTabs();

      // Laad data voor eerste kind
      await _loadChild(0);

    } catch(e) {
      console.warn('[Dashboard] load mislukt:', e);
      _showLoading(false);
    }
  }

  function _renderChildTabs() {
    const tabs = document.getElementById('dashboard-child-tabs');
    if (!tabs) return;
    tabs.style.display = _children.length > 1 ? '' : 'none';
    tabs.innerHTML = _children.map((c, i) =>
      `<button class="child-tab${i===0?' active':''}" onclick="Dashboard.selectChild(${i})">
        ${c.child_name || 'Kind'}
      </button>`
    ).join('');
    _updateDashTitle(0);
  }

  function _updateDashTitle(idx) {
    const child = _children[idx];
    if (!child) return;
    const name = child.child_name || 'Kind';
    const titleEl    = document.getElementById('dash-child-title');
    const subtitleEl = document.getElementById('dash-child-subtitle');
    if (titleEl) titleEl.textContent = `Voortgang ${name}`;
    if (subtitleEl) {
      // Laatste activiteit
      const lastSeen = _progressAll.length
        ? _progressAll.filter(p => p.last_seen).sort((a,b) => new Date(b.last_seen) - new Date(a.last_seen))[0]?.last_seen
        : null;
      if (lastSeen) {
        const d = new Date(lastSeen);
        const daysAgo = Math.floor((Date.now() - d) / 86400000);
        subtitleEl.textContent = daysAgo === 0 ? 'Vandaag geoefend 🟢' : daysAgo === 1 ? 'Gisteren geoefend' : `${daysAgo} dagen geleden geoefend`;
      } else {
        subtitleEl.textContent = 'Nog niet geoefend';
      }
    }
  }

  async function selectChild(idx) {
    _activeIdx = idx;
    document.querySelectorAll('.child-tab').forEach((t, i) =>
      t.classList.toggle('active', i === idx));
    await _loadChild(idx);
  }

  async function _loadChild(idx) {
    _showLoading(true);
    const child = _children[idx];
    if (!child?.child_user_id) {
      _showLoading(false);
      document.getElementById('dashboard-empty').style.display = '';
      return;
    }

    try {
      const { data, error } = await supa.rpc('get_child_progress', {
        p_child_user_id: child.child_user_id
      });
      if (error) throw error;

      _progressAll = data || [];
      _progress    = data || [];
      await _render(child);
      _updateDashTitle(idx);
      _showLoading(false);
      document.getElementById('dashboard-content').style.display = '';
      document.getElementById('dashboard-empty').style.display   = 'none';

    } catch(e) {
      console.warn('[Dashboard] kind laden mislukt:', e);
      _showLoading(false);
      document.getElementById('dashboard-empty').style.display = '';
    }
  }

  async function _render(summary) {
    const lang = App.getLang();

    // Laad juiste sheet voor lookup op basis van actieve taal
    const cfg = Data.getConfig();
    try {
      if (lang === 'en' && cfg?.sheetEn) {
        await Data.loadFromSheet(cfg.sheetEn, cfg.tabEn || 'Woorden');
      } else if (cfg?.sheetWords) {
        await Data.loadFromSheet(cfg.sheetWords, cfg.tabWords || 'Woorden');
      } else {
        if (lang === 'en') Data.loadEnglishDemoData();
        else Data.loadDemoData();
      }
    } catch(e) {
      if (lang === 'en') Data.loadEnglishDemoData();
      else Data.loadDemoData();
    }

    // Filter progress op actieve taal op basis van originele data
    const langPrefix = lang === 'en' ? ['EN','EV'] : ['FR','V'];
    _progress = _progressAll.filter(p => {
      const id = (p.card_id || '').toUpperCase();
      return langPrefix.some(px => id.startsWith(px));
    });

    // KPI's herberekenen na filter
    const streak = _calcStreak(_progress);
    const mastered   = _progress.filter(p => (p.srs_level || 0) >= 4).length;
    const struggling = _progress.filter(p => (p.times_seen||0) >= 2 && ((p.times_correct||0)/Math.max(p.times_seen,1)) < 0.6).length;
    document.getElementById('dash-total').textContent      = _progress.reduce((s,p) => s + (p.times_seen||0), 0);
    document.getElementById('dash-mastered').textContent   = mastered;
    document.getElementById('dash-streak').textContent     = streak;
    document.getElementById('dash-struggling').textContent = struggling;

    // Activiteit grafiek
    _renderActivityChart();

    // Voortgang per hoofdstuk
    _renderChapters();

    // Moeilijke & goed gekende woorden
    _renderStruggling();
  }

  function _renderChapters() {
    const card = document.getElementById('dash-chapters-card');
    const list = document.getElementById('dash-chapters-list');
    if (!card || !list) return;

    // Koppel progress aan woorden/werkwoorden
    const allWords = Data.getWords();
    const allVerbs = Data.getVerbs();

    // Bouw lookup: card_id → { category, theme }
    const lookup = {};
    const ALL_PERSONS = ['je','tu','il/elle','nous','vous','ils/elles'];
    allWords.forEach(w => { lookup[w.id] = { cat: w.category, theme: w.theme || '—' }; });
    allVerbs.forEach(v => {
      const info = { cat: v.category, theme: v.theme || '—' };
      lookup[v.id + '_inf'] = info;
      ALL_PERSONS.forEach(p => { lookup[v.id + '_' + p] = info; });
    });
    function resolveInfo(cardId) {
      if (lookup[cardId]) return lookup[cardId];
      if (cardId.endsWith('_inf')) {
        const v = allVerbs.find(v => v.id === cardId.slice(0,-4));
        if (v) return { cat: v.category, theme: v.theme || '—' };
      }
      for (const p of ALL_PERSONS) {
        if (cardId.endsWith('_' + p)) {
          const v = allVerbs.find(v => v.id === cardId.slice(0,-(p.length+1)));
          if (v) return { cat: v.category, theme: v.theme || '—' };
        }
      }
      return null;
    }
    // Fallback: voor card_ids die een _suffix hebben maar niet in lookup zitten
    // (bijv. oudere V-prefix entries) — strip suffix en zoek opnieuw
    function resolveCardId(cardId) {
      if (lookup[cardId]) return lookup[cardId];
      if (cardId.endsWith('_inf')) {
        const base = cardId.slice(0,-4);
        const v = allVerbs.find(v => v.id === base);
        if (v) return { cat: v.category, theme: v.theme || '—' };
      }
      for (const p of ALL_PERSONS) {
        if (cardId.endsWith('_' + p)) {
          const base = cardId.slice(0, -(p.length+1));
          const v = allVerbs.find(v => v.id === base);
          if (v) return { cat: v.category, theme: v.theme || '—' };
        }
      }
      return null;
    }

    // Groepeer progress per categorie → paragraaf
    const chapters = {}; // { catName: { total, correct, seen, paragraphs: { theme: {total,correct,seen} } } }

    _progress.forEach(p => {
      const info = resolveCardId(p.card_id);
      if (!info) return;
      const cat = info.cat || 'Overig';
      const theme = info.theme || '—';
      if (!chapters[cat]) chapters[cat] = { seen: 0, correct: 0, total: 0, paragraphs: {} };
      if (!chapters[cat].paragraphs[theme]) chapters[cat].paragraphs[theme] = { seen: 0, correct: 0 };

      chapters[cat].seen          += p.times_seen    || 0;
      chapters[cat].correct       += p.times_correct || 0;
      chapters[cat].total++;
      chapters[cat].paragraphs[theme].seen    += p.times_seen    || 0;
      chapters[cat].paragraphs[theme].correct += p.times_correct || 0;
    });

    if (Object.keys(chapters).length === 0) {
      card.style.display = 'none';
      return;
    }
    card.style.display = '';

    list.innerHTML = Object.entries(chapters)
      .map(([cat, data]) => {
        const pct      = data.seen > 0 ? Math.round((data.correct / data.seen) * 100) : 0;
        const barColor = pct >= 70 ? 'var(--lime)' : pct >= 40 ? 'var(--warning, #f0a500)' : '#ff6b6b';
        const pctLabel = data.seen > 0 ? `${pct}%` : 'Nog niet geoefend';

        const paraRows = Object.entries(data.paragraphs)
          .filter(([theme]) => theme !== '—')
          .map(([theme, pd]) => {
            const pp = pd.seen > 0 ? Math.round((pd.correct / pd.seen) * 100) : 0;
            const pc = pd.seen > 0 ? `${pp}%` : '—';
            const pColor = pp >= 70 ? 'var(--lime)' : pp >= 40 ? 'var(--warning, #f0a500)' : '#ff6b6b';
            return `<div class="dash-para-row">
              <span class="dash-para-label">${theme}</span>
              <div class="dash-para-bar-wrap">
                <div class="dash-para-bar-fill" style="width:${pp}%;background:${pColor}"></div>
              </div>
              <span class="dash-para-pct" style="color:${pColor}">${pc}</span>
              <span class="dash-para-count">${pd.seen}×</span>
            </div>`;
          }).join('');

        const hasParas = paraRows.length > 0;

        return `<div class="dash-chapter-block">
          <div class="dash-chapter-header" onclick="this.closest('.dash-chapter-block').classList.toggle('open')">
            <span class="dash-chapter-name">${cat}</span>
            <span class="dash-chapter-meta">${pctLabel} · ${data.seen}× geoefend</span>
          </div>
          <div class="dash-chapter-bar-wrap">
            <div class="dash-chapter-bar-fill" style="width:${pct}%;background:${barColor}"></div>
          </div>
          ${hasParas ? `<div class="dash-chapter-expand-hint" style="font-size:11px;color:var(--text-muted)">▸ tik voor paragrafen</div>
          <div class="dash-para-rows">${paraRows}</div>` : ''}
        </div>`;
      }).join('');
  }

  function _renderActivityChart() {
    const canvas = document.getElementById('dash-activity-chart');
    if (!canvas) return;

    // Bouw array: activiteit per dag (laatste 7 dagen)
    const days = [];
    const counts = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayStr = d.toDateString();
      days.push(['zo','ma','di','wo','do','vr','za'][d.getDay()]);
      counts.push(_progress.filter(p => {
        if (!p.last_seen) return false;
        return new Date(p.last_seen).toDateString() === dayStr;
      }).length);
    }

    // Teken simpele bar chart via Canvas API — leest CSS variabelen uit voor theme support
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth || 300;
    const H = 80;
    canvas.width  = W;
    canvas.height = H;

    // Lees kleuren uit CSS variabelen (werkt met alle themes + dark/light)
    const styles  = getComputedStyle(document.body);
    const lime    = styles.getPropertyValue('--lime').trim() || '#b4ff50';
    const textMut = styles.getPropertyValue('--text-muted').trim() || '#888';
    const textSoft= styles.getPropertyValue('--text-soft').trim() || '#aaa';
    const border  = styles.getPropertyValue('--border-hi').trim() || '#333';
    // Lege bar: gebruik border kleur met wat opacity — zichtbaar in zowel dark als light
    const isLight = document.body.classList.contains('light');
    const dimBg   = isLight
      ? 'rgba(0,0,0,0.09)'      // lichte modus: subtiel grijsje
      : 'rgba(255,255,255,0.07)'; // donkere modus: subtiel wit

    const max   = Math.max(...counts, 1);
    const barW  = (W / 7) * 0.55;
    const gap   = (W / 7) * 0.45;

    ctx.clearRect(0, 0, W, H);

    days.forEach((label, i) => {
      const x    = i * (W / 7) + gap / 2;
      const pct  = counts[i] / max;
      const bH   = Math.max(pct * (H - 22), counts[i] > 0 ? 4 : 0);
      const y    = H - bH - 16;
      const isToday = i === 6;

      // Bar background — altijd zichtbaar
      ctx.fillStyle = dimBg;
      ctx.beginPath();
      ctx.roundRect(x, 0, barW, H - 16, 4);
      ctx.fill();

      // Bar fill
      if (counts[i] > 0) {
        // Actieve bars: lime voor vandaag, iets gedempt voor andere dagen
        ctx.fillStyle = isToday ? lime : (isLight ? lime + 'aa' : lime + '88');
        ctx.beginPath();
        ctx.roundRect(x, y, barW, bH, 4);
        ctx.fill();
      }

      // Label
      ctx.fillStyle = isToday ? lime : (isLight ? textMut : 'rgba(255,255,255,0.3)');
      ctx.font = `${isToday ? 600 : 400} 10px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(label, x + barW / 2, H - 2);

      // Count
      if (counts[i] > 0) {
        ctx.fillStyle = isToday ? lime : 'rgba(255,255,255,.4)';
        ctx.font = '10px sans-serif';
        ctx.fillText(counts[i], x + barW / 2, y - 3);
      }
    });
  }

  function _renderStruggling() {
    const card  = document.getElementById('dash-struggling-card');
    const list  = document.getElementById('dash-struggling-list');
    const mCard = document.getElementById('dash-mastered-card');
    const mList = document.getElementById('dash-mastered-list');
    if (!card || !list) return;

    // ── Bouw één grote flat lookup van card_id → label ──────────
    // Elke mogelijke card_id die de app ooit opslaat wordt hier gedekt.
    const PERSONS = ['je','tu','il/elle','nous','vous','ils/elles'];
    const labelMap = {}; // card_id → { nl, fr }

    Data.getWords().forEach(w => {
      const fr = (w.article ? w.article + ' ' : '') + w.fr;
      labelMap[w.id] = { nl: w.nl, fr };
    });

    Data.getVerbs().forEach(v => {
      labelMap[v.id + '_inf'] = { nl: v.nl, fr: v.infinitive };
      PERSONS.forEach(p => {
        labelMap[v.id + '_' + p] = { nl: `${v.nl} (${p})`, fr: `${v.infinitive} — ${p}` };
      });
    });

    // Fallback lookup: strip suffix → zoek op basis-ID in woorden én werkwoorden
    function resolveLabel(cardId) {
      if (labelMap[cardId]) return labelMap[cardId];
      // Strip bekende suffixen en probeer basis-ID
      const suffixes = ['_inf', ...PERSONS.map(p => '_' + p)];
      for (const s of suffixes) {
        if (cardId.endsWith(s)) {
          const baseId = cardId.slice(0, -s.length);
          // Zoek in woorden
          const w = Data.getWords().find(w => w.id === baseId);
          if (w) return { nl: w.nl, fr: (w.article ? w.article + ' ' : '') + w.fr };
          // Zoek in werkwoorden
          const v = Data.getVerbs().find(v => v.id === baseId);
          if (v) {
            const person = s.startsWith('_') && s !== '_inf' ? s.slice(1) : null;
            return { nl: person ? `${v.nl} (${person})` : v.nl, fr: v.infinitive };
          }
        }
      }
      return null;
    }

    // ── Render één rij ───────────────────────────────────────────
    function renderRow(p, color) {
      const pct   = p.times_seen > 0 ? Math.round((p.times_correct / p.times_seen) * 100) : 0;
      const label = resolveLabel(p.card_id);
      const nl    = label ? label.nl : p.card_id;
      const fr    = label ? label.fr : '';
      const bars  = _scoreBars(pct);
      return `<div class="dash-word-row">
        <div class="dash-word-info">
          <span class="dash-word-nl">${nl}</span>
          <span class="dash-word-fr">${fr}</span>
        </div>
        <div class="dash-word-right">
          <div class="dash-score-bars">${bars}</div>
          <span class="dash-word-score" style="color:${color}">${pct}%<span style="font-size:10px;opacity:.5;margin-left:3px">${p.times_seen}×</span></span>
        </div>
      </div>`;
    }

    // ── Moeilijke woorden: ≥2x gezien, <60% correct ─────────────
    const struggling = _progress
      .filter(p => (p.times_seen || 0) >= 2 && ((p.times_correct || 0) / p.times_seen) < 0.6)
      .sort((a, b) => (a.times_correct / a.times_seen) - (b.times_correct / b.times_seen))
      .slice(0, 12);

    if (struggling.length === 0) {
      card.style.display = 'none';
    } else {
      card.style.display = '';
      list.innerHTML = struggling.map(p => renderRow(p, '#ff6b6b')).join('');
    }

    // ── Goed gekend: level ≥ 4 ───────────────────────────────────
    const mastered = _progress
      .filter(p => (p.level || 0) >= 4)
      .sort((a, b) => (b.level || 0) - (a.level || 0))
      .slice(0, 8);

    if (mastered.length === 0) {
      if (mCard) mCard.style.display = 'none';
    } else {
      if (mCard) mCard.style.display = '';
      if (mList) mList.innerHTML = mastered.map(p => renderRow(p, 'var(--lime)')).join('');
    }
  }

  function _scoreBars(pct) {
    const filled = Math.round(pct / 20); // 0–5 blokjes
    return Array.from({length: 5}, (_, i) =>
      `<span class="dash-score-bar${i < filled ? ' filled' : ''}"></span>`
    ).join('');
  }

  function _calcStreak(progress) {
    const days = new Set(progress
      .filter(p => p.last_seen)
      .map(p => new Date(p.last_seen).toDateString()));

    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      if (days.has(d.toDateString())) streak++;
      else if (i > 0) break;
    }
    return streak;
  }

  function _showLoading(show) {
    const loading = document.getElementById('dashboard-loading');
    const content = document.getElementById('dashboard-content');
    const empty   = document.getElementById('dashboard-empty');
    if (loading) loading.style.display = show ? 'flex' : 'none';
    if (show && content) content.style.display = 'none';
    if (show && empty)   empty.style.display   = 'none';
  }

  return { load, selectChild };
})();
