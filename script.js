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

  // ---- Bouton de thème (injecté dans la nav) ----
  const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  const navLinks = document.getElementById('nav-links');
  if (navLinks) {
    const li = document.createElement('li');
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
    navLinks.appendChild(li);
  }

  // ---- Menu mobile ----
  const toggle = document.getElementById('nav-toggle');
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
      revealEls.forEach(el => io.observe(el));
    }
  }

});
