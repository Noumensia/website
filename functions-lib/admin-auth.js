// Contrôle d'accès des routes /api/admin/* : jeton envoyé dans l'en-tête Authorization.
// Seule l'empreinte SHA-256 du jeton est écrite ici (le jeton lui-même est chez Arthur).
// Pour changer de jeton : remplacer l'empreinte, ou définir ADMIN_HASH dans Cloudflare.
const ADMIN_HASH = '76e7f5628044ebf41f1b3da3895f51055898d93d5cee87dcc63432b3faf5305c';

export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

export async function autorise(request, env) {
  const t = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!t) return false;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === ((env && env.ADMIN_HASH) || ADMIN_HASH);
}
