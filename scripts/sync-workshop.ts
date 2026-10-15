/**
 * WallpaperGallery — Script Gerador e Sincronizador de Catálogo via Steam Web API
 *
 * Consulta o Steam Workshop (AppID 431960 - Wallpaper Engine) via
 * IPublishedFileService/QueryFiles, normaliza metadados, categorias,
 * resoluções, mídias e funde incrementalmente novos wallpapers ao catálogo JSON.
 *
 * Suporta:
 * - Leitura automática de variáveis do arquivo .env local (Node.js 20+)
 * - Execução online via STEAM_API_KEY ou modo offline/demonstração (--mock-export)
 * - Fusão incremental (merge sem perder itens anteriores já coletados)
 * - Modos de consulta: --mode=all (populares + recentes), --mode=popular, --mode=recent
 * - Paginação de múltiplas páginas com --pages=N (até 100 itens por página)
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import process from 'node:process';
import { isWallpaperItem } from '../src/utils/validateWallpaper.ts';
import { createCatalogShards, writeCatalogShardsSync } from '../src/utils/catalogSharder.ts';
import { ModerationPipeline } from '../src/services/moderation/moderationPipeline.ts';
import type {
  WallpaperItem,
  WallpaperType,
  WallpaperAgeRating,
  AspectRatio,
} from '../src/types/wallpaper';

export const WALLPAPER_ENGINE_APP_ID = 431960;
export const DEFAULT_OUTPUT_FILE = 'public/data/catalog.json';
export const STEAM_QUERY = { popular: 0, recent: 1 } as const;
export const REAL_SYNC_AUTHORIZATION = 'AUTORIZO A PRIMEIRA SINCRONIZAÇÃO DE 200 WALLPAPERS.';

export function loadLocalEnv() {
  try { process.loadEnvFile(); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Arquivo .env inválido');
  }
}

export function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} deve ser um inteiro positivo`);
  return value;
}

/**
 * Estrutura bruta de um item retornado pela API IPublishedFileService da Steam
 */
export interface SteamPublishedFileRaw {
  publishedfileid: string;
  result?: number;
  creator?: string;
  creator_appid?: number;
  consumer_appid?: number;
  filename?: string;
  file_size?: string | number;
  file_url?: string;
  hcontent_file?: string;
  preview_url?: string;
  hcontent_preview?: string;
  title: string;
  file_description?: string;
  time_created?: number;
  time_updated?: number;
  visibility?: number;
  flags?: number;
  workshop_file?: boolean;
  workshop_accepted?: boolean;
  show_subscribe_all?: boolean;
  num_comments_developer?: number;
  num_comments_public?: number;
  banned?: boolean;
  ban_reason?: string;
  banner?: string;
  can_be_deleted?: boolean;
  app_name?: string;
  file_type?: number;
  can_subscribe?: boolean;
  subscriptions?: number;
  favorited?: number;
  followers?: number;
  lifetime_subscriptions?: number;
  lifetime_favorited?: number;
  lifetime_followers?: number;
  lifetime_playtime?: string;
  lifetime_playtime_sessions?: string;
  views?: number;
  num_children?: number;
  num_reports?: number;
  previews?: Array<{
    previewid?: string;
    sortorder?: number;
    url?: string;
    size?: number;
    original_filename?: string;
    preview_type?: number;
    youtubevideo?: string;
  }>;
  tags?: Array<{
    tag: string;
    display_name?: string;
  }>;
  vote_data?: {
    score?: number;
    votes_up?: number;
    votes_down?: number;
  };
}

/**
 * Normaliza as tags da Steam em tipo de wallpaper (Scene, Video, Web, Application)
 */
export function normalizeWallpaperType(tags: string[]): WallpaperType {
  const lowerTags = tags.map((t) => t.toLowerCase().trim());

  if (lowerTags.some((t) => t === 'video')) return 'Video';
  if (
    lowerTags.some(
      (t) => t === 'web' || t.includes('html') || t.includes('webgl')
    )
  ) {
    return 'Web';
  }
  if (lowerTags.some((t) => t === 'application' || t === 'exe')) {
    return 'Application';
  }
  return 'Scene';
}

