import { supa } from './constants.js';

export const Auth = (() => {
  let _user    = null;  // Supabase auth user
  let _profile = null;  // rij uit public.users { id, email, name, role }

  function getUser()    { return _user; }
  function getProfile() { return _profile; }
  function isParent()   { return _profile?.role === 'parent'; }
  function isChild()    { return _profile?.role === 'child'; }

  // ── Inloggen via Google ─────────────────────────────────
  async function signIn() {
    await supa.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href.split('?')[0] }
    });
  }

  // ── Uitloggen ───────────────────────────────────────────
  async function signOut() {
    // Sluit menu, toon direct feedback
    UI.closeUserMenu();
    const pill = document.getElementById('user-pill-wrap');
    if (pill) { pill.style.opacity = '0.4'; pill.style.pointerEvents = 'none'; }

    await supa.auth.signOut();
    _user = _profile = null;

    // Reset header volledig
    _updateHeader();
    if (pill) { pill.style.opacity = ''; pill.style.pointerEvents = ''; }

    Data.loadDemoData();
    UI.showScreen('home');
    UI.updateHomeStats();
    UI.showToast('Je bent uitgelogd');
  }

  // ── Rol bevestigen (rolkeuze-scherm) ────────────────────
  async function confirmRole(role) {
    const errEl = document.getElementById('role-error');
    errEl.style.display = 'none';
    try {
      if (role === 'parent') {
        const { data, error } = await supa.rpc('register_as_parent');
        if (error) throw error;
        _profile = data;
        await _afterLogin();
      } else {
        // Kind maar email onbekend — toon melding
        document.getElementById('child-unknown-email').textContent = _user.email;
        UI.showScreen('child-unknown');
      }
    } catch(e) {
      errEl.textContent = e.message;
      errEl.style.display = '';
    }
  }

  // ── Boot: verwerk sessie bij laden pagina ───────────────
  async function boot() {
    const { data: { session } } = await supa.auth.getSession();
    if (!session?.user) return false;
    _user = session.user;
    window.history.replaceState({}, '', window.location.pathname);

    // Haal profiel op
    const { data: profile } = await supa.rpc('get_my_profile');
    if (profile) {
      _profile = profile;
      await _afterLogin();
      return true;
    }

    // Geen profiel gevonden bij bestaande sessie (bijv. oude sessie na DB reset)
    // → gewoon uitloggen en als gast verder
    await supa.auth.signOut();
    _user = null;
    return false;
  }

  // ── Resolve na expliciete login (OAuth redirect) ────────
  async function _resolveProfile() {
    const { data: profile } = await supa.rpc('get_my_profile');

    if (profile) {
      _profile = profile;
      await _afterLogin();
      return;
    }

    // Geen profiel → check of email bekend is als kind
    console.log('[resolveProfile] geen profiel, check is_known_child_email...');
    const { data: isKnownChild, error: knownErr } = await supa.rpc('is_known_child_email');
    console.log('[resolveProfile] is_known_child_email:', isKnownChild, 'error:', knownErr);

    if (isKnownChild) {
      const { data: childProfile, error: regErr } = await supa.rpc('register_as_child');
      console.log('[resolveProfile] register_as_child:', childProfile, 'error:', regErr);
      if (childProfile) {
        _profile = childProfile;
        await _afterLogin();
        return;
      }
      // register_as_child mislukt — toon fout ipv rolkeuze
      const greet = document.getElementById('role-greeting');
      if (greet) greet.textContent = `Fout bij aanmaken account: ${regErr?.message || 'onbekend'}. Probeer opnieuw.`;
      UI.showScreen('role');
      return;
    }

    // Echt onbekend → rolkeuze tonen
    const name = _user.user_metadata?.full_name?.split(' ')[0] || '';
    const greet = document.getElementById('role-greeting');
    if (greet) greet.textContent = name
      ? `Hoi ${name}! Je e-mailadres is nog niet bekend. Wie ben jij?`
      : 'Je e-mailadres is nog niet bekend. Wie ben jij?';
    UI.showScreen('role');
  }

  // ── Na succesvolle login: laad data en toon home ────────
  async function _afterLogin() {
    _updateHeader();
    // Herstel taalvoorkeur uit profiel (als opgeslagen)
    if (_profile?.lang && (_profile.lang === 'fr' || _profile.lang === 'en')) {
      App.setLangSilent(_profile.lang);
    }
    await SRS.loadFromSupabase();
    if (isParent()) {
      await App.loadData();
      await _syncSheetConfigToSupabase();
      Dashboard.load();
    } else {
      await _loadChildData();
    }
    UI.showScreen('home');
    UI.updateHomeStats();
  }

  // ── Sync sheet config van localStorage naar Supabase ──
  async function _syncSheetConfigToSupabase() {
    try {
      const cfg = Data.getConfig();
      if (!cfg?.sheetWords) return;

      // Altijd updaten zodat url_en ook gesynchroniseerd wordt
      const { error } = await supa.rpc('save_sheet_config', {
        p_url:       cfg.sheetWords,
        p_tab_words: cfg.tabWords  || 'Woorden',
        p_tab_verbs: cfg.tabWords  || 'Woorden',
        p_url_en:    cfg.sheetEn   || null,
        p_tab_en:    cfg.tabEn     || 'Woorden',
      });
      if (error) throw error;
      console.log('[Auth] sheet config gesynchroniseerd naar Supabase (incl. Engels)');
    } catch(e) {
      console.warn('[Auth] sync sheet config mislukt:', e);
    }
  }

  // ── Kind: haal sheet config op van de ouder ─────────────
  async function _loadChildData() {
    try {
      const { data: cfg } = await supa.rpc('get_parent_sheet_config');
      console.log('[Auth] parent sheet config:', cfg);
      if (cfg && cfg.sheet_url) {
        const lang = App.getLang();
        // Kies juiste sheet op basis van taal; val terug op Franse sheet als Engels ontbreekt
        const useEn = lang === 'en' && cfg.url_en;
        const sheet = useEn ? cfg.url_en   : cfg.sheet_url;
        const tab   = useEn ? cfg.tab_en   : cfg.tab_words;
        await Data.loadFromSheet(sheet, tab || 'Woorden');
        // Sla volledige config op zodat taalswitch later ook werkt
        Data.saveConfig({
          sheetWords: cfg.sheet_url,
          tabWords:   cfg.tab_words || 'Woorden',
          sheetEn:    cfg.url_en    || '',
          tabEn:      cfg.tab_en    || 'Woorden',
        });
        return;
      }
    } catch(e) { console.warn('Geen sheet config van ouder:', e); }
    // Fallback: demodata
    const lang = App.getLang();
    if (lang === 'en') Data.loadEnglishDemoData();
    else               Data.loadDemoData();
  }

  // ── Header bijwerken ────────────────────────────────────
  function _updateHeader() {
    const btnLogin  = document.getElementById('btn-login');
    // pill element (kept for reference, use user-pill-wrap for visibility)
    const nameEl    = document.getElementById('user-name');
    const initEl    = document.getElementById('user-initial');
    const menuName     = document.getElementById('menu-name');
    const menuEmail    = document.getElementById('menu-email');
    const menuRole     = document.getElementById('menu-role');
    const menuSettings = document.getElementById('menu-settings');
    const menuAddChild = document.getElementById('menu-add-child');
    const btnSettings  = document.getElementById('btn-settings');

    if (_profile) {
      btnLogin.style.display = 'none';
      const wrap = document.getElementById('user-pill-wrap');
      if (wrap) wrap.style.display = 'flex';
      if (btnSettings) btnSettings.style.display = 'none';

      const name = _profile.name || _profile.email || '?';
      nameEl.textContent = name.split(' ')[0];
      initEl.textContent = name.charAt(0).toUpperCase();

      if (menuName)     menuName.textContent  = name;
      if (menuEmail)    menuEmail.textContent  = _profile.email || '';
      if (menuRole)     menuRole.textContent   = isParent() ? 'Ouder' : 'Kind';
      if (menuSettings) menuSettings.style.display = isParent() ? '' : 'none';
      if (menuAddChild) menuAddChild.style.display  = isParent() ? '' : 'none';

      // Kinderen laden als ouder
      if (isParent()) _loadChildrenIntoMenu();

    } else {
      btnLogin.style.display = '';
      const wrap = document.getElementById('user-pill-wrap');
      if (wrap) wrap.style.display = 'none';
      if (btnSettings) btnSettings.style.display = 'none';
    }
  }

  async function _loadChildrenIntoMenu() {
    const section = document.getElementById('menu-children-section');
    const list    = document.getElementById('menu-children-list');
    if (!section || !list) return;

    try {
      const { data, error } = await supa.rpc('get_my_children');
      if (error || !data || data.length === 0) {
        section.style.display = 'none';
        return;
      }
      section.style.display = '';
      list.innerHTML = data.map(child => {
        const initial  = (child.name || child.child_name || '?').charAt(0).toUpperCase();
        const name     = child.name || child.child_name || 'Kind';
        const email    = child.email || child.child_email || '';
        const isActive = !!child.user_id;
        return `
          <div class="menu-child-row">
            <div class="menu-child-avatar">${initial}</div>
            <div class="menu-child-info">
              <div class="menu-child-name">${name}</div>
              <div class="menu-child-email">${email}</div>
            </div>
            <span class="menu-child-status ${isActive ? 'active' : 'pending'}">
              ${isActive ? '✓ actief' : 'wacht...'}
            </span>
          </div>`;
      }).join('');
    } catch(e) {
      section.style.display = 'none';
    }
  }

  // Intern: gezet door App.init na OAuth redirect
  function _setUser(u) { _user = u; }

  // Na OAuth redirect: profiel bepalen en routen
  async function resolveAfterOAuth() {
    await _resolveProfile();
  }

  return { getUser, getProfile, isParent, isChild, signIn, signOut, confirmRole, boot, resolveAfterOAuth, _setUser, _loadChildrenIntoMenu };
})();

