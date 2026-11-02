// GET /api/admin/analyse?vue=...&du=AAAA-MM-JJ&au=AAAA-MM-JJ[&moi=1][&f.<dimension>=valeur|valeur2...]
// Toutes les vues acceptent les mêmes filtres croisés (f.page, f.source, f.pays, f.ville, f.organisation,
// f.appareil, f.navigateur, f.os, f.langue, f.campagne, f.entree, f.type_visiteur, f.visiteur, f.ip, f.evt...).
// Une valeur précédée de « ! » exclut au lieu d'inclure. moi=1 inclut les visites d'Arthur (exclues par défaut).
// Les robots sont toujours exclus.
import { json, autorise } from '../../../functions-lib/admin-auth.js';

const NA = "('vue','temps','defilement','interactions')";
const ASSETS = "('/api/ev','/interactions.js','/style.css','/script.js','/fonts/ibm-plex-sans-400.woff2','/fonts/newsreader-600.woff2')";
const OFF = "CASE WHEN substr(ts,6,5) BETWEEN '03-29' AND '10-25' THEN '+2 hours' ELSE '+1 hours' END";
// Expressions des dimensions, sur les colonnes de F (événements filtrés + attributs d'arrivée de la visite)
const DIMS = {
  jour: 'jour', semaine: "strftime('%Y-S%W', jour)", mois: 'substr(jour,1,7)',
  heure: `CAST(strftime('%H', ts, ${OFF}) AS INTEGER)`, jour_semaine: `CAST(strftime('%w', ts, ${OFF}) AS INTEGER)`,
  page: 'page', titre: "COALESCE(titre,'')", entree: "COALESCE(entree_page,'?')", source: "COALESCE(e_source,'inconnu')",
  campagne: "COALESCE(e_campagne,'')", utm_source: "COALESCE(e_utm_source,'')", referrer: "COALESCE(e_referrer,'')",
  pays: "COALESCE(pays,'?')", region: "COALESCE(region,'?')", ville: "COALESCE(ville,'?')", code_postal: "COALESCE(code_postal,'?')",
  organisation: "COALESCE(organisation,'?')", appareil: "COALESCE(appareil,'?')", navigateur: "COALESCE(navigateur,'?')",
  os: "COALESCE(os,'?')", langue: "COALESCE(substr(langue,1,2),'?')",
  ecran: "CASE WHEN ecran IS NULL THEN '?' WHEN CAST(ecran AS INTEGER)<600 THEN 'moins de 600 px' WHEN CAST(ecran AS INTEGER)<1024 THEN '600 à 1023 px' WHEN CAST(ecran AS INTEGER)<1440 THEN '1024 à 1439 px' ELSE '1440 px et plus' END",
  visiteur: "COALESCE(visiteur,'s:'||COALESCE(session,''))", session: "COALESCE(session,'')", ip: "COALESCE(ip,'?')", evt: 'evt',
  type_visiteur: "CASE WHEN visiteur IS NULL THEN 'inconnu' WHEN visiteur IN (SELECT visiteur FROM R) THEN 'revenant' ELSE 'nouveau' END"
};
const METRIQUES = {
  visiteurs: "COUNT(DISTINCT COALESCE(visiteur,'s:'||session))", visites: 'COUNT(DISTINCT session)',
  vues: "SUM(evt='vue')", actions: `SUM(evt NOT IN ${NA})`, clics: "SUM(evt LIKE 'clic:%' OR evt LIKE 'lien:%' OR evt LIKE 'bouton:%')",
  envois: "SUM(evt LIKE 'envoi:%')", temps_moyen: "ROUND(AVG(CASE WHEN evt='temps' THEN valeur END))",
  temps_total: "SUM(CASE WHEN evt='temps' THEN valeur ELSE 0 END)", lecture_moyenne: "ROUND(AVG(CASE WHEN evt='temps' THEN CAST(detail AS INTEGER) END))",
  usages_outil: "SUM(evt='interactions')", evenements: 'COUNT(*)'
};

function dates(url, shift) {
  const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  let au = ok(url.searchParams.get('au')) ? url.searchParams.get('au') : new Date().toISOString().slice(0, 10);
  let du = url.searchParams.get('du');
  if (!ok(du)) { const d = new Date(au + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 29); du = d.toISOString().slice(0, 10); }
  if (shift) {
    const n = Math.round((Date.parse(au) - Date.parse(du)) / 864e5) + 1;
    au = new Date(Date.parse(du) - 864e5).toISOString().slice(0, 10);
    du = new Date(Date.parse(du) - n * 864e5).toISOString().slice(0, 10);
  }
  return { du, au };
}

