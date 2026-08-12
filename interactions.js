// Interactions utilisateur — mesure minimale, sans cookie ni ID persistant.
// Config : window.NOUMENSIA_TRACKING = { endpoint: '...' } à définir dans le <head>
// avant chargement. Sans endpoint : logs locaux uniquement (localStorage + console).
(function () {
  'use strict';

  var CONFIG = {
    endpoint: null,
    logLocal: true,
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

  function record(name, props) {
    var payload = {
      event: name,
      props: props || {},
      page: location.pathname + location.hash,
      referrer: document.referrer || null,
      ts: new Date().toISOString()
    };
    if (CONFIG.logConsole) console.debug('[nm]', payload);
    if (CONFIG.logLocal) { var l = getLocal(); l.push(payload); saveLocal(l); }
    send(payload);
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

    document.querySelectorAll('[data-nm-click]').forEach(function (el) {
      el.addEventListener('click', function () {
        record('click', {
          name: el.getAttribute('data-nm-click'),
          href: el.getAttribute('href') || null
        });
      });
    });

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
