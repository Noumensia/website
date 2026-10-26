/*
  Parcours du visiteur (26/10/2026) — chargé par script.js sur toutes les pages.

  Trois usages, tous calculés dans le navigateur du visiteur :
  1. Page 404 : propose la page du site la plus proche de l'adresse tapée.
  2. Fin des articles, modèles et décryptages : « Pour continuer », deux contenus
     liés que le visiteur n'a pas encore lus.
  3. Accueil : quand un visiteur revient (nouvelle visite), un lien discret pour
     reprendre la dernière lecture.

  Mémoire : la liste des pages de contenu déjà vues est gardée uniquement dans le
  navigateur (localStorage « nm-parcours »), jamais envoyée ni partagée. Si le stockage
  est indisponible (navigation privée, réglages), tout fonctionne sans la mémoire.
  Pour ajouter une page au catalogue : une ligne dans PAGES.
*/
(function () {
  'use strict';

  // type : modele | article | decryptage | outil | page
  // tags : sujets partagés, servent à choisir les contenus liés
  var PAGES = [
    { p: '/', t: 'Accueil', type: 'page', tags: [] },
    { p: '/modeles', t: 'Les modèles', type: 'page', tags: ['modeles'] },
    { p: '/modeles/turnover', t: 'Turnover volontaire, le modèle', type: 'modele', tags: ['turnover'] },
    { p: '/modeles/burnout', t: 'Burn-out et risques psychosociaux, le modèle', type: 'modele', tags: ['rps'] },
    { p: '/articles', t: 'Les articles', type: 'page', tags: [] },
    { p: '/articles/causes-turnover-recherche', t: 'Pourquoi vos salariés partent, ce que 60 ans de recherche disent', type: 'article', tags: ['turnover'] },
    { p: '/articles/cout-turnover-ratios', t: "Coût du turnover, d'où viennent les ratios 21 % et 150 %", type: 'article', tags: ['turnover'] },
    { p: '/decryptages', t: 'Les décryptages', type: 'page', tags: [] },
    { p: '/decryptages/ai-act/', t: "L'AI Act en RH, sans le brouillard", type: 'decryptage', tags: ['ai-act'] },
    { p: '/decryptages/ai-act/parcours-qualification', t: 'Votre outil RH est-il concerné par l’AI Act ?', type: 'outil', tags: ['ai-act'] },
    { p: '/decryptages/ai-act/registre-obligations', t: 'Les obligations de l’AI Act, une par une', type: 'outil', tags: ['ai-act'] },
    { p: '/decryptages/ai-act/simulateur-sanction', t: 'AI Act, par quoi commencer pour réduire son exposition', type: 'outil', tags: ['ai-act'] },
    { p: '/decryptages/ai-act/cartographie', t: "L'AI Act en un seul graphe", type: 'outil', tags: ['ai-act'] },
    { p: '/decryptages/ai-act/structure-du-texte', t: 'AI Act, de quoi parle vraiment le règlement', type: 'outil', tags: ['ai-act'] },
    { p: '/decryptages/ai-act/mecanique-causale', t: 'AI Act, comment un outil RH finit en sanction', type: 'outil', tags: ['ai-act'] },
    { p: '/decryptages/ai-act/effets-causaux', t: 'AI Act, les facteurs qui pèsent le plus sur le préjudice', type: 'outil', tags: ['ai-act'] },
    { p: '/decryptages/ai-act/arbitrage-conformite', t: 'AI Act, combien coûte la conformité et que rapporte-t-elle', type: 'outil', tags: ['ai-act'] },
    { p: '/methode', t: 'La méthode', type: 'page', tags: ['methode'] },
    { p: '/faq', t: 'Questions fréquentes', type: 'page', tags: [] },
    { p: '/a-propos', t: 'À propos', type: 'page', tags: [] },
    { p: '/contact', t: 'Contact', type: 'page', tags: [] },
    { p: '/rendez-vous', t: 'Prendre rendez-vous', type: 'page', tags: [] },
    { p: '/mentions-legales', t: 'Mentions légales', type: 'page', tags: [] },
    { p: '/mentions-legales/confidentialite', t: 'Confidentialité', type: 'page', tags: [] }
  ];
  var TYPE_LABEL = { modele: 'Modèle', article: 'Article', decryptage: 'Décryptage', outil: 'Outil AI Act' };
  var CONTENU = { modele: 1, article: 1, decryptage: 1, outil: 1 };
  var LS_KEY = 'nm-parcours';
  var SESSION_GAP = 30 * 60 * 1000;        // au-delà de 30 min sans visite : nouvelle visite
  var MAX_AGE = 60 * 24 * 3600 * 1000;     // on oublie au bout de 60 jours

  function norm(path) {
    path = (path || '/').replace(/\.html$/, '').replace(/\/index$/, '/');
    if (path.length > 1 && path !== '/decryptages/ai-act/') path = path.replace(/\/$/, '');
    if (path === '/decryptages/ai-act') path = '/decryptages/ai-act/';
    return path || '/';
  }
  function find(path) {
    path = norm(path);
    for (var i = 0; i < PAGES.length; i++) if (PAGES[i].p === path) return PAGES[i];
    return null;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function load() {
    try {
      var l = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      var now = Date.now();
      return Array.isArray(l) ? l.filter(function (v) { return v && v.p && now - v.d < MAX_AGE; }) : [];
    } catch (e) { return []; }
  }
  function save(l) { try { localStorage.setItem(LS_KEY, JSON.stringify(l.slice(-40))); } catch (e) {} }
  function track(name, props) { try { if (window.nmRecord) window.nmRecord('click', Object.assign({ name: name }, props || {})); } catch (e) {} }

  var is404 = !!document.querySelector('.error-wrap');
  var here = is404 ? null : find(location.pathname);
  var history = load();
  // dernière lecture enregistrée avant cette page : sert à « reprendre » sur l'accueil
  var last = history.length ? history[history.length - 1] : null;
  // nouvelle visite = premier affichage dans cet onglet, et dernière lecture vieille de 30 min ou plus
  var premierePage = false;
  try { premierePage = !sessionStorage.getItem('nm-s'); sessionStorage.setItem('nm-s', '1'); } catch (e) {}
  var nouvelleVisite = premierePage && !!last && (Date.now() - last.d > SESSION_GAP);

  // 1. Mémoriser la page de contenu courante
  if (here && CONTENU[here.type]) {
    history = history.filter(function (v) { return v.p !== here.p; });
    history.push({ p: here.p, d: Date.now() });
    save(history);
  }
  var vus = {};
  history.forEach(function (v) { vus[v.p] = 1; });

  // ---------- 2. Page 404 : la page la plus proche de l'adresse tapée ----------
  function lev(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) d[i] = [i];
    for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  function slugify(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\.html?$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function suggest404() {
    var box = document.getElementById('nf-suggest');
    if (!box) return;
    var asked = slugify(decodeURIComponent(location.pathname));
    if (!asked) return;
    var askedLast = asked.split(' ').slice(-3).join(' ');
    var scored = PAGES.filter(function (pg) { return pg.p !== '/'; }).map(function (pg) {
      var full = slugify(pg.p), lastSeg = slugify(pg.p.split('/').filter(Boolean).pop() || '');
      // distance normalisée sur le chemin complet et sur le dernier segment
      var s1 = lev(asked, full) / Math.max(asked.length, full.length);
      var s2 = lev(askedLast, lastSeg) / Math.max(askedLast.length, lastSeg.length || 1);
      // bonus si un mot tapé apparaît tel quel dans le chemin
      var words = asked.split(' ').filter(function (w) { return w.length > 3; });
      var hit = words.filter(function (w) { return full.indexOf(w) >= 0; }).length * 0.12;
      return { pg: pg, s: Math.min(s1, s2) - hit };
    }).sort(function (a, b) { return a.s - b.s; });
    // une seule proposition si elle se détache nettement, deux si elles sont au coude à coude
    var best = scored.filter(function (x, i) { return x.s < 0.45 && (i === 0 || x.s <= scored[0].s + 0.08); }).slice(0, 2);
    if (!best.length) return;
    var html = '<p class="nf-suggest__label">Vous cherchiez peut-être</p><ul class="nf-suggest__list">';
    best.forEach(function (x, i) {
      html += '<li><a href="' + x.pg.p + '" data-i="' + i + '">' + esc(x.pg.t) + '&nbsp;→</a></li>';
    });
    box.innerHTML = html + '</ul>';
    box.hidden = false;
    box.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { track('notfound-suggest', { from: location.pathname, href: a.getAttribute('href') }); });
    });
  }

  // ---------- 3. « Pour continuer » en fin de contenu ----------
  function nextReads() {
    if (!here || !CONTENU[here.type]) return;
    // pages du site : fin de <main> ; pages d'outils AI Act : juste avant leur pied de page
    var main = document.querySelector('main');
    var toolFooter = document.querySelector('.nm-site-footer');
    if ((!main && !toolFooter) || document.querySelector('.next-reads')) return;
    var outil = here.type === 'outil';
    var candidats = PAGES.filter(function (pg) {
      if (!CONTENU[pg.type] || pg.p === here.p || vus[pg.p]) return false;
      return true;
    }).map(function (pg) {
      var same = pg.tags.some(function (t) { return here.tags.indexOf(t) >= 0; });
      // même sujet d'abord ; depuis un outil, on propose plutôt les autres outils
      var score = (same ? 0 : 10) + (outil ? (pg.type === 'outil' ? 0 : 2) : (pg.type === 'outil' ? 3 : 0));
      return { pg: pg, score: score };
    }).sort(function (a, b) { return a.score - b.score; }).slice(0, 2);
    if (candidats.length < 2) return; // tout est lu, ou presque : rien à ajouter
    var sec = document.createElement('section');
    sec.className = 'next-reads';
    sec.setAttribute('aria-label', 'Pour continuer');
    var html = '<div class="wrap"><p class="next-reads__label">Pour continuer</p><div class="next-reads__grid">';
    candidats.forEach(function (c) {
      html += '<a class="next-read" href="' + c.pg.p + '">' +
        '<span class="next-read__type">' + TYPE_LABEL[c.pg.type] + '</span>' +
        '<span class="next-read__title">' + esc(c.pg.t) + '</span>' +
        '<span class="next-read__go" aria-hidden="true">→</span></a>';
    });
    sec.innerHTML = html + '</div></div>';
    if (main) main.appendChild(sec); else toolFooter.parentNode.insertBefore(sec, toolFooter);
    sec.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { track('next-read', { from: here.p, href: a.getAttribute('href') }); });
    });
  }

  // ---------- 4. Accueil : reprendre la dernière lecture (nouvelle visite seulement) ----------
  function resume() {
    if (!here || here.p !== '/' || !nouvelleVisite) return;
    var pg = find(last.p);
    if (!pg || !CONTENU[pg.type]) return;
    var anchor = document.querySelector('.hero-ctas');
    if (!anchor) return;
    var a = document.createElement('a');
    a.className = 'resume-link';
    a.href = pg.p;
    a.innerHTML = '<span class="resume-link__k">Reprendre</span> ' + esc(pg.t) + '&nbsp;→';
    anchor.insertAdjacentElement('afterend', a);
    a.addEventListener('click', function () { track('home-resume', { href: pg.p }); });
  }

  // Styles injectés ici pour servir aussi aux pages d'outils AI Act, qui n'utilisent pas style.css
  var CSS = ".nf-suggest{ margin:0 0 1.75rem; } .nf-suggest[hidden]{ display:none; } .nf-suggest__label{ font-size:.85rem; color:var(--gris-doux); margin:0 0 .5rem !important; } .nf-suggest__list{ list-style:none; margin:0; padding:0; display:grid; gap:.4rem; } .nf-suggest__list a{ font-family:var(--font-display,\"Newsreader\",Georgia,serif); font-size:1.25rem; font-weight:500; color:var(--bordeaux-vif); background-image:linear-gradient(currentColor, currentColor); background-size:0% 1.5px; background-position:0 100%; background-repeat:no-repeat; transition:background-size .35s cubic-bezier(.22,1,.36,1); } .nf-suggest__list a:hover{ text-decoration:none; background-size:100% 1.5px; } .next-reads{ padding:clamp(2.5rem,6vw,4rem) 0; border-top:1px solid var(--ardoise-3); } .next-reads__grid{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem; } .next-read{ position:relative; display:flex; flex-direction:column; gap:.35rem; padding:1.15rem 3rem 1.15rem 1.25rem; border-radius:10px; border:1px solid #46566A; color:var(--blanc-casse); background:linear-gradient(180deg, #333F4D 0%, #2D3845 100%); box-shadow:inset 0 1px 0 rgba(255,255,255,.05), 0 8px 26px rgba(0,0,0,.30); transition:transform .22s ease, box-shadow .22s ease, border-color .22s ease; } .next-read:hover{ text-decoration:none; transform:translateY(-2px); border-color:transparent; box-shadow:0 10px 28px rgba(0,0,0,.25); } .next-read__type{ font-family:var(--font-mono,\"IBM Plex Mono\",monospace); font-size:.72rem; letter-spacing:.06em; text-transform:uppercase; color:var(--bordeaux-vif); } .next-read__title{ font-family:var(--font-display,\"Newsreader\",Georgia,serif); font-size:1.12rem; font-weight:500; line-height:1.3; } .next-read__go{ position:absolute; right:1.2rem; top:50%; transform:translateY(-50%); color:var(--bordeaux-vif); transition:transform .22s ease; } .next-read:hover .next-read__go{ transform:translate(4px,-50%); } html[data-theme=\"light\"] .next-read{ background:var(--papier,#F8F0E0); border-color:#DCCBAA; box-shadow:0 1px 2px rgba(70,45,20,.07), 0 4px 14px rgba(70,45,20,.07); } html[data-theme=\"light\"] .next-read:hover{ box-shadow:0 2px 4px rgba(70,45,20,.07), 0 14px 34px rgba(70,45,20,.13); } @media (max-width:640px){ .next-reads__grid{ grid-template-columns:1fr; } } .resume-link{ display:inline-flex; align-items:baseline; gap:.5rem; margin-top:1.1rem; font-size:.92rem; color:var(--gris-doux); animation:nmParcoursIn .6s cubic-bezier(.16,1,.3,1) .3s both; } .resume-link__k{ font-family:var(--font-mono,\"IBM Plex Mono\",monospace); font-size:.72rem; letter-spacing:.06em; text-transform:uppercase; color:var(--bordeaux-vif); } .resume-link:hover{ color:var(--blanc-casse); text-decoration:underline; text-underline-offset:3px; } @keyframes nmParcoursIn{ from{ opacity:0; transform:translateY(6px); } to{ opacity:1; transform:none; } } .next-reads__label{ display:inline-flex; align-items:center; gap:.5rem; margin:0 0 1rem; font-family:var(--font-body,\"IBM Plex Sans\",sans-serif); font-size:.8rem; font-weight:600; letter-spacing:.04em; color:var(--bordeaux-vif); } .next-reads__label::before{ content:\"\"; width:1.35rem; height:1px; background:var(--bordeaux-vif); opacity:.8; } .next-reads .wrap{ max-width:var(--maxw,1180px); margin:0 auto; padding:0 var(--pad,clamp(1.25rem,4vw,3.5rem)); } .next-read, .next-read:hover{ text-decoration:none; }";
  function injectCss() {
    if (document.getElementById('nm-parcours-css')) return;
    var st = document.createElement('style'); st.id = 'nm-parcours-css'; st.textContent = CSS;
    document.head.appendChild(st);
  }

  function run() { injectCss(); suggest404(); nextReads(); resume(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
