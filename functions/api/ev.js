// POST /api/ev : mesure d'audience de noumensia.com.
// Chaque événement est gardé en entier, sans durée de conservation automatique :
// page, adresse et titre, visiteur (identifiant tiré au hasard et gardé dans le navigateur),
// visite (session de 30 minutes d'inactivité), provenance complète, adresse IP et ce que
// Cloudflare en déduit (pays, région, ville, code postal, réseau / organisation, fuseau),
// navigateur complet, langue, largeur d'écran, position des clics.
// Les visites d'Arthur (appareil marqué ou IP exclue) sont gardées mais marquées moi = 1.

const EVTS = { view: 'vue', click: 'clic', link: 'lien', button: 'bouton', submit: 'envoi', open: 'ouverture',
  resultat: 'resultat', scroll: 'defilement', temps: 'temps', interactions: 'interactions', notfound: 'erreur404' };

const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|monitor|curl|wget|python|httpclient|facebookexternalhit|embedly|quora|whatsapp|telegram|discord|skype|bingpreview|petalbot|semrush|ahrefs|yandex|baidu|bytespider|gptbot|claudebot|perplexity|ccbot/i;

function nettoie(s, max) {
  return String(s == null ? '' : s).trim().replace(/[\u0000-\u001f<>]/g, '').slice(0, max || 120);
}
function chemin(p) {
  let s = String(p || '/').split('#')[0].split('?')[0].slice(0, 200);
  if (!s.startsWith('/') || s.startsWith('//') || s.includes('\\')) return null;
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
  if (/linkedinapp/i.test(ua)) return 'Appli LinkedIn';
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
    case 'vue': case 'defilement': case 'temps': case 'interactions': case 'erreur404': return type;
    case 'clic': return p.name ? 'clic:' + n(p.name) : null;
    case 'lien': return p.href ? 'lien:' + n(p.href) : null;
    case 'bouton': return 'bouton:' + (n(p.name) || 'sans nom');
    case 'envoi': return p.name ? 'envoi:' + n(p.name) : null;
    case 'ouverture': return 'ouverture:' + n(p.group) + ':' + n(p.id || p.label);
    case 'resultat': return p.name ? 'resultat:' + n(p.name) : null;
    default: return null;
  }
}
const ID = (s) => /^[a-z0-9]{8,40}$/i.test(String(s || '')) ? String(s) : null;
const vide = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

export async function onRequestPost({ request, env }) {
  if (!env.DB) return vide();
  const ua = request.headers.get('user-agent') || '';
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

  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const jour = ts.slice(0, 10);
  const session = ID(d.sid), visiteur = ID(d.vid);
  const entree = d.entree ? 1 : 0;
  const num = (v, max) => (v == null || v === '' || !Number.isFinite(+v)) ? null : Math.max(0, Math.min(+v, max));
  const valeur = num(d.valeur, 1e9) == null ? null : Math.round(num(d.valeur, 1e9));
  const detail = nettoie(d.detail, 300) || null;
  let source = null, us = null, um = null, uc = null, referrer = null;
  if (entree) {
    source = nettoie(d.ref, 160).toLowerCase().replace(/^www\./, '') || 'direct';
    referrer = nettoie(d.ref_complet, 500) || null;
    us = nettoie(d.utm_source, 80) || null;
    um = nettoie(d.utm_medium, 80) || null;
    uc = nettoie(d.utm_campaign, 120) || null;
  }
  const cf = request.cf || {};
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || null;
  const robot = (!ua || BOT.test(ua)) ? 1 : 0;

  let moi = d.moi ? 1 : 0;
  if (!moi && (ip || visiteur)) {
    try {
      const ex = await env.DB.prepare("SELECT 1 FROM exclusions WHERE (type='ip' AND valeur=?1) OR (type='visiteur' AND valeur=?2) LIMIT 1")
        .bind(ip || '', visiteur || '').first();
      if (ex) moi = 1;
    } catch (e) {}
  }

  const cols = {
    ts, jour, session, page, evt, detail, valeur, source, utm_source: us, utm_medium: um, utm_campaign: uc,
    pays: nettoie(cf.country, 3) || null, appareil: appareil(ua), navigateur: navigateur(ua), os: systeme(ua), entree,
    visiteur, ip, ua: nettoie(ua, 400) || null, ville: nettoie(cf.city, 80) || null, region: nettoie(cf.region, 80) || null,
    code_postal: nettoie(cf.postalCode, 12) || null, asn: Number.isFinite(+cf.asn) ? +cf.asn : null,
    organisation: nettoie(cf.asOrganization, 120) || null, fuseau: nettoie(cf.timezone, 60) || null,
    langue: nettoie(d.langue, 20) || null, ecran: num(d.ecran, 20000) == null ? null : String(Math.round(num(d.ecran, 20000))),
    moi, url: nettoie(d.url, 500) || null, referrer, titre: nettoie(d.titre, 200) || null,
    x: num(d.x, 1), y: num(d.y, 1), lat: cf.latitude != null ? +cf.latitude : null, lon: cf.longitude != null ? +cf.longitude : null,
    nouveau: d.nouveau ? 1 : 0, robot
  };
  const names = Object.keys(cols);
  const stmts = [env.DB.prepare(`INSERT INTO hits (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`).bind(...names.map(k => cols[k]))];
  if (!robot && !moi && ['vue', 'clic', 'lien', 'envoi', 'ouverture', 'resultat'].includes(type)) {
    stmts.push(env.DB.prepare('INSERT INTO evenements (jour, page, evt, n) VALUES (?1, ?2, ?3, 1) ON CONFLICT (jour, page, evt) DO UPDATE SET n = n + 1').bind(jour, page, evt));
  }
  try { await env.DB.batch(stmts); } catch (e) {}
  return vide();
}
