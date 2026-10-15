import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SITE_URL, canonicalUrl } from '../src/config/site.ts';
import { isWallpaperItem } from '../src/utils/validateWallpaper.ts';

/** Only the official consolidated catalog is used; never mocks, quarantine or backups. */
export function generateSitemap(catalog: unknown): string {
  if (!Array.isArray(catalog) || !catalog.length) throw new Error('Sitemap: catálogo vazio ou inválido');
  const ids = new Set<string>();
  for (const item of catalog) {
    if (!isWallpaperItem(item) || item.isSimulated || !/^[1-9]\d*$/.test(item.id) || BigInt(item.id) > 18446744073709551615n || ids.has(item.id)) {
      throw new Error('Sitemap: item inválido, simulado ou duplicado');
    }
    ids.add(item.id);
  }
  if (ids.size + 1 > 50000) throw new Error('Sitemap: limite de 50.000 URLs excedido');
  const urls = [canonicalUrl(), ...[...ids].sort().map(id => canonicalUrl(id))];
  // URLs contain only the fixed HTTPS origin and validated decimal IDs: no XML escaping needed.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <url><loc>${url}</loc></url>`).join('\n')}\n</urlset>\n`;
  if (Buffer.byteLength(xml) > 50 * 1024 * 1024) throw new Error('Sitemap: limite de tamanho excedido');
  return xml;
}

export function generateSeoFiles(catalogPath = 'public/data/catalog.json', outputDirectory = 'public'): number {
  // Validate completely before touching either public file. Never rewrites catalog data.
  const catalog: unknown = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const sitemap = generateSitemap(catalog);
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(resolve(outputDirectory, 'sitemap.xml'), sitemap);
  writeFileSync(resolve(outputDirectory, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  return (catalog as unknown[]).length + 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(`SEO: ${generateSeoFiles()} URLs geradas a partir do catálogo oficial.`);
}
