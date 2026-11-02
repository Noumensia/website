// POST /api/ev : mesure d'audience du site, sans cookie ni adresse IP.
// Chaque événement est gardé avec : la page, un numéro de visite tiré au hasard (il ne vit que le
// temps de l'onglet, sessionStorage), la provenance de la visite, le pays (déduit par Cloudflare,
// l'adresse IP n'est jamais enregistrée), le type d'appareil, le navigateur et le système.
// Conservation : 25 mois au plus (purge automatique), conformément à la recommandation de la CNIL.

const EVTS = { view: 'vue', click: 'clic', link: 'lien', submit: 'envoi', open: 'ouverture', resultat: 'resultat',
  scroll: 'defilement', temps: 'temps', interactions: 'interactions', notfound: 'erreur404' };

const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|monitor|curl|wget|python|httpclient|facebookexternalhit|embedly|quora|whatsapp|telegram|discord|skype|bingpreview|petalbot|semrush|ahrefs|yandex|baidu|bytespider|gptbot|claude|perplexity|ccbot/i;

function nettoie(s, max) {
  return String(s == null ? '' : s).trim().replace(/[\u0000-\u001f<>"]/g, '').slice(0, max || 120);
}

function chemin(p) {
  let s = String(p || '/').split('#')[0].split('?')[0].slice(0, 160);
  if (!s.startsWith('/')) return null;
  s = s.replace(/[.\s]+$/, '').replace(/\.html$/, '').replace(/\/index$/, '/');
  return s || '/';
}

function appareil(ua) {
  if (/ipad|tablet|kindle|silk|(android(?!.*mobile))/i.test(ua)) return 'tablette';
  if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(ua)) return 'mobile';
  return 'ordinateur';
}
function navigateur(ua) {
  if (/edg\//i.test(ua)) return 'Edge';
  if (/opr\/|opera/i.test(ua)) return 'Opera';
  if (/samsungbrowser/i.test(ua)) return 'Samsung Internet';
  if (/firefox|fxios/i.test(ua)) return 'Firefox';
  if (/chrome|crios/i.test(ua)) return 'Chrome';
  if (/safari/i.test(ua)) return 'Safari';
  return 'Autre';
}
function systeme(ua) {
  if (/windows/i.test(ua)) return 'Windows';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
  if (/mac os x|macintosh/i.test(ua)) return 'macOS';
  if (/android/i.test(ua)) return 'Android';
  if (/cros/i.test(ua)) return 'ChromeOS';
  if (/linux/i.test(ua)) return 'Linux';
  return 'Autre';
}
function libelle(type, p) {
  const n = (s) => nettoie(s, 100).toLowerCase().replace(/https?:\/\/(www\.)?/, '');
  switch (type) {
    case 'vue': return 'vue';
    case 'clic': return p.name ? 'clic:' + n(p.name) : null;
    case 'lien': return p.href ? 'lien:' + n(p.href) : null;
    case 'envoi': return p.name ? 'envoi:' + n(p.name) : null;
    case 'ouverture': return 'ouverture:' + n(p.group) + ':' + n(p.id || p.label);
    case 'resultat': return p.name ? 'resultat:' + n(p.name) : null;
    case 'defilement': return 'defilement';
    case 'temps': return 'temps';
    case 'interactions': return 'interactions';
    case 'erreur404': return 'erreur404';
    default: return null;
  }
}

const vide = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

export async function onRequestPost({ request, env, waitUntil }) {
  if (!env.DB) return vide();
  const ua = request.headers.get('user-agent') || '';
  if (!ua || BOT.test(ua)) return vide();
  let d;
  try { d = JSON.parse(await request.text()); } catch (e) { return vide(); }
  if (!d || typeof d !== 'object') return vide();
  const type = EVTS[d.event];
  if (!type) return vide();
  const p = (d.props && typeof d.props === 'object') ? d.props : {};
  const evt = libelle(type, p);
  if (!evt) return vide();
  const page = chemin(d.page);
  if (!page) return vide();

  const now = new Date();
  const ts = now.toISOString().slice(0, 19).replace('T', ' ');
  const jour = ts.slice(0, 10);
  const session = /^[a-z0-9]{8,32}$/i.test(String(d.sid || '')) ? String(d.sid) : null;
  const entree = d.entree ? 1 : 0;
  let valeur = Number.isFinite(+d.valeur) ? Math.max(0, Math.min(Math.round(+d.valeur), 10000000)) : null;
  const detail = nettoie(d.detail, 200) || null;
  // Provenance : seulement pour la première page de la visite
  let source = null, us = null, um = null, uc = null;
  if (entree) {
    const ref = nettoie(d.ref, 120).toLowerCase().replace(/^www\./, '');
    source = ref || 'direct';
    us = nettoie(d.utm_source, 60) || null;
    um = nettoie(d.utm_medium, 60) || null;
    uc = nettoie(d.utm_campaign, 80) || null;
  }
  const cf = request.cf || {};
  const pays = nettoie(cf.country, 3) || null;

  const stmts = [
    env.DB.prepare(
      'INSERT INTO hits (ts, jour, session, page, evt, detail, valeur, source, utm_source, utm_medium, utm_campaign, pays, appareil, navigateur, os, entree) ' +
      'VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)'
    ).bind(ts, jour, session, page, evt, detail, valeur, source, us, um, uc, pays, appareil(ua), navigateur(ua), systeme(ua), entree)
  ];
  // Compteur agrégé historique (première version de la mesure, gardé pour la continuité)
  if (['vue', 'clic', 'lien', 'envoi', 'ouverture', 'resultat'].includes(type)) {
    stmts.push(env.DB.prepare(
      'INSERT INTO evenements (jour, page, evt, n) VALUES (?1, ?2, ?3, 1) ON CONFLICT (jour, page, evt) DO UPDATE SET n = n + 1'
    ).bind(jour, page, evt));
  }
  try { await env.DB.batch(stmts); } catch (e) {}

  // Purge des données de plus de 25 mois, de temps en temps
  if (Math.random() < 0.01) {
    const purge = env.DB.batch([
      env.DB.prepare("DELETE FROM hits WHERE jour < date('now', '-25 months')"),
      env.DB.prepare("DELETE FROM evenements WHERE jour < date('now', '-25 months')")
    ]).catch(() => {});
    if (waitUntil) waitUntil(purge);
  }
  return vide();
}