/**
 * Normaliza a resolução extraída das tags da Steam (ex: "3840 x 2160" -> "3840x2160")
 */
export function normalizeResolution(tags: string[]): {
  resolution: string;
  aspectRatio: AspectRatio;
} {
  for (const tag of tags) {
    const cleaned = tag.replace(/\s+/g, '').toLowerCase();

    // Casos padrão como 3840x2160, 2560x1440, 1920x1080
    const resMatch = cleaned.match(/(\d{3,4})x(\d{3,4})/);
    if (resMatch) {
      const width = parseInt(resMatch[1], 10);
      const height = parseInt(resMatch[2], 10);
      const formatted = `${width}x${height}`;

      // Cálculo de proporção
      const ratio = width / height;
      let aspectRatio: AspectRatio = 'Other';

      if (Math.abs(ratio - 16 / 9) < 0.05) {
        aspectRatio = '16:9';
      } else if (Math.abs(ratio - 21 / 9) < 0.1 || Math.abs(ratio - 43 / 18) < 0.1) {
        aspectRatio = '21:9';
      } else if (Math.abs(ratio - 16 / 10) < 0.05) {
        aspectRatio = '16:10';
      } else if (Math.abs(ratio - 32 / 9) < 0.1) {
        aspectRatio = '32:9';
      }

      return { resolution: formatted, aspectRatio };
    }
  }

  // Metadado ausente permanece desconhecido
  return { resolution: 'Não informada', aspectRatio: 'Other' };
}

/**
 * Normaliza classificação indicativa
 */
export function normalizeRating(tags: string[]): WallpaperAgeRating {
  const cleaned = tags.map((t) => (typeof t === 'string' ? t.trim().toLowerCase() : ''));
  if (cleaned.includes('mature')) return 'Mature';
  if (cleaned.includes('questionable')) return 'Questionable';
  if (cleaned.includes('everyone')) return 'Everyone';
  return 'Unrated';
}

/**
 * Filtra tags temáticas válidas (excluindo tags estruturais de sistema como resolução e rating)
 */
export function extractThematicTags(tags: string[]): string[] {
  const structuralRegex =
    /^(scene|video|web|application|everyone|questionable|mature|unrated|\d{3,4}\s*x\s*\d{3,4}|dual.*|triple.*|ultrawide.*)$/i;

  return tags
    .map((t) => t.trim())
    .filter((t) => Boolean(t) && !structuralRegex.test(t));
}

/**
 * Normaliza um item bruto retornado pela Steam para o formato de nosso catálogo
 */
export function normalizeSteamWorkshopItem(raw: SteamPublishedFileRaw): WallpaperItem {
  const rawTags = (raw.tags || []).map((t) => (typeof t === 'string' ? t : t.tag));
  const type = normalizeWallpaperType(rawTags);
  const { resolution, aspectRatio } = normalizeResolution(rawTags);
  const rating = normalizeRating(rawTags);
  const thematicTags = extractThematicTags(rawTags);

  // Extrair YouTube preview do array de previews se disponível
  let youtubePreviewUrl: string | undefined;
  if (raw.previews && Array.isArray(raw.previews)) {
    const ytPreview = raw.previews.find((p) => Boolean(p.youtubevideo));
    if (ytPreview?.youtubevideo) {
      youtubePreviewUrl = `https://www.youtube.com/watch?v=${ytPreview.youtubevideo}`;
    }
  }

  const createdAt = raw.time_created
    ? new Date(raw.time_created * 1000).toISOString()
    : '';

  const updatedAt = raw.time_updated
    ? new Date(raw.time_updated * 1000).toISOString()
    : createdAt;

  const fileSizeBytes =
    typeof raw.file_size === 'string'
      ? parseInt(raw.file_size, 10)
      : raw.file_size || undefined;

  const votesUp = raw.vote_data?.votes_up;

  return {
    id: String(raw.publishedfileid),
    isSimulated: false,
    title: raw.title || `Wallpaper #${raw.publishedfileid}`,
    description: (raw.file_description || '').trim(),
    author: {
      name: raw.creator ? `SteamUser (${raw.creator})` : 'Steam Creator',
      steamId: raw.creator,
    },
    previewUrl:
      raw.preview_url || '',
    youtubePreviewUrl,
    type,
    resolution,
    aspectRatio,
    tags: thematicTags.length > 0 ? thematicTags : ['Wallpaper Engine'],
    rating,
    fileSizeBytes: Number.isNaN(fileSizeBytes) ? undefined : fileSizeBytes,
    createdAt,
    updatedAt,
    stats: {
      views: raw.views,
      subscriptions: raw.subscriptions,
      favorited: raw.favorited,
      votesUp,
    },
    steamUrl: `https://steamcommunity.com/sharedfiles/filedetails/?id=${raw.publishedfileid}`,
    steamClientUri: `steam://url/CommunityFilePage/${raw.publishedfileid}`,
  };
}

