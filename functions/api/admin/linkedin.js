// GET  /api/admin/linkedin : posts LinkedIn, tous leurs relevés de statistiques, chiffres du compte,
//                            et visites du site venues de LinkedIn (par jour).
// POST /api/admin/linkedin : { posts:[{urn,publie_le,titre,extrait,url,format}],
//                              stats:[{urn,releve_le,impressions,...}], compte:[{jour,mesure,valeur}] }
import { json, autorise } from '../../../functions-lib/admin-auth.js';

const STAT_COLS = ['impressions', 'membres_atteints', 'reactions', 'commentaires', 'republications', 'enregistrements',
  'envois', 'vues_profil', 'abonnes_gagnes', 'reseau_pct', 'engagements', 'demographie'];

export async function onRequest({ request, env }) {
  if (!(await autorise(request, env))) return json({ ok: false, error: 'Jeton refusé' }, 401);
  if (!env.DB) return json({ ok: false, error: 'Base non reliée au site' }, 503);
  const DB = env.DB;
  const q = async (sql, ...b) => (await DB.prepare(sql).bind(...b).all()).results || [];

  if (request.method === 'GET') {
    return json({
      ok: true,
      posts: await q('SELECT * FROM li_posts ORDER BY publie_le DESC'),
      stats: await q('SELECT * FROM li_stats ORDER BY urn, releve_le'),
      compte: await q('SELECT * FROM li_compte ORDER BY jour, mesure'),
      jours: await q('SELECT * FROM li_jour ORDER BY jour'),
      demographie: await q('SELECT * FROM li_demographie WHERE releve_le = (SELECT MAX(releve_le) FROM li_demographie) ORDER BY type, categorie'),
      visites: await q(`SELECT jour, COUNT(DISTINCT session) sessions, SUM(evt='vue') vues FROM hits
        WHERE robot = 0 AND moi = 0 AND session IN (SELECT session FROM hits WHERE entree=1 AND evt='vue' AND (source LIKE '%linkedin%' OR source LIKE 'lnkd.in%'))
        GROUP BY jour ORDER BY jour`),
      pagesDepuisLinkedin: await q(`SELECT page, COUNT(*) n FROM hits WHERE robot = 0 AND moi = 0 AND entree=1 AND evt='vue' AND (source LIKE '%linkedin%' OR source LIKE 'lnkd.in%') GROUP BY page ORDER BY n DESC`),
      cf: await q(`SELECT jour, SUM(n) n FROM historique WHERE source='cf_web' AND dimension='ref' AND valeur LIKE '%linkedin%' GROUP BY jour ORDER BY jour`)
    });
  }

  if (request.method === 'POST') {
    let d = {};
    try { d = await request.json(); } catch (e) { return json({ ok: false, error: 'JSON invalide' }, 400); }
    const st = [];
    for (const p of (Array.isArray(d.posts) ? d.posts : []).slice(0, 500)) {
      if (!/^\d{10,25}$/.test(String(p.urn || ''))) continue;
      st.push(DB.prepare(`INSERT INTO li_posts (urn, publie_le, titre, extrait, url, format) VALUES (?1,?2,?3,?4,?5,?6)
        ON CONFLICT(urn) DO UPDATE SET publie_le=COALESCE(excluded.publie_le, publie_le), titre=COALESCE(excluded.titre, titre),
        extrait=COALESCE(excluded.extrait, extrait), url=COALESCE(excluded.url, url), format=COALESCE(excluded.format, format)`)
        .bind(String(p.urn), p.publie_le || null, p.titre || null, p.extrait || null, p.url || null, p.format || null));
    }
    for (const s of (Array.isArray(d.stats) ? d.stats : []).slice(0, 2000)) {
      if (!/^\d{10,25}$/.test(String(s.urn || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(s.releve_le || ''))) continue;
      const vals = STAT_COLS.map(c => c === 'demographie' ? (s[c] == null ? null : (typeof s[c] === 'string' ? s[c] : JSON.stringify(s[c]))) : (s[c] == null ? null : +s[c]));
      st.push(DB.prepare(`INSERT OR REPLACE INTO li_stats (urn, releve_le, ${STAT_COLS.join(', ')}) VALUES (?1, ?2, ${STAT_COLS.map((_, i) => '?' + (i + 3)).join(', ')})`)
        .bind(String(s.urn), s.releve_le, ...vals));
    }
    for (const c of (Array.isArray(d.compte) ? d.compte : []).slice(0, 2000)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(c.jour || '')) || !c.mesure) continue;
      st.push(DB.prepare('INSERT OR REPLACE INTO li_compte (jour, mesure, valeur) VALUES (?1, ?2, ?3)').bind(c.jour, String(c.mesure).slice(0, 60), c.valeur == null ? null : +c.valeur));
    }
    for (const j of (Array.isArray(d.jours) ? d.jours : []).slice(0, 2000)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(j.jour || ''))) continue;
      st.push(DB.prepare('INSERT OR REPLACE INTO li_jour (jour, impressions, engagements, nouveaux_abonnes) VALUES (?1, ?2, ?3, ?4)').bind(j.jour, j.impressions == null ? null : +j.impressions, j.engagements == null ? null : +j.engagements, j.nouveaux_abonnes == null ? null : +j.nouveaux_abonnes));
    }
    for (const m of (Array.isArray(d.demographie) ? d.demographie : []).slice(0, 1000)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(m.releve_le || '')) || !m.type || !m.categorie || !m.valeur) continue;
      st.push(DB.prepare('INSERT OR REPLACE INTO li_demographie (releve_le, type, categorie, valeur, pct) VALUES (?1, ?2, ?3, ?4, ?5)').bind(m.releve_le, String(m.type), String(m.categorie), String(m.valeur), m.pct == null ? null : String(m.pct)));
    }
    if (!st.length) return json({ ok: false, error: 'Rien à enregistrer' }, 400);
    for (let i = 0; i < st.length; i += 50) await DB.batch(st.slice(i, i + 50));
    return json({ ok: true, enregistres: st.length });
  }
  return json({ ok: false, error: 'Méthode non permise' }, 405);
}
