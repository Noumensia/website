// Menu mobile + ombre de nav au scroll
// Partagé par toutes les pages
document.addEventListener('DOMContentLoaded', () => {

  // ---- Menu mobile ----
  const toggle = document.getElementById('nav-toggle');
  const links = document.getElementById('nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const open = links.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open);
    });
  }

  // ---- Ombre de nav au scroll ----
  // Signale visuellement que la barre est sticky.
  // Pas d'animation décorative : juste de l'ergonomie.
  const nav = document.querySelector('.nav');
  if (nav) {
    const onScroll = () => {
      nav.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // état initial
  }

});
