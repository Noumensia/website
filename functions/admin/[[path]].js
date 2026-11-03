// Le cockpit n'est servi que sur admin.noumensia.com : une origine séparée du site public, où le jeton
// d'accès ne côtoie aucun script tiers (agenda Cal.com, mesure Cloudflare…).
// Sur noumensia.com (et les autres adresses du projet), /admin renvoie vers admin.noumensia.com après avoir
// effacé l'ancien jeton gardé sur ce domaine. /admin/?moi=1 (ou ?moi=0) marque (ou démarque) cet appareil
// comme celui d'Arthur pour la mesure d'audience, ce qui ne peut se faire que depuis le domaine du site.
const HOTE = 'admin.noumensia.com';
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";
const SECU = {
  'Content-Security-Policy': CSP, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Strict-Transport-Security': 'max-age=31536000'
};
const PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><title>Cockpit Noumensia</title></head>
<body style="font-family:system-ui,sans-serif;background:#F1E7D3;color:#1E2630;padding:40px">
<p>Le cockpit est sur <a href="https://${HOTE}/admin/">${HOTE}</a>…</p>
<script>
(function () {
  var q = new URLSearchParams(location.search), dest = 'https://${HOTE}/admin/', m = q.get('moi');
  try { localStorage.removeItem('nm-admin-token'); localStorage.removeItem('nm-admin-etat'); localStorage.removeItem('nm-admin-periode'); } catch (e) {}
  if (m === '1') {
    var v = null; try { localStorage.setItem('nm-moi', '1'); v = localStorage.getItem('nm-vid'); } catch (e) {}
    dest += '#/donnees?moi=ok' + (v && /^[a-z0-9]{8,40}$/i.test(v) ? '&vid=' + v : '');
  } else if (m === '0') {
    try { localStorage.removeItem('nm-moi'); } catch (e) {}
    dest += '#/donnees?moi=retire';
  } else if (/^#\\/[a-z]/.test(location.hash)) dest += location.hash;
  location.replace(dest);
})();
</script></body></html>`;

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const local = /^(localhost|127\.0\.0\.1)$/.test(url.hostname) && !url.searchParams.has('public');
  if (url.hostname === HOTE || local) {
    const r = await env.ASSETS.fetch(request);
    const h = new Headers(r.headers);
    for (const [k, v] of Object.entries(SECU)) h.set(k, v);
    h.delete('X-Frame-Options');
    return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
  }
  const h = new Headers(SECU);
  h.set('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'");
  h.set('Content-Type', 'text/html; charset=utf-8');
  return new Response(PAGE, { status: 200, headers: h });
}
