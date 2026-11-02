// Mesure d'audience de noumensia.com : sans cookie, sans adresse IP, sans identifiant durable.
// Les événements partent vers /api/ev (Pages Function, base Cloudflare D1 dans l'UE).
// - Un numéro de visite tiré au hasard vit dans sessionStorage, le temps de l'onglet seulement.
// - Rien n'est envoyé si le visiteur s'y est opposé (bouton sur la page Confidentialité,
//   localStorage « nm-optout ») ou si son navigateur envoie le signal Global Privacy Control.
// Config facultative : window.NOUMENSIA_TRACKING = { endpoint: null } pour couper l'envoi.
(function () {
  'use strict';

  var CONFIG = { endpoint: '/api/ev', logConsole: false };
  if (window.NOUMENSIA_TRACKING && typeof window.NOUMENSIA_TRACKING === 'object') {
    for (var k in window.NOUMENSIA_TRACKING) {
      if (Object.prototype.hasOwnProperty.call(window.NOUMENSIA_TRACKING, k)) CONFIG[k] = window.NOUMENSIA_TRACKING[k];
    }
  }

  function optedOut() {
    try { if (localStorage.getItem('nm-optout') === '1') return true; } catch (e) {}
    return navigator.globalPrivacyControl === true;
  }

  // ---- Visite (session d'onglet) ----
  var sid = null, entree = false;
  try {
    sid = sessionStorage.getItem('nm-sid');
    if (!sid) {
      sid = (Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 20);
      sessionStorage.setItem('nm-sid', sid);
      entree = true;
    }
  } catch (e) { sid = null; entree = true; }

  var ctx = {};
  if (entree) {
    try {
      var r = document.referrer ? new URL(document.referrer) : null;
      ctx.ref = r && r.host !== location.host ? r.host : (r ? 'interne' : '');
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
    var payload = { event: name, props: props || {}, page: location.pathname, sid: sid };
    if (extra) for (var x in extra) if (Object.prototype.hasOwnProperty.call(extra, x)) payload[x] = extra[x];
    if (first && name === 'view') {
      payload.entree = entree;
      for (var c in ctx) if (Object.prototype.hasOwnProperty.call(ctx, c)) payload[c] = ctx[c];
      first = false;
    }
    if (CONFIG.logConsole) console.debug('[nm]', payload);
    send(payload);
  }

  window.nmRecord = function (name, props) { record(name, props); };

  // ---- Temps passé (onglet visible seulement), défilement, interactions avec les outils ----
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

  document.addEventListener('DOMContentLoaded', function () {
    var load = (window.performance && performance.now) ? Math.round(performance.now()) : null;
    var is404 = !!document.querySelector('.error-code') && /404/.test(document.title + document.querySelector('.error-code').textContent);
    record('view', { title: document.title }, { valeur: load, detail: is404 ? 'page introuvable' : null });
    if (is404) record('notfound', {}, { detail: location.pathname + location.search });

    var st; window.addEventListener('scroll', function () { clearTimeout(st); st = setTimeout(onScroll, 200); }, { passive: true });
    setTimeout(onScroll, 1500);

    // Outils : chaque réglage modifié (case, curseur, liste, bouton d'un formulaire d'outil)
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

    // Clics : un seul écouteur pour toute la page (y compris le contenu ajouté après coup).
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target : null;
      if (!t) return;
      var named = t.closest('[data-nm-click]');
      var a = t.closest('a[href]');
      if (!named && !a) {
        var b = t.closest('button');
        if (b && !b.closest('form.contact-form, #aiact-alert')) nInteractions++;
        return;
      }
      var raw = a ? (a.getAttribute('href') || '') : '';
      var u = null;
      try { if (a) u = new URL(a.href, location.href); } catch (err) { u = null; }
      var interne = !!(u && u.host === location.host);
      if (named) {
        record('click', { name: named.getAttribute('data-nm-click'), href: raw || null });
      } else {
        if (!raw || /^(javascript|tel):/i.test(raw)) return;
        if (/^mailto:/i.test(raw)) { record('link', { href: 'mailto' }); return; }
        if (raw.charAt(0) === '#') { record('link', { href: location.pathname + raw }); return; }
        record('link', { href: u ? (interne ? u.pathname + u.hash : u.host + u.pathname) : raw });
      }
      // Navigation dans le même onglet vers une autre page : on envoie le temps passé tout de suite
      // (plus fiable que d'attendre la fermeture de la page).
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
