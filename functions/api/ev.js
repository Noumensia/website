// POST /api/ev : compteur de clics et de pages vues, agrégé par jour.
// Aucune adresse IP, aucun identifiant, aucun cookie : seulement (jour, page, événement, nombre).

function nettoie(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/https?:\/\/(www\.)?/, '')
    .replace(/[^a-z0-9:_\-.\/#?=&%àâçéèêëîïôûùüÿœ]/g, '-')
    .slice(0, 90);
}

function evenement(d) {
  const p = (d && d.props) || {};
  switch (d && d.event) {
    case 'view': return 'vue';
    case 'click': return p.name ? 'clic:' + nettoie(p.name) : null;
    case 'link': return p.href ? 'lien:' + nettoie(p.href) : null;
    case 'submit': return p.name ? 'envoi:' + nettoie(p.name) : null;
    case 'open': return 'ouverture:' + nettoie(p.group) + ':' + nettoie(p.id || p.label);
    case 'resultat': return p.name ? 'resultat:' + nettoie(p.name) : null;
    default: return null;
  }
}

const vide = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

export async function onRequestPost({ request, env }) {
  if (!env.DB) return vide();
  let d;
  try { d = JSON.parse(await request.text()); } catch (e) { return vide(); }
  const evt = evenement(d);
  if (!evt) return vide();
  let page = String((d && d.page) || '/').split('#')[0].split('?')[0].slice(0, 120);
  if (!page.startsWith('/')) return vide();
  page = page.replace(/\.html$/, '').replace(/\/index$/, '/') || '/';
  const jour = new Date().toISOString().slice(0, 10);
  try {
    await env.DB.prepare(
      'INSERT INTO evenements (jour, page, evt, n) VALUES (?1, ?2, ?3, 1) ' +
      'ON CONFLICT (jour, page, evt) DO UPDATE SET n = n + 1'
    ).bind(jour, page, evt).run();
  } catch (e) {}
  return vide();
}
