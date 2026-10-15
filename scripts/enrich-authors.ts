/** Consulta opcional de perfis: não busca Workshop nem publica no catálogo real. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import process from 'node:process';
import type { WallpaperItem } from '../src/types/wallpaper.ts';
import { getAuthorDisplayName } from '../src/utils/authors.ts';
import { createCatalogShards, writeCatalogShardsSync } from '../src/utils/catalogSharder.ts';
import { loadLocalEnv } from './sync-workshop.ts';

export const AUTHOR_AUTHORIZATION = 'AUTORIZO A CONSULTA DOS NOMES PUBLICOS DOS AUTORES.';

export async function enrichAuthors(items: readonly WallpaperItem[], options: {
  apiKey: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}): Promise<WallpaperItem[]> {
  if (!options.apiKey) throw new Error('STEAM_API_KEY obrigatória');
  const request = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const names = new Map<string, string>();
  for (const item of items) {
    const name = getAuthorDisplayName(item.author);
    if (item.author.steamId && name) names.set(item.author.steamId, name);
  }
  const missing = [...new Set(items.map(item => item.author.steamId).filter((id): id is string => typeof id === 'string' && /^\d{17}$/.test(id)))].filter(id => !names.has(id));
  for (let offset = 0; offset < missing.length; offset += 100) {
    const ids = missing.slice(offset, offset + 100);
    const url = new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/');
    url.searchParams.set('key', options.apiKey);
    url.searchParams.set('steamids', ids.join(','));
    let response: Response | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { response = await request(url, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } }); }
      catch { response = undefined; }
      if (response?.ok) break;
      if (response && response.status !== 429 && response.status < 500) throw new Error(`Perfis Steam: HTTP ${response.status}`);
      if (attempt === 2) throw new Error('Perfis Steam: rede indisponível ou tentativas esgotadas');
      await sleep(500 * 2 ** attempt);
    }
    let payload: unknown;
    try { payload = await response!.json(); } catch { throw new Error('Perfis Steam: JSON inválido'); }
    const players = (payload as { response?: { players?: unknown } })?.response?.players;
    if (!Array.isArray(players)) throw new Error('Perfis Steam: resposta inválida');
    for (const player of players) {
      if (!player || !ids.includes(player.steamid) || typeof player.personaname !== 'string' || !player.personaname.trim()) continue;
      names.set(player.steamid, player.personaname.trim());
    }
    if (offset + 100 < missing.length) await sleep(400);
  }
  return items.map(item => {
    const name = item.author.steamId ? names.get(item.author.steamId) : undefined;
    return name ? { ...item, author: { ...item.author, name } } : { ...item, author: { ...item.author } };
  });
}

export async function main() {
  loadLocalEnv();
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0] !== '--authorize-steam-profiles' || process.env.WALLPAPER_AUTHOR_AUTHORIZATION !== AUTHOR_AUTHORIZATION) throw new Error('Consulta de perfis exige autorização específica');
  const items = JSON.parse(readFileSync('public/data/catalog.json', 'utf8')) as WallpaperItem[];
  const manifest = JSON.parse(readFileSync('public/data/catalog/manifest.json', 'utf8'));
  if (!Number.isSafeInteger(manifest.pageSize) || manifest.pageSize < 1) throw new Error('pageSize do manifesto inválido');
  createCatalogShards(items, { pageSize: manifest.pageSize }); // valida antes de qualquer chamada
  const enriched = await enrichAuthors(items, { apiKey: process.env.STEAM_API_KEY ?? '' });
  const staged = createCatalogShards(enriched, { pageSize: manifest.pageSize });
  const output = resolve('.enrichment');
  mkdirSync(output, { recursive: true });
  writeCatalogShardsSync(join(output, 'catalog'), staged);
  writeFileSync(join(output, 'catalog.json'), JSON.stringify(enriched, null, 2));
  console.log(`Enriquecimento preparado em .enrichment/: ${enriched.length} itens; pageSize ${manifest.pageSize}. Catálogo público não alterado.`);
}

if (process.argv[1]?.endsWith('enrich-authors.ts')) {
  main().catch(() => { console.error('Enriquecimento interrompido. Verifique autorização, configuração e dados de entrada.'); process.exitCode = 1; });
}
