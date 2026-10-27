// POST /api/alerte : inscription à une alerte e-mail.
// Enregistre l'adresse dans D1 (table inscrits) et prévient Arthur par e-mail via Formspree.
// Si la base est indisponible, Formspree seul suffit ; si tout échoue, le navigateur
// repasse par Formspree directement (voir la page AI Act).

const FORMSPREE = 'https://formspree.io/f/mojzoazo';
const LISTES = {
  'ai-act-lignes-directrices': 'Alerte AI Act : inscription (lignes directrices haut risque)'
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

export async function onRequestPost({ request, env }) {
  let d = {};
  try {
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) d = await request.json();
    else { const f = await request.formData(); for (const [k, v] of f) d[k] = String(v); }
  } catch (e) { return json({ ok: false, error: 'format' }, 400); }

  if (d._gotcha) return json({ ok: true }); // champ piège rempli : robot

  const email = String(d.email || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return json({ ok: false, error: 'email' }, 400);
  }
  const liste = LISTES[d.liste] ? d.liste : 'ai-act-lignes-directrices';
  const page = String(d.page || '').slice(0, 200);
  const recontact = (d.recontact === true || d.recontact === 1 || /^(1|on|true|oui)$/i.test(String(d.recontact || ''))) ? 1 : 0;

  let enregistre = false, nouveau = true;
  if (env.DB) {
    try {
      const r = await env.DB
        .prepare('INSERT OR IGNORE INTO inscrits (email, liste, page, recontact) VALUES (?1, ?2, ?3, ?4)')
        .bind(email, liste, page, recontact).run();
      enregistre = true;
      nouveau = (r.meta && r.meta.changes > 0);
      if (!nouveau && recontact) {
        await env.DB.prepare('UPDATE inscrits SET recontact = 1 WHERE email = ?1 AND liste = ?2')
          .bind(email, liste).run();
      }
    } catch (e) { enregistre = false; }
  }

  let prevenu = false;
  if (nouveau) {
    try {
      const r = await fetch(FORMSPREE, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Origin': 'https://noumensia.com',
          'Referer': 'https://noumensia.com' + (page.startsWith('/') ? page : '/')
        },
        body: JSON.stringify({
          email,
          _subject: LISTES[liste],
          liste,
          provenance: page,
          accepte_d_etre_recontacte: recontact ? 'oui' : 'non',
          liste_du_site: enregistre ? 'oui, visible sur noumensia.com/admin/' : 'non (base indisponible)'
        })
      });
      prevenu = r.ok;
    } catch (e) { prevenu = false; }
  }

  if (!enregistre && !prevenu) return json({ ok: false, error: 'indisponible' }, 503);
  return json({ ok: true });
}
