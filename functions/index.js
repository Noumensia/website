// Page d'accueil : sur admin.noumensia.com, renvoie directement vers le cockpit ; partout ailleurs, la page d'accueil du site.
export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  if (url.hostname === 'admin.noumensia.com') return Response.redirect('https://admin.noumensia.com/admin/', 302);
  return env.ASSETS.fetch(request);
}
