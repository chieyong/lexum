import { supa } from './constants.js';
import * as XLSX from 'xlsx';

export const App = (() => {

  // ── Taalstatus ───────────────────────────────────────────────
  let _lang = localStorage.getItem('lexum_lang') || 'fr'; // 'fr' | 'en'

  function setLang(lang) {
    _lang = lang;
    localStorage.setItem('lexum_lang', lang);
    _applyLang();
    if (Auth.getProfile()) {
      // Sla taalvoorkeur op in Supabase
      try { supa.rpc('save_lang_preference', { p_lang: lang }); } catch(e) {}
      // Onthoud huidig scherm VOOR de async operatie
      const screenBefore = document.querySelector('.screen.active')?.id || '';
      _loadData().then(() => {
        // Controleer welk scherm actief was toen de switch begon
        if (screenBefore === 'screen-home' && Auth.isParent()) {
          Dashboard.load();
        } else if (screenBefore === 'screen-setup') {
          UI.renderFilters(Session.getMode());
          _applyLang();
        } else {
          UI.updateHomeStats();
        }
      });
    } else {
      // Demo: laad voorbeelddata voor deze taal
      if (lang === 'en') Data.loadEnglishDemoData();
      else               Data.loadDemoData();
      UI.updateHomeStats();
    }
  }

  function getLang() { return _lang; }

  // Stelt taal in zonder data opnieuw te laden (voor gebruik bij login)
  function setLangSilent(lang) {
    _lang = lang;
    localStorage.setItem('lexum_lang', lang);
    _applyLang();
  }

  function _applyLang() {
    // Taalknopjes
    document.getElementById('lang-btn-fr')?.classList.toggle('active', _lang === 'fr');
    document.getElementById('lang-btn-en')?.classList.toggle('active', _lang === 'en');
    // Subtitle op mode-kaart
    const sub = document.getElementById('mode-words-subtitle');
    if (sub) sub.textContent = _lang === 'en' ? 'Nederlands → Engels' : 'Nederlands → Frans';
    // Vervoegen-kaart (Frans) ↔ Verleden tijd-kaart (Engels)
    const verbCard = document.querySelector('.mode-card.verbs:not(#mode-card-past)');
    const pastCard = document.getElementById('mode-card-past');
    if (verbCard) verbCard.style.display = _lang === 'en' ? 'none' : '';
    if (pastCard) pastCard.style.display = _lang === 'en' ? '' : 'none';
    // Richting-chips in leer-setup
    const target = _lang === 'en' ? 'EN' : 'FR';
    const c1 = document.getElementById('dir-chip-nl-fr');
    const c2 = document.getElementById('dir-chip-fr-nl');
    if (c1) c1.textContent = `NL → ${target}`;
    if (c2) c2.textContent = `${target} → NL`;
    // Greeting taal
    UI.updateGreeting(_lang);
    // Demo stats + voortgang opnieuw renderen met nieuwe taalcijfers
    if (!Auth.getProfile()) {
      UI.updateHomeStats();
      if (typeof ChildProgress !== 'undefined') ChildProgress.render();
    }
  }

  async function init() {
    UI.applyStoredTheme();
    UI.initTooltips();
    UI.showScreen('loading');
    try {
      const isOAuthReturn = window.location.hash.includes('access_token')
                         || window.location.search.includes('code=');

      if (isOAuthReturn) {
        // Terugkeer van Google OAuth → profiel bepalen en routen
        const { data: { session } } = await supa.auth.getSession();
        if (session?.user) {
          Auth._setUser(session.user);
          window.history.replaceState({}, '', window.location.pathname);
          await Auth.resolveAfterOAuth();
          return;
        }
      }

      // Geen OAuth redirect — check bestaande sessie
      const loggedIn = await Auth.boot();
      if (!loggedIn) {
        if (_lang === 'en') Data.loadEnglishDemoData();
        else                Data.loadDemoData();
        UI.showScreen('home');
        UI.updateHomeStats();
      }
    } catch(e) {
      console.error('init fout:', e);
      Data.loadDemoData();
      UI.showScreen('home');
      UI.updateHomeStats();
    }
    _applyLang();
  }

  async function _loadData(cfgOverride) {
    const cfg  = cfgOverride || Data.getConfig();
    const lang = getLang();
    // Kies juiste sheet op basis van actieve taal
    const useEn  = lang === 'en' && cfg?.sheetEn;
    const sheet  = useEn ? cfg.sheetEn   : cfg?.sheetWords;
    const tab    = useEn ? cfg.tabEn     : cfg?.tabWords;

    if (sheet) {
      try {
        const result = await Data.loadFromSheet(sheet, tab || 'Woorden');
        if (result.wordCount === 0 && result.verbCount === 0) throw new Error('Geen data');
        UI.hideSheetError();
      } catch(e) {
        _loadFallbackDemo();
        UI.showSheetError();
      }
    } else {
      _loadFallbackDemo();
    }
  }

  function _loadFallbackDemo() {
    if (_lang === 'en') Data.loadEnglishDemoData();
    else                Data.loadDemoData();
  }

  function selectModeWithChapter(mode, chapter) {
    // Shortcut: start direct een sessie voor een specifiek hoofdstuk
    if (Data.getWords().length === 0 && Data.getVerbs().length === 0) Data.loadDemoData();
    Session.setMode(mode);
    Session.setLength(10);
    Session.setFilters({ categories: [chapter], themes: [], verbGroups: [] });
    const count = Session.buildDeck();
    if (count === 0) { alert('Geen kaarten gevonden voor dit hoofdstuk.'); return; }
    UI.showScreen('session');
    showCurrentCard();
  }

  function selectMode(mode) {
    // Vangnet: als data leeg is, laad demodata
    if (Data.getWords().length === 0 && Data.getVerbs().length === 0) {
      if (_lang === 'en') Data.loadEnglishDemoData();
      else Data.loadDemoData();
    }
    if (mode === 'learn') {
      Learn.init();
      UI.showScreen('learn-setup');
      return;
    }
    Session.setMode(mode);
    const titles = { words: 'Oefenen', verbs: 'Vervoegen', mixed: 'Alles gemengd', past: 'Verleden tijd' };
    document.getElementById('setup-title').textContent = titles[mode] || 'Oefenen';
    UI.renderFilters(mode);
    UI.showScreen('setup');
  }

  function startSession() {
    const accordion = UI.getAccordionSelection('chapter-accordion');
    const cats      = accordion.categories;
    const themes    = accordion.themes;
    const verbGrps  = UI.getSelectedChips('verb-group-chips');
    const lenChip   = document.querySelector('#session-length-chips .len-chip.selected');
    const len       = lenChip ? parseInt(lenChip.dataset.value) : 5;

    Session.setLength(len);
    Session.setFilters({ categories: cats, themes: themes, verbGroups: verbGrps });

    const count = Session.buildDeck();
    const emptyEl = document.getElementById('setup-empty');
    if (count === 0) { emptyEl.style.display = ''; return; }
    emptyEl.style.display = 'none';

    UI.showScreen('session');
    _showCurrentCard();
  }

  function _showCurrentCard() {
    const card = Session.getCurrentCard();
    if (!card) return;
    UI.renderCard(card);
    UI.updateProgress(Session.getProgress());
  }

  function checkAnswer() {
    const input = document.getElementById('card-input');
    if (!input.value.trim()) { input.focus(); return; }
    const result = Session.checkAnswer(input.value);
    const card   = Session.getCurrentCard();
    UI.showFeedback(result, card);
  }

  // Zelfbeoordeling: gebruiker klikt Goed / Bijna Goed / Fout
  function rateAnswer(rating) {
    Session.recordResult(rating);
    if (rating === 'good') {
      const flash = document.getElementById('correct-flash');
      flash.classList.remove('pop');
      void flash.offsetWidth;
      flash.classList.add('pop');
      setTimeout(_advance, 520);
    } else {
      _advance();
    }
  }

  function advance() { _advance(); }

  function _advance() {
    try {
      if (Session.nextCard()) {
        _showCurrentCard();
      } else {
        const summary = Session.getSummary();
        UI.renderSummary(summary);
        UI.showScreen('summary');
        UI.updateHomeStats();
      }
    } catch(e) {
      console.error('Advance fout:', e);
      // Vangnet: ga altijd naar summary als er iets misgaat
      try {
        const summary = Session.getSummary();
        UI.renderSummary(summary);
        UI.showScreen('summary');
      } catch(_) {
        UI.showScreen('home');
      }
    }
  }

  function showHint() {
    const card    = Session.getCurrentCard();
    if (!card) return;
    const bubble  = document.getElementById('hint-bubble');
    const hintBtn = document.getElementById('btn-hint');
    bubble.textContent = `Begint met: ${card._hint}`;
    bubble.classList.add('visible');
    hintBtn.style.display = 'none';
  }

  function endSession() {
    UI.showScreen('home');
    UI.updateHomeStats();
  }

  function extractSheetId(input) {
    const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : input.trim();
  }

  async function saveConfig() {
    const rawUrl   = document.getElementById('cfg-sheet-words').value.trim();
    const tabWords = document.getElementById('cfg-tab-words').value.trim() || 'Woorden';
    const rawUrlEn = document.getElementById('cfg-sheet-en')?.value.trim() || '';
    const tabEn    = document.getElementById('cfg-tab-en')?.value.trim() || 'Woorden';

    if (!rawUrl) { UI.setConfigStatus('Vul de Sheet URL in.', false); return; }

    const sheetId   = extractSheetId(rawUrl);
    const sheetIdEn = rawUrlEn ? extractSheetId(rawUrlEn) : '';
    UI.setConfigStatus('Laden…', true);
    try {
      // Laad actieve taal sheet
      const activeLang = getLang();
      let r;
      if (activeLang === 'en' && sheetIdEn) {
        r = await Data.loadFromSheet(sheetIdEn, tabEn);
      } else {
        r = await Data.loadFromSheet(sheetId, tabWords);
      }

      // Sla config op (beide talen)
      Data.saveConfig({ sheetWords: sheetId, tabWords, sheetEn: sheetIdEn, tabEn });

      // Sync naar Supabase
      if (Auth.isParent()) {
        try {
          await supa.rpc('save_sheet_config', {
            p_url:       sheetId,
            p_tab_words: tabWords,
            p_tab_verbs: tabWords,
            p_url_en:    sheetIdEn || null,
            p_tab_en:    tabEn     || null,
          });
        } catch(e) { console.warn('Supabase sync mislukt:', e); }
      }

      UI.setConfigStatus(`✓ Geladen: ${r.wordCount} woorden, ${r.verbCount} werkwoorden`, true);
      UI.hideSheetError();
      setTimeout(() => { UI.hideConfig(); UI.updateHomeStats(); }, 1400);
    } catch(e) {
      UI.setConfigStatus(`Fout: ${e.message}`, false);
    }
  }

  function loadDemo() {
    const r = Data.loadDemoData();
    Data.saveConfig(null);
    UI.setConfigStatus(`✓ Demodata: ${r.wordCount} woorden, ${r.verbCount} werkwoorden`, true);
    setTimeout(() => { UI.hideConfig(); UI.updateHomeStats(); }, 1200);
  }

  function downloadTemplate() {
    const wb = XLSX.utils.book_new();

    // ── Tab 1: Woorden (woorden én werkwoorden) ──
    const rows = [
      ['id','nl','fr','article','category','theme','emoji','example','type','group','verb_type','active'],
      // Woorden (type leeg of 'word')
      ['FR001','school',"l'école","l'",'1 - School','A','🏫',"Je vais à l'école.",'','','','TRUE'],
      ['FR002','leraar','le professeur','le','1 - School','A','👨‍🏫','Le professeur explique.','','','','TRUE'],
      ['FR003','schrift','un cahier','un','1 - School','A','📓',"J'écris dans mon cahier.",'','','','TRUE'],
      ['FR004','potlood','un crayon','un','1 - School','A','✏️','Prête-moi ton crayon.','','','','TRUE'],
      ['FR005','boek','un livre','un','1 - School','B','📖',"J'ouvre mon livre.",'','','','TRUE'],
      ['FR006','huiswerk','les devoirs','les','1 - School','B','📝','Je fais mes devoirs.','','','','TRUE'],
      ['FR007','toets','le contrôle','le','1 - School','B','📋',"J'ai un contrôle demain.",'','','','TRUE'],
      ['FR008','appel','une pomme','une','2 - Boodschappen','A','🍎','Je mange une pomme.','','','','TRUE'],
      ['FR009','brood','du pain','du','2 - Boodschappen','A','🍞',"J'achète du pain.",'','','','TRUE'],
      ['FR010','melk','du lait','du','2 - Boodschappen','A','🥛','Je bois du lait.','','','','TRUE'],
      // Werkwoorden (type = 'verb', fr = infinitief, group en verb_type verplicht)
      ['V001','praten/spreken','parler','','1 - School','A','💬','Je parle français.','verb','-er','regular','TRUE'],
      ['V002','luisteren','écouter','','1 - School','A','🎧',"J'écoute le prof.",'verb','-er','regular','TRUE'],
      ['V003','schrijven','écrire','','1 - School','B','✍️',"J'écris une lettre.",'verb','irregular','irregular','TRUE'],
      ['V004','lezen','lire','','1 - School','B','📖','Il lit un livre.','verb','irregular','irregular','TRUE'],
      ['V005','zijn','être','','1 - School','A','🌟','Je suis élève.','verb','irregular','irregular','TRUE'],
      ['V006','hebben','avoir','','1 - School','A','🤲',"J'ai un cahier.",'verb','irregular','irregular','TRUE'],
      ['V007','eten','manger','','2 - Boodschappen','A','🍽️','Je mange une pomme.','verb','-er','regular','TRUE'],
      ['V008','kopen','acheter','','2 - Boodschappen','A','🛒',"J'achète du pain.",'verb','-er','regular','TRUE'],
      ['V009','gaan','aller','','2 - Boodschappen','A','🚶','Je vais au marché.','verb','irregular','irregular','TRUE'],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(rows);
    ws1['!cols'] = [8,20,20,9,18,8,7,36,6,10,12,8].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws1, 'Woorden');

    // ── Tab 2: Instructies ──
    const info = [
      ['LEXUM — Template instructies'],
      [''],
      ['Eén tab voor zowel woorden als werkwoorden.'],
      ['Onderscheid via de kolom "type": leeg of "word" = woordje, "verb" = werkwoord.'],
      [''],
      ['Kolommen'],
      ['id          Uniek ID, bv. FR001 of V001'],
      ['nl          Het Nederlandse woord of de Nederlandse betekenis'],
      ['fr          Het Franse woord (voor werkwoorden: de infinitief)'],
      ["article     Lidwoord: un / une / du / de la / l'  (leeg bij werkwoorden)"],
      ["category    Hoofdstuk, bv. '1 - School'"],
      ['theme       Paragraaf: A, B, C, D ...'],
      ['emoji       Optioneel: één emoji als geheugensteun'],
      ['example     Een voorbeeldzin in het Frans (optioneel bij werkwoorden)'],
      ['type        Leeg of "word" voor woordjes — "verb" voor werkwoorden'],
      ['group       Alleen bij werkwoorden: -er / -ir / -re / irregular'],
      ['verb_type   Alleen bij werkwoorden: regular of irregular'],
      ['active      TRUE = actief, FALSE = overgeslagen'],
      [''],
      ['Google Sheets delen'],
      ['1. Klik rechtsboven op "Delen"'],
      ['2. Klik op "Link wijzigen"'],
      ['3. Kies: Iedereen met de link → Lezer'],
      ['4. Kopieer de volledige URL en plak in de app'],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(info);
    ws2['!cols'] = [{ wch: 65 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Instructies');

    // ── Tab 3: Engels ──
    const rowsEn = [
      ['id','nl','en','category','theme','emoji','example','type','past_simple','active'],
      // Woordjes (type leeg of 'word')
      ['EN001','school','school','1 - School','A','🏫','I go to school every day.','','','TRUE'],
      ['EN002','leraar','teacher','1 - School','A','👨‍🏫','The teacher explains.','','','TRUE'],
      ['EN003','schrift','notebook','1 - School','A','📓','I write in my notebook.','','','TRUE'],
      ['EN004','potlood','pencil','1 - School','A','✏️','Can I borrow your pencil?','','','TRUE'],
      ['EN005','boek','book','1 - School','B','📖','I open my book.','','','TRUE'],
      ['EN006','huiswerk','homework','1 - School','B','📝','I do my homework.','','','TRUE'],
      ['EN007','toets','test','1 - School','B','📋','I have a test tomorrow.','','','TRUE'],
      ['EN008','appel','apple','2 - Boodschappen','A','🍎','I eat an apple.','','','TRUE'],
      ['EN009','brood','bread','2 - Boodschappen','A','🍞','I buy some bread.','','','TRUE'],
      ['EN010','melk','milk','2 - Boodschappen','A','🥛','I drink milk.','','','TRUE'],
      // Onregelmatige werkwoorden (type = 'irregular_verb', en = infinitief, past_simple = verleden tijd)
      ['EV001','gaan','go','1 - School','A','🚶','I went to school.','irregular_verb','went','TRUE'],
      ['EV002','komen','come','1 - School','A','🏃','She came to class.','irregular_verb','came','TRUE'],
      ['EV003','schrijven','write','1 - School','B','✍️','He wrote the answer.','irregular_verb','wrote','TRUE'],
      ['EV004','lezen','read','1 - School','B','📖','I read the book.','irregular_verb','read','TRUE'],
      ['EV005','kopen','buy','2 - Boodschappen','A','🛒','I bought some bread.','irregular_verb','bought','TRUE'],
      ['EV006','eten','eat','2 - Boodschappen','A','🍽️','We ate an apple.','irregular_verb','ate','TRUE'],
      ['EV007','drinken','drink','2 - Boodschappen','A','🥛','I drank some milk.','irregular_verb','drank','TRUE'],
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(rowsEn);
    ws3['!cols'] = [8,20,20,18,8,7,36,15,12,8].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws3, 'Engels');

    // ── Tab 4: Instructies Engels ──
    const infoEn = [
      ['LEXUM — Template instructies (Engels)'],
      [''],
      ['Kolommen'],
      ['id            Uniek ID, bv. EN001 (woordjes) of EV001 (werkwoorden)'],
      ['nl            Het Nederlandse woord'],
      ['en            Het Engelse woord of infinitief (bv. go, eat, write)'],
      ['category      Hoofdstuk, bv. "1 - School"'],
      ['theme         Paragraaf: A, B, C, D ...'],
      ['emoji         Optioneel: één emoji als geheugensteun'],
      ['example       Een voorbeeldzin in het Engels (optioneel)'],
      ['type          Leeg of "word" voor woordjes — "irregular_verb" voor onregelmatige werkwoorden'],
      ['past_simple   Alleen bij irregular_verb: de verleden tijd (bv. went, ate, wrote)'],
      ['active        TRUE = actief, FALSE = overgeslagen'],
      [''],
      ['Oefenmodi bij Engels:'],
      ['- Vertalen: Nederlands → Engels (woordjes)'],
      ['- Verleden tijd: infinitief → past simple (onregelmatige werkwoorden)'],
      [''],
      ['Let op: lidwoorden (article) zijn niet van toepassing bij Engels.'],
      [''],
      ['Google Sheets delen'],
      ['1. Klik rechtsboven op "Delen"'],
      ['2. Klik op "Link wijzigen"'],
      ['3. Kies: Iedereen met de link → Lezer'],
      ['4. Kopieer de URL en plak in de app onder 🇬🇧 Engels'],
    ];
    const ws4 = XLSX.utils.aoa_to_sheet(infoEn);
    ws4['!cols'] = [{ wch: 72 }];
    XLSX.utils.book_append_sheet(wb, ws4, 'Instructies Engels');

    XLSX.writeFile(wb, 'lexum-template.xlsx');
  }

  function handleAvatarUpload(key, input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      saveAvatar(key, dataUrl);
      const preview = document.getElementById(`preview-${key}`);
      if (preview) preview.innerHTML = `<img src="${dataUrl}" alt="">`;
    };
    reader.readAsDataURL(file);
  }

  // ── Kind toevoegen ────────────────────────────────────
  async function addChild() {
    const name  = document.getElementById('child-name-input').value.trim();
    const email = document.getElementById('child-email-input').value.trim().toLowerCase();
    if (!name || !email) {
      UI.setAddChildStatus('Vul naam én e-mailadres in.', false);
      return;
    }
    UI.setAddChildStatus('Opslaan…', true);
    try {
      const { error } = await supa.rpc('create_child', { p_email: email, p_name: name });
      if (error) throw error;
      UI.setAddChildStatus(`✓ ${name} toegevoegd! Zodra ${name} inlogt met ${email}, wordt het account automatisch gekoppeld.`, true);
      setTimeout(() => UI.hideAddChild(), 3000);
    } catch(e) {
      UI.setAddChildStatus(`Fout: ${e.message}`, false);
    }
  }

  return { init, selectMode, selectModeWithChapter, startSession, checkAnswer, rateAnswer, showHint, advance, endSession, saveConfig, loadDemo, downloadTemplate, addChild, loadData: _loadData, reload: _loadData, setLang, getLang, setLangSilent };
})();


