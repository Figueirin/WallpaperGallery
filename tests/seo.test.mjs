import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SITE_URL, DEFAULT_SOCIAL_IMAGE, canonicalUrl } from '../src/config/site.ts';
import { generateSitemap, generateSeoFiles } from '../scripts/generate-sitemap.ts';
import { socialImage, structuredData, updatePageMetadata } from '../src/utils/pageMetadata.ts';
import { translate } from '../src/i18n/translations.ts';
const catalog = JSON.parse(readFileSync('public/data/catalog.json', 'utf8'));

test('SEO: origem HTTPS sem www, canonical de filtro/home e detalhe independente do host', () => {
  assert.equal(SITE_URL, 'https://wewallpapers.cc');
  assert.equal(canonicalUrl(), SITE_URL + '/');
  assert.equal(canonicalUrl(catalog[0].id), `${SITE_URL}/wallpaper/${catalog[0].id}`);
  for (const invalid of ['https://localhost', '1?q=x', '../x', '0', '1/2']) assert.equal(canonicalUrl(invalid), SITE_URL + '/');
});

test('sitemap real: XML UTF-8 determinístico, 15001 URLs únicas e todos os IDs oficiais', () => {
  const xml = readFileSync('public/sitemap.xml', 'utf8');
  assert.equal(xml, generateSitemap(catalog));
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">\n(?:  <url><loc>https:\/\/wewallpapers.cc\/(?:wallpaper\/[1-9]\d*)?<\/loc><\/url>\n)+<\/urlset>\n$/);
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.equal(urls.length, 15001); assert.equal(new Set(urls).size, 15001);
  assert.deepEqual(new Set(urls), new Set([canonicalUrl(), ...catalog.map(item => canonicalUrl(item.id))]));
  assert.ok(urls.every(url => new URL(url).protocol === 'https:' && !new URL(url).search && !new URL(url).hash));
  assert.doesNotMatch(xml, /localhost|workers\.dev|<lastmod>|<changefreq>|<priority>/);
});