export interface MergeResult {
  merged: WallpaperItem[];
  added: number;
  updated: number;
  unchanged: number;
}

/**
 * Funde incrementalmente novos wallpapers ao catálogo existente, sem duplicar nem apagar itens prévios.
 */
export function mergeWallpapers(
  existingItems: WallpaperItem[],
  incomingItems: WallpaperItem[]
): MergeResult {
  const map = new Map<string, WallpaperItem>();

  for (const item of existingItems) {
    if (item && item.id) {
      map.set(item.id, item);
    }
  }

  let added = 0;
  let updated = 0;
  let unchanged = 0;

  for (const incoming of incomingItems) {
    if (!incoming || !incoming.id) continue;

    if (map.has(incoming.id)) {
      const existing = map.get(incoming.id)!;
      const defined = <T extends object>(value: T) => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
      const combined = {
        ...existing, ...defined(incoming),
        author: { ...existing.author, ...defined(incoming.author) },
        stats: { ...existing.stats, ...defined(incoming.stats) },
      } as WallpaperItem;
      if (JSON.stringify(combined) !== JSON.stringify(existing)) {
        map.set(incoming.id, combined);
        updated++;
      } else { unchanged++; }
    } else {
      map.set(incoming.id, incoming);
      added++;
    }
  }

  return {
    merged: Array.from(map.values()),
    added,
    updated,
    unchanged,
  };
}

/**
 * Consulta a Steam Web API IPublishedFileService/QueryFiles/v1/ com paginação
 */
