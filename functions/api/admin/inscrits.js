// GET  /api/admin/inscrits : liste des inscrits aux alertes.
// POST /api/admin/inscrits : { action: 'marquer_envoye' | 'supprimer', ids: [...] } ou { action: 'supprimer_envoyes' }
// La purge « supprimer_envoyes » garde les personnes qui ont accepté d'être recontactées.
import { json, autorise } from '../../../functions-lib/admin-auth.js';

export async function onRequest({ request, env }) {
  if (!(await autorise(request, env))) return json({ ok: false, error: 'Jeton refusé' }, 401);
  if (!env.DB) return json({ ok: false, error: 'Base non reliée au site' }, 503);

  if (request.method === 'GET') {
    const { results } = await env.DB
      .prepare('SELECT id, email, liste, page, cree_le, envoye_le, recontact FROM inscrits ORDER BY cree_le DESC')
      .all();
    return json({ ok: true, inscrits: results || [] });
  }

  if (request.method === 'POST') {
    let d = {};
    try { d = await request.json(); } catch (e) {}
    const ids = Array.isArray(d.ids) ? d.ids.map(Number).filter(Number.isInteger).slice(0, 90) : [];
    const ph = ids.map((_, i) => '?' + (i + 1)).join(',');
    let r;
    if (d.action === 'marquer_envoye' && ids.length) {
      r = await env.DB.prepare(`UPDATE inscrits SET envoye_le = datetime('now') WHERE id IN (${ph})`).bind(...ids).run();
    } else if (d.action === 'supprimer' && ids.length) {
      r = await env.DB.prepare(`DELETE FROM inscrits WHERE id IN (${ph})`).bind(...ids).run();
    } else if (d.action === 'supprimer_envoyes') {
      r = await env.DB.prepare('DELETE FROM inscrits WHERE envoye_le IS NOT NULL AND recontact = 0').run();
    } else {
      return json({ ok: false, error: 'Action inconnue' }, 400);
    }
    return json({ ok: true, modifies: (r && r.meta && r.meta.changes) || 0 });
  }

  return json({ ok: false, error: 'Méthode non permise' }, 405);
}
