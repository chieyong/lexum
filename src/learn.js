export const Learn = (() => {
  let _cards     = [];
  let _index     = 0;
  let _flipped   = false;
  let _direction = 'nl-fr'; // 'nl-fr' of 'fr-nl'

  function init() {
    UI._buildAccordion('learn-chapter-accordion', true);
  }

  function start() {
    const accordion = UI.getAccordionSelection('learn-chapter-accordion');
    const selCats   = accordion.categories;
    const selThemes = accordion.themes;
    const orderChip = document.querySelector('#screen-learn-setup .learn-order-chips .chip.selected');
    const random    = orderChip ? orderChip.dataset.value === 'random' : false;
    const dirChip   = document.querySelector('#screen-learn-setup .learn-direction-chips .chip.selected');
    _direction      = dirChip ? dirChip.dataset.value : 'nl-fr';

    // Woorden
    let words = Data.getWords();
    if (selCats.length)   words = words.filter(w => selCats.includes(w.category));
    if (selThemes.length) words = words.filter(w => selThemes.includes(w.theme));

    // Werkwoorden — markeer als type:'verb' voor renderCard
    let verbs = Data.getVerbs();
    if (selCats.length) verbs = verbs.filter(v => selCats.includes(v.category));

    let pool = [...words, ...verbs];
    if (pool.length === 0) { alert('Geen kaarten gevonden voor deze selectie.'); return; }

    if (random) {
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
    }

    _cards   = pool;
    _index   = 0;
    _flipped = false;

    UI.showScreen('learn');
    _renderCard();
    _renderDots();

    // Click card to flip
    const inner = document.getElementById('learn-card-inner');
    if (inner) {
      inner.onclick = () => flip();
    }
  }

  function _renderCard() {
    const card = _cards[_index];
    if (!card) return;

    // Reset flip
    _flipped = false;
    const inner = document.getElementById('learn-card-inner');
    if (inner) inner.classList.remove('flipped');
    const showBtn = document.getElementById('learn-btn-show');
    if (showBtn) { showBtn.classList.remove('revealed'); showBtn.textContent = 'Toon'; }

    const isVerb  = card.type === 'verb';
    const frFull  = isVerb ? card.infinitive : (card.article ? `${card.article} ${card.fr}` : (card.fr || '—'));
    const frMain  = isVerb ? card.infinitive : (card.fr || '—');
    const frSub   = isVerb
      ? (card.group !== 'irregular' ? card.group : 'onregelmatig')
      : (card.article ? `(${card.article})` : '');
    const nlMain  = card.nl || '—';

    if (_direction === 'fr-nl') {
      // Voorkant: Frans
      document.getElementById('learn-emoji').textContent      = card.emoji || '';
      document.getElementById('learn-fr').textContent         = frMain;
      document.getElementById('learn-article').textContent    = frSub;
      // Achterkant: Nederlands
      document.getElementById('learn-emoji-back').textContent = card.emoji || '';
      document.getElementById('learn-nl').textContent         = nlMain;
      document.getElementById('learn-fr-small').textContent   = frFull;
      document.getElementById('learn-example').textContent    = card.example || '';
    } else {
      // Voorkant: Nederlands (NL→FR, standaard)
      document.getElementById('learn-emoji').textContent      = card.emoji || '';
      document.getElementById('learn-fr').textContent         = nlMain;
      document.getElementById('learn-article').textContent    = '';
      // Achterkant: Frans
      document.getElementById('learn-emoji-back').textContent = card.emoji || '';
      document.getElementById('learn-nl').textContent         = frMain;
      document.getElementById('learn-fr-small').textContent   = frSub;
      document.getElementById('learn-example').textContent    = card.example || '';
    }

    // Breadcrumb
    const lbc = document.getElementById('learn-breadcrumb');
    if (lbc) {
      const cat   = card.category || '';
      const theme = card.theme    || '';
      lbc.textContent = cat && theme ? `${cat} · ${theme}` : cat || theme || '';
    }

    // Progress
    const pct = (_index / _cards.length) * 100;
    document.getElementById('learn-progress-fill').style.width = pct + '%';
    document.getElementById('learn-card-count').textContent = `${_index + 1}/${_cards.length}`;

    // Buttons
    const prev = document.getElementById('learn-btn-prev');
    const next = document.getElementById('learn-btn-next');
    if (prev) prev.disabled = _index === 0;
    if (next) {
      next.disabled = false;
      if (_index === _cards.length - 1) {
        next.textContent = 'Klaar ✓';
        next.classList.add('finish');
      } else {
        next.textContent = 'Volgende →';
        next.classList.remove('finish');
      }
    }

    _updateDots();
  }

  function flip() {
    _flipped = !_flipped;
    const inner = document.getElementById('learn-card-inner');
    if (inner) inner.classList.toggle('flipped', _flipped);
    const btn = document.getElementById('learn-btn-show');
    if (btn) {
      btn.classList.toggle('revealed', _flipped);
      btn.textContent = _flipped ? 'Verberg' : 'Toon';
    }
  }

  function next() {
    if (_index >= _cards.length - 1) { exit(); return; }
    _index++;
    _renderCardAnimated();
  }

  function prev() {
    if (_index <= 0) return;
    _index--;
    _renderCardAnimated();
  }

  function _renderCardAnimated() {
    const inner = document.getElementById('learn-card-inner');
    if (!inner) { _renderCard(); return; }

    if (_flipped) {
      // Kaart staat omgedraaid: content wisselen halverwege de terugdraai-animatie
      // zodat de wissel onzichtbaar is (kaart staat op dat moment op zijn kant)
      inner.classList.remove('flipped');
      _flipped = false;
      setTimeout(() => _renderCard(), 190);
    } else {
      _renderCard();
    }
  }

  function exit() {
    UI.showScreen('home');
  }

  function _renderDots() {
    const container = document.getElementById('learn-dots');
    if (!container) return;
    // Max 20 dots, anders te druk
    if (_cards.length > 20) { container.innerHTML = ''; return; }
    container.innerHTML = _cards.map((_, i) =>
      `<span class="learn-dot${i === 0 ? ' active' : ''}"></span>`
    ).join('');
  }

  function _updateDots() {
    const dots = document.querySelectorAll('#learn-dots .learn-dot');
    dots.forEach((d, i) => {
      d.classList.remove('active', 'seen');
      if (i === _index) d.classList.add('active');
      else if (i < _index) d.classList.add('seen');
    });
  }

  return { init, start, next, prev, flip, exit };
})();

