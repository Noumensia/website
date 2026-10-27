// Interactions utilisateur — mesure minimale, sans cookie ni ID persistant.
// Les événements partent vers /api/ev (Pages Function), qui ne garde qu'un compteur
// par jour, page et événement : ni adresse IP, ni identifiant, ni cookie.
// Config facultative : window.NOUMENSIA_TRACKING = { endpoint: null } pour couper l'envoi.
(function () {
  'use strict';

  var CONFIG = {
    endpoint: '/api/ev',
    logLocal: false,
    logConsole: false,
    lsKey: 'nm-ev',
    lsMax: 100
  };

  if (window.NOUMENSIA_TRACKING && typeof window.NOUMENSIA_TRACKING === 'object') {
    for (var k in window.NOUMENSIA_TRACKING) {
      if (Object.prototype.hasOwnProperty.call(window.NOUMENSIA_TRACKING, k)) {
        CONFIG[k] = window.NOUMENSIA_TRACKING[k];
      }
    }
  }

  function getLocal() {
    try {
      var raw = localStorage.getItem(CONFIG.lsKey);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveLocal(list) {
    try {
      localStorage.setItem(CONFIG.lsKey, JSON.stringify(list.slice(-CONFIG.lsMax)));
    } catch (e) {}
  }

  function send(payload) {
    if (!CONFIG.endpoint) return;
    try {
      var body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(CONFIG.endpoint, new Blob([body], { type: 'application/json' }));
      } else {
        fetch(CONFIG.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
          keepalive: true
        }).catch(function () {});
      }
    } catch (e) {}
  }

  var SENT = { view: 1, click: 1, link: 1, submit: 1, open: 1, resultat: 1 };

  function record(name, props) {
    var payload = {
      event: name,
      props: props || {},
      page: location.pathname
    };
    if (CONFIG.logConsole) console.debug('[nm]', payload);
    if (CONFIG.logLocal) { var l = getLocal(); l.push(payload); saveLocal(l); }
    if (SENT[name]) send(payload);
  }

  window.nmRecord = record;
  window.nmList = getLocal;
  window.nmClear = function () { try { localStorage.removeItem(CONFIG.lsKey); } catch (e) {} };

  document.addEventListener('DOMContentLoaded', function () {
    record('view', { title: document.title });

    document.querySelectorAll('[data-nm-toggle]').forEach(function (el) {
      var group = el.getAttribute('data-nm-toggle');
      el.addEventListener('toggle', function () {
        var s = el.querySelector('summary');
        var label = s ? s.textContent.trim() : null;
        record(el.open ? 'open' : 'close', {
          group: group,
          id: el.id || null,
          label: label
        });
      });
    });

    // Clics : un seul écouteur pour toute la page (y compris le contenu ajouté
    // après coup, comme le résultat du parcours). Un élément marqué data-nm-click
    // garde son nom ; tout autre lien est compté sous son adresse.
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target : null;
      if (!t) return;
      var named = t.closest('[data-nm-click]');
      if (named) {
        record('click', {
          name: named.getAttribute('data-nm-click'),
          href: named.getAttribute('href') || null
        });
        return;
      }
      var a = t.closest('a[href]');
      if (!a) return;
      var raw = a.getAttribute('href') || '';
      if (!raw || raw.charAt(0) === '#' || /^(javascript|mailto|tel):/i.test(raw)) {
        if (/^mailto:/i.test(raw)) record('link', { href: 'mailto' });
        return;
      }
      var href;
      try {
        var u = new URL(a.href, location.href);
        href = (u.host === location.host) ? u.pathname + u.hash : u.host + u.pathname;
      } catch (err) { href = raw; }
      record('link', { href: href });
    }, true);

    document.querySelectorAll('[data-nm-submit]').forEach(function (form) {
      form.addEventListener('submit', function () {
        record('submit', { name: form.getAttribute('data-nm-submit') });
      });
    });

    // ---- Bouton « copier le lien » (share row des articles) ----
    function fallbackCopy(text) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (e) {}
    }

    document.querySelectorAll('[data-share-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var url = location.href.split('#')[0];
        var showCopied = function () {
          btn.classList.add('is-copied');
          clearTimeout(btn._nmCopyTimer);
          btn._nmCopyTimer = setTimeout(function () {
            btn.classList.remove('is-copied');
          }, 1800);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(showCopied).catch(function () {
            fallbackCopy(url);
            showCopied();
          });
        } else {
          fallbackCopy(url);
          showCopied();
        }
      });
    });
  });

})();
