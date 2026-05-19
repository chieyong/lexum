export const ChildProgress = (() => {

  function render() {
    const list  = document.getElementById('child-chapters-list');
    const empty = document.getElementById('child-progress-empty');
    if (!list) return;

    const allWords = Data.getWords();
    const allVerbs = Data.getVerbs();
    const progress = SRS.loadAllProgress(); // zie SRS module

    // Bouw lookup card_id → { category, theme }
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

    // Groepeer per categorie → paragraaf
    const chapters = {};

    // Initialiseer alle bekende categorieën (ook ongeoefende)
    const allCats = [...new Set([
      ...allWords.map(w => w.category),
      ...allVerbs.map(v => v.category)
    ].filter(Boolean))].sort();

    allCats.forEach(cat => {
      chapters[cat] = { seen: 0, correct: 0, cardsSeen: 0, paragraphs: {} };
      // Paragrafen van woorden
      [...new Set(allWords.filter(w => w.category === cat).map(w => w.theme).filter(Boolean))]
        .sort()
        .forEach(t => { chapters[cat].paragraphs[t] = { seen: 0, correct: 0 }; });
    });

    // Vul met voortgangsdata
    Object.entries(progress).forEach(([cardId, p]) => {
      const info = resolveInfo(cardId);
      if (!info) return;
      const cat   = info.cat;
      const theme = info.theme;
      if (!chapters[cat]) return;
      chapters[cat].seen       += p.timesSeen    || 0;
      chapters[cat].correct    += p.timesCorrect || 0;
      chapters[cat].cardsSeen++;
      if (theme && theme !== '—' && chapters[cat].paragraphs[theme]) {
        chapters[cat].paragraphs[theme].seen    += p.timesSeen    || 0;
        chapters[cat].paragraphs[theme].correct += p.timesCorrect || 0;
      }
    });

    const hasAny = Object.values(chapters).some(c => c.cardsSeen > 0);

    if (!hasAny) {
      // Demo-modus: toon voorbeeldvoortgang
      if (!Auth.getProfile()) {
        if (empty) empty.style.display = 'none';
        list.innerHTML = _renderDemoProgress();
        return;
      }
      list.innerHTML = '';
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';

    list.innerHTML = Object.entries(chapters).map(([cat, data]) => {
      const pct    = data.seen > 0 ? Math.round((data.correct / data.seen) * 100) : null;
      const status = pct === null ? 'unseen' : pct >= 70 ? 'good' : pct >= 40 ? 'medium' : 'weak';
      const dot    = pct === null ? '⚪' : pct >= 70 ? '🟢' : pct >= 40 ? '🟠' : '🔴';
      const msg    = pct === null
        ? 'Nog niet geoefend'
        : pct >= 70 ? 'Gaat super, blijf zo doorgaan!'
        : pct >= 40 ? 'Je bent op de goede weg, nog even oefenen'
        : 'Hier valt nog wat te winnen — zin in een rondje?';

      const paraRows = Object.entries(data.paragraphs).map(([theme, pd]) => {
        const pp     = pd.seen > 0 ? Math.round((pd.correct / pd.seen) * 100) : null;
        const pdot   = pp === null ? '⚪' : pp >= 70 ? '🟢' : pp >= 40 ? '🟠' : '🔴';
        const pmsg   = pp === null ? 'nog niet geoefend' : pp >= 70 ? 'goed!' : pp >= 40 ? 'bijna' : 'lastig';
        const pcolor = pp === null ? 'var(--border)' : pp >= 70 ? 'var(--lime)' : pp >= 40 ? '#f0a500' : '#ff6b6b';
        return `<div class="child-para-row">
          <span class="child-para-dot">${pdot}</span>
          <span class="child-para-label">${theme}</span>
          <div class="child-para-bar-wrap">
            <div class="child-para-bar-fill" style="width:${pp||0}%;background:${pcolor}"></div>
          </div>
          <span class="child-para-msg">${pmsg}</span>
        </div>`;
      }).join('');

      const hasCta   = status === 'weak';
      const hasParas = paraRows.length > 0;

      return `<div class="child-chapter-item status-${status}">
        <div class="child-chapter-header" onclick="this.closest('.child-chapter-item').classList.toggle('open')">
          <span class="child-chapter-dot">${dot}</span>
          <div class="child-chapter-info">
            <span class="child-chapter-name">${cat}</span>
            <span class="child-chapter-msg">${msg}${hasCta ? ` <span class="child-chapter-cta"><button class="btn-chapter-practice" onclick="event.stopPropagation();App.selectModeWithChapter('words','${cat}')">Oefen nu →</button></span>` : ''}</span>
          </div>
          ${hasParas ? '<span class="child-chapter-arrow">›</span>' : ''}
        </div>
        ${hasParas ? `<div class="child-para-rows">${paraRows}</div>` : ''}
      </div>`;
    }).join('');
  }

  function _renderDemoProgress() {
    const lang = App?.getLang?.() || 'fr';

    const demoFr = [
      { cat: '1 - School',       pct: 82, paragraphs: [{ t:'A', pct:90 },{ t:'B', pct:75 },{ t:'C', pct:80 }] },
      { cat: '2 - Boodschappen', pct: 55, paragraphs: [{ t:'A', pct:70 },{ t:'B', pct:45 },{ t:'C', pct:50 }] },
      { cat: '3 - Vrije tijd',   pct: 30, paragraphs: [{ t:'A', pct:40 },{ t:'B', pct:20 }] },
    ];
    const demoEn = [
      { cat: '1 - School',       pct: 65, paragraphs: [{ t:'A', pct:80 },{ t:'B', pct:55 },{ t:'C', pct:60 }] },
      { cat: '2 - Boodschappen', pct: 40, paragraphs: [{ t:'A', pct:50 },{ t:'B', pct:30 },{ t:'C', pct:40 }] },
      { cat: '3 - Vrije tijd',   pct:  0, paragraphs: [{ t:'A', pct: 0 },{ t:'B', pct: 0 }] },
    ];

    const data = lang === 'en' ? demoEn : demoFr;

    return data.map(({ cat, pct, paragraphs }) => {
      const status = pct >= 70 ? 'good' : pct >= 40 ? 'medium' : 'weak';
      const dot    = pct >= 70 ? '🟢' : pct >= 40 ? '🟠' : pct > 0 ? '🔴' : '⚪';
      const msg    = pct >= 70 ? 'Gaat super, blijf zo doorgaan!'
                   : pct >= 40 ? 'Je bent op de goede weg, nog even oefenen'
                   : pct > 0   ? 'Hier valt nog wat te winnen — zin in een rondje?'
                   :             'Nog niet geoefend';

      const paraRows = paragraphs.map(({ t, pct: pp }) => {
        const pdot   = pp >= 70 ? '🟢' : pp >= 40 ? '🟠' : pp > 0 ? '🔴' : '⚪';
        const pmsg   = pp >= 70 ? 'goed!' : pp >= 40 ? 'bijna' : pp > 0 ? 'lastig' : 'nog niet geoefend';
        const pcolor = pp >= 70 ? 'var(--lime)' : pp >= 40 ? '#f0a500' : pp > 0 ? '#ff6b6b' : 'var(--border)';
        return `<div class="child-para-row">
          <span class="child-para-dot">${pdot}</span>
          <span class="child-para-label">${t}</span>
          <div class="child-para-bar-wrap">
            <div class="child-para-bar-fill" style="width:${pp}%;background:${pcolor}"></div>
          </div>
          <span class="child-para-msg">${pmsg}</span>
        </div>`;
      }).join('');

      return `<div class="child-chapter-item status-${status}">
        <div class="child-chapter-header" onclick="this.closest('.child-chapter-item').classList.toggle('open')">
          <span class="child-chapter-dot">${dot}</span>
          <div class="child-chapter-info">
            <span class="child-chapter-name">${cat}</span>
            <span class="child-chapter-msg">${msg}</span>
          </div>
          <span class="child-chapter-arrow">›</span>
        </div>
        <div class="child-para-rows">${paraRows}</div>
      </div>`;
    }).join('');
  }

  return { render };
})();
