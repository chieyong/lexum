import './styles/main.css';
import { supa } from './constants.js';
import { Auth }          from './auth.js';
import { Data }          from './data.js';
import { Conjugation }   from './conjugation.js';
import { SRS }           from './srs.js';
import { Session }       from './session.js';
import { UI }            from './ui.js';
import { App }           from './app.js';
import { Dashboard }     from './dashboard.js';
import { Learn }         from './learn.js';
import { ChildProgress } from './child-progress.js';

// Expose all modules as globals so that:
// 1. HTML onclick="App.xxx()" handlers work
// 2. Modules referencing each other by name work
window.supa          = supa;
window.Auth          = Auth;
window.Data          = Data;
window.Conjugation   = Conjugation;
window.SRS           = SRS;
window.Session       = Session;
window.UI            = UI;
window.App           = App;
window.Dashboard     = Dashboard;
window.Learn         = Learn;
window.ChildProgress = ChildProgress;

document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (document.activeElement === document.getElementById('card-input')) App.checkAnswer();
  }
});

document.addEventListener('click', e => {
  const wrap = document.getElementById('user-pill-wrap');
  const menu = document.getElementById('user-menu');
  if (menu && wrap && !wrap.contains(e.target)) {
    UI.closeUserMenu();
  }
});

document.addEventListener('DOMContentLoaded', App.init);
