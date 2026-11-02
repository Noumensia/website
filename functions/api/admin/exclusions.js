// GET  /api/admin/exclusions : adresses IP et visiteurs exclus des statistiques, et l'IP de l'appareil qui consulte.
// POST /api/admin/exclusions : {action:'ajouter', type:'ip'|'visiteur', valeur?, note?} (sans valeur : l'IP actuelle),
//                              {action:'retirer', type, valeur}, {action:'requalifier'} (applique les exclusions à tout l'historique).
import { json, autorise } from '../../../functions-lib/admin-auth.js';

export async function onRequest({ request, env }) {
  if (!(await autorise(request, env))) return json({ ok: false, error: 'Jeton refusé' }, 401);
  if (!env.DB) return json({ ok: false, error: 'Base non reliée au site' }, 503);
  const DB = env.DB;
  const ip = request.headers.get('cf-connecting-ip') || '';
  const cf = request.cf || {};
  if (request.method === 'GET') {
    const { results } = await DB.prepare('SELECT * FROM exclusions ORDER BY ajoute_le DESC').all();
    const marques = await DB.prepare('SELECT COUNT(*) n FROM hits WHERE moi = 1').first();
    return json({ ok: true, exclusions: results || [], monIp: ip, monReseau: cf.asOrganization || null, maVille: cf.city || null, evenementsMarques: marques ? marques.n : 0 });
  }
  if (request.method === 'POST') {
    let d = {}; try { d = await request.json(); } catch (e) {}
    const type = d.type === 'visiteur' ? 'visiteur' : 'ip';
    if (d.action === 'ajouter') {
      const v = String(d.valeur || (type === 'ip' ? ip : '')).trim().slice(0, 80);
      if (!v) return json({ ok: false, error: 'Valeur manquante' }, 400);
      await DB.prepare('INSERT OR REPLACE INTO exclusions (type, valeur, note) VALUES (?1, ?2, ?3)').bind(type, v, String(d.note || '').slice(0, 120)).run();
      const r = await DB.prepare(type === 'ip' ? 'UPDATE hits SET moi = 1 WHERE ip = ?1' : 'UPDATE hits SET moi = 1 WHERE visiteur = ?1').bind(v).run();
      return json({ ok: true, valeur: v, requalifies: (r.meta && r.meta.changes) || 0 });
    }
    if (d.action === 'retirer') {
      await DB.prepare('DELETE FROM exclusions WHERE type = ?1 AND valeur = ?2').bind(type, String(d.valeur || '')).run();
      return json({ ok: true });
    }
    if (d.action === 'requalifier') {
      const r = await DB.prepare(`UPDATE hits SET moi = 1 WHERE moi = 0 AND (ip IN (SELECT valeur FROM exclusions WHERE type='ip')
        OR visiteur IN (SELECT valeur FROM exclusions WHERE type='visiteur'))`).run();
      return json({ ok: true, requalifies: (r.meta && r.meta.changes) || 0 });
    }
    return json({ ok: false, error: 'Action inconnue' }, 400);
  }
  return json({ ok: false, error: 'Méthode non permise' }, 405);
}
