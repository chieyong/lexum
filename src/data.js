export const Data = (() => {
  let words = [];
  let verbs = [];
  let irregForms = {};

  // ── CSV parser (RFC 4180 compliant) ──────────────────────────
  function parseCSVLine(line) {
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ',') { out.push(cur); cur = ''; }
        else cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
    return lines.slice(1)
      .filter(l => l.trim())
      .map(l => {
        const vals = parseCSVLine(l);
        const obj = {};
        headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
        return obj;
      });
  }

  // ── Google Sheets fetch ───────────────────────────────────────
  async function fetchTab(sheetId, tabName) {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Kan tab "${tabName}" niet laden (${res.status})`);
    return parseCSV(await res.text());
  }

  async function loadFromSheet(sheetWords, tabWords) {
    words = []; verbs = []; irregForms = {};
    let wc = 0, vc = 0;

    if (sheetWords) {
      try {
        const raw = await fetchTab(sheetWords, tabWords);
        const active = raw.filter(r => (r.active || '').toUpperCase() !== 'FALSE');
        active.forEach(r => {
          const typeVal = (r.type || '').toLowerCase();
          const isVerb        = typeVal === 'verb';
          const isIrregVerb   = typeVal === 'irregular_verb';
          if (isVerb || isIrregVerb) {
            verbs.push({
              id:         r.id || '',
              infinitive: r.fr || r.en || '',   // ondersteuning fr én en kolom
              past:       r.past_simple || r.past || '',
              nl:         r.nl || '',
              group:      r.group || '-er',
              verbType:   r.verb_type || 'regular',
              category:   r.category || '',
              theme:      r.theme || '',
              emoji:      r.emoji || '',
              example:    r.example || '',
              type:       isIrregVerb ? 'irregular_verb' : 'verb',
            });
            vc++;
          } else {
            words.push({
              id:       r.id || '',
              fr:       r.fr || r.en || '',    // ondersteuning fr én en kolom
              nl:       r.nl || '',
              category: r.category || '',
              theme:    r.theme || '',
              article:  r.article || '',
              emoji:    r.emoji || '',
              example:  r.example || '',
              type:     'word',
            });
            wc++;
          }
        });
      } catch(e) { console.warn('Laden mislukt:', e); }
    }

    return { wordCount: wc, verbCount: vc };
  }

  // ── Demo data ─────────────────────────────────────────────────
  function loadDemoData() {
    words = [
      { id:'FR001', fr:'école',       nl:'school',         category:'1 - School',       theme:'A', article:"l'",  emoji:'🏫', example:"Je vais à l'école.",          type:'word' },
      { id:'FR002', fr:'professeur',  nl:'leraar',          category:'1 - School',       theme:'A', article:'le',  emoji:'👨‍🏫', example:"Le professeur explique.",      type:'word' },
      { id:'FR003', fr:'cahier',      nl:'schrift',         category:'1 - School',       theme:'A', article:'un',  emoji:'📓', example:"J'écris dans mon cahier.",     type:'word' },
      { id:'FR004', fr:'crayon',      nl:'potlood',         category:'1 - School',       theme:'A', article:'un',  emoji:'✏️', example:"Prête-moi ton crayon.",        type:'word' },
      { id:'FR005', fr:'livre',       nl:'boek',            category:'1 - School',       theme:'B', article:'un',  emoji:'📖', example:"J'ouvre mon livre.",           type:'word' },
      { id:'FR006', fr:'devoirs',     nl:'huiswerk',        category:'1 - School',       theme:'B', article:'les', emoji:'📝', example:"Je fais mes devoirs.",         type:'word' },
      { id:'FR007', fr:'classe',      nl:'klas',            category:'1 - School',       theme:'B', article:'la',  emoji:'🎒', example:"Ma classe est sympa.",         type:'word' },
      { id:'FR008', fr:'stylo',       nl:'pen',             category:'1 - School',       theme:'C', article:'un',  emoji:'🖊️', example:"Donne-moi ton stylo.",         type:'word' },
      { id:'FR009', fr:'tableau',     nl:'bord',            category:'1 - School',       theme:'C', article:'le',  emoji:'🖥️', example:"Regarde le tableau.",          type:'word' },
      { id:'FR010', fr:'pomme',       nl:'appel',           category:'2 - Boodschappen', theme:'A', article:'une', emoji:'🍎', example:"Je mange une pomme.",          type:'word' },
      { id:'FR011', fr:'banane',      nl:'banaan',          category:'2 - Boodschappen', theme:'A', article:'une', emoji:'🍌', example:"J'aime les bananes.",          type:'word' },
      { id:'FR012', fr:'carotte',     nl:'wortel',          category:'2 - Boodschappen', theme:'A', article:'une', emoji:'🥕', example:"Mange ta carotte!",            type:'word' },
      { id:'FR013', fr:'pain',        nl:'brood',           category:'2 - Boodschappen', theme:'B', article:'du',  emoji:'🍞', example:"J'achète du pain.",            type:'word' },
      { id:'FR014', fr:'lait',        nl:'melk',            category:'2 - Boodschappen', theme:'B', article:'du',  emoji:'🥛', example:"Je bois du lait.",             type:'word' },
      { id:'FR015', fr:'fromage',     nl:'kaas',            category:'2 - Boodschappen', theme:'B', article:'du',  emoji:'🧀', example:"Le fromage est délicieux.",    type:'word' },
      { id:'FR016', fr:'eau',         nl:'water',           category:'2 - Boodschappen', theme:'C', article:"l'",  emoji:'💧', example:"L'eau est froide.",            type:'word' },
      { id:'FR017', fr:'jus',         nl:'sap',             category:'2 - Boodschappen', theme:'C', article:'du',  emoji:'🧃', example:"Un jus d'orange.",             type:'word' },
      { id:'FR018', fr:'vélo',        nl:'fiets',           category:'3 - Vrije tijd',   theme:'A', article:'le',  emoji:'🚲', example:"Je fais du vélo.",             type:'word' },
      { id:'FR019', fr:'musique',     nl:'muziek',          category:'3 - Vrije tijd',   theme:'A', article:'la',  emoji:'🎵', example:"J'écoute de la musique.",      type:'word' },
      { id:'FR020', fr:'film',        nl:'film',            category:'3 - Vrije tijd',   theme:'A', article:'un',  emoji:'🎬', example:"On regarde un film.",          type:'word' },
      { id:'FR021', fr:'sport',       nl:'sport',           category:'3 - Vrije tijd',   theme:'B', article:'le',  emoji:'⚽', example:"J'aime le sport.",             type:'word' },
      { id:'FR022', fr:'vacances',    nl:'vakantie',        category:'3 - Vrije tijd',   theme:'B', article:'les', emoji:'🏖️', example:"Bonnes vacances!",             type:'word' },
    ];

    verbs = [
      { id:'V001', infinitive:'parler',   nl:'praten/spreken', group:'-er',       verbType:'regular',   category:'1 - School',       emoji:'💬', type:'verb' },
      { id:'V002', infinitive:'écouter',  nl:'luisteren',      group:'-er',       verbType:'regular',   category:'1 - School',       emoji:'🎧', type:'verb' },
      { id:'V003', infinitive:'écrire',   nl:'schrijven',      group:'irregular', verbType:'irregular', category:'1 - School',       emoji:'✍️', type:'verb' },
      { id:'V004', infinitive:'lire',     nl:'lezen',          group:'irregular', verbType:'irregular', category:'1 - School',       emoji:'📖', type:'verb' },
      { id:'V005', infinitive:'être',     nl:'zijn',           group:'irregular', verbType:'irregular', category:'1 - School',       emoji:'🌟', type:'verb' },
      { id:'V006', infinitive:'avoir',    nl:'hebben',         group:'irregular', verbType:'irregular', category:'1 - School',       emoji:'🤲', type:'verb' },
      { id:'V007', infinitive:'manger',   nl:'eten',           group:'-er',       verbType:'regular',   category:'2 - Boodschappen', emoji:'🍽️', type:'verb' },
      { id:'V008', infinitive:'acheter',  nl:'kopen',          group:'-er',       verbType:'regular',   category:'2 - Boodschappen', emoji:'🛒', type:'verb' },
      { id:'V009', infinitive:'faire',    nl:'doen/maken',     group:'irregular', verbType:'irregular', category:'2 - Boodschappen', emoji:'🛠️', type:'verb' },
      { id:'V010', infinitive:'aller',    nl:'gaan',           group:'irregular', verbType:'irregular', category:'3 - Vrije tijd',   emoji:'🚶', type:'verb' },
      { id:'V011', infinitive:'jouer',    nl:'spelen',         group:'-er',       verbType:'regular',   category:'3 - Vrije tijd',   emoji:'🎮', type:'verb' },
      { id:'V012', infinitive:'regarder', nl:'kijken',         group:'-er',       verbType:'regular',   category:'3 - Vrije tijd',   emoji:'👀', type:'verb' },
    ];

    irregForms = {
      // être (V005)
      'V005_présent_je':'suis',    'V005_présent_tu':'es',      'V005_présent_il/elle':'est',
      'V005_présent_nous':'sommes','V005_présent_vous':'êtes',  'V005_présent_ils/elles':'sont',
      // avoir (V006)
      'V006_présent_je':'ai',      'V006_présent_tu':'as',      'V006_présent_il/elle':'a',
      'V006_présent_nous':'avons', 'V006_présent_vous':'avez',  'V006_présent_ils/elles':'ont',
      // faire (V009)
      'V009_présent_je':'fais',    'V009_présent_tu':'fais',    'V009_présent_il/elle':'fait',
      'V009_présent_nous':'faisons','V009_présent_vous':'faites','V009_présent_ils/elles':'font',
      // aller (V010)
      'V010_présent_je':'vais',    'V010_présent_tu':'vas',     'V010_présent_il/elle':'va',
      'V010_présent_nous':'allons','V010_présent_vous':'allez', 'V010_présent_ils/elles':'vont',
      // écrire (V003)
      'V003_présent_je':'écris',   'V003_présent_tu':'écris',   'V003_présent_il/elle':'écrit',
      'V003_présent_nous':'écrivons','V003_présent_vous':'écrivez','V003_présent_ils/elles':'écrivent',
      // lire (V004)
      'V004_présent_je':'lis',     'V004_présent_tu':'lis',     'V004_présent_il/elle':'lit',
      'V004_présent_nous':'lisons','V004_présent_vous':'lisez', 'V004_présent_ils/elles':'lisent',
    };

    return { wordCount: words.length, verbCount: verbs.length };
  }

  // ── English demo data ─────────────────────────────────────
  function loadEnglishDemoData() {
    // In Engels gebruiken we 'fr' veld voor het Engelse woord (zelfde data-structuur)
    words = [
      { id:'EN001', fr:'school',    nl:'school',   category:'1 - School',       theme:'A', article:'', emoji:'🏫', example:'I go to school every day.',      type:'word' },
      { id:'EN002', fr:'teacher',   nl:'leraar',   category:'1 - School',       theme:'A', article:'', emoji:'👨‍🏫', example:'The teacher explains.',           type:'word' },
      { id:'EN003', fr:'notebook',  nl:'schrift',  category:'1 - School',       theme:'A', article:'', emoji:'📓', example:'I write in my notebook.',         type:'word' },
      { id:'EN004', fr:'pencil',    nl:'potlood',  category:'1 - School',       theme:'A', article:'', emoji:'✏️', example:'Can I borrow your pencil?',       type:'word' },
      { id:'EN005', fr:'book',      nl:'boek',     category:'1 - School',       theme:'B', article:'', emoji:'📖', example:'I open my book.',                 type:'word' },
      { id:'EN006', fr:'homework',  nl:'huiswerk', category:'1 - School',       theme:'B', article:'', emoji:'📝', example:'I do my homework.',               type:'word' },
      { id:'EN007', fr:'classroom', nl:'klas',     category:'1 - School',       theme:'B', article:'', emoji:'🎒', example:'My classroom is nice.',           type:'word' },
      { id:'EN008', fr:'apple',     nl:'appel',    category:'2 - Boodschappen', theme:'A', article:'', emoji:'🍎', example:'I eat an apple.',                 type:'word' },
      { id:'EN009', fr:'bread',     nl:'brood',    category:'2 - Boodschappen', theme:'A', article:'', emoji:'🍞', example:'I buy bread.',                    type:'word' },
      { id:'EN010', fr:'milk',      nl:'melk',     category:'2 - Boodschappen', theme:'A', article:'', emoji:'🥛', example:'I drink milk.',                   type:'word' },
      { id:'EN011', fr:'bicycle',   nl:'fiets',    category:'3 - Vrije tijd',   theme:'A', article:'', emoji:'🚲', example:'I ride my bicycle.',              type:'word' },
      { id:'EN012', fr:'music',     nl:'muziek',   category:'3 - Vrije tijd',   theme:'A', article:'', emoji:'🎵', example:'I listen to music.',              type:'word' },
      { id:'EN013', fr:'sport',     nl:'sport',    category:'3 - Vrije tijd',   theme:'B', article:'', emoji:'⚽', example:'I love sport.',                   type:'word' },
    ];
    // Onregelmatige werkwoorden: fr = infinitief, past_simple = verleden tijd
    verbs = [
      { id:'EV001', infinitive:'go',    past:'went',   nl:'gaan',       category:'1 - School',       theme:'A', emoji:'🚶', example:'I went to school.',     type:'irregular_verb' },
      { id:'EV002', infinitive:'come',  past:'came',   nl:'komen',      category:'1 - School',       theme:'A', emoji:'🏃', example:'She came to class.',    type:'irregular_verb' },
      { id:'EV003', infinitive:'write', past:'wrote',  nl:'schrijven',  category:'1 - School',       theme:'B', emoji:'✍️', example:'He wrote the answer.',  type:'irregular_verb' },
      { id:'EV004', infinitive:'read',  past:'read',   nl:'lezen',      category:'1 - School',       theme:'B', emoji:'📖', example:'I read the book.',      type:'irregular_verb' },
      { id:'EV005', infinitive:'give',  past:'gave',   nl:'geven',      category:'1 - School',       theme:'B', emoji:'🤲', example:'She gave me a pen.',    type:'irregular_verb' },
      { id:'EV006', infinitive:'buy',   past:'bought', nl:'kopen',      category:'2 - Boodschappen', theme:'A', emoji:'🛒', example:'I bought some bread.',  type:'irregular_verb' },
      { id:'EV007', infinitive:'eat',   past:'ate',    nl:'eten',       category:'2 - Boodschappen', theme:'A', emoji:'🍽️', example:'We ate an apple.',      type:'irregular_verb' },
      { id:'EV008', infinitive:'drink', past:'drank',  nl:'drinken',    category:'2 - Boodschappen', theme:'A', emoji:'🥛', example:'I drank some milk.',    type:'irregular_verb' },
      { id:'EV009', infinitive:'ride',  past:'rode',   nl:'rijden',     category:'3 - Vrije tijd',   theme:'A', emoji:'🚲', example:'I rode my bicycle.',    type:'irregular_verb' },
      { id:'EV010', infinitive:'sing',  past:'sang',   nl:'zingen',     category:'3 - Vrije tijd',   theme:'A', emoji:'🎵', example:'She sang a song.',      type:'irregular_verb' },
      { id:'EV011', infinitive:'run',   past:'ran',    nl:'rennen',     category:'3 - Vrije tijd',   theme:'B', emoji:'🏃', example:'He ran very fast.',     type:'irregular_verb' },
      { id:'EV012', infinitive:'win',   past:'won',    nl:'winnen',     category:'3 - Vrije tijd',   theme:'B', emoji:'🏆', example:'We won the match.',     type:'irregular_verb' },
    ];
    irregForms = {};
    return { wordCount: words.length, verbCount: verbs.length };
  }

  // ── Getters ───────────────────────────────────────────────────
  const getWords       = () => words;
  const getVerbs       = () => verbs;
  const getIrregForm   = (id, tense, person) => irregForms[`${id}_${tense}_${person}`] || null;
  const getCategories  = () => [...new Set(words.map(w => w.category).filter(Boolean))];
  const getThemes      = () => [...new Set(words.map(w => w.theme).filter(Boolean))];
  const getParagraphs  = (chapters) => {
    const pool = chapters && chapters.length
      ? words.filter(w => chapters.includes(w.category))
      : words;
    return [...new Set(pool.map(w => w.theme).filter(Boolean))];
  };
  const getVerbGroups  = () => [...new Set(verbs.map(v => v.group).filter(Boolean))];

  // ── Config persistence ────────────────────────────────────────
  function getConfig() {
    try { return JSON.parse(localStorage.getItem('mesmots_config')); } catch { return null; }
  }
  function saveConfig(cfg) {
    if (cfg === null) localStorage.removeItem('mesmots_config');
    else localStorage.setItem('mesmots_config', JSON.stringify(cfg));
  }

  return {
    loadFromSheet, loadDemoData, loadEnglishDemoData,
    getWords, getVerbs, getIrregForm,
    getCategories, getThemes, getParagraphs, getVerbGroups,
    getConfig, saveConfig,
  };
})();


