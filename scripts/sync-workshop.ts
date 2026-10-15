/**
 * WallpaperGallery — Script Gerador de Catálogo via Steam Web API (Etapa 8)
 *
 * Consulta o Steam Workshop (AppID 431960 - Wallpaper Engine) via
 * IPublishedFileService/QueryFiles, normaliza metadados, categorias,
 * resoluções, mídias e gera o catálogo JSON do projeto.
 *
 * Suporta execução online com STEAM_API_KEY ou modo offline/demonstração (--mock-export).
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import process from 'node:process';
import type {
  WallpaperItem,
  WallpaperType,
  WallpaperAgeRating,
  AspectRatio,
} from '../src/types/wallpaper';

export const WALLPAPER_ENGINE_APP_ID = 431960;
export const DEFAULT_OUTPUT_FILE = 'public/data/catalog.json';

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

  if (lowerTags.some((t) => t.includes('video'))) return 'Video';
  if (
    lowerTags.some(
      (t) => t === 'web' || t.includes('html') || t.includes('webgl')
    )
  ) {
    return 'Web';
  }
  if (lowerTags.some((t) => t.includes('application') || t.includes('exe'))) {
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

  // Padrão seguro para Wallpaper Engine
  return { resolution: '1920x1080', aspectRatio: '16:9' };
}

/**
 * Normaliza classificação indicativa
 */
export function normalizeRating(tags: string[]): WallpaperAgeRating {
  const lower = tags.map((t) => t.toLowerCase());
  if (lower.includes('mature')) return 'Mature';
  if (lower.includes('questionable')) return 'Questionable';
  return 'Everyone';
}

/**
 * Filtra tags temáticas válidas (excluindo tags estruturais de sistema como resolução e rating)
 */
export function extractThematicTags(tags: string[]): string[] {
  const structuralRegex =
    /^(scene|video|web|application|everyone|questionable|mature|\d{3,4}\s*x\s*\d{3,4}|dual.*|triple.*|ultrawide.*)$/i;

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
    : new Date().toISOString();

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
    title: raw.title || `Wallpaper #${raw.publishedfileid}`,
    description: (raw.file_description || '').trim(),
    author: {
      name: raw.creator ? `SteamUser (${raw.creator})` : 'Steam Creator',
      steamId: raw.creator,
    },
    previewUrl:
      raw.preview_url ||
      'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1000&q=80',
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

/**
 * Consulta a Steam Web API IPublishedFileService/QueryFiles/v1/
 */
export async function fetchSteamWorkshopWallpapers(options: {
  apiKey: string;
  limit?: number;
  queryType?: number;
}): Promise<WallpaperItem[]> {
  const { apiKey, limit = 20, queryType = 1 } = options;

  const params = new URLSearchParams({
    key: apiKey,
    appid: String(WALLPAPER_ENGINE_APP_ID),
    query_type: String(queryType), // 1 = RankedByVote, 0 = RankedByPublicationDate
    numperpage: String(Math.min(limit, 100)),
    return_previews: 'true',
    return_tags: 'true',
    return_metadata: 'true',
    return_vote_data: 'true',
    return_kv_tags: 'true',
  });

  const url = `https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'WallpaperGallery-Catalog-Generator/1.0',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Steam API request failed with status ${response.status}: ${errorText}`
    );
  }

  const data = (await response.json()) as {
    response?: {
      publishedfiledetails?: SteamPublishedFileRaw[];
      total?: number;
    };
  };

  const rawItems = data.response?.publishedfiledetails || [];
  return rawItems.map(normalizeSteamWorkshopItem);
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

  return mockSteamRaw.map(normalizeSteamWorkshopItem);
}

/**
 * Função principal executada via linha de comando
 */
export async function main() {
  const args = process.argv.slice(2);
  const isMockExport =
    args.includes('--mock-export') || args.includes('--offline');

  const keyArg = args.find((a) => a.startsWith('--key='));
  const apiKey = keyArg ? keyArg.split('=')[1] : process.env.STEAM_API_KEY;

  const outArg = args.find((a) => a.startsWith('--out='));
  const outputPath = resolve(
    process.cwd(),
    outArg ? outArg.split('=')[1] : DEFAULT_OUTPUT_FILE
  );

  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 20;

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   WallpaperGallery — Gerador de Catálogo Steam Workshop    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  let wallpapers: WallpaperItem[] = [];

  if (isMockExport || !apiKey) {
    if (!apiKey && !isMockExport) {
      console.warn('⚠️  Nenhuma STEAM_API_KEY detectada no ambiente nem via --key=...');
      console.warn('ℹ️  Executando exportação em modo de demonstração (--mock-export).\n');
      console.warn('💡 Para consultar a API real da Steam, forneça:');
      console.warn('   export STEAM_API_KEY="SUA_CHAVE_AQUI"');
      console.warn('   npm run sync:workshop\n');
    } else {
      console.log('📦 Modo de demonstração ativado (--mock-export / --offline).');
    }

    wallpapers = generateMockSteamCatalog();
  } else {
    console.log(`🌐 Conectando à Steam Web API (AppID ${WALLPAPER_ENGINE_APP_ID})...`);
    console.log(`🔍 Buscando ${limit} itens mais populares...`);
    try {
      wallpapers = await fetchSteamWorkshopWallpapers({ apiKey, limit });
    } catch (err) {
      console.error('❌ Falha na conexão com a Steam API:', err);
      process.exit(1);
    }
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(wallpapers, null, 2), 'utf-8');

  console.log(`\n✅ Sucesso! Catálogo gerado com ${wallpapers.length} wallpapers.`);
  console.log(`📁 Arquivo salvo em: ${outputPath}\n`);
}

// Execução direta via CLI se chamado diretamente
if (process.argv[1]?.endsWith('sync-workshop.ts') || process.argv[1]?.endsWith('sync-workshop.js')) {
  main().catch((err) => {
    console.error('Erro na execução:', err);
    process.exit(1);
  });
}
