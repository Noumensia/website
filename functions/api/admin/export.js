// GET /api/admin/export?table=<table>&format=csv|json (tables : voir TABLES)
// Exporte une table entière (sauvegarde). Pour hits et cf_requetes, découpe possible : &depuis_id=N (lots de 20 000 lignes).
import { json, autorise } from '../../../functions-lib/admin-auth.js';

const TABLES = ['hits', 'evenements', 'historique', 'inscrits', 'li_posts', 'li_stats', 'li_compte', 'li_jour', 'li_demographie', 'recherche', 'exclusions', 'cf_requetes'];

export async function onRequestGet({ request, env }) {
  if (!(await autorise(request, env))) return json({ ok: false, error: 'Jeton refusé' }, 401);
  if (!env.DB) return json({ ok: false, error: 'Base non reliée au site' }, 503);
  const url = new URL(request.url);
  const t = url.searchParams.get('table');
  if (!TABLES.includes(t)) return json({ ok: false, error: 'Table inconnue', tables: TABLES }, 400);
  let rows;
  if (t === 'hits') {
    const dep = parseInt(url.searchParams.get('depuis_id') || '0', 10) || 0;
    rows = (await env.DB.prepare('SELECT * FROM hits WHERE id > ?1 ORDER BY id LIMIT 20000').bind(dep).all()).results || [];
  } else if (t === 'cf_requetes') {
    const dep = parseInt(url.searchParams.get('depuis_id') || '0', 10) || 0;
    rows = (await env.DB.prepare('SELECT rowid AS _id, * FROM cf_requetes WHERE rowid > ?1 ORDER BY rowid LIMIT 20000').bind(dep).all()).results || [];
  } else {
    rows = (await env.DB.prepare(`SELECT * FROM ${t}`).all()).results || [];
  }
  if (url.searchParams.get('format') === 'json') return json({ ok: true, table: t, lignes: rows });
  const cols = rows.length ? Object.keys(rows[0]) : [];
  // Une valeur qui commence par = + - @ serait lue comme une formule par Excel : on la préfixe d'une apostrophe.
  const sur = v => { v = String(v); return /^[=+\-@\t\r]/.test(v) && !/^-?\d+([.,]\d+)?$/.test(v) ? "'" + v : v; };
  const esc = v => { if (v == null) return ''; v = sur(v); return /[";\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const csv = '﻿' + [cols.join(';')].concat(rows.map(r => cols.map(c => esc(r[c])).join(';'))).join('\r\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="noumensia-${t}-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
