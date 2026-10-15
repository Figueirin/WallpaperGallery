import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { enrichAuthors, main as authorMain } from '../scripts/enrich-authors.ts';
import { getAuthorDisplayName } from '../src/utils/authors.ts';
import { normalizeSteamWorkshopItem, mergeWallpapers } from '../scripts/sync-workshop.ts';
import { galleryUrl, wallpaperIdFromLocation, pageFromSearch } from '../src/utils/navigation.ts';
import { SITE_TITLE, SITE_DESCRIPTION, updatePageMetadata } from '../src/utils/pageMetadata.ts';

// Usa compilador já instalado para renderizar os componentes reais sem instalar DOM/browser.
mkdirSync('node_modules/.tmp', { recursive: true });
const temp = mkdtempSync(resolve('node_modules/.tmp/prelaunch-'));
const output = join(temp, 'components.mjs');
buildSync({ stdin: { contents: "export { WallpaperCard } from './src/components/WallpaperCard.tsx'; export { AuthorName } from './src/components/AuthorName.tsx';", resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', external: ['react', 'react/jsx-runtime', 'lucide-react'], outfile: output, logLevel: 'silent' });
const { WallpaperCard, AuthorName } = await import(pathToFileURL(output).href);
after(() => rmSync(temp, { recursive: true, force: true }));
const item = (id = '1', author = { name: '', steamId: '76561198000000001' }) => ({ ...normalizeSteamWorkshopItem({ publishedfileid: id, title: 'Paisagem', tags: [{ tag: 'Everyone' }] }), author });

test('renderização real: nome público aparece, placeholder e SteamID são ocultados sem nome genérico', () => {
  for (const name of ['', 'Steam Creator', 'SteamUser (76561198000000001)', '76561198000000001']) {
    const wallpaper = item('1', { name, steamId: '76561198000000001' });
    assert.equal(getAuthorDisplayName(wallpaper.author), null);
    assert.equal(renderToStaticMarkup(createElement(AuthorName, { author: wallpaper.author })), '');
    const html = renderToStaticMarkup(createElement(WallpaperCard, { wallpaper }));
    assert.ok(!html.includes('76561198000000001'));
    assert.ok(!html.includes('Steam Creator'));
  }
  const html = renderToStaticMarkup(createElement(WallpaperCard, { wallpaper: item('1', { name: 'Nome Público <&>', steamId: '76561198000000001' }) }));
  assert.ok(html.includes('Nome Público &lt;&amp;&gt;'));
});

test('renderização real: ação Steam usa HTTPS, detalhes têm link rastreável, simulado não promete Workshop', () => {
  const html = renderToStaticMarkup(createElement(WallpaperCard, { wallpaper: item('123') }));
  assert.ok(html.includes('https://steamcommunity.com/sharedfiles/filedetails/?id=123'));
  assert.ok(html.includes('href="/wallpaper/123"'));
  assert.ok(html.includes('rel="noopener noreferrer"'));
  assert.ok(!html.includes('steam://') && !html.includes('Linux'));
  const mock = renderToStaticMarkup(createElement(WallpaperCard, { wallpaper: { ...item('123'), isSimulated: true } }));
  assert.ok(!mock.includes('steamcommunity.com'));
  const detail = readFileSync('src/components/WallpaperDetailView.tsx', 'utf8');
  assert.ok(!detail.includes('.client') && !detail.includes('Linux'));
  assert.ok(detail.includes('<AuthorName author={wallpaper.author}'));
});

test('perfis oficiais: dedup, lotes 100, cache de nomes existentes, respostas parciais e preservação dos IDs', async () => {
  const input = Array.from({ length: 101 }, (_, i) => item(String(i), { name: '', steamId: String(76561198000000000n + BigInt(i)) }));
  input.push(input[0]);
  input.push(item('500', { name: 'Já Resolvido', steamId: '76561198000000500' }));
  const snapshot = JSON.stringify(input), calls = [];
  const output = await enrichAuthors(input, { apiKey: 'offline-key', sleep: async () => {}, fetchImpl: async (url, options) => {
    const parsed = new URL(url); calls.push(parsed);
    assert.equal(parsed.pathname, '/ISteamUser/GetPlayerSummaries/v2/');
    assert.ok(options.signal);
    const ids = parsed.searchParams.get('steamids').split(',');
    return Response.json({ response: { players: [{ steamid: ids[0], personaname: 'Autor Real' }, { steamid: '999', personaname: 'Injetado' }] } });
  } });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].searchParams.get('steamids').split(',').length, 100);
  assert.equal(calls[1].searchParams.get('steamids').split(',').length, 1);
  assert.equal(output[0].author.name, 'Autor Real');
  assert.equal(output[101].author.name, 'Autor Real');
  assert.equal(output[1].author.name, '');
  assert.equal(output.at(-1).author.name, 'Já Resolvido');
  assert.deepEqual(output.map(w => [w.id, w.author.steamId]), input.map(w => [w.id, w.author.steamId]));
  assert.equal(JSON.stringify(input), snapshot);
});

test('perfis: erro não vira catálogo inventado e mensagens não reproduzem corpo/chave', async () => {
  await assert.rejects(enrichAuthors([item()], { apiKey: 'offline-key', fetchImpl: async () => new Response('private-secret', { status: 403 }) }), error => /HTTP 403/.test(error.message) && !error.message.includes('private-secret'));
  await assert.rejects(enrichAuthors([item()], { apiKey: 'offline-key', fetchImpl: async () => Response.json({}) }), /resposta inválida/);
  let calls = 0;
  const output = await enrichAuthors([item()], { apiKey: 'offline-key', sleep: async () => {}, fetchImpl: async () => { calls++; return calls === 1 ? new Response('', { status: 429 }) : Response.json({ response: { players: [] } }); } });
  assert.equal(calls, 2); assert.equal(output[0].author.name, '');
});

test('normalização não inventa nome; merge preserva nome resolvido somente para o mesmo SteamID', () => {
  const normalized = normalizeSteamWorkshopItem({ publishedfileid: '1', title: 'Paisagem', creator: '76561198000000001' });
  assert.equal(normalized.author.name, '');
  const previous = { ...normalized, author: { ...normalized.author, name: 'Nome Resolvido' } };
  assert.equal(mergeWallpapers([previous], [normalized]).merged[0].author.name, 'Nome Resolvido');
  assert.equal(mergeWallpapers([previous], [{ ...normalized, author: { name: '', steamId: '76561198000000002' } }]).merged[0].author.name, '');
});

test('HTML de entrada contém identidade, idioma, SEO textual, favicon e JSON-LD sem domínio inventado', () => {
  const html = readFileSync('index.html', 'utf8');
  assert.match(html, /<html lang="pt-BR"/);
  assert.ok(html.includes(`<title>${SITE_TITLE}</title>`));
  assert.ok(html.includes(`name="description" content="${SITE_DESCRIPTION}"`));
  assert.ok(html.includes('name="viewport"'));
  for (const token of ['og:title', 'og:description', 'og:type', 'twitter:card', 'twitter:title', '/favicon.svg']) assert.ok(html.includes(token));
  const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);
  assert.equal(schema['@type'], 'WebSite'); assert.equal(schema.inLanguage, 'pt-BR');
  assert.equal(schema.url, undefined); assert.ok(!html.includes('rel="canonical"') && !html.includes('og:image'));
  assert.ok(readFileSync('public/robots.txt', 'utf8').includes('Allow: /'));
});

