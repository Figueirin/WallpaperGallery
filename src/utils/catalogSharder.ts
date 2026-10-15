/**
 * WallpaperGallery — Gerador e Estruturador de Shards do Catálogo JSON
 *
 * Divide o catálogo estático em:
 * 1. manifest.json: Metadados globais, contagem total, páginas e índices de shards
 * 2. index.json: Índice compacto para busca textual, filtros e ordenação rápidos
 * 3. pages/000001.json, ...: Shards com documentos WallpaperItem completos (ex: 24 por shard)
 */

import {
  existsSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  openSync,
  closeSync,
  unlinkSync,
  rmSync,
  readdirSync,
  copyFileSync,
} from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import {
  type WallpaperItem,
  type FilterMetadata,
  type WallpaperType,
  type WallpaperAgeRating,
  DEFAULT_PAGE_SIZE,
} from '../types/wallpaper.ts';
import { isWallpaperItem } from './validateWallpaper.ts';
import { extractFilterMetadata } from './filterWallpapers.ts';

export const CATALOG_FORMAT_VERSION = '2.0.0';
export const DEFAULT_SHARD_PAGE_SIZE = DEFAULT_PAGE_SIZE;


export interface ShardSummary {
  page: number;
  file: string;
  count: number;
  idRange: [string, string];
}

export interface CatalogManifest {
  version: string;
  generatedAt: string;
  appId: number;
  totalItems: number;
  pageSize: number;
  totalPages: number;
  metadata: FilterMetadata;
  shards: ShardSummary[];
  itemToPage: Record<string, number>;
}

export interface CompactCatalogIndexEntry {
  id: string;
  title: string;
  type: WallpaperType;
  res: string;
  tags: string[];
  rating: WallpaperAgeRating;
  author: string;
  desc: string;
  pop: number;
  date: number;
  page: number;
}

export interface CatalogShard {
  page: number;
  file: string;
  items: WallpaperItem[];
}

export interface ShardedCatalogData {
  manifest: CatalogManifest;
  index: CompactCatalogIndexEntry[];
  shards: CatalogShard[];
}

/**
 * Calcula a pontuação de popularidade de forma determinística
 */
export function calculatePopularityScore(stats?: WallpaperItem['stats']): number {
  if (!stats) return 0;
  return (stats.subscriptions ?? 0) + (stats.favorited ?? 0) + (stats.votesUp ?? 0);
}

/**
 * Converte data ISO ou string para timestamp em milissegundos
 */