// CTE communes : R (visiteurs revenants), E (arrivée de chaque visite), F (événements de la période, filtrés), S (visites)
function base(url, shift) {
  const { du, au } = dates(url, shift);
  const moi = url.searchParams.get('moi') === '1';
  const binds = [du, au];
  let filt = '';
  for (const [k, v] of url.searchParams) {
    if (!k.startsWith('f.')) continue;
    const dim = k.slice(2);
    if (!DIMS[dim] || v === '') continue;
    const vals = v.split('|').slice(0, 50);
    const neg = vals[0].startsWith('!');
    if (neg) vals[0] = vals[0].slice(1);
    filt += ` AND ${DIMS[dim]} ${neg ? 'NOT ' : ''}IN (${vals.map(() => '?').join(',')})`;
    binds.push(...vals);
  }
  const sql = `WITH R AS (SELECT visiteur FROM hits WHERE visiteur IS NOT NULL AND robot=0 GROUP BY visiteur HAVING COUNT(DISTINCT session) > 1),
  E AS (SELECT session, MAX(page) AS entree_page, MAX(COALESCE(source,'inconnu')) AS e_source, MAX(utm_campaign) AS e_campagne,
        MAX(utm_source) AS e_utm_source, MAX(referrer) AS e_referrer
        FROM hits WHERE entree=1 AND evt='vue' AND session IS NOT NULL GROUP BY session),
  F0 AS (SELECT h.*, E.entree_page, E.e_source, E.e_campagne, E.e_utm_source, E.e_referrer FROM hits h LEFT JOIN E ON E.session = h.session
        WHERE h.jour BETWEEN ? AND ? AND h.robot = 0 ${moi ? '' : 'AND h.moi = 0'}),
  F AS (SELECT * FROM F0 WHERE 1=1 ${filt}),
  S AS (SELECT session, MIN(ts) debut, MAX(ts) fin, SUM(evt='vue') vues, SUM(CASE WHEN evt='temps' THEN valeur ELSE 0 END) secondes,
        SUM(evt NOT IN ${NA}) actions, SUM(evt LIKE 'envoi:%') envois, MAX(COALESCE(visiteur,'s:'||session)) visiteur,
        MAX(entree_page) entree_page, MAX(e_source) source, MAX(e_campagne) campagne, MAX(pays) pays, MAX(region) region, MAX(ville) ville,
        MAX(organisation) organisation, MAX(appareil) appareil, MAX(navigateur) navigateur, MAX(os) os, MAX(ip) ip, MAX(nouveau) nouveau
        FROM F WHERE session IS NOT NULL GROUP BY session) `;
  return { sql, binds, du, au };
}

