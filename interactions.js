// Mesure d'audience de noumensia.com (voir la page Confidentialité).
// - Visiteur : identifiant tiré au hasard, gardé dans le navigateur (localStorage « nm-vid »).
// - Visite : nouvelle après 30 minutes sans activité (localStorage « nm-sess »).
// - Les événements partent vers /api/ev (base Cloudflare D1, dans l'UE).
// - Rien n'est envoyé si le visiteur s'y est opposé (bouton de la page Confidentialité, « nm-optout »).
// - « nm-moi » = 1 : appareil d'Arthur, ses visites sont gardées mais marquées et exclues des statistiques.
(function () {
  'use strict';
  // Pas de mesure dans un cadre (aperçu de la carte des clics du cockpit).
  try { if (window.self !== window.top) return; } catch (e) { return; }

  var CONFIG = { endpoint: '/api/ev', logConsole: false };
  if (window.NOUMENSIA_TRACKING && typeof window.NOUMENSIA_TRACKING === 'object') {
    for (var k in window.NOUMENSIA_TRACKING) {
      if (Object.prototype.hasOwnProperty.call(window.NOUMENSIA_TRACKING, k)) CONFIG[k] = window.NOUMENSIA_TRACKING[k];
    }
  }
  function ls(key, val) {
    try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) { return null; }
    return null;
  }
  function rid() { return (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 24); }
  function optedOut() { return ls('nm-optout') === '1'; }

  // ---- Visiteur et visite ----
  var vid = ls('nm-vid'), nouveau = false;
  if (!vid) { vid = rid(); nouveau = true; ls('nm-vid', vid); }
  var now = Date.now(), sess = null, entree = false;
  try { sess = JSON.parse(ls('nm-sess') || 'null'); } catch (e) { sess = null; }
  if (!sess || !sess.id || now - (sess.last || 0) > 30 * 60 * 1000) { sess = { id: rid(), last: now }; entree = true; }
  function touch() { sess.last = Date.now(); ls('nm-sess', JSON.stringify(sess)); }
  touch();

  var ctx = {};
  if (entree) {
    try {
      var r = document.referrer ? new URL(document.referrer) : null;
      ctx.ref = r && r.host !== location.host ? r.host : (r ? 'interne' : '');
      ctx.ref_complet = document.referrer || '';
    } catch (e) { ctx.ref = ''; }
    try {
      var q = new URLSearchParams(location.search);
      ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function (u) { if (q.get(u)) ctx[u] = q.get(u); });
    } catch (e) {}
  }

  function send(payload) {
    if (!CONFIG.endpoint || optedOut()) return;
    try {
      var body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(CONFIG.endpoint, new Blob([body], { type: 'application/json' }));
      } else {
        fetch(CONFIG.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
      }
    } catch (e) {}
  }

  var first = true;
  function record(name, props, extra) {
    touch();
    var payload = { event: name, props: props || {}, page: location.pathname, url: location.pathname + location.search,
      sid: sess.id, vid: vid, langue: navigator.language || '', ecran: window.innerWidth || null };
    if (ls('nm-moi') === '1') payload.moi = 1;
    if (extra) for (var x in extra) if (Object.prototype.hasOwnProperty.call(extra, x)) payload[x] = extra[x];
    if (first && name === 'view') {
      payload.entree = entree; payload.nouveau = nouveau; payload.titre = document.title;
      for (var c in ctx) if (Object.prototype.hasOwnProperty.call(ctx, c)) payload[c] = ctx[c];
      first = false;
    }
    if (CONFIG.logConsole) console.debug('[nm]', payload);
    send(payload);
  }
  window.nmRecord = function (name, props) { record(name, props); };

  // ---- Temps passé (onglet visible), défilement, réglages des outils ----
  var visibleSince = document.visibilityState === 'visible' ? Date.now() : null;
  var engaged = 0, maxScroll = 0, scrollSent = {}, nInteractions = 0, flushed = false;
  function tick() { if (visibleSince) { engaged += Date.now() - visibleSince; visibleSince = null; } }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { tick(); flush(); }
    else { visibleSince = Date.now(); flushed = false; }
  });
  window.addEventListener('pagehide', function () { tick(); flush(); });
  function flush() {
    if (flushed) return;
    flushed = true;
    var s = Math.round(engaged / 1000);
    if (s >= 1) record('temps', {}, { valeur: s, detail: String(maxScroll) });
    if (nInteractions > 0) record('interactions', {}, { valeur: nInteractions });
    engaged = 0; nInteractions = 0;
  }
  function onScroll() {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    var pct = h > 0 ? Math.min(100, Math.round(window.scrollY / h * 100)) : 100;
    if (pct > maxScroll) maxScroll = pct;
    [25, 50, 75, 100].forEach(function (m) {
      if (maxScroll >= m && !scrollSent[m]) { scrollSent[m] = 1; record('scroll', {}, { valeur: m }); }
    });
  }
  function texte(el) {
    var t = (el.getAttribute('aria-label') || el.innerText || el.textContent || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
    return t.slice(0, 90);
  }
  function pos(e) {
    var d = document.documentElement, w = Math.max(d.scrollWidth, 1), h = Math.max(d.scrollHeight, 1);
    return { x: Math.round(e.pageX / w * 10000) / 10000, y: Math.round(e.pageY / h * 10000) / 10000 };
  }

  document.addEventListener('DOMContentLoaded', function () {
    var load = (window.performance && performance.now) ? Math.round(performance.now()) : null;
    var ec = document.querySelector('.error-code');
    var is404 = !!ec && /404/.test(document.title + ec.textContent);
    record('view', { title: document.title }, { valeur: load, detail: is404 ? 'page introuvable' : null });
    if (is404) record('notfound', {}, { detail: location.pathname + location.search });

    var st; window.addEventListener('scroll', function () { clearTimeout(st); st = setTimeout(onScroll, 200); }, { passive: true });
    setTimeout(onScroll, 1500);

    document.addEventListener('change', function (e) {
      if (e.target && e.target.closest && !e.target.closest('form.contact-form, #aiact-alert')) nInteractions++;
    }, true);

    document.querySelectorAll('[data-nm-toggle]').forEach(function (el) {
      var group = el.getAttribute('data-nm-toggle');
      el.addEventListener('toggle', function () {
        if (!el.open) return;
        var s = el.querySelector('summary');
        record('open', { group: group, id: el.id || null, label: s ? s.textContent.trim() : null });
      });
    });

    // Clics : un seul écouteur pour toute la page. On garde le texte du lien ou du bouton
    // et la position du clic (en proportion de la page) pour la carte des clics.
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target : null;
      if (!t) return;
      var named = t.closest('[data-nm-click]');
      var a = t.closest('a[href]');
      var b = t.closest('button, [role=button], summary, input[type=checkbox], input[type=radio], label');
      var p = pos(e);
      if (!named && !a) {
        if (b && !b.closest('form.contact-form, #aiact-alert')) { nInteractions++; record('button', { name: texte(b) }, { detail: texte(b), x: p.x, y: p.y }); }
        return;
      }
      var el = named || a;
      var raw = a ? (a.getAttribute('href') || '') : '';
      var u = null;
      try { if (a) u = new URL(a.href, location.href); } catch (err) { u = null; }
      var interne = !!(u && u.host === location.host);
      var info = { detail: texte(el), x: p.x, y: p.y };
      if (named) {
        record('click', { name: named.getAttribute('data-nm-click'), href: raw || null }, info);
      } else {
        if (!raw || /^(javascript|tel):/i.test(raw)) return;
        if (/^mailto:/i.test(raw)) { record('link', { href: 'mailto' }, info); return; }
        if (raw.charAt(0) === '#') { record('link', { href: location.pathname + raw }, info); return; }
        record('link', { href: u ? (interne ? u.pathname + u.hash : u.host + u.pathname) : raw }, info);
      }
      if (interne && !e.ctrlKey && !e.metaKey && !e.shiftKey && a.target !== '_blank' && u.pathname !== location.pathname) { tick(); flush(); }
    }, true);

    document.querySelectorAll('[data-nm-submit]').forEach(function (form) {
      form.addEventListener('submit', function () { record('submit', { name: form.getAttribute('data-nm-submit') }); });
    });

    // ---- Bouton « copier le lien » (share row des articles) ----
    function fallbackCopy(text) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      } catch (e) {}
    }
    document.querySelectorAll('[data-share-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var url = location.href.split('#')[0];
        var showCopied = function () {
          btn.classList.add('is-copied');
          clearTimeout(btn._nmCopyTimer);
          btn._nmCopyTimer = setTimeout(function () { btn.classList.remove('is-copied'); }, 1800);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(showCopied).catch(function () { fallbackCopy(url); showCopied(); });
        } else { fallbackCopy(url); showCopied(); }
      });
    });
  });
})();