test('metadados por página são atualizados e restaurados sem HTML injetado', () => {
  const previous = globalThis.document;
  const elements = new Map();
  globalThis.document = { title: SITE_TITLE, querySelector(selector) { if (!elements.has(selector)) elements.set(selector, { content: 'Original' }); return elements.get(selector); } };
  try {
    const cleanup = updatePageMetadata('Paisagem <teste>', 'Descrição real');
    assert.equal(document.title, 'Paisagem <teste>');
    assert.equal(elements.get('meta[name="description"]').content, 'Descrição real');
    assert.equal(elements.get('meta[property="og:title"]').content, 'Paisagem <teste>');
    cleanup(); assert.equal(document.title, SITE_TITLE);
    assert.ok([...elements.values()].every(node => node.content === 'Original'));
  } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
});

test('navegação de produção preserva página, caminho, hash legado e decodificação segura', () => {
  assert.equal(wallpaperIdFromLocation('/wallpaper/123', ''), '123');
  assert.equal(wallpaperIdFromLocation('/', '#/wallpaper/123'), '123');
  assert.equal(wallpaperIdFromLocation('/wallpaper/%ZZ', ''), null);
  assert.equal(pageFromSearch('?page=40'), 40);
  assert.equal(pageFromSearch('?page=bad'), 1);
  const target = galleryUrl('https://offline.invalid/?page=3', 3, '123');
  assert.equal(new URL(target).pathname, '/wallpaper/123');
  assert.equal(new URL(target).searchParams.get('page'), '3');
  assert.equal(galleryUrl(target, 1, null), 'https://offline.invalid/');
});


test('entrada de perfis rejeita execução não autorizada antes de rede ou staging', async () => {
  const directory = mkdtempSync(join(temp, 'cli-'));
  const previous = { cwd: process.cwd(), argv: process.argv, auth: process.env.WALLPAPER_AUTHOR_AUTHORIZATION };
  try {
    process.chdir(directory); process.argv = [process.execPath, 'offline-author-test'];
    delete process.env.WALLPAPER_AUTHOR_AUTHORIZATION;
    await assert.rejects(authorMain(), /autorização específica/);
    assert.equal(existsSync(join(directory, '.enrichment')), false);
  } finally {
    process.chdir(previous.cwd); process.argv = previous.argv;
    if (previous.auth === undefined) delete process.env.WALLPAPER_AUTHOR_AUTHORIZATION;
    else process.env.WALLPAPER_AUTHOR_AUTHORIZATION = previous.auth;
  }
});