test('gerador: rejeita simulados, duplicados, IDs inválidos e não escreve em falha de validação', () => {
  for (const input of [[], {}, [catalog[0], catalog[0]], [{ ...catalog[0], isSimulated: true }], [{ ...catalog[0], id: '1&2' }]]) assert.throws(() => generateSitemap(input), /Sitemap:/);
  const dir = mkdtempSync(join(tmpdir(), 'wg-seo-'));
  try {
    const input = join(dir, 'catalog.json'), output = join(dir, 'out');
    writeFileSync(input, JSON.stringify([catalog[0]]));
    assert.equal(generateSeoFiles(input, output), 2);
    const before = readFileSync(join(output, 'sitemap.xml'), 'utf8');
    assert.ok(readFileSync(join(output, 'robots.txt'), 'utf8').includes('Sitemap: https://wewallpapers.cc/sitemap.xml'));
    writeFileSync(input, '{'); assert.throws(() => generateSeoFiles(input, output));
    assert.equal(readFileSync(join(output, 'sitemap.xml'), 'utf8'), before);
    assert.ok(!existsSync(join(dir, 'out', 'catalog.json')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('robots e HTML: crawl permitido, recursos acessíveis, imagem real e sem noindex/verification inventados', () => {
  const robots = readFileSync('public/robots.txt', 'utf8'), html = readFileSync('index.html', 'utf8');
  assert.equal(robots, `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  assert.doesNotMatch(html, /noindex|nofollow|google-site-verification/i);
  assert.match(html, /twitter:card" content="summary_large_image/);
  assert.match(html, /og:image" content="__SITE_URL__\/social-card.png/);
  // Shared shell must not declare the homepage canonical for every wallpaper route.
  assert.doesNotMatch(html, /rel="canonical"/);
  const png = readFileSync('public/social-card.png');
  assert.equal(png.subarray(1, 4).toString(), 'PNG'); assert.equal(png.readUInt32BE(16), 1200); assert.equal(png.readUInt32BE(20), 630);
});

test('social e JSON-LD: preview HTTPS ou fallback real, campos verdadeiros e EN/PT preservados', () => {
  for (const invalid of [undefined, 'http://bad.invalid/a', 'javascript:alert(1)', 'https://user:pass@example.invalid/a']) assert.equal(socialImage(invalid), DEFAULT_SOCIAL_IMAGE);
  const image = 'https://example.invalid/real-preview.jpg';assert.equal(socialImage(image), image);
  const home = structuredData('Title', 'Description');assert.equal(home['@type'], 'WebSite');assert.equal(home.url, SITE_URL + '/');
  for (const language of ['en', 'pt-BR']) {
    const data = structuredData('Title', 'Description', { wallpaperId: catalog[0].id, image, language });
    assert.equal(data['@type'], 'WebPage');assert.equal(data.inLanguage, language);assert.equal(data.url, canonicalUrl(catalog[0].id));assert.equal(data.primaryImageOfPage.contentUrl, image);
    assert.equal(data.author, undefined);assert.equal(data.aggregateRating, undefined);assert.equal(data.review, undefined);
    assert.deepEqual(JSON.parse(JSON.stringify(data)), data);
  }
});

// Small DOM fixture exercises production mutation. No copy of the SEO rules lives here.
function domFixture() {
  const nodes = [];
  const createElement = tag => ({ tag, attributes: {}, textContent: '', get content() { return this.attributes.content; }, set content(value) { this.attributes.content = value; }, setAttribute(key, value) { this.attributes[key] = value; }, getAttribute(key) { return this.attributes[key] ?? null; }, removeAttribute(key) { delete this.attributes[key]; }, remove() { const i = nodes.indexOf(this); if (i >= 0) nodes.splice(i, 1); } });
  const querySelectorAll = selector => { const [, tag, key, value] = selector.match(/^(\w+)\[([^=]+)="([^"]+)"\]$/); return nodes.filter(n => n.tag === tag && n.attributes[key] === value); };
  const doc = { title: '', createElement, head: { appendChild(node) { nodes.push(node); } }, querySelectorAll, querySelector: selector => querySelectorAll(selector)[0] ?? null };
  for (const [key, type] of [['description','name'],['og:title','property'],['og:description','property'],['twitter:title','name'],['twitter:description','name']]) { const node = createElement('meta');node.setAttribute(type,key);doc.head.appendChild(node); }
  return doc;
}

test('mutações de produção: home → detalhe A → detalhe B → home filtrada; canonical único, reset social e idiomas', () => {
  const previous = globalThis.document; const doc = domFixture();globalThis.document = doc;
  try {
    for (const [language, id, image] of [['en',null,undefined],['pt-BR',catalog[0].id,catalog[0].previewUrl],['en',catalog[1].id,undefined],['en',null,undefined]]) {
      const title = id ? `External <title> — WallpaperGallery` : translate(language,'siteTitle');
      updatePageMetadata(title, translate(language,'siteDescription'), {wallpaperId:id,image,language});
      assert.equal(doc.title,title);assert.equal(doc.querySelectorAll('link[rel="canonical"]').length,1);
      assert.equal(doc.querySelector('link[rel="canonical"]').getAttribute('href'),canonicalUrl(id));
      assert.equal(doc.querySelector('meta[property="og:url"]').content,canonicalUrl(id));
      assert.equal(doc.querySelector('meta[name="twitter:image"]').content,socialImage(image));
      assert.equal(doc.querySelector('meta[property="og:locale"]').content,language==='en'?'en_US':'pt_BR');
      assert.equal(JSON.parse(doc.querySelector('script[type="application/ld+json"]').textContent).url,canonicalUrl(id));
      assert.equal(doc.querySelector('meta[name="description"]').content,translate(language,'siteDescription'));
    }
  } finally { if (previous === undefined) delete globalThis.document;else globalThis.document=previous; }
});
