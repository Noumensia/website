// GET /api/admin/analyse?vue=...&du=AAAA-MM-JJ&au=AAAA-MM-JJ
// Vues : resume, pages, page (p=), sources, source (s=), actions, action (e=), sessions, session (id=),
//        audience, entonnoirs, historique, brut. Toutes les listes sont exhaustives (sauf sessions et brut, paginées).
import { json, autorise } from '../../../functions-lib/admin-auth.js';

const NON_ACTIONS = "('vue','temps','defilement','interactions')";

function plage(url) {
  const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  const au = ok(url.searchParams.get('au')) ? url.searchParams.get('au') : new Date().toISOString().slice(0, 10);
  let du = url.searchParams.get('du');
  if (!ok(du)) { const d = new Date(au + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 29); du = d.toISOString().slice(0, 10); }
  return { du, au };
}

export async function onRequestGet({ request, env }) {
  if (!(await autorise(request, env))) return json({ ok: false, error: 'Jeton refusé' }, 401);
  if (!env.DB) return json({ ok: false, error: 'Base non reliée au site' }, 503);
  const url = new URL(request.url);
  const vue = url.searchParams.get('vue') || 'resume';
  const { du, au } = plage(url);
  const DB = env.DB;
  const q = async (sql, ...b) => (await DB.prepare(sql).bind(...b).all()).results || [];
  const one = async (sql, ...b) => (await q(sql, ...b))[0] || {};
  const R = { ok: true, vue, du, au };

  // Sessions de la période, avec leur page d'entrée et leur provenance
  const SESS = `WITH s AS (
      SELECT session, MIN(ts) debut, MAX(ts) fin, SUM(evt='vue') vues,
             SUM(CASE WHEN evt='temps' THEN valeur ELSE 0 END) secondes,
             SUM(evt NOT IN ${NON_ACTIONS}) actions
      FROM hits WHERE jour BETWEEN ?1 AND ?2 AND session IS NOT NULL GROUP BY session),
    e AS (SELECT session, page entree_page, source, utm_source, utm_campaign, pays, appareil, navigateur, os
          FROM hits WHERE entree=1 AND evt='vue' AND jour BETWEEN ?1 AND ?2)`;

  try {
    if (vue === 'resume') {
      R.totaux = await one(`${SESS} SELECT COUNT(*) sessions, SUM(vues) vues, ROUND(AVG(vues),2) pages_par_session,
          ROUND(100.0*SUM(vues=1)/MAX(COUNT(*),1),1) rebond_pct, ROUND(AVG(secondes)) secondes_moy, SUM(actions) actions,
          SUM(actions>0) sessions_avec_action FROM s WHERE vues>0`, du, au);
      // période précédente de même longueur
      const n = Math.round((Date.parse(au) - Date.parse(du)) / 864e5) + 1;
      const pAu = new Date(Date.parse(du) - 864e5).toISOString().slice(0, 10);
      const pDu = new Date(Date.parse(du) - n * 864e5).toISOString().slice(0, 10);
      R.precedent = await one(`${SESS} SELECT COUNT(*) sessions, SUM(vues) vues, ROUND(AVG(secondes)) secondes_moy, SUM(actions) actions FROM s WHERE vues>0`, pDu, pAu);
      R.precedent.du = pDu; R.precedent.au = pAu;
      R.parJour = await q(`SELECT jour, SUM(evt='vue') vues, COUNT(DISTINCT CASE WHEN evt='vue' THEN session END) sessions,
          SUM(evt NOT IN ${NON_ACTIONS}) actions FROM hits WHERE jour BETWEEN ?1 AND ?2 GROUP BY jour ORDER BY jour`, du, au);
      R.v1 = await q(`SELECT jour, SUM(CASE WHEN evt='vue' THEN n ELSE 0 END) vues, SUM(CASE WHEN evt<>'vue' THEN n ELSE 0 END) actions
          FROM evenements WHERE jour BETWEEN ?1 AND ?2 GROUP BY jour ORDER BY jour`, du, au);
      R.historique = await q(`SELECT jour, source, SUM(n) n, SUM(visites) visites FROM historique
          WHERE jour BETWEEN ?1 AND ?2 AND ((source='cf_web' AND dimension='path') OR (source='cf_zone' AND dimension='pages_html'))
          GROUP BY jour, source ORDER BY jour`, du, au);
      R.topPages = await q(`SELECT page, SUM(evt='vue') vues FROM hits WHERE jour BETWEEN ?1 AND ?2 GROUP BY page HAVING vues>0 ORDER BY vues DESC LIMIT 8`, du, au);
      R.topSources = await q(`${SESS} SELECT COALESCE(e.source,'inconnu') source, COUNT(*) sessions FROM e GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, du, au);
      R.topActions = await q(`SELECT evt, COUNT(*) n FROM hits WHERE jour BETWEEN ?1 AND ?2 AND evt NOT IN ${NON_ACTIONS} GROUP BY evt ORDER BY n DESC LIMIT 8`, du, au);
      R.linkedin = await q(`SELECT p.urn, p.publie_le, p.titre FROM li_posts p WHERE substr(p.publie_le,1,10) BETWEEN ?1 AND ?2 ORDER BY p.publie_le`, du, au);
    }

    else if (vue === 'pages') {
      R.lignes = await q(`WITH sorties AS (
            SELECT page, COUNT(*) n FROM (SELECT page, ROW_NUMBER() OVER (PARTITION BY session ORDER BY ts DESC, id DESC) rn
              FROM hits WHERE evt='vue' AND session IS NOT NULL AND jour BETWEEN ?1 AND ?2) WHERE rn=1 GROUP BY page)
          SELECT h.page, SUM(h.evt='vue') vues, COUNT(DISTINCT CASE WHEN h.evt='vue' THEN h.session END) sessions,
            SUM(h.evt='vue' AND h.entree=1) entrees, COALESCE(MAX(so.n),0) sorties,
            ROUND(AVG(CASE WHEN h.evt='temps' THEN h.valeur END)) secondes_moy,
            ROUND(AVG(CASE WHEN h.evt='temps' THEN CAST(h.detail AS INTEGER) END)) defilement_moy,
            SUM(h.evt='defilement' AND h.valeur=100) lu_en_entier,
            SUM(h.evt LIKE 'clic:%' OR h.evt LIKE 'lien:%') clics,
            SUM(h.evt='interactions') usages_outil, ROUND(AVG(CASE WHEN h.evt='vue' THEN h.valeur END)) chargement_ms
          FROM hits h LEFT JOIN sorties so ON so.page=h.page
          WHERE h.jour BETWEEN ?1 AND ?2 GROUP BY h.page ORDER BY vues DESC, h.page`, du, au);
    }

    else if (vue === 'page') {
      const p = url.searchParams.get('p') || '/';
      R.page = p;
      R.parJour = await q(`SELECT jour, SUM(evt='vue') vues, COUNT(DISTINCT CASE WHEN evt='vue' THEN session END) sessions FROM hits WHERE page=?3 AND jour BETWEEN ?1 AND ?2 GROUP BY jour ORDER BY jour`, du, au, p);
      R.v1 = await q(`SELECT jour, n vues FROM evenements WHERE page=?3 AND evt='vue' AND jour BETWEEN ?1 AND ?2 ORDER BY jour`, du, au, p);
      R.cf = await q(`SELECT jour, n FROM historique WHERE source='cf_web' AND dimension='path' AND valeur=?3 AND jour BETWEEN ?1 AND ?2 ORDER BY jour`, du, au, p);
      R.entrees = await q(`SELECT COALESCE(source,'inconnu') source, COUNT(*) n FROM hits WHERE page=?3 AND entree=1 AND evt='vue' AND jour BETWEEN ?1 AND ?2 GROUP BY 1 ORDER BY 2 DESC`, du, au, p);
      const seq = `SELECT page, LAG(page) OVER w avant, LEAD(page) OVER w apres FROM hits WHERE evt='vue' AND session IS NOT NULL AND jour BETWEEN ?1 AND ?2 WINDOW w AS (PARTITION BY session ORDER BY ts, id)`;
      R.avant = await q(`SELECT COALESCE(avant,'(entrée sur le site)') page, COUNT(*) n FROM (${seq}) WHERE page=?3 GROUP BY 1 ORDER BY 2 DESC`, du, au, p);
      R.apres = await q(`SELECT COALESCE(apres,'(sortie du site)') page, COUNT(*) n FROM (${seq}) WHERE page=?3 GROUP BY 1 ORDER BY 2 DESC`, du, au, p);
      R.actions = await q(`SELECT evt, COUNT(*) n, COUNT(DISTINCT session) sessions FROM hits WHERE page=?3 AND evt NOT IN ('vue','temps','defilement') AND jour BETWEEN ?1 AND ?2 GROUP BY evt ORDER BY n DESC`, du, au, p);
      R.defilement = await q(`SELECT valeur palier, COUNT(*) n FROM hits WHERE page=?3 AND evt='defilement' AND jour BETWEEN ?1 AND ?2 GROUP BY valeur ORDER BY valeur`, du, au, p);
      R.temps = await q(`SELECT CASE WHEN valeur<10 THEN 'moins de 10 s' WHEN valeur<30 THEN '10 à 30 s' WHEN valeur<60 THEN '30 s à 1 min'
            WHEN valeur<180 THEN '1 à 3 min' WHEN valeur<600 THEN '3 à 10 min' ELSE 'plus de 10 min' END tranche, COUNT(*) n, MIN(valeur) ordre
          FROM hits WHERE page=?3 AND evt='temps' AND jour BETWEEN ?1 AND ?2 GROUP BY 1 ORDER BY ordre`, du, au, p);
      R.appareils = await q(`SELECT appareil, COUNT(*) n FROM hits WHERE page=?3 AND evt='vue' AND jour BETWEEN ?1 AND ?2 GROUP BY 1 ORDER BY 2 DESC`, du, au, p);
      R.pays = await q(`SELECT COALESCE(pays,'?') pays, COUNT(*) n FROM hits WHERE page=?3 AND evt='vue' AND jour BETWEEN ?1 AND ?2 GROUP BY 1 ORDER BY 2 DESC`, du, au, p);
      R.sessions = await q(`${SESS} SELECT s.session, s.debut, s.vues, s.secondes, s.actions, e.entree_page, e.source, e.pays, e.appareil
          FROM s LEFT JOIN e ON e.session=s.session WHERE s.session IN (SELECT session FROM hits WHERE page=?3 AND jour BETWEEN ?1 AND ?2)
          ORDER BY s.debut DESC LIMIT 1000`, du, au, p);
    }

    else if (vue === 'sources') {
      R.lignes = await q(`${SESS} SELECT COALESCE(e.source,'inconnu') source, COALESCE(e.utm_source,'') utm_source, COALESCE(e.utm_campaign,'') utm_campaign,
          COUNT(*) sessions, SUM(s.vues) vues, ROUND(AVG(s.vues),2) pages_par_session, ROUND(AVG(s.secondes)) secondes_moy,
          SUM(s.actions) actions, ROUND(100.0*SUM(s.vues=1)/COUNT(*),1) rebond_pct
          FROM e JOIN s ON s.session=e.session GROUP BY 1,2,3 ORDER BY sessions DESC`, du, au);
      R.cf = await q(`SELECT valeur source, SUM(n) n FROM historique WHERE source='cf_web' AND dimension='ref' AND jour BETWEEN ?1 AND ?2 GROUP BY valeur ORDER BY n DESC`, du, au);
    }

    else if (vue === 'source') {
      const src = url.searchParams.get('s') || 'direct';
      R.source = src;
      const F = `session IN (SELECT session FROM hits WHERE entree=1 AND evt='vue' AND COALESCE(source,'inconnu')=?3 AND jour BETWEEN ?1 AND ?2)`;
      R.parJour = await q(`SELECT jour, COUNT(*) sessions FROM hits WHERE entree=1 AND evt='vue' AND COALESCE(source,'inconnu')=?3 AND jour BETWEEN ?1 AND ?2 GROUP BY jour ORDER BY jour`, du, au, src);
      R.entrees = await q(`SELECT page, COUNT(*) n FROM hits WHERE entree=1 AND evt='vue' AND COALESCE(source,'inconnu')=?3 AND jour BETWEEN ?1 AND ?2 GROUP BY page ORDER BY n DESC`, du, au, src);
      R.pages = await q(`SELECT page, COUNT(*) n FROM hits WHERE evt='vue' AND ${F} GROUP BY page ORDER BY n DESC`, du, au, src);
      R.actions = await q(`SELECT evt, COUNT(*) n FROM hits WHERE evt NOT IN ${NON_ACTIONS} AND ${F} GROUP BY evt ORDER BY n DESC`, du, au, src);
      R.campagnes = await q(`SELECT COALESCE(utm_source,'') utm_source, COALESCE(utm_medium,'') utm_medium, COALESCE(utm_campaign,'') utm_campaign, COUNT(*) n
          FROM hits WHERE entree=1 AND evt='vue' AND COALESCE(source,'inconnu')=?3 AND jour BETWEEN ?1 AND ?2 GROUP BY 1,2,3 ORDER BY n DESC`, du, au, src);
      R.sessions = await q(`${SESS} SELECT s.session, s.debut, s.vues, s.secondes, s.actions, e.entree_page, e.source, e.pays, e.appareil
          FROM s JOIN e ON e.session=s.session WHERE COALESCE(e.source,'inconnu')=?3 ORDER BY s.debut DESC LIMIT 1000`, du, au, src);
    }

    else if (vue === 'actions') {
      R.lignes = await q(`SELECT evt, COUNT(*) n, COUNT(DISTINCT session) sessions, COUNT(DISTINCT page) pages, MIN(ts) premier, MAX(ts) dernier
          FROM hits WHERE jour BETWEEN ?1 AND ?2 AND evt NOT IN ('vue','temps','defilement') GROUP BY evt ORDER BY n DESC, evt`, du, au);
      R.v1 = await q(`SELECT evt, page, SUM(n) n FROM evenements WHERE jour BETWEEN ?1 AND ?2 AND evt<>'vue' GROUP BY evt, page ORDER BY n DESC`, du, au);
    }

    else if (vue === 'action') {
      const ev = url.searchParams.get('e') || '';
      R.evt = ev;
      R.parJour = await q(`SELECT jour, COUNT(*) n FROM hits WHERE evt=?3 AND jour BETWEEN ?1 AND ?2 GROUP BY jour ORDER BY jour`, du, au, ev);
      R.pages = await q(`SELECT page, COUNT(*) n, COUNT(DISTINCT session) sessions FROM hits WHERE evt=?3 AND jour BETWEEN ?1 AND ?2 GROUP BY page ORDER BY n DESC`, du, au, ev);
      R.details = await q(`SELECT COALESCE(detail,'') detail, valeur, COUNT(*) n FROM hits WHERE evt=?3 AND jour BETWEEN ?1 AND ?2 GROUP BY 1,2 ORDER BY n DESC`, du, au, ev);
      R.sessions = await q(`${SESS} SELECT s.session, s.debut, s.vues, s.secondes, s.actions, e.entree_page, e.source, e.pays, e.appareil
          FROM s LEFT JOIN e ON e.session=s.session WHERE s.session IN (SELECT session FROM hits WHERE evt=?3 AND jour BETWEEN ?1 AND ?2)
          ORDER BY s.debut DESC LIMIT 1000`, du, au, ev);
    }

    else if (vue === 'sessions') {
      const lim = Math.min(parseInt(url.searchParams.get('limite') || '200', 10) || 200, 2000);
      const off = Math.max(parseInt(url.searchParams.get('depart') || '0', 10) || 0, 0);
      R.total = (await one(`SELECT COUNT(DISTINCT session) n FROM hits WHERE jour BETWEEN ?1 AND ?2 AND session IS NOT NULL`, du, au)).n || 0;
      R.lignes = await q(`${SESS} SELECT s.session, s.debut, s.fin, s.vues, s.secondes, s.actions, e.entree_page, e.source, e.utm_campaign, e.pays, e.appareil, e.navigateur, e.os
          FROM s LEFT JOIN e ON e.session=s.session ORDER BY s.debut DESC LIMIT ?3 OFFSET ?4`, du, au, lim, off);
      R.limite = lim; R.depart = off;
    }

    else if (vue === 'session') {
      const id = url.searchParams.get('id') || '';
      R.session = id;
      R.evenements = await q(`SELECT ts, page, evt, detail, valeur, source, utm_source, utm_medium, utm_campaign, pays, appareil, navigateur, os, entree
          FROM hits WHERE session=?1 ORDER BY ts, id`, id);
    }

    else if (vue === 'audience') {
      const cnt = (col) => q(`SELECT COALESCE(${col},'?') valeur, COUNT(*) sessions FROM hits WHERE entree=1 AND evt='vue' AND jour BETWEEN ?1 AND ?2 GROUP BY 1 ORDER BY 2 DESC`, du, au);
      R.pays = await cnt('pays'); R.appareils = await cnt('appareil'); R.navigateurs = await cnt('navigateur'); R.systemes = await cnt('os');
      R.heures = await q(`SELECT ts FROM hits WHERE evt='vue' AND jour BETWEEN ?1 AND ?2`, du, au);
      R.cf = await q(`SELECT dimension, valeur, SUM(n) n FROM historique WHERE source='cf_web' AND dimension IN ('pays','appareil','navigateur','os') AND jour BETWEEN ?1 AND ?2 GROUP BY 1,2 ORDER BY 1, 3 DESC`, du, au);
    }

    else if (vue === 'entonnoirs') {
      const S = (cond) => one(`SELECT COUNT(DISTINCT session) n FROM hits WHERE jour BETWEEN ?1 AND ?2 AND session IS NOT NULL AND ${cond}`, du, au);
      const tous = await S("evt='vue'");
      const AI = "session IN (SELECT session FROM hits WHERE jour BETWEEN ?1 AND ?2 AND evt='vue' AND page LIKE '/decryptages/ai-act%')";
      R.site = [
        ['Visites', tous.n],
        ['ont vu les missions', (await S("evt='vue' AND page='/missions'")).n],
        ['ont ouvert contact ou rendez-vous', (await S("evt='vue' AND page IN ('/contact','/rendez-vous')")).n],
        ['ont envoyé un formulaire ou réservé', (await S("(evt LIKE 'envoi:%' OR evt LIKE 'clic:%cal%' OR evt LIKE 'lien:cal.eu%')")).n]
      ];
      R.aiact = [
        ['Visites sur le décryptage AI Act', (await S("evt='vue' AND page LIKE '/decryptages/ai-act%'")).n],
        ['ont ouvert au moins un outil', (await S("evt='vue' AND page LIKE '/decryptages/ai-act/_%'")).n],
        ['ont utilisé un outil', (await S("evt='interactions' AND page LIKE '/decryptages/ai-act/%'")).n],
        ['ont terminé le parcours de qualification', (await S("evt LIKE 'resultat:%'")).n],
        ['ont cliqué vers les missions', (await S(`(evt LIKE '%missions%') AND ${AI}`)).n],
        ['ont ouvert un graphe Hellixmap', (await S(`(evt LIKE '%/graphe%' OR evt LIKE '%hellixmap%') AND ${AI}`)).n],
        ['se sont inscrits à l\'alerte', (await S("evt='envoi:aiact-alerte'")).n],
        ['ont écrit via le formulaire', (await S("evt='envoi:aiact-question'")).n]
      ];
      R.resultats = await q(`SELECT evt, COUNT(*) n FROM hits WHERE evt LIKE 'resultat:%' AND jour BETWEEN ?1 AND ?2 GROUP BY evt ORDER BY n DESC`, du, au);
    }

    else if (vue === 'historique') {
      R.lignes = await q(`SELECT source, jour, dimension, valeur, n, visites FROM historique WHERE jour BETWEEN ?1 AND ?2 ORDER BY jour, source, dimension, n DESC`, du, au);
    }

    else if (vue === 'brut') {
      const lim = Math.min(parseInt(url.searchParams.get('limite') || '500', 10) || 500, 5000);
      const off = Math.max(parseInt(url.searchParams.get('depart') || '0', 10) || 0, 0);
      R.total = (await one(`SELECT COUNT(*) n FROM hits WHERE jour BETWEEN ?1 AND ?2`, du, au)).n || 0;
      R.lignes = await q(`SELECT id, ts, session, page, evt, detail, valeur, source, utm_source, utm_medium, utm_campaign, pays, appareil, navigateur, os, entree
          FROM hits WHERE jour BETWEEN ?1 AND ?2 ORDER BY id DESC LIMIT ?3 OFFSET ?4`, du, au, lim, off);
      R.limite = lim; R.depart = off;
    }

    else return json({ ok: false, error: 'Vue inconnue' }, 400);
  } catch (e) {
    return json({ ok: false, error: 'Requête impossible : ' + String(e && e.message || e).slice(0, 200) }, 500);
  }
  return json(R);
}