export function parseDateTimestamp(dateStr?: string): number {
  if (!dateStr) return 0;
  const time = new Date(dateStr).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Cria a estrutura fragmentada (manifesto, índice compacto e shards)
 * a partir de uma lista de wallpapers.
 */
export function createCatalogShards(
  items: readonly WallpaperItem[],
  options: {
    pageSize?: number;
    generatedAt?: string;
    appId?: number;
    allowSimulated?: boolean;
  } = {}
): ShardedCatalogData {
  const pageSize = options.pageSize && options.pageSize > 0 ? options.pageSize : DEFAULT_SHARD_PAGE_SIZE;
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const appId = options.appId ?? 431960;
  const allowSimulated = Boolean(options.allowSimulated);

  // 1. Validação estrita de cada item
  const seenIds = new Set<string>();
  for (const item of items) {
    if (!isWallpaperItem(item)) {
      const rawId = item && typeof item === 'object' && 'id' in item ? String((item as { id: unknown }).id) : 'desconhecido';
      throw new Error(`Item inválido para inclusão no catálogo: ${rawId}`);
    }
    if (!allowSimulated && item.isSimulated) {
      throw new Error(`Item simulado rejeitado no catálogo de produção: ${item.id}`);
    }
    if (seenIds.has(item.id)) {
      throw new Error(`ID duplicado detectado no catálogo: ${item.id}`);
    }
    seenIds.add(item.id);
  }

  // 2. Ordenação padrão da coleção (por popularidade decrescente, desempate por data e ID)
  const sortedItems = [...items].sort((a, b) => {
    const popA = calculatePopularityScore(a.stats);
    const popB = calculatePopularityScore(b.stats);
    if (popB !== popA) return popB - popA;

    const dateA = parseDateTimestamp(a.createdAt);
    const dateB = parseDateTimestamp(b.createdAt);
    if (dateB !== dateA) return dateB - dateA;

    return a.id.localeCompare(b.id);
  });

  // 3. Extração dos metadados globais (tags, resoluções e tipos)
  const metadata = extractFilterMetadata(sortedItems);

  // 4. Divisão em shards e mapeamentos
  const totalPages = Math.ceil(sortedItems.length / pageSize) || (sortedItems.length === 0 ? 0 : 1);
  const shards: CatalogShard[] = [];
  const shardSummaries: ShardSummary[] = [];
  const itemToPage: Record<string, number> = {};
  const index: CompactCatalogIndexEntry[] = [];

  for (let p = 1; p <= totalPages; p++) {
    const startIndex = (p - 1) * pageSize;
    const pageItems = sortedItems.slice(startIndex, startIndex + pageSize);
    const fileName = `pages/${String(p).padStart(6, '0')}.json`;

    shards.push({
      page: p,
      file: fileName,
      items: pageItems,
    });

    if (pageItems.length > 0) {
      shardSummaries.push({
        page: p,
        file: fileName,
        count: pageItems.length,
        idRange: [pageItems[0].id, pageItems[pageItems.length - 1].id],
      });
    }

    for (const item of pageItems) {
      itemToPage[item.id] = p;
      index.push({
        id: item.id,
        title: item.title,
        type: item.type,
        res: item.resolution,
        tags: item.tags,
        rating: item.rating,
        author: item.author.name,
        desc: item.description,
        pop: calculatePopularityScore(item.stats),
        date: parseDateTimestamp(item.createdAt),
        page: p,
      });
    }
  }

  const manifest: CatalogManifest = {
    version: CATALOG_FORMAT_VERSION,
    generatedAt,
    appId,
    totalItems: sortedItems.length,
    pageSize,
    totalPages,
    metadata,
    shards: shardSummaries,
    itemToPage,
  };

  return {
    manifest,
    index,
    shards,
  };
}

/**
 * Grava de forma segura e atômica os shards e o manifesto em disco
 */
export function writeCatalogShardsSync(
  outputDir: string,
  shardedData: ShardedCatalogData,
  options: { isMock?: boolean } = {}
): void {
  const isMock = Boolean(options.isMock);

  if (!isMock && shardedData.manifest.totalItems > 0) {
    for (const shard of shardedData.shards) {
      if (shard.items.some(item => item.isSimulated)) {
        throw new Error('Tentativa de gravar dados simulados no catálogo de produção');
      }
    }
  }

  const absDir = resolve(outputDir);
  mkdirSync(absDir, { recursive: true });

  // Bloqueio atômico para evitar conflitos concorrentes de escrita
  const lockFile = `${absDir}.lock`;
  const lock = openSync(lockFile, 'wx');

  const tempDir = join(dirname(absDir), `.catalog_tmp_${process.pid}_${Date.now()}`);
  const rollbackDir = join(dirname(absDir), `.catalog_rollback_${process.pid}_${Date.now()}`);

  const hadManifest = existsSync(join(absDir, 'manifest.json'));
  const hadIndex = existsSync(join(absDir, 'index.json'));
  const currentPagesDir = join(absDir, 'pages');
  const originalPageFiles = existsSync(currentPagesDir)
    ? new Set(readdirSync(currentPagesDir))
    : new Set<string>();

  let promotionStarted = false;
  let rollbackSucceeded = false;
  let operationSucceeded = false;


  try {
    mkdirSync(tempDir, { recursive: true });
    mkdirSync(join(tempDir, 'pages'), { recursive: true });

    // 1. Grava o manifest.json em staging
    writeFileSync(
      join(tempDir, 'manifest.json'),
      JSON.stringify(shardedData.manifest, null, 2),
      'utf-8'
    );

    // 2. Grava o index.json compacto em staging
    writeFileSync(
      join(tempDir, 'index.json'),
      JSON.stringify(shardedData.index),
      'utf-8'
    );

    // 3. Grava cada página individual em staging
    for (const shard of shardedData.shards) {
      const shardPath = join(tempDir, shard.file);
      mkdirSync(dirname(shardPath), { recursive: true });
      writeFileSync(
        shardPath,
        JSON.stringify(shard.items, null, 2),
        'utf-8'
      );
    }

    // 4. Cria cópia de rollback do estado anterior de absDir caso exista
    mkdirSync(rollbackDir, { recursive: true });
    mkdirSync(join(rollbackDir, 'pages'), { recursive: true });
    if (hadManifest) {
      copyFileSync(join(absDir, 'manifest.json'), join(rollbackDir, 'manifest.json'));
    }
    if (hadIndex) {
      copyFileSync(join(absDir, 'index.json'), join(rollbackDir, 'index.json'));
    }
    if (existsSync(currentPagesDir)) {
      for (const file of originalPageFiles) {
        copyFileSync(join(currentPagesDir, file), join(rollbackDir, 'pages', file));
      }
    }

    // 5. Substitui manifest e index atomicamente (Início da promoção)
    promotionStarted = true;
    mkdirSync(join(absDir, 'pages'), { recursive: true });

    renameSync(join(tempDir, 'manifest.json'), join(absDir, 'manifest.json'));
    renameSync(join(tempDir, 'index.json'), join(absDir, 'index.json'));

    // Move shards
    const activeFiles = new Set<string>();
    for (const shard of shardedData.shards) {
      activeFiles.add(shard.file);
      const srcShard = join(tempDir, shard.file);
      const destShard = join(absDir, shard.file);
      if (existsSync(srcShard)) {
        renameSync(srcShard, destShard);
      }
    }

    // Prune stale shard files in absDir/pages
    if (existsSync(currentPagesDir)) {
      const existingPageFiles = readdirSync(currentPagesDir);
      for (const file of existingPageFiles) {
        const relativeShard = `pages/${file}`;
        if (!activeFiles.has(relativeShard)) {
          unlinkSync(join(currentPagesDir, file));
        }
      }
    }
    operationSucceeded = true;
  } catch (err) {
    // Rollback para restaurar manifesto, índice e páginas caso a promoção falhe
    if (promotionStarted && existsSync(rollbackDir)) {
      try {
        if (hadManifest) {
          copyFileSync(join(rollbackDir, 'manifest.json'), join(absDir, 'manifest.json'));
        } else if (existsSync(join(absDir, 'manifest.json'))) {
          unlinkSync(join(absDir, 'manifest.json'));
        }

        if (hadIndex) {
          copyFileSync(join(rollbackDir, 'index.json'), join(absDir, 'index.json'));
        } else if (existsSync(join(absDir, 'index.json'))) {
          unlinkSync(join(absDir, 'index.json'));
        }

        const pagesDir = join(absDir, 'pages');
        if (existsSync(pagesDir)) {
          const currentFiles = readdirSync(pagesDir);
          // R-03: Remove shards criados por esta tentativa que não existiam na geração anterior
          for (const file of currentFiles) {
            if (!originalPageFiles.has(file)) {
              unlinkSync(join(pagesDir, file));
            }
          }
          // Restaura todos os shards que existiam originalmente
          for (const file of originalPageFiles) {
            copyFileSync(join(rollbackDir, 'pages', file), join(pagesDir, file));
          }
        }
        rollbackSucceeded = true;
      } catch (rollbackErr) {
        console.error('Falha durante execução do rollback de shards:', rollbackErr);
      }
    }
    throw err;
  } finally {
    closeSync(lock);
    if (existsSync(lockFile)) unlinkSync(lockFile);
    if (existsSync(tempDir)) {
      try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
    // R-04: Se o rollback falhou após iniciar a promoção, preserva rollbackDir para recuperação/investigação
    if (existsSync(rollbackDir)) {
      if (operationSucceeded || !promotionStarted || rollbackSucceeded) {
        try { rmSync(rollbackDir, { recursive: true, force: true }); } catch {}
      }
    }
  }
}