export async function onRequestGet({ request, env }) {
  if (!(await autorise(request, env))) return json({ ok: false, error: 'Jeton refusé' }, 401);
  if (!env.DB) return json({ ok: false, error: 'Base non reliée au site' }, 503);
  const url = new URL(request.url);
  const vue = url.searchParams.get('vue') || 'resume';
  const B = base(url);
  const DB = env.DB;
  const q = async (sql, ...extra) => (await DB.prepare(B.sql + sql).bind(...B.binds, ...extra).all()).results || [];
  const raw = async (sql, ...b) => (await DB.prepare(sql).bind(...b).all()).results || [];
  const one = async (sql, ...extra) => (await q(sql, ...extra))[0] || {};
  const R = { ok: true, vue, du: B.du, au: B.au };
  const lim = (n, d, m) => Math.min(Math.max(parseInt(url.searchParams.get(n) || d, 10) || d, 0), m);
  const TOT = `SELECT COUNT(*) visites, COUNT(DISTINCT visiteur) visiteurs, SUM(vues) vues, ROUND(AVG(vues),2) pages_par_visite,
      ROUND(100.0*SUM(vues=1)/MAX(COUNT(*),1),1) rebond_pct, ROUND(AVG(secondes)) secondes_moy, SUM(actions) actions,
      SUM(envois) envois, SUM(actions>0) visites_avec_action, SUM(nouveau=1) nouveaux FROM S WHERE vues > 0`;

  try {
    if (vue === 'resume') {
      R.totaux = await one(TOT);
      R.revenants = (await one('SELECT COUNT(DISTINCT visiteur) n FROM F WHERE visiteur IN (SELECT visiteur FROM R)')).n || 0;
      const P = base(url, true);
      R.precedent = (await DB.prepare(P.sql + TOT).bind(...P.binds).all()).results[0] || {};
      R.precedent.du = P.du; R.precedent.au = P.au;
      R.topPages = await q("SELECT page, MAX(titre) titre, SUM(evt='vue') vues, COUNT(DISTINCT COALESCE(visiteur,session)) visiteurs FROM F GROUP BY page HAVING vues > 0 ORDER BY vues DESC LIMIT 10");
      R.topSources = await q("SELECT COALESCE(source,'inconnu') source, COUNT(*) visites, COUNT(DISTINCT visiteur) visiteurs FROM S GROUP BY 1 ORDER BY 2 DESC LIMIT 10");
      R.topActions = await q(`SELECT evt, MAX(detail) libelle, COUNT(*) n FROM F WHERE evt NOT IN ${NA} GROUP BY evt ORDER BY n DESC LIMIT 10`);
      R.topOrganisations = await q("SELECT COALESCE(organisation,'?') organisation, COUNT(DISTINCT visiteur) visiteurs, COUNT(*) visites FROM S GROUP BY 1 ORDER BY 3 DESC LIMIT 10");
    }

    else if (vue === 'serie') {
      const gk = url.searchParams.get('g') || 'jour';
      const g = { jour: 'jour', semaine: "strftime('%Y-S%W', jour)", mois: 'substr(jour,1,7)', heure: `strftime('%Y-%m-%d %H', ts, ${OFF})` }[gk] || 'jour';
      R.g = gk;
      R.lignes = await q(`SELECT ${g} t, ${METRIQUES.visiteurs} visiteurs, ${METRIQUES.visites} visites, ${METRIQUES.vues} vues, ${METRIQUES.actions} actions,
          ${METRIQUES.envois} envois, ${METRIQUES.temps_moyen} temps_moyen FROM F GROUP BY 1 ORDER BY 1`);
      R.v1 = await raw("SELECT jour, SUM(CASE WHEN evt='vue' THEN n ELSE 0 END) vues FROM evenements WHERE jour BETWEEN ? AND ? GROUP BY jour ORDER BY jour", B.du, B.au);
      R.cf = await raw("SELECT jour, SUM(n) n, SUM(visites) visites FROM historique WHERE source='cf_web' AND dimension='path' AND jour BETWEEN ? AND ? GROUP BY jour ORDER BY jour", B.du, B.au);
      R.li = await raw('SELECT jour, impressions, engagements, nouveaux_abonnes FROM li_jour WHERE jour BETWEEN ? AND ? ORDER BY jour', B.du, B.au);
      R.recherche = await raw("SELECT moteur, jour, clics, impressions FROM recherche WHERE dimension='total' AND jour BETWEEN ? AND ? ORDER BY jour", B.du, B.au);
      R.posts = await raw('SELECT urn, publie_le, titre FROM li_posts WHERE substr(publie_le,1,10) BETWEEN ? AND ? ORDER BY publie_le', B.du, B.au);
    }

    else if (vue === 'explorer') {
      const d1 = DIMS[url.searchParams.get('d1')] ? url.searchParams.get('d1') : 'page';
      const d2 = DIMS[url.searchParams.get('d2')] ? url.searchParams.get('d2') : null;
      const ms = (url.searchParams.get('m') || 'visiteurs,visites,vues').split(',').filter(m => METRIQUES[m]).slice(0, 8);
      if (!ms.length) ms.push('vues');
      R.d1 = d1; R.d2 = d2; R.m = ms;
      R.lignes = await q(`SELECT ${DIMS[d1]} d1${d2 ? `, ${DIMS[d2]} d2` : ''}, ${ms.map(m => `${METRIQUES[m]} ${m}`).join(', ')}
          FROM F GROUP BY 1${d2 ? ', 2' : ''} ORDER BY ${ms[0]} DESC LIMIT 5000`);
    }

    else if (vue === 'filtres') {
      const dim = url.searchParams.get('dim');
      if (!DIMS[dim]) return json({ ok: false, error: 'Dimension inconnue' }, 400);
      R.valeurs = await q(`SELECT ${DIMS[dim]} v, COUNT(*) n FROM F GROUP BY 1 ORDER BY 2 DESC LIMIT 500`);
    }

    else if (vue === 'pages') {
      R.lignes = await q(`, SO AS (SELECT page, COUNT(*) n FROM (SELECT page, ROW_NUMBER() OVER (PARTITION BY session ORDER BY ts DESC, id DESC) rn
              FROM F WHERE evt='vue' AND session IS NOT NULL) WHERE rn=1 GROUP BY page)
          SELECT F.page, MAX(F.titre) titre, SUM(F.evt='vue') vues, COUNT(DISTINCT CASE WHEN F.evt='vue' THEN COALESCE(F.visiteur,F.session) END) visiteurs,
            COUNT(DISTINCT CASE WHEN F.evt='vue' THEN F.session END) visites, SUM(F.evt='vue' AND F.entree=1) entrees, COALESCE(MAX(SO.n),0) sorties,
            ROUND(AVG(CASE WHEN F.evt='temps' THEN F.valeur END)) secondes_moy, ROUND(AVG(CASE WHEN F.evt='temps' THEN CAST(F.detail AS INTEGER) END)) defilement_moy,
            SUM(F.evt='defilement' AND F.valeur=100) lu_en_entier, SUM(F.evt LIKE 'clic:%' OR F.evt LIKE 'lien:%' OR F.evt LIKE 'bouton:%') clics,
            SUM(F.evt='interactions') usages_outil, ROUND(AVG(CASE WHEN F.evt='vue' THEN F.valeur END)) chargement_ms
          FROM F LEFT JOIN SO ON SO.page = F.page GROUP BY F.page ORDER BY vues DESC, F.page`);
    }

    else if (vue === 'page') {
      const p = url.searchParams.get('p') || '/';
      R.page = p;
      R.titre = (await one('SELECT MAX(titre) t FROM F WHERE page = ?', p)).t || null;
      R.parJour = await q("SELECT jour, SUM(evt='vue') vues, COUNT(DISTINCT CASE WHEN evt='vue' THEN COALESCE(visiteur,session) END) visiteurs FROM F WHERE page = ? GROUP BY jour ORDER BY jour", p);
      R.v1 = await raw("SELECT jour, n vues FROM evenements WHERE page = ? AND evt='vue' AND jour BETWEEN ? AND ? ORDER BY jour", p, B.du, B.au);
      R.cf = await raw("SELECT jour, n FROM historique WHERE source='cf_web' AND dimension='path' AND valeur = ? AND jour BETWEEN ? AND ? ORDER BY jour", p, B.du, B.au);
      R.entrees = await q("SELECT COALESCE(e_source,'inconnu') source, COUNT(*) n FROM F WHERE page = ? AND entree=1 AND evt='vue' GROUP BY 1 ORDER BY 2 DESC", p);
      const seq = "SELECT page, LAG(page) OVER w avant, LEAD(page) OVER w apres FROM F WHERE evt='vue' AND session IS NOT NULL WINDOW w AS (PARTITION BY session ORDER BY ts, id)";
      R.avant = await q(`SELECT COALESCE(avant,'(arrivée sur le site)') page, COUNT(*) n FROM (${seq}) WHERE page = ? GROUP BY 1 ORDER BY 2 DESC`, p);
      R.apres = await q(`SELECT COALESCE(apres,'(sortie du site)') page, COUNT(*) n FROM (${seq}) WHERE page = ? GROUP BY 1 ORDER BY 2 DESC`, p);
      R.actions = await q("SELECT evt, MAX(detail) libelle, COUNT(*) n, COUNT(DISTINCT session) visites FROM F WHERE page = ? AND evt NOT IN ('vue','temps','defilement') GROUP BY evt ORDER BY n DESC", p);
      R.defilement = await q("SELECT valeur palier, COUNT(*) n FROM F WHERE page = ? AND evt='defilement' GROUP BY valeur ORDER BY valeur", p);
      R.temps = await q(`SELECT CASE WHEN valeur<10 THEN 'moins de 10 s' WHEN valeur<30 THEN '10 à 30 s' WHEN valeur<60 THEN '30 s à 1 min'
            WHEN valeur<180 THEN '1 à 3 min' WHEN valeur<600 THEN '3 à 10 min' ELSE 'plus de 10 min' END tranche, COUNT(*) n, MIN(valeur) ordre
          FROM F WHERE page = ? AND evt='temps' GROUP BY 1 ORDER BY ordre`, p);
      R.appareils = await q("SELECT COALESCE(appareil,'?') appareil, COUNT(*) n FROM F WHERE page = ? AND evt='vue' GROUP BY 1 ORDER BY 2 DESC", p);
      R.villes = await q("SELECT COALESCE(ville,'?') ville, COALESCE(pays,'?') pays, COUNT(*) n FROM F WHERE page = ? AND evt='vue' GROUP BY 1,2 ORDER BY 3 DESC", p);
      R.organisations = await q("SELECT COALESCE(organisation,'?') organisation, COUNT(DISTINCT COALESCE(visiteur,session)) visiteurs, COUNT(*) vues FROM F WHERE page = ? AND evt='vue' GROUP BY 1 ORDER BY 3 DESC", p);
      R.sessions = await q('SELECT S.* FROM S WHERE session IN (SELECT session FROM F WHERE page = ?) ORDER BY debut DESC LIMIT 2000', p);
    }

    else if (vue === 'sources') {
      R.lignes = await q(`SELECT COALESCE(source,'inconnu') source, COALESCE(campagne,'') campagne, COUNT(*) visites, COUNT(DISTINCT visiteur) visiteurs,
          SUM(vues) vues, ROUND(AVG(vues),2) pages_par_visite, ROUND(AVG(secondes)) secondes_moy, SUM(actions) actions, SUM(envois) envois,
          ROUND(100.0*SUM(vues=1)/COUNT(*),1) rebond_pct FROM S GROUP BY 1,2 ORDER BY visites DESC`);
      R.referrers = await q("SELECT e_referrer referrer, COUNT(DISTINCT session) visites FROM F WHERE entree=1 AND evt='vue' AND e_referrer IS NOT NULL AND e_referrer<>'' GROUP BY 1 ORDER BY 2 DESC");
      R.cf = await raw("SELECT valeur source, SUM(n) n FROM historique WHERE source='cf_web' AND dimension='ref' AND jour BETWEEN ? AND ? GROUP BY valeur ORDER BY n DESC", B.du, B.au);
    }

    else if (vue === 'source') {
      const s = url.searchParams.get('s') || 'direct';
      R.source = s;
      const IN = "session IN (SELECT session FROM S WHERE COALESCE(source,'inconnu') = ?)";
      R.parJour = await q("SELECT substr(debut,1,10) jour, COUNT(*) visites FROM S WHERE COALESCE(source,'inconnu') = ? GROUP BY 1 ORDER BY 1", s);
      R.entrees = await q("SELECT entree_page page, COUNT(*) n FROM S WHERE COALESCE(source,'inconnu') = ? GROUP BY 1 ORDER BY 2 DESC", s);
      R.pages = await q(`SELECT page, COUNT(*) n FROM F WHERE evt='vue' AND ${IN} GROUP BY page ORDER BY n DESC`, s);
      R.actions = await q(`SELECT evt, MAX(detail) libelle, COUNT(*) n FROM F WHERE evt NOT IN ${NA} AND ${IN} GROUP BY evt ORDER BY n DESC`, s);
      R.referrers = await q("SELECT COALESCE(e_referrer,'') referrer, COUNT(DISTINCT session) n FROM F WHERE entree=1 AND evt='vue' AND COALESCE(e_source,'inconnu') = ? GROUP BY 1 ORDER BY 2 DESC", s);
      R.campagnes = await q("SELECT COALESCE(utm_source,'') utm_source, COALESCE(utm_medium,'') utm_medium, COALESCE(utm_campaign,'') utm_campaign, COUNT(*) n FROM F WHERE entree=1 AND evt='vue' AND COALESCE(e_source,'inconnu') = ? GROUP BY 1,2,3 ORDER BY n DESC", s);
      R.sessions = await q("SELECT * FROM S WHERE COALESCE(source,'inconnu') = ? ORDER BY debut DESC LIMIT 2000", s);
    }

    else if (vue === 'actions') {
      R.lignes = await q("SELECT evt, MAX(detail) libelle, COUNT(*) n, COUNT(DISTINCT session) visites, COUNT(DISTINCT COALESCE(visiteur,session)) visiteurs, COUNT(DISTINCT page) pages, MAX(ts) dernier FROM F WHERE evt NOT IN ('vue','temps','defilement') GROUP BY evt ORDER BY n DESC, evt");
      R.v1 = await raw("SELECT evt, page, SUM(n) n FROM evenements WHERE jour BETWEEN ? AND ? AND evt<>'vue' GROUP BY evt, page ORDER BY n DESC", B.du, B.au);
    }

    else if (vue === 'action') {
      const e = url.searchParams.get('e') || '';
      R.evt = e;
      R.parJour = await q('SELECT jour, COUNT(*) n FROM F WHERE evt = ? GROUP BY jour ORDER BY jour', e);
      R.pages = await q('SELECT page, COUNT(*) n, COUNT(DISTINCT session) visites FROM F WHERE evt = ? GROUP BY page ORDER BY n DESC', e);
      R.details = await q("SELECT COALESCE(detail,'') detail, valeur, COUNT(*) n FROM F WHERE evt = ? GROUP BY 1,2 ORDER BY n DESC", e);
      R.sessions = await q('SELECT S.* FROM S WHERE session IN (SELECT session FROM F WHERE evt = ?) ORDER BY debut DESC LIMIT 2000', e);
    }

    else if (vue === 'sessions') {
      const l = lim('limite', 200, 5000), o = lim('depart', 0, 1e9);
      R.total = (await one('SELECT COUNT(*) n FROM S')).n || 0;
      R.lignes = await q('SELECT * FROM S ORDER BY debut DESC LIMIT ? OFFSET ?', l, o);
      R.limite = l; R.depart = o;
    }

    else if (vue === 'session') {
      const id = url.searchParams.get('id') || '';
      R.session = id;
      R.evenements = await raw(`SELECT id, ts, page, titre, url, evt, detail, valeur, source, referrer, utm_source, utm_medium, utm_campaign, pays, region, ville,
          code_postal, organisation, asn, ip, appareil, navigateur, os, ua, langue, ecran, entree, visiteur, nouveau, moi FROM hits WHERE session = ? ORDER BY ts, id`, id);
    }

    else if (vue === 'visiteurs') {
      const l = lim('limite', 500, 5000), o = lim('depart', 0, 1e9);
      R.total = (await one('SELECT COUNT(DISTINCT visiteur) n FROM S')).n || 0;
      R.lignes = await q(`SELECT visiteur, COUNT(*) visites, SUM(vues) vues, SUM(actions) actions, SUM(secondes) secondes, MIN(debut) premier, MAX(debut) dernier,
          MAX(organisation) organisation, MAX(ville) ville, MAX(pays) pays, MAX(appareil) appareil, GROUP_CONCAT(DISTINCT source) sources, COUNT(DISTINCT ip) ips
          FROM S GROUP BY visiteur ORDER BY dernier DESC LIMIT ? OFFSET ?`, l, o);
      R.limite = l; R.depart = o;
    }

    else if (vue === 'visiteur') {
      const v = url.searchParams.get('v') || '';
      R.visiteur = v;
      const cond = v.startsWith('s:') ? 'session = ?' : 'visiteur = ?';
      const val = v.startsWith('s:') ? v.slice(2) : v;
      R.visites = await raw(`SELECT session, MIN(ts) debut, MAX(ts) fin, SUM(evt='vue') vues, SUM(CASE WHEN evt='temps' THEN valeur ELSE 0 END) secondes,
          SUM(evt NOT IN ${NA}) actions, MAX(CASE WHEN entree=1 THEN page END) entree_page, MAX(CASE WHEN entree=1 THEN source END) source,
          MAX(ip) ip, MAX(ville) ville, MAX(organisation) organisation, MAX(appareil) appareil, MAX(navigateur) navigateur, MAX(moi) moi
          FROM hits WHERE ${cond} GROUP BY session ORDER BY debut DESC`, val);
      R.pages = await raw(`SELECT page, MAX(titre) titre, COUNT(*) vues FROM hits WHERE ${cond} AND evt='vue' GROUP BY page ORDER BY vues DESC`, val);
      R.actions = await raw(`SELECT evt, MAX(detail) libelle, COUNT(*) n FROM hits WHERE ${cond} AND evt NOT IN ${NA} GROUP BY evt ORDER BY n DESC`, val);
      R.ips = await raw(`SELECT ip, MAX(organisation) organisation, MAX(ville) ville, MAX(code_postal) code_postal, MAX(pays) pays, COUNT(*) n, MIN(ts) premier, MAX(ts) dernier FROM hits WHERE ${cond} GROUP BY ip ORDER BY dernier DESC`, val);
    }

    else if (vue === 'audience') {
      const c = (expr) => q(`SELECT ${expr} valeur, COUNT(*) visites, COUNT(DISTINCT visiteur) visiteurs FROM S GROUP BY 1 ORDER BY 2 DESC`);
      R.pays = await c("COALESCE(pays,'?')"); R.regions = await c("COALESCE(region,'?')"); R.villes = await c("COALESCE(ville,'?')");
      R.organisations = await c("COALESCE(organisation,'?')"); R.appareils = await c("COALESCE(appareil,'?')");
      R.navigateurs = await c("COALESCE(navigateur,'?')"); R.systemes = await c("COALESCE(os,'?')");
      R.langues = await q("SELECT COALESCE(substr(langue,1,2),'?') valeur, COUNT(DISTINCT session) visites FROM F WHERE evt='vue' GROUP BY 1 ORDER BY 2 DESC");
      R.ecrans = await q(`SELECT ${DIMS.ecran} valeur, COUNT(DISTINCT session) visites FROM F WHERE evt='vue' GROUP BY 1 ORDER BY 2 DESC`);
      R.types = await q(`SELECT ${DIMS.type_visiteur} valeur, COUNT(DISTINCT COALESCE(visiteur,session)) visiteurs FROM F GROUP BY 1`);
      R.heures = await q(`SELECT ${DIMS.jour_semaine} js, ${DIMS.heure} h, SUM(evt='vue') vues FROM F GROUP BY 1,2`);
      R.cf = await raw("SELECT dimension, valeur, SUM(n) n FROM historique WHERE source='cf_web' AND dimension IN ('pays','appareil','navigateur','os') AND jour BETWEEN ? AND ? GROUP BY 1,2 ORDER BY 1, 3 DESC", B.du, B.au);
    }

    else if (vue === 'entonnoirs') {
      const S1 = async (cond) => (await one(`SELECT COUNT(DISTINCT session) n FROM F WHERE session IS NOT NULL AND ${cond}`)).n || 0;
      const AI = "session IN (SELECT session FROM F WHERE evt='vue' AND page LIKE '/decryptages/ai-act%')";
      R.site = [['Visites', await S1("evt='vue'")], ['ont vu les missions', await S1("evt='vue' AND page='/missions'")],
        ['ont ouvert contact ou rendez-vous', await S1("evt='vue' AND page IN ('/contact','/rendez-vous')")],
        ['ont envoyé un formulaire ou réservé', await S1("(evt LIKE 'envoi:%' OR evt LIKE 'clic:%cal%' OR evt LIKE 'lien:cal.eu%')")]];
      R.aiact = [['Visites sur le décryptage AI Act', await S1("evt='vue' AND page LIKE '/decryptages/ai-act%'")],
        ['ont ouvert au moins un outil', await S1("evt='vue' AND page LIKE '/decryptages/ai-act/_%'")],
        ['ont utilisé un outil', await S1("evt='interactions' AND page LIKE '/decryptages/ai-act/%'")],
        ['ont terminé le parcours de qualification', await S1("evt LIKE 'resultat:%'")],
        ['ont cliqué vers les missions', await S1(`evt LIKE '%missions%' AND evt NOT IN ${NA} AND ${AI}`)],
        ['ont ouvert un graphe Hellixmap', await S1(`(evt LIKE '%/graphe%' OR evt LIKE '%hellixmap%') AND ${AI}`)],
        ['se sont inscrits à l\'alerte', await S1("evt='envoi:aiact-alerte'")], ['ont écrit via le formulaire', await S1("evt='envoi:aiact-question'")]];
      R.resultats = await q("SELECT evt, COUNT(*) n FROM F WHERE evt LIKE 'resultat:%' GROUP BY evt ORDER BY n DESC");
      // entonnoir libre : etapes=page1|page2|page3 (pages vues dans cet ordre au cours d'une visite)
      const et = (url.searchParams.get('etapes') || '').split('|').filter(Boolean).slice(0, 8);
      if (et.length) {
        const rows = await q("SELECT session, page FROM F WHERE evt='vue' AND session IS NOT NULL ORDER BY session, ts, id");
        const paths = new Map(); for (const r of rows) { const a = paths.get(r.session) || []; a.push(r.page); paths.set(r.session, a); }
        const cnt = et.map(() => 0);
        for (const ps of paths.values()) { let k = 0; for (const pg of ps) { if (k < et.length && pg === et[k]) { cnt[k]++; k++; } } }
        R.libre = et.map((pg, i) => [pg, cnt[i]]);
      }
    }

    else if (vue === 'parcours') {
      const etapes = Math.max(2, lim('etapes', 5, 8)), top = Math.max(2, lim('top', 8, 25));
      const rows = await q("SELECT session, page FROM F WHERE evt='vue' AND session IS NOT NULL ORDER BY session, ts, id");
      const paths = new Map();
      for (const r of rows) { const a = paths.get(r.session) || []; if (a[a.length - 1] !== r.page) a.push(r.page); paths.set(r.session, a); }
      const freq = Array.from({ length: etapes }, () => new Map());
      for (const p of paths.values()) p.slice(0, etapes).forEach((pg, i) => freq[i].set(pg, (freq[i].get(pg) || 0) + 1));
      const keep = freq.map(m => new Set([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(x => x[0])));
      const nom = (i, pg) => keep[i].has(pg) ? pg : '(autres pages)';
      const links = new Map(), nodes = new Map();
      const add = (m, k) => m.set(k, (m.get(k) || 0) + 1);
      for (const p of paths.values()) {
        const s = p.slice(0, etapes);
        s.forEach((pg, i) => add(nodes, i + '\u0001' + nom(i, pg)));
        s.forEach((pg, i) => {
          const a = i + '\u0001' + nom(i, pg);
          if (i + 1 < s.length) add(links, a + '\u0002' + (i + 1) + '\u0001' + nom(i + 1, s[i + 1]));
          else if (i + 1 < etapes && p.length === s.length) { add(links, a + '\u0002' + (i + 1) + '\u0001(sortie)'); add(nodes, (i + 1) + '\u0001(sortie)'); }
        });
      }
      R.noeuds = [...nodes.entries()].map(([k, n]) => { const [i, pg] = k.split('\u0001'); return { etape: +i, page: pg, n }; });
      R.liens = [...links.entries()].map(([k, n]) => { const [a, b] = k.split('\u0002'); const [i, p1] = a.split('\u0001'); const p2 = b.split('\u0001')[1]; return { etape: +i, de: p1, a: p2, n }; });
      const tr = new Map();
      for (const p of paths.values()) for (let i = 0; i < p.length; i++) add(tr, p[i] + '\u0002' + (p[i + 1] || '(sortie)'));
      R.transitions = [...tr.entries()].map(([k, n]) => { const [de, a] = k.split('\u0002'); return { de, a, n }; }).sort((x, y) => y.n - x.n);
      const ch = new Map();
      for (const p of paths.values()) add(ch, p.slice(0, 6).join(' → ') + (p.length > 6 ? ' → …' : ''));
      R.chemins = [...ch.entries()].map(([chemin, n]) => ({ chemin, n })).sort((a, b) => b.n - a.n).slice(0, 500);
      R.visites = paths.size;
      R.titres = await q('SELECT page, MAX(titre) titre FROM F WHERE titre IS NOT NULL GROUP BY page');
    }

    else if (vue === 'clics') {
      const p = url.searchParams.get('p') || '/';
      R.page = p;
      R.points = await q('SELECT x, y, evt, detail, ecran, appareil FROM F WHERE page = ? AND x IS NOT NULL AND y IS NOT NULL LIMIT 20000', p);
      R.cibles = await q("SELECT evt, MAX(detail) libelle, COUNT(*) n, COUNT(DISTINCT COALESCE(visiteur,session)) visiteurs FROM F WHERE page = ? AND (evt LIKE 'clic:%' OR evt LIKE 'lien:%' OR evt LIKE 'bouton:%') GROUP BY evt ORDER BY n DESC", p);
      R.defilement = await q("SELECT valeur palier, COUNT(*) n FROM F WHERE page = ? AND evt='defilement' GROUP BY valeur ORDER BY valeur", p);
      R.vues = (await one("SELECT SUM(evt='vue') n FROM F WHERE page = ?", p)).n || 0;
    }

    else if (vue === 'historique') {
      R.lignes = await raw('SELECT source, jour, dimension, valeur, n, visites FROM historique WHERE jour BETWEEN ? AND ? ORDER BY jour, source, dimension, n DESC', B.du, B.au);
    }

    else if (vue === 'recherche') {
      R.lignes = await raw('SELECT * FROM recherche ORDER BY moteur, dimension, jour, clics DESC, impressions DESC');
      R.siteDepuisRecherche = await q("SELECT COALESCE(source,'inconnu') source, COUNT(*) visites, SUM(vues) vues FROM S WHERE source LIKE '%google%' OR source LIKE '%bing%' OR source LIKE '%duckduckgo%' OR source LIKE '%qwant%' OR source LIKE '%ecosia%' OR source LIKE '%yahoo%' GROUP BY 1 ORDER BY 2 DESC");
    }

    else if (vue === 'serveur') {
      // Requêtes de pages reçues par Cloudflare (table cf_requetes, recopiée chaque semaine, 31 jours glissants chez Cloudflare).
      // humain : 0 robot ou parasite, 1 navigateur probable, 2 confirmé (a chargé polices / style / script le même jour).
      const niv = lim('niveau', 2, 2);
      const PG = `page NOT IN ${ASSETS}`;
      R.niveau = niv;
      R.couverture = (await raw('SELECT MIN(jour) du, MAX(jour) au, COUNT(*) lignes FROM cf_requetes'))[0] || {};
      R.totaux = await raw(`SELECT humain, SUM(n) vues, COUNT(DISTINCT ip) ips FROM cf_requetes WHERE ${PG} AND jour BETWEEN ? AND ? GROUP BY humain`, B.du, B.au);
      R.parJour = await raw(`SELECT jour, SUM(CASE WHEN humain=2 THEN n ELSE 0 END) vues_confirmees, COUNT(DISTINCT CASE WHEN humain=2 THEN ip END) ips_confirmees,
          SUM(CASE WHEN humain>=1 THEN n ELSE 0 END) vues_probables, COUNT(DISTINCT CASE WHEN humain>=1 THEN ip END) ips_probables, SUM(n) vues_toutes
          FROM cf_requetes WHERE ${PG} AND jour BETWEEN ? AND ? GROUP BY jour ORDER BY jour`, B.du, B.au);
      R.ips = await raw(`SELECT ip, MIN(ts) premier, MAX(ts) dernier, COUNT(DISTINCT jour) jours, SUM(n) vues, COUNT(DISTINCT page) pages, MAX(pays) pays,
          MAX(appareil) appareil, MAX(ua) ua, MAX(humain) humain, MAX(echantillon) echantillon,
          EXISTS (SELECT 1 FROM hits h WHERE h.ip = c.ip) mesure_site, EXISTS (SELECT 1 FROM exclusions x WHERE x.type='ip' AND x.valeur = c.ip) exclue,
          (SELECT group_concat(page, ' · ') FROM (SELECT page FROM cf_requetes c2 WHERE c2.ip = c.ip AND c2.page NOT IN ${ASSETS} AND c2.jour BETWEEN ?1 AND ?2 GROUP BY page ORDER BY SUM(n) DESC LIMIT 4)) top_pages
          FROM cf_requetes c WHERE ${PG} AND jour BETWEEN ?1 AND ?2 AND humain >= ?3 GROUP BY ip ORDER BY dernier DESC LIMIT 5000`, B.du, B.au, niv);
      R.pages = await raw(`SELECT page, SUM(n) vues, COUNT(DISTINCT ip) ips FROM cf_requetes WHERE ${PG} AND jour BETWEEN ? AND ? AND humain >= ? GROUP BY page ORDER BY vues DESC LIMIT 500`, B.du, B.au, niv);
    }

    else if (vue === 'ip') {
      const ip = (url.searchParams.get('ip') || '').slice(0, 64);
      R.ip = ip;
      R.requetes = await raw('SELECT ts, hote, page, ua, pays, appareil, statut, robot_verifie, n, echantillon, humain FROM cf_requetes WHERE ip = ? ORDER BY ts', ip);
      R.visites = await raw(`SELECT session, MIN(ts) debut, MAX(visiteur) visiteur, SUM(evt='vue') vues, MAX(organisation) organisation, MAX(ville) ville, MAX(code_postal) code_postal,
          MAX(appareil) appareil, MAX(moi) moi FROM hits WHERE ip = ? GROUP BY session ORDER BY debut DESC LIMIT 500`, ip);
      R.exclue = !!(await raw("SELECT 1 x FROM exclusions WHERE type='ip' AND valeur = ?", ip)).length;
    }

    else if (vue === 'brut') {
      const l = lim('limite', 500, 10000), o = lim('depart', 0, 1e9);
      R.total = (await one('SELECT COUNT(*) n FROM F')).n || 0;
      R.lignes = await q(`SELECT id, ts, session, visiteur, page, evt, detail, valeur, e_source source, utm_campaign, pays, region, ville, organisation, ip,
          appareil, navigateur, os, langue, ecran, entree, nouveau, moi FROM F ORDER BY id DESC LIMIT ? OFFSET ?`, l, o);
      R.limite = l; R.depart = o;
    }

    else return json({ ok: false, error: 'Vue inconnue' }, 400);
  } catch (e) {
    return json({ ok: false, error: 'Requête impossible : ' + String(e && e.message || e).slice(0, 300) }, 500);
  }
  return json(R);
}
