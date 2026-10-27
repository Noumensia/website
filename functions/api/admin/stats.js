// GET /api/admin/stats?jours=30 : compteurs agrégés (pages vues, clics, envois de formulaires).
import { json, autorise } from '../../../functions-lib/admin-auth.js';

export async function onRequestGet({ request, env }) {
  if (!(await autorise(request, env))) return json({ ok: false, error: 'Jeton refusé' }, 401);
  if (!env.DB) return json({ ok: false, error: 'Base non reliée au site' }, 503);
  const url = new URL(request.url);
  const jours = Math.min(Math.max(parseInt(url.searchParams.get('jours') || '30', 10) || 30, 1), 365);
  const depuis = '-' + (jours - 1) + ' days';
  const lignes = await env.DB.prepare(
    "SELECT evt, page, SUM(n) AS n FROM evenements WHERE jour >= date('now', ?1) " +
    'GROUP BY evt, page ORDER BY n DESC LIMIT 1000'
  ).bind(depuis).all();
  const parJour = await env.DB.prepare(
    "SELECT jour, SUM(CASE WHEN evt = 'vue' THEN n ELSE 0 END) AS vues, " +
    "SUM(CASE WHEN evt <> 'vue' THEN n ELSE 0 END) AS actions " +
    "FROM evenements WHERE jour >= date('now', ?1) GROUP BY jour ORDER BY jour"
  ).bind(depuis).all();
  return json({ ok: true, jours, lignes: lignes.results || [], parJour: parJour.results || [] });
}
