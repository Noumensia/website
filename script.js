// Noumensia — comportements partagés (thème, menu mobile, nav au scroll,
// révélation au scroll, barre de progression). Aucune dépendance externe.

// ---- Thème : appliqué le plus tôt possible pour limiter le flash ----
(function () {
  try {
    var t = localStorage.getItem('noumensia-theme');
    if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
  } catch (e) {}
})();

document.addEventListener('DOMContentLoaded', () => {

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Regroupe liens, bouton thème et burger dans un conteneur commun ----
  // (permet d'afficher le bouton thème à côté du burger sur mobile, hors du
  // panneau de menu qui reste fermé par défaut)
  const navLinks = document.getElementById('nav-links');
  const navToggleBtn = document.getElementById('nav-toggle');
  let navActions = null;
  if (navToggleBtn && navLinks && navToggleBtn.parentElement === navLinks.parentElement) {
    navActions = document.createElement('div');
    navActions.className = 'nav-actions';
    navToggleBtn.parentElement.insertBefore(navActions, navToggleBtn);
    navActions.appendChild(navLinks);
    navActions.appendChild(navToggleBtn);
  }

  // ---- Bouton de thème (injecté dans la nav) ----
  const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  if (navLinks) {
    const li = document.createElement('div');
    li.className = 'theme-toggle-li';
    const btn = document.createElement('button');
    btn.className = 'theme-toggle';
    btn.type = 'button';
    const setLabel = () => {
      const light = document.documentElement.getAttribute('data-theme') === 'light';
      btn.innerHTML = light ? MOON : SUN;
      btn.setAttribute('aria-label', light ? 'Passer en mode sombre' : 'Passer en mode clair');
      btn.setAttribute('title', light ? 'Mode sombre' : 'Mode clair');
    };
    setLabel();
    btn.addEventListener('click', () => {
      const light = document.documentElement.getAttribute('data-theme') === 'light';
      if (light) {
        document.documentElement.removeAttribute('data-theme');
        try { localStorage.setItem('noumensia-theme', 'dark'); } catch (e) {}
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
        try { localStorage.setItem('noumensia-theme', 'light'); } catch (e) {}
      }
      setLabel();
    });
    li.appendChild(btn);
    (navActions || navLinks).appendChild(li);
  }

  // ---- Menu mobile ----
  const toggle = navToggleBtn;
  if (toggle && navLinks) {
    toggle.addEventListener('click', () => {
      const open = navLinks.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    navLinks.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        navLinks.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // ---- Ombre de nav + barre de progression au scroll ----
  const nav = document.querySelector('.nav');
  const progress = document.querySelector('.scroll-progress');
  const onScroll = () => {
    if (nav) nav.classList.toggle('is-scrolled', window.scrollY > 8);
    if (progress) {
      const h = document.documentElement;
      const scrollable = h.scrollHeight - h.clientHeight;
      const pct = scrollable > 0 ? (h.scrollTop || window.scrollY) / scrollable : 0;
      progress.style.width = (pct * 100).toFixed(2) + '%';
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---- Révélation au scroll ----
  // Règle : tout ce qui est déjà dans la fenêtre au chargement est affiché
  // immédiatement, sans fondu. Le contenu above-the-fold ne doit jamais
  // dépendre d'un scroll pour devenir visible.
  const revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length) {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      revealEls.forEach(el => el.classList.add('is-visible'));
    } else {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      revealEls.forEach(el => {
        if (el.getBoundingClientRect().top < window.innerHeight) {
          el.classList.add('is-visible');
        } else {
          io.observe(el);
        }
      });
    }
  }

  // ---- Dock flottant : accès permanent au graphe et au simulateur ----
  // Construit à partir du bloc #model-access du hero : aucun HTML à dupliquer,
  // et toute nouvelle page modèle en bénéficie automatiquement.
  const access = document.getElementById('model-access');
  if (access) {
    const cards = access.querySelectorAll('.access-card');
    if (cards.length) {
      const ICONS = [
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="6" r="2.2"/><circle cx="19" cy="6" r="2.2"/><circle cx="12" cy="18" r="2.2"/><path d="M6.8 7.2 10.5 16M17.2 7.2 13.5 16M7 6h10"/></svg>',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="15" cy="7" r="2.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="2.3" fill="currentColor" stroke="none"/><circle cx="14" cy="17" r="2.3" fill="currentColor" stroke="none"/></svg>'
      ];
      const LABELS = ['Le graphe', 'Le simulateur'];

      const dock = document.createElement('div');
      dock.className = 'model-dock';
      dock.setAttribute('aria-label', 'Accès rapide au modèle');

      cards.forEach((card, i) => {
        const a = document.createElement('a');
        a.href = card.getAttribute('href');
        a.target = '_blank';
        a.rel = 'noopener';
        const nm = card.getAttribute('data-nm-click');
        if (nm) a.setAttribute('data-nm-click', nm.replace('-hero', '-dock'));
        a.innerHTML = ICONS[i] + '<span>' + (LABELS[i] || 'Ouvrir') + '</span>';
        dock.appendChild(a);
      });
      document.body.appendChild(dock);

      // Le dock apparaît une fois le bloc du hero dépassé, et s'efface quand
      // le bloc « Explorer ce modèle » de fin d'article prend le relais.
      const relay = document.querySelector('.explore-cta');
      const syncDock = () => {
        const passed = access.getBoundingClientRect().bottom < 0;
        const relayVisible = relay
          ? relay.getBoundingClientRect().top < window.innerHeight
          : false;
        dock.classList.toggle('is-shown', passed && !relayVisible);
      };
      window.addEventListener('scroll', syncDock, { passive: true });
      window.addEventListener('resize', syncDock, { passive: true });
      syncDock();
    }
  }

});
