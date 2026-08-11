#!/usr/bin/env node
/**
 * Régénère sitemap.xml à partir des pages HTML réellement présentes dans le repo.
 *
 * - <lastmod> = date du dernier commit git qui a touché le fichier (fallback :
 *   date de modification du fichier si celui-ci n'est pas encore commité).
 * - Les dossiers listés dans SCANNED_DIRS sont scannés automatiquement : ajouter
 *   un nouvel article dans /articles ou un nouveau modèle dans /modeles suffit,
 *   pas besoin de toucher ce script ni sitemap.xml à la main.
 * - Pensé pour tourner comme "Build command" Cloudflare Pages à chaque déploiement :
 *       node generate-sitemap.js
 *
 * Aucune dépendance externe (Node natif uniquement).
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DOMAIN = 'https://noumensia.com';

// Pages racine fixes : peu nombreuses, changent rarement -> déclarées ici.
const STATIC_PAGES = [
  { file: 'index.html', url: '/', priority: '1.0', changefreq: 'monthly' },
  { file: 'modeles.html', url: '/modeles', priority: '0.9', changefreq: 'monthly' },
  { file: 'articles.html', url: '/articles', priority: '0.8', changefreq: 'weekly' },
  { file: 'methode.html', url: '/methode', priority: '0.8', changefreq: 'monthly' },
  { file: 'faq.html', url: '/faq', priority: '0.7', changefreq: 'monthly' },
  { file: 'contact.html', url: '/contact', priority: '0.7', changefreq: 'yearly' },
  { file: 'a-propos.html', url: '/a-propos', priority: '0.6', changefreq: 'yearly' },
  { file: 'mentions-legales.html', url: '/mentions-legales', priority: '0.2', changefreq: 'yearly' },
];

// Dossiers scannés automatiquement : chaque .html trouvé devient une URL.
const SCANNED_DIRS = [
  { dir: 'modeles', urlPrefix: '/modeles', priority: '0.8', changefreq: 'monthly' },
  { dir: 'articles', urlPrefix: '/articles', priority: '0.8', changefreq: 'monthly' },
  { dir: 'mentions-legales', urlPrefix: '/mentions-legales', priority: '0.2', changefreq: 'yearly' },
];

function lastmod(relPath) {
  try {
    const out = execSync(`git log -1 --format=%cs -- "${relPath}"`, { cwd: ROOT }).toString().trim();
    if (out) return out;
  } catch (e) {
    // fichier hors historique git (tout juste créé, pas encore commité) -> fallback mtime
  }
  return fs.statSync(path.join(ROOT, relPath)).mtime.toISOString().slice(0, 10);
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const entries = [];

for (const page of STATIC_PAGES) {
  if (!fs.existsSync(path.join(ROOT, page.file))) continue; // page supprimée -> on ne casse pas le build
  entries.push({
    loc: DOMAIN + page.url,
    lastmod: lastmod(page.file),
    changefreq: page.changefreq,
    priority: page.priority,
  });
}

for (const scan of SCANNED_DIRS) {
  const dirPath = path.join(ROOT, scan.dir);
  if (!fs.existsSync(dirPath)) continue;
  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.html')).sort();
  for (const f of files) {
    const rel = path.join(scan.dir, f);
    const slug = f.replace(/\.html$/, '');
    entries.push({
      loc: `${DOMAIN}${scan.urlPrefix}/${slug}`,
      lastmod: lastmod(rel),
      changefreq: scan.changefreq,
      priority: scan.priority,
    });
  }
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (e) => `  <url>
    <loc>${escapeXml(e.loc)}</loc>
    <lastmod>${e.lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
console.log(`sitemap.xml régénéré avec ${entries.length} URLs.`);
