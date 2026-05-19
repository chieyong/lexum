export const Session = (() => {
  function stripOptional(word) {
    // "fort(e)" → "fort", "interessant(e)" → "interessant"
    return word.replace(/\([^)]*\)/g, '').trim();
  }
  function optionalVariants(word) {
    // Returns array of accepted variants, handling:
    // - optional suffix: "fort(e)" → "fort", "forte"
    // - slash variants: "nul/nulle" → "nul", "nulle"
    const variants = new Set();
    // First split on / to get base forms
    const slashParts = word.split('/').map(s => s.trim()).filter(Boolean);
    slashParts.forEach(part => {
      variants.add(part);
      variants.add(stripOptional(part));
      // expand optional suffix: "fort(e)" → "forte"
      const expanded = part.replace(/\(([^)]*)\)/g, '$1').trim();
      variants.add(expanded);
    });
    return [...variants].filter(Boolean);
  }

  function stripArticle(fr, article) {
    if (!fr || !article) return fr;
    const art = article.toLowerCase().trim();
    // l' plakt direct aan woord (geen spatie)
    if (art === "l'" && fr.toLowerCase().startsWith("l'")) return fr.slice(2);
    const prefix = art + ' ';
    if (fr.toLowerCase().startsWith(prefix)) return fr.slice(prefix.length);
    return fr;
  }
  let mode = 'words';
  let cards = [];
  let index = 0;
  let results = [];
  let length = 5;
  let filters = { categories: [], themes: [], verbGroups: [] };

  const setMode    = (m) => { mode = m; };
  const getMode    = ()  => mode;
  const setLength  = (n) => { length = n; };
  const setFilters = (f) => { filters = f; };

  function buildDeck() {
    let pool = [];

    if (mode === 'words' || mode === 'mixed') {
      // Gewone woorden
      let w = Data.getWords();
      if (filters.categories.length) w = w.filter(x => filters.categories.includes(x.category));
      if (filters.themes.length)     w = w.filter(x => filters.themes.includes(x.theme));
      pool = pool.concat(w.map(word => ({
        ...word,
        _srsId:           word.id,
        _type:            'word',
        _prompt:          word.nl,
        _answer:          stripArticle(word.fr, word.article),
        _answerBase:      stripArticle(word.fr, word.article),
        _answerWithArt:   word.article ? `${word.article} ${stripArticle(word.fr, word.article)}` : null,
        _person:          null,
        _example:         word.example,
        _hint:            (word.article ? `${word.article} ` : '') + stripArticle(word.fr, word.article)[0] + '…',
      })));

      // Werkwoorden als gewone vertaalkaart (infinitief NL→FR)
      let vw = Data.getVerbs();
      if (filters.categories.length) vw = vw.filter(x => filters.categories.includes(x.category));
      pool = pool.concat(vw.map(verb => ({
        ...verb,
        _srsId:      `${verb.id}_inf`,
        _type:       'word',
        _prompt:     verb.nl,
        _answer:     verb.infinitive,
        _answerBase: verb.infinitive,
        _person:     null,
        _example:    '',
        _hint:       verb.infinitive[0] + '…',
      })));
    }

    if (mode === 'verbs' || mode === 'mixed') {
      let v = Data.getVerbs();
      if (filters.verbGroups.length) v = v.filter(x => filters.verbGroups.includes(x.group));
      v.forEach(verb => {
        const person = Conjugation.getRandomPerson();
        const form   = Conjugation.conjugate(verb, person);
        if (form) {
          pool.push({
            ...verb,
            _srsId:      `${verb.id}_${person}`,
            _type:       'verb',
            _prompt:     verb.infinitive,
            _promptNl:   verb.nl,
            _answer:     form,
            _answerBase: form,
            emoji:       verb.emoji || '',
            _person:     person,
            _example:    `${capitalize(person)} ${form}.`,
            _hint:       form[0] + '…',
          });
        }
      });
    }

    if (mode === 'past') {
      // Engelse onregelmatige verleden tijd
      let v = Data.getVerbs().filter(x => x.type === 'irregular_verb' && x.past);
      if (filters.categories.length) v = v.filter(x => filters.categories.includes(x.category));
      pool = pool.concat(v.map(verb => ({
        ...verb,
        _srsId:      `${verb.id}_past`,
        _type:       'past',
        _prompt:     verb.infinitive,
        _promptNl:   verb.nl,
        _answer:     verb.past,
        _answerBase: verb.past,
        emoji:       verb.emoji || '',
        _example:    verb.example || '',
        _hint:       verb.past[0] + '…',
      })));
    }

    // SRS sort, then shuffle within groups
    pool = SRS.sortByPriority(pool);
    const now = Date.now();
    const due    = pool.filter(c => SRS.getCard(c._srsId).nextDue <= now);
    const notDue = pool.filter(c => SRS.getCard(c._srsId).nextDue  > now);
    shuffle(due); shuffle(notDue);
    pool = [...due, ...notDue];

    cards = pool.slice(0, length);
    index = 0;
    results = [];
    return cards.length;
  }

  const getCurrentCard = () => cards[index] || null;

  function checkAnswer(input) {
    const card = getCurrentCard();
    if (!card) return null;
    const norm = s => s.toLowerCase().trim()
      .replace(/['']/g, "'")
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const u = norm(input);
    // Collect all accepted answers incl. optional-suffix variants
    const accepted = new Set();
    [card._answer, card._answerBase, card._answerWithArt].filter(Boolean).forEach(ans => {
      optionalVariants(ans).forEach(v => accepted.add(norm(v)));
    });
    const acceptedArr = [...accepted];
    const isCorrect = acceptedArr.some(a => u === a);
    const isClose   = !isCorrect && acceptedArr.some(a => lev(u, a) <= 1);
    return { isCorrect, isClose, correctAnswer: card._answer, userAnswer: input };
  }

  function recordResult(rating) {
    const card = getCurrentCard();
    if (!card) return;
    SRS.updateCard(card._srsId, rating);
    results.push({ card, rating });
  }

  const nextCard    = () => { index++; return index < cards.length; };
  const getProgress = () => ({ current: index + 1, total: cards.length, pct: (index / cards.length) * 100 });

  function getSummary() {
    const good  = results.filter(r => r.rating === 'good').length;
    const doubt = results.filter(r => r.rating === 'doubt').length;
    const bad   = results.filter(r => r.rating === 'bad').length;
    const difficult = results
      .filter(r => r.rating !== 'good')
      .map(r => ({ prompt: r.card._prompt, person: r.card._person, answer: r.card._answer }));
    const pct = results.length ? good / results.length : 0;
    let avatar = 'meh', title = 'Goed bezig!', sub = 'Elke sessie telt mee!';
    if (pct >= 0.9)       { avatar = 'great'; title = 'Fantastisch!';   sub = 'Je kent deze woordjes super goed!'; }
    else if (pct >= 0.7)  { avatar = 'great'; title = 'Goed gedaan!';   sub = 'Mooie vooruitgang!'; }
    else if (pct < 0.4)   { avatar = 'bad';   title = 'Blijf oefenen!'; sub = 'Herhaling is het geheim van talen leren.'; }
    return { good, doubt, bad, difficult, avatar, title, sub };
  }

  // Helpers
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function lev(a, b) {
    const dp = Array.from({length: a.length+1}, (_, i) => [i]);
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+(a[i-1]!==b[j-1]?1:0));
    return dp[a.length][b.length];
  }

  return {
    setMode, getMode, setLength, setFilters, buildDeck,
    getCurrentCard, checkAnswer, recordResult, nextCard,
    getProgress, getSummary,
  };
})();