export async function fetchSteamWorkshopWallpapers(options: {
  apiKey: string;
  limitPerPage?: number;
  pages?: number;
  queryType?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}): Promise<WallpaperItem[]> {
  const { apiKey, limitPerPage = 100, pages = 1, queryType = STEAM_QUERY.popular, fetchImpl = fetch, sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms)) } = options;
  positiveInteger(pages, "pages");
  positiveInteger(limitPerPage, "limitPerPage");
  if (pages > 1000) throw new Error("Use no máximo 1000 páginas; varredura histórica exige cursor");
  const allWallpapers: WallpaperItem[] = [];

  for (let page = 1; page <= pages; page++) {
    const params = new URLSearchParams({
      key: apiKey,
      appid: String(WALLPAPER_ENGINE_APP_ID),
      query_type: String(queryType), // 0 = RankedByVote, 1 = RankedByPublicationDate
      page: String(page),
      numperpage: String(Math.min(limitPerPage, 100)),
      return_previews: 'true',
      return_tags: 'true',
      return_metadata: 'true',
      return_vote_data: 'true',
      return_kv_tags: 'true',
    });

    const url = `https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/?${params.toString()}`;

    let response: Response | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await fetchImpl(url, {
          headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000),
        });
      } catch {
        if (attempt === 2) throw new Error('Steam API: falha de rede ou timeout');
      }
      if (response?.ok) break;
      if (response && response.status !== 429 && response.status < 500) {
        throw new Error(`Steam API: HTTP ${response.status}`);
      }
      if (attempt === 2) throw new Error(`Steam API: tentativas esgotadas (HTTP ${response?.status ?? 'rede'})`);
      await sleep(500 * 2 ** attempt);
    }
    if (!response) throw new Error('Steam API: sem resposta');
    const data = (await response.json()) as {
      response?: {
        publishedfiledetails?: SteamPublishedFileRaw[];
        total?: number;
      };
    };

    if (!Array.isArray(data.response?.publishedfiledetails)) throw new Error('Steam API: resposta inválida');
    const rawItems = data.response.publishedfiledetails;
    if (rawItems.length === 0) {
      break; // Não há mais itens disponíveis
    }

    for (const raw of rawItems) {
      if (!/^\d+$/.test(raw.publishedfileid) || typeof raw.title !== 'string') throw new Error('Steam API: item inválido');
      if ((raw.result !== undefined && raw.result !== 1) || raw.banned || (raw.visibility !== undefined && raw.visibility !== 0) || (raw.consumer_appid !== undefined && raw.consumer_appid !== WALLPAPER_ENGINE_APP_ID)) continue;
      const item = normalizeSteamWorkshopItem(raw);
      if (!isWallpaperItem(item)) throw new Error('Steam API: metadados normalizados inválidos');
      allWallpapers.push(item);
    }

    // Intervalo respeitoso entre requisições para evitar rate limit
    if (page < pages) {
      await sleep(400);
    }
  }

  return Array.from(new Map(allWallpapers.map(item => [item.id, item])).values());
}

/**
 * Gera um catálogo de demonstração a partir de dados simulados compatíveis com a Steam API
 */
export function generateMockSteamCatalog(): WallpaperItem[] {
  const mockSteamRaw: SteamPublishedFileRaw[] = [
    {
      publishedfileid: '2987102911',
      title: 'Neon Sakura Cyberpunk City Rain (Interactive)',
      file_description:
        'Cenário cyberpunk em Neo-Tokyo com chuva reativa e reflexos de neon em tempo real.',
      creator: '76561198000000001',
      preview_url:
        'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=1000&q=80',
      time_created: 1723636800,
      time_updated: 1725287400,
      file_size: 45200000,
      views: 45200,
      subscriptions: 18300,
      favorited: 4200,
      vote_data: { votes_up: 3900 },
      tags: [
        { tag: 'Scene' },
        { tag: '3840 x 2160' },
        { tag: 'Everyone' },
        { tag: 'Cyberpunk' },
        { tag: 'Rain' },
        { tag: 'City' },
      ],
      previews: [{ youtubevideo: 'jfKfPfyJRdk' }],
    },
    {
      publishedfileid: '2987102912',
      title: 'Cozy Lofi Mountain Cabin Sunset 4K',
      file_description:
        'Cabana aconchegante nas montanhas com iluminação de entardecer e neve sutil.',
      creator: '76561198000000002',
      preview_url:
        'https://images.unsplash.com/photo-1518495973542-4542c06a5843?auto=format&fit=crop&w=1000&q=80',
      time_created: 1721502120,
      time_updated: 1721502120,
      file_size: 112000000,
      views: 89400,
      subscriptions: 34100,
      favorited: 8900,
      vote_data: { votes_up: 7800 },
      tags: [
        { tag: 'Video' },
        { tag: '2560 x 1440' },
        { tag: 'Everyone' },
        { tag: 'Nature' },
        { tag: 'Cozy' },
        { tag: 'Sunset' },
      ],
    },
    {
      publishedfileid: '2987102913',
      title: 'Audio Visualizer Spectrum 3D (WebGL)',
      file_description:
        'Visualizador de áudio interativo baseado em WebGL com ondas reativas aos sons do sistema.',
      creator: '76561198000000006',
      preview_url:
        'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=1000&q=80',
      time_created: 1726002000,
      time_updated: 1726169400,
      file_size: 14200000,
      views: 54300,
      subscriptions: 21500,
      favorited: 6200,
      vote_data: { votes_up: 5400 },
      tags: [
        { tag: 'Web' },
        { tag: '2560 x 1440' },
        { tag: 'Everyone' },
        { tag: 'Abstract' },
        { tag: 'Audio Visualizer' },
        { tag: 'Interactive' },
      ],
      previews: [{ youtubevideo: 'dQw4w9WgXcQ' }],
    },
  ];

  return mockSteamRaw.map(raw => ({ ...normalizeSteamWorkshopItem(raw), isSimulated: true }));
}

