export const Conjugation = (() => {
  const PERSONS = ['je','tu','il/elle','nous','vous','ils/elles'];

  const ENDINGS = {
    '-er': { 'je':'e','tu':'es','il/elle':'e','nous':'ons','vous':'ez','ils/elles':'ent' },
    '-ir': { 'je':'is','tu':'is','il/elle':'it','nous':'issons','vous':'issez','ils/elles':'issent' },
    '-re': { 'je':'s','tu':'s','il/elle':'','nous':'ons','vous':'ez','ils/elles':'ent' },
  };

  function conjugateRegular(infinitive, group, person) {
    const endings = ENDINGS[group];
    if (!endings) return null;
    const stem = infinitive.slice(0, -2);
    // -ger exception: nous mangeons
    if (group === '-er' && infinitive.endsWith('ger') && person === 'nous')
      return stem + 'e' + endings[person];
    // -cer exception: nous commençons
    if (group === '-er' && infinitive.endsWith('cer') && person === 'nous')
      return stem.slice(0,-1) + 'ç' + endings[person];
    return stem + endings[person];
  }

  function conjugate(verb, person, tense = 'présent') {
    const irr = Data.getIrregForm(verb.id, tense, person);
    if (irr) return irr;
    if (verb.verbType === 'irregular') return null;
    return conjugateRegular(verb.infinitive, verb.group, person);
  }

  const getRandomPerson = () => PERSONS[Math.floor(Math.random() * PERSONS.length)];
  const getHintLetters  = (answer, n = 1) => answer.slice(0, n) + '…';

  return { conjugate, getRandomPerson, PERSONS, getHintLetters };
})();


