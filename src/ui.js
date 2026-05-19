export const UI = (() => {
  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(`screen-${name}`);
    if (el) el.classList.add('active');
    // Taalswitch alleen op home zichtbaar (en alleen als niet ingelogd)
    const langSwitch = document.getElementById('lang-switch');
    if (langSwitch) {
      langSwitch.style.display = (name === 'home' || name === 'setup') ? '' : 'none';
    }
  }

  function showConfig() {
    const cfg = Data.getConfig();
    if (cfg) {
      document.getElementById('cfg-sheet-words').value = cfg.sheetWords || '';
      document.getElementById('cfg-tab-words').value   = cfg.tabWords   || 'Woorden';
      document.getElementById('cfg-sheet-en').value    = cfg.sheetEn    || '';
      document.getElementById('cfg-tab-en').value      = cfg.tabEn      || 'Woorden';
    }
    document.getElementById('config-overlay').classList.add('visible');
  }

  function hideConfig() {
    document.getElementById('config-overlay').classList.remove('visible');
    document.getElementById('cfg-status').textContent = '';
    document.getElementById('cfg-status').className   = 'modal-status';
  }

  function setConfigStatus(msg, ok) {
    const el = document.getElementById('cfg-status');
    el.textContent = msg;
    el.className   = 'modal-status ' + (ok ? 'ok' : 'err');
  }

  // ── Filter chips ─────────────────────────────────────────────
  function renderFilters(mode) {
    const showCat  = document.getElementById('filter-chapters');
    const showVerb = document.getElementById('filter-verb-group');
    const verbWrap = document.getElementById('verb-group-chips');

    if (mode === 'words') {
      if (showCat) showCat.style.display = '';
      if (showVerb) showVerb.style.display = 'none';
      _buildAccordion('chapter-accordion', false);
    } else if (mode === 'verbs') {
      if (showCat) showCat.style.display = 'none';
      if (showVerb) { showVerb.style.display = ''; verbWrap.innerHTML = ''; }
      Data.getVerbGroups().forEach(g => verbWrap && verbWrap.appendChild(makeChip(g, 'verb-group')));
    } else if (mode === 'past') {
      // Verleden tijd: toon hoofdstuk-accordion (werkwoorden inbegrepen), geen verb-group filter
      if (showCat) showCat.style.display = '';
      if (showVerb) showVerb.style.display = 'none';
      _buildAccordion('chapter-accordion', true); // includeVerbs=true voor irregular_verb categories
    }
  }

  function _buildAccordion(containerId, includeVerbs) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const allCats = [...new Set([
      ...Data.getCategories(),
      ...(includeVerbs ? Data.getVerbs().map(v => v.category).filter(Boolean) : [])
    ])];

    allCats.forEach(cat => {
      const paragraphs = Data.getParagraphs([cat]);
      const item = document.createElement('div');
      item.className = 'accordion-item';

      // Header row
      const header = document.createElement('button');
      header.className = 'accordion-header';
      header.innerHTML = `
        <span class="accordion-chapter-check"></span>
        <span class="accordion-chapter-name">${cat}</span>
        <span class="accordion-arrow">›</span>`;

      // Paragraph chips (hidden by default)
      const parasWrap = document.createElement('div');
      parasWrap.className = 'accordion-paragraphs';

      if (paragraphs.length > 0) {
        const chipRow = document.createElement('div');
        chipRow.className = 'paragraph-chips';
        paragraphs.forEach(p => {
          const chip = makeChip(p, 'theme');
          chip.onclick = () => {
            chip.classList.toggle('selected');
            _updateAccordionHeader(header, cat, containerId);
          };
          chipRow.appendChild(chip);
        });
        parasWrap.appendChild(chipRow);
      }

      // Header click: toggle chapter selection + open/close
      header.onclick = (e) => {
        const checkEl = header.querySelector('.accordion-chapter-check');
        const isChapterSelected = header.classList.contains('has-selection') &&
          [...parasWrap.querySelectorAll('.chip')].every(c => c.classList.contains('selected'));

        if (!item.classList.contains('open')) {
          // Open accordion
          item.classList.add('open');
          _saveAccordionSelection(containerId);
        } else if (!header.classList.contains('has-selection')) {
          // Select all paragraphs
          parasWrap.querySelectorAll('.chip').forEach(c => c.classList.add('selected'));
          _updateAccordionHeader(header, cat, containerId);
        } else {
          // Deselect all & close
          parasWrap.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
          item.classList.remove('open');
          _updateAccordionHeader(header, cat, containerId);
        }
      };

      item.appendChild(header);
      item.appendChild(parasWrap);
      container.appendChild(item);
    });

    // Herstel vorige selectie
    _restoreAccordionSelection(containerId);
  }

  function _updateAccordionHeader(header, cat, containerId) {
    const item    = header.closest('.accordion-item');
    const chips   = item ? [...item.querySelectorAll('.accordion-paragraphs .chip')] : [];
    const anySelected = chips.some(c => c.classList.contains('selected'));
    header.classList.toggle('has-selection', anySelected);
    const checkEl = header.querySelector('.accordion-chapter-check');
    if (checkEl) checkEl.textContent = anySelected ? '✓' : '';
    // Persist selectie na elke wijziging
    _saveAccordionSelection(containerId);
  }

  const ACCORDION_STORAGE_KEY = 'lexum_accordion_selection';

  function _saveAccordionSelection(containerId) {
    try {
      const sel = getAccordionSelection(containerId);
      const all = JSON.parse(localStorage.getItem(ACCORDION_STORAGE_KEY) || '{}');
      all[containerId] = sel;
      localStorage.setItem(ACCORDION_STORAGE_KEY, JSON.stringify(all));
    } catch(e) {}
  }

  function _restoreAccordionSelection(containerId) {
    try {
      const all = JSON.parse(localStorage.getItem(ACCORDION_STORAGE_KEY) || '{}');
      const sel = all[containerId];
      if (!sel) return;
      const container = document.getElementById(containerId);
      if (!container) return;
      container.querySelectorAll('.accordion-item').forEach(item => {
        const cat = item.querySelector('.accordion-chapter-name')?.textContent;
        if (!cat || !sel.categories.includes(cat)) return;
        // Open accordion
        item.classList.add('open');
        // Select matching paragraph chips
        item.querySelectorAll('.accordion-paragraphs .chip').forEach(chip => {
          if (sel.themes.includes(chip.dataset.value)) {
            chip.classList.add('selected');
          }
        });
        // Update header
        const header = item.querySelector('.accordion-header');
        if (header) _updateAccordionHeader(header, cat, containerId);
      });
    } catch(e) {}
  }

  // Read selections out of accordion
  function getAccordionSelection(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return { categories: [], themes: [] };
    const categories = new Set();
    const themes     = [];
    container.querySelectorAll('.accordion-item').forEach(item => {
      const selChips = [...item.querySelectorAll('.accordion-paragraphs .chip.selected')];
      if (selChips.length) {
        const cat = item.querySelector('.accordion-chapter-name').textContent;
        categories.add(cat);
        selChips.forEach(c => themes.push(c.dataset.value));
      }
    });
    return { categories: [...categories], themes };
  }

  function makeChip(label, group) {
    const el = document.createElement('button');
    el.className     = 'chip';
    el.textContent   = label;
    el.dataset.value = label;
    el.onclick       = () => el.classList.toggle('selected'); // default; overridden by caller if needed
    return el;
  }

  function selectLen(el) {
    el.closest('.len-row').querySelectorAll('.len-chip').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
  }

  function selectChipSingle(el) {
    el.closest('.chip-row, .learn-order-chips').querySelectorAll('.chip')
      .forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
  }

  function getSelectedChips(containerId) {
    const c = document.getElementById(containerId);
    if (!c) return [];
    return [...c.querySelectorAll('.chip.selected')].map(x => x.dataset.value);
  }

  // ── Card rendering ───────────────────────────────────────────
  function renderCard(card) {
    const badge     = document.getElementById('card-badge');
    const direction = document.getElementById('card-direction');
    const wordEl    = document.getElementById('card-word');
    const hintEl    = document.getElementById('card-hint');
    const artWrap   = document.getElementById('article-hint-wrap');
    const artVal    = document.getElementById('article-hint-val');
    const input     = document.getElementById('card-input');
    const btnCheck  = document.getElementById('btn-check');
    const feedback  = document.getElementById('feedback-block');
    const hintBub   = document.getElementById('hint-bubble');

    // Reset state
    input.value = '';
    input.className = 'word-input';
    input.disabled  = false;
    btnCheck.style.display = '';
    feedback.classList.remove('visible');
    const ratingRowEl = document.getElementById('rating-row');
    if (ratingRowEl) ratingRowEl.classList.remove('visible');
    document.getElementById('correct-flash').classList.remove('pop');
    hintBub.classList.remove('visible');
    hintBub.textContent = '';
    document.getElementById('btn-hint').style.display = '';

    // Animate
    const fc = document.getElementById('flashcard');
    fc.classList.remove('card-enter', 'card-exit');
    void fc.offsetWidth;  // reflow
    fc.classList.add('card-enter');

    // Breadcrumb
    const breadcrumb = document.getElementById('card-breadcrumb');
    if (breadcrumb) {
      const cat   = card.category || '';
      const theme = card.theme    || '';
      breadcrumb.textContent = cat && theme ? `${cat} · ${theme}` : cat || theme || '';
    }

    if (card._type === 'word') {
      badge.textContent      = 'woordje';
      badge.className        = 'card-type-badge';
      const lang = App?.getLang?.() || 'fr';
      if (card._type === 'past') {
        direction.textContent = 'Verleden tijd (past simple)';
        wordEl.textContent    = card._prompt;
        hintEl.textContent    = card._promptNl ? `(${card._promptNl})` : '';
        artWrap.style.display = 'none';
        input.placeholder     = 'Typ de verleden tijd…';
      } else {
        direction.textContent  = lang === 'en' ? 'Vertaal naar het Engels' : 'Vertaal naar het Frans';
        wordEl.textContent     = card._prompt;
        hintEl.textContent     = '';
        // Show article hint (alleen Frans)
        if (card.article && lang === 'fr') {
          artWrap.style.display = '';
          artVal.textContent    = card.article;
        } else {
          artWrap.style.display = 'none';
        }
        input.placeholder      = lang === 'en' ? 'Typ het Engelse woord…' : 'Typ het Franse woord…';
      }
      document.getElementById('verb-subject-row').style.display = 'none';
    } else {
      badge.textContent      = 'werkwoord';
      badge.className        = 'card-type-badge verb';
      direction.textContent  = 'Vervoeg in de présent';
      wordEl.textContent     = `${card._prompt}`;
      hintEl.textContent     = `(${card._promptNl})`;
      artWrap.style.display  = 'none';
      // Show prominent subject
      document.getElementById('verb-subject-row').style.display = '';
      document.getElementById('verb-subject-label').textContent = card._person;
      input.placeholder = '…';
    }

    input.focus();
  }

  function showFeedback(result, card) {
    const input     = document.getElementById('card-input');
    const btnCheck  = document.getElementById('btn-check');
    const block     = document.getElementById('feedback-block');
    const verdict   = document.getElementById('feedback-verdict');
    const answerEl  = document.getElementById('feedback-answer');
    const exampleEl = document.getElementById('feedback-example');
    const ratingRow = document.getElementById('rating-row');
    const hintBtn   = document.getElementById('btn-hint');

    input.disabled         = true;
    btnCheck.style.display = 'none';
    hintBtn.style.display  = 'none';
    block.classList.remove('visible');
    ratingRow.classList.remove('visible');

    // Toon altijd het juiste antwoord zodat de gebruiker zelf kan beoordelen
    if (result.isCorrect) {
      input.classList.add('is-correct');
      block.className       = 'feedback-block visible correct';
      verdict.textContent   = '✓ Goed zo! Klik je beoordeling:';
      answerEl.innerHTML    = '';
    } else if (result.isClose) {
      input.classList.add('is-close');
      block.className       = 'feedback-block visible close';
      verdict.textContent   = '≈ Bijna! Let op de spelling.';
      answerEl.innerHTML    = `<div class="feedback-correct-answer">Het juiste antwoord: <strong>${result.correctAnswer}</strong></div>`;
    } else {
      input.classList.add('is-wrong');
      block.className       = 'feedback-block visible wrong';
      verdict.textContent   = '✗ Fout antwoord';
      answerEl.innerHTML    = `<div class="feedback-correct-answer">Het juiste antwoord: <strong>${result.correctAnswer}</strong></div>`;
    }
    exampleEl.textContent = card._example || '';
    ratingRow.classList.add('visible');
  }

  function updateProgress(progress) {
    document.getElementById('card-counter').textContent   = `${progress.current}/${progress.total}`;
    document.getElementById('progress-fill').style.width  = `${progress.pct}%`;
  }

  function renderSummary(summary) {
    const el = document.getElementById('sum-avatar');
    if (el) el.innerHTML = `<span class="summary-emoji">${summary.emoji || '🎉'}</span>`;
    document.getElementById('sum-title').textContent  = summary.title;
    document.getElementById('sum-sub').textContent    = summary.sub;
    document.getElementById('sum-good').textContent   = summary.good;
    document.getElementById('sum-doubt').textContent  = summary.doubt;
    document.getElementById('sum-bad').textContent    = summary.bad;


    const panel = document.getElementById('diff-panel');
    const list  = document.getElementById('diff-list');
    list.innerHTML = '';

    if (summary.difficult.length > 0) {
      panel.style.display = '';
      summary.difficult.forEach(d => {
        const row = document.createElement('div');
        row.className = 'diff-row';
        const label = d.person ? `${d.prompt} (${d.person})` : d.prompt;
        row.innerHTML = `<span class="diff-nl">${label}</span><span class="diff-fr">${d.answer}</span>`;
        list.appendChild(row);
      });
    } else {
      panel.style.display = 'none';
    }
  }

  function updateHomeStats() {
    const s = SRS.getStats();
    const isDemo = !Auth.getProfile();
    if (isDemo) {
      // Toon voorbeeldcijfers per taal om de functie te illustreren
      const lang = App?.getLang?.() || 'fr';
      document.getElementById('stat-studied').textContent = lang === 'en' ? '18' : '24';
      document.getElementById('stat-week').textContent    = lang === 'en' ? '3'  : '5';
    } else {
      document.getElementById('stat-studied').textContent = s.todayCount;
      document.getElementById('stat-week').textContent    = s.thisWeek;
    }
    // Demo banner: tonen als niet ingelogd
    const banner = document.getElementById('demo-banner');
    if (banner) banner.style.display = Auth.getProfile() ? 'none' : '';
    // Taalswitch: alleen zichtbaar als niet ingelogd
    const langSwitch = document.getElementById('lang-switch');
    if (langSwitch) langSwitch.style.display = ''; // altijd zichtbaar op home
    // Inlogknop
    const btnLogin = document.getElementById('btn-login');
    const pillWrap = document.getElementById('user-pill-wrap');
    if (Auth.getProfile()) {
      if (btnLogin) btnLogin.style.display = 'none';
      if (pillWrap) pillWrap.style.display = '';
    } else {
      if (btnLogin) btnLogin.style.display = '';
      if (pillWrap) pillWrap.style.display = 'none';
    }
    // Ouder vs kind weergave
    _updateHomeView();
  }

  function _updateHomeView() {
    const isParent   = Auth.isParent();
    const childView  = document.getElementById('home-child-view');
    const dash       = document.getElementById('parent-dashboard');
    if (childView) childView.style.display = isParent ? 'none' : '';
    if (dash)      dash.style.display      = isParent ? ''     : 'none';
    // Kind voortgang renderen
    if (!isParent && typeof ChildProgress !== 'undefined') ChildProgress.render();
    // Paint knop
    _updatePaintBtn();
  }

  function showParentPractice() {
    // Ouder wil zelf oefenen: toon kind-view tijdelijk
    const childView = document.getElementById('home-child-view');
    const dash      = document.getElementById('parent-dashboard');
    if (childView) childView.style.display = '';
    if (dash)      dash.style.display      = 'none';
    // Scroll naar oefenmodes
    childView && childView.scrollIntoView({ behavior: 'smooth' });
  }

  function updateGreeting(lang) {
    const el = document.getElementById('greeting-time');
    if (!el) return;
    const h = new Date().getHours();
    const isFr = (lang || App?.getLang?.() || 'fr') === 'fr';
    let time;
    if (isFr) {
      time = h < 6 ? '🌙 Vroeg vogeltje!' : h < 12 ? '☀️ Bonjour!' : h < 18 ? '🌤 Bon après-midi!' : '🌙 Bonsoir!';
    } else {
      time = h < 6 ? '🌙 Early bird!' : h < 12 ? '☀️ Good morning!' : h < 18 ? '🌤 Good afternoon!' : '🌙 Good evening!';
    }
    el.textContent = time;
  }

  // ── Theme picker ─────────────────────────────────────────────
  const THEME_CLASSES = [
    'theme-spiderman','theme-avengers','theme-cosmic',
    'theme-sakura','theme-sage','theme-cloud',
    'theme-paper','theme-midnight','theme-studio',
    'theme-pixel','theme-candy','theme-ocean',
  ];

  // Licht/donker toggle: behoudt het huidige kleurthema
  function toggleTheme() {
    const isLight = document.body.classList.toggle('light');
    document.getElementById('theme-icon').textContent = isLight ? '🌙' : '☀️';
    localStorage.setItem('lexum_lightmode', isLight ? '1' : '0');
  }

  function applyStoredTheme() {
    // 1. Herstel kleurthema
    const colorTheme = localStorage.getItem('lexum_color_theme') || 'default';
    const isLight    = localStorage.getItem('lexum_lightmode') === '1';
    _applyColorTheme(colorTheme, isLight, true);
  }

  function _applyColorTheme(name, isLight, silent) {
    document.body.classList.remove(...THEME_CLASSES);
    document.body.classList.toggle('light', isLight);
    document.getElementById('theme-icon').textContent = isLight ? '🌙' : '☀️';

    if (name && name !== 'default') {
      document.body.classList.add('theme-' + name);
    }

    if (!silent) {
      localStorage.setItem('lexum_color_theme', name || 'default');
      localStorage.setItem('lexum_lightmode', isLight ? '1' : '0');
      _syncSwatchActive(name || 'default');
      _syncModeBtns();
    }
  }

  function _syncSwatchActive(name) {
    document.querySelectorAll('.theme-swatch').forEach(s => {
      s.classList.toggle('active', s.dataset.theme === name);
    });
  }

  function applyTheme(name) {
    const isLight = document.body.classList.contains('light');
    _applyColorTheme(name, isLight, false);
    hideThemePicker();
  }

  function showThemePicker() {
    const cur = localStorage.getItem('lexum_color_theme') || 'default';
    _syncSwatchActive(cur);
    _syncModeBtns();
    document.getElementById('theme-overlay').classList.add('visible');
  }

  function _syncModeBtns() {
    const isLight = document.body.classList.contains('light');
    const btnDark  = document.getElementById('theme-btn-dark');
    const btnLight = document.getElementById('theme-btn-light');
    if (btnDark)  btnDark.classList.toggle('theme-mode-btn-active', !isLight);
    if (btnLight) btnLight.classList.toggle('theme-mode-btn-active', isLight);
  }

  function hideThemePicker() {
    document.getElementById('theme-overlay').classList.remove('visible');
  }

  // ── Paint knop zichtbaarheid ──────────────────────────────────
  function _updatePaintBtn() {
    const btn = document.getElementById('btn-theme-paint');
    if (!btn) return;
    btn.style.display = Auth.isParent() ? 'none' : '';
  }

  function initTooltips() {
    document.querySelectorAll('.stat-tile--tip').forEach(tile => {
      tile.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') {
          tile.classList.add('tooltip-open');
        }
      });
      tile.addEventListener('pointerup', (e) => {
        if (e.pointerType === 'touch') {
          tile.classList.remove('tooltip-open');
          e.preventDefault();
        }
      });
      tile.addEventListener('pointerleave', (e) => {
        if (e.pointerType === 'touch') {
          tile.classList.remove('tooltip-open');
        }
      });
    });
  }

  function showSheetError() {
    document.getElementById('sheet-error-banner').style.display = '';
  }

  function hideSheetError() {
    document.getElementById('sheet-error-banner').style.display = 'none';
  }

  function updateDemoBanner() { updateHomeStats(); }

  // ── Welcome modal ─────────────────────────────────────
  function showWelcomeModal() {
    document.getElementById('welcome-overlay').classList.add('visible');
  }
  function hideWelcomeModal(e) {
    if (e && e.target !== document.getElementById('welcome-overlay')) return;
    document.getElementById('welcome-overlay').classList.remove('visible');
  }
  function showUpsell() {}
  function hideUpsell() {}


  function updateHeaderAuth() {}

  // ── Toast notificatie ─────────────────────────────────
  let _toastTimer = null;
  function showToast(msg, duration = 2500) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('visible');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('visible'), duration);
  }

  // ── User menu ─────────────────────────────────────────
  function toggleUserMenu() {
    const menu = document.getElementById('user-menu');
    if (!menu) return;
    const isOpen = menu.style.display === 'block';
    if (!isOpen && Auth.isParent()) Auth._loadChildrenIntoMenu();
    menu.style.display = isOpen ? 'none' : 'block';
  }
  function closeUserMenu() {
    const menu = document.getElementById('user-menu');
    if (menu) menu.style.display = 'none';
  }

  // ── Kind toevoegen modal ──────────────────────────────
  function showAddChild() {
    document.getElementById('child-name-input').value  = '';
    document.getElementById('child-email-input').value = '';
    document.getElementById('add-child-status').textContent = '';
    document.getElementById('add-child-status').className   = 'modal-status';
    document.getElementById('add-child-overlay').classList.add('visible');
  }
  function hideAddChild() {
    document.getElementById('add-child-overlay').classList.remove('visible');
  }
  function setAddChildStatus(msg, ok) {
    const el = document.getElementById('add-child-status');
    el.textContent = msg;
    el.className   = 'modal-status ' + (ok ? 'ok' : 'err');
  }

  return {
    showScreen, showConfig, hideConfig, setConfigStatus,
    showAddChild, hideAddChild, setAddChildStatus,
    toggleUserMenu, closeUserMenu, showToast,
    showWelcomeModal, hideWelcomeModal,
    renderFilters, selectLen, getSelectedChips,
    renderCard, showFeedback, updateProgress,
    renderSummary, updateHomeStats, updateGreeting,
    toggleTheme, applyStoredTheme, applyTheme, _applyColorTheme,
    showThemePicker, hideThemePicker, _syncModeBtns,
    initTooltips,
    showSheetError, hideSheetError,
    showUpsell, hideUpsell, updateDemoBanner,
    updateHeaderAuth,
    selectChipSingle,
    showParentPractice,
    getAccordionSelection, _buildAccordion,
  };
})();