/**
 * Função principal executada via linha de comando
 */
export async function main() {
  loadLocalEnv();
  const args = process.argv.slice(2);
  const isMockExport =
    args.includes('--mock-export') || args.includes('--offline');

  const keyArg = args.find((a) => a.startsWith('--key='));
  if (keyArg) throw new Error('Use STEAM_API_KEY no ambiente, nunca --key');
  const apiKey = process.env.STEAM_API_KEY;

  const outArg = args.find((a) => a.startsWith('--out='));
  const outputPath = resolve(
    process.cwd(),
    outArg ? outArg.slice(6) : isMockExport ? 'public/data/demo-catalog.json' : DEFAULT_OUTPUT_FILE
  );

  const pagesArg = args.find((a) => a.startsWith('--pages='));
  const pages = positiveInteger(pagesArg ? Number(pagesArg.slice(8)) : 1, 'pages');

  const modeArg = args.find((a) => a.startsWith('--mode='));
  const mode = modeArg ? modeArg.split('=')[1] : 'all'; // 'all', 'popular', 'recent'

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   WallpaperGallery — Gerador de Catálogo Steam Workshop    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  if (args.some(arg => !['--mock-export', '--offline', '--authorize-real-sync'].includes(arg) && !['--mode=', '--pages=', '--out='].some(prefix => arg.startsWith(prefix)))) throw new Error('Argumento desconhecido');
  if (!isMockExport && pages !== 1) throw new Error('Primeira sincronização limitada a no máximo 200 itens (uma página por ordenação)');
  if (!['all', 'popular', 'recent'].includes(mode)) throw new Error('mode inválido');
  if (!isMockExport && (process.env.WALLPAPER_SYNC_AUTHORIZATION !== REAL_SYNC_AUTHORIZATION || !args.includes('--authorize-real-sync'))) throw new Error('Sincronização real exige autorização explícita');
  if (!isMockExport && !apiKey) throw new Error('STEAM_API_KEY ausente');
  if (isMockExport && outputPath === resolve(DEFAULT_OUTPUT_FILE)) throw new Error('Demonstração não pode sobrescrever catálogo real');
  let fetchedWallpapers: WallpaperItem[] = [];

  if (isMockExport) {
    fetchedWallpapers = generateMockSteamCatalog();
  } else {
    console.log(`🌐 Conectando à Steam Web API (AppID ${WALLPAPER_ENGINE_APP_ID})...`);
    console.log(`📋 Modo de consulta: [${mode.toUpperCase()}] | Páginas: ${pages}\n`);

    try {
      if (mode === 'all') {
        // Consulta tanto os mais populares (RankedByVote) quanto os recém-adicionados (RankedByPublicationDate)
        console.log(`⭐ Coletando ${pages} página(s) de wallpapers mais populares (RankedByVote)...`);
        const popular = await fetchSteamWorkshopWallpapers({
          apiKey: apiKey!,
          queryType: STEAM_QUERY.popular,
          pages,
          limitPerPage: 100,
        });

        console.log(`✨ Coletando ${pages} página(s) de wallpapers recém-adicionados (RankedByPublicationDate)...`);
        const recent = await fetchSteamWorkshopWallpapers({
          apiKey: apiKey!,
          queryType: STEAM_QUERY.recent,
          pages,
          limitPerPage: 100,
        });

        fetchedWallpapers = [...popular, ...recent];
      } else if (mode === 'recent') {
        console.log(`✨ Coletando ${pages} página(s) de wallpapers recém-adicionados...`);
        fetchedWallpapers = await fetchSteamWorkshopWallpapers({
          apiKey: apiKey!,
          queryType: STEAM_QUERY.recent,
          pages,
          limitPerPage: 100,
        });
      } else {
        console.log(`⭐ Coletando ${pages} página(s) de wallpapers mais populares...`);
        fetchedWallpapers = await fetchSteamWorkshopWallpapers({
          apiKey: apiKey!,
          queryType: STEAM_QUERY.popular,
          pages,
          limitPerPage: 100,
        });
      }
    } catch (err) {
      console.error('Falha na coleta Steam; catálogo preservado.');
      process.exit(1);
    }
  }

  // 1. Ler catálogo existente se já existir para realizar merge incremental
  let existingCatalog: WallpaperItem[] = [];
  let originalDiskCatalog: WallpaperItem[] = [];
  const hadOriginalDiskCatalog = existsSync(outputPath);
  let originalRawBytes: string | null = null;
  if (hadOriginalDiskCatalog) {
    try {
      const raw = readFileSync(outputPath, 'utf-8');
      originalRawBytes = raw;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.some(item => !item || typeof item.id !== 'string')) throw new Error('Catálogo inválido');
      existingCatalog = parsed;
      originalDiskCatalog = parsed;
    } catch (err) {
      throw new Error('Catálogo existente inválido; original preservado', { cause: err });
    }
  }

  if (existingCatalog.some(item => Boolean(item.isSimulated) !== isMockExport)) {
    if (!isMockExport && existingCatalog.every(item => item.isSimulated)) {
      console.log('⚠️ Catálogo existente contém apenas dados de demonstração simulados.');
      console.log('   Preservando cópia em legacy-simulated-samples.json e iniciando catálogo de produção real...');
      try {
        writeFileSync(resolve(dirname(outputPath), 'legacy-simulated-samples.json'), JSON.stringify(existingCatalog, null, 2), 'utf-8');
      } catch {}
      existingCatalog = [];
    } else {
      throw new Error('Não é permitido misturar dados reais e simulados');
    }
  }

  // 2. Fundir dados incrementalmente (evita perder wallpapers coletados anteriormente)
  const { merged, added, updated, unchanged } = mergeWallpapers(
    existingCatalog,
    fetchedWallpapers
  );

  // 3. Moderação COMPLETA do catálogo consolidado (Merged Collection)
  // Garante que tanto novos wallpapers quanto itens pré-existentes (ex: IDs antigos
  // adicionados à blacklist ou com metadados reprovados) sejam filtrados antes de qualquer escrita.
  let finalWallpapers = merged;
  if (!isMockExport) {
    console.log(`🛡️ Aplicando moderação de conteúdo sobre o catálogo consolidado (${merged.length} wallpapers)...`);
    const pipeline = new ModerationPipeline();
    const approved: WallpaperItem[] = [];
    const quarantined: Array<{ item: WallpaperItem; reasons: string[] }> = [];

    for (const item of merged) {
      const decision = pipeline.evaluateItem(item);
      if (decision.status === 'safe') {
        approved.push(item);
      } else {
        quarantined.push({ item, reasons: decision.reasons.map((r) => r.message) });
      }
    }

    if (quarantined.length > 0) {
      console.log(`⚠️ ${quarantined.length} wallpaper(s) retidos por moderação/quarentena e excluídos do catálogo.`);
      try {
        const qPath = resolve('.moderation/quarantine.json');
        mkdirSync(dirname(qPath), { recursive: true });
        writeFileSync(qPath, JSON.stringify(quarantined, null, 2), 'utf-8');
      } catch {}
    }
    finalWallpapers = approved;
    console.log(`✅ ${finalWallpapers.length} wallpaper(s) aprovados para o catálogo público.\n`);
  }

  // 4. Pré-validação rigorosa de todos os itens antes de modificar arquivos públicos
  for (const item of finalWallpapers) {
    if (!isWallpaperItem(item)) {
      throw new Error(`Item inválido para inclusão no catálogo: ${(item as { id?: string })?.id ?? 'desconhecido'}`);
    }
    if (!isMockExport && item.isSimulated) {
      throw new Error(`Item simulado rejeitado no catálogo de produção: ${item.id}`);
    }
  }

  const shardedDir = outputPath.endsWith('.json')
    ? outputPath.slice(0, -5)
    : resolve(dirname(outputPath), 'catalog');

  const sharded = createCatalogShards(finalWallpapers, {
    appId: WALLPAPER_ENGINE_APP_ID,
    pageSize: 24,
    allowSimulated: isMockExport,
  });

  const shardsLockPath = `${shardedDir}.lock`;
  if (existsSync(shardsLockPath)) {
    const err = new Error(`EEXIST: Lock ocupado em: ${shardsLockPath}`);
    (err as NodeJS.ErrnoException).code = 'EEXIST';
    throw err;
  }

  // 5. Salvar catálogo consolidado e shards com proteção de rollback
  mkdirSync(dirname(outputPath), { recursive: true });
  const lockPath = `${outputPath}.lock`;
  const lock = openSync(lockPath, 'wx');
  const tempPath = `${outputPath}.${process.pid}.tmp`;
  let publicationStarted = false;
  try {
    // Detecta mudanças desde a leitura para evitar sobrescrever outro coletor.
    if (existsSync(outputPath)) {
      if (!hadOriginalDiskCatalog) {
        throw new Error('Catálogo alterado por outro processo');
      }
      const currentRaw = readFileSync(outputPath, 'utf-8');
      if (currentRaw !== originalRawBytes) {
        throw new Error('Catálogo alterado por outro processo');
      }
    } else if (hadOriginalDiskCatalog) {
      throw new Error('Catálogo alterado por outro processo');
    }

    writeFileSync(tempPath, JSON.stringify(finalWallpapers, null, 2), { encoding: 'utf-8', flag: 'wx' });
    renameSync(tempPath, outputPath);
    publicationStarted = true;

    writeCatalogShardsSync(shardedDir, sharded, {
      isMock: isMockExport,
    });
  } catch (err) {
    // R-01: Não restaurar arquivo que esta execução ainda não substituiu
    // R-02: Restaurar exatamente os bytes originais ou remover arquivo se não existia
    if (publicationStarted) {
      try {
        if (hadOriginalDiskCatalog && originalRawBytes !== null) {
          writeFileSync(outputPath, originalRawBytes, 'utf-8');
        } else if (!hadOriginalDiskCatalog && existsSync(outputPath)) {
          unlinkSync(outputPath);
        }
      } catch {}
    }
    throw err;
  } finally {
    closeSync(lock);
    if (existsSync(lockPath)) unlinkSync(lockPath);
    if (existsSync(tempPath)) unlinkSync(tempPath);
  }

  console.log('\n📊 Relatório de Sincronização Incremental:');
  console.log(`   • Total anterior no catálogo:     ${existingCatalog.length}`);
  console.log(`   • Novos wallpapers inseridos:     +${added}`);
  console.log(`   • Wallpapers com stats atualizados: ${updated}`);
  console.log(`   • Wallpapers sem alterações:       ${unchanged}`);
  console.log(`   • Total consolidado no catálogo:   ${finalWallpapers.length}`);
  console.log(`\n✅ Sucesso! Catálogo salvo em: ${outputPath}`);
  console.log(`✅ Sucesso! Shards salvos em: ${shardedDir}\n`);
}

// Execução direta via CLI se chamado diretamente
if (process.argv[1]?.endsWith('sync-workshop.ts') || process.argv[1]?.endsWith('sync-workshop.js')) {
  main().catch((err) => {
    console.error('Sincronização interrompida. Verifique autorização, argumentos e configuração.');
    if (err instanceof Error) {
      console.error(`Detalhe: ${err.message}`);
    }
    process.exit(1);
  });
}
