/**
 * WallpaperGallery — Script de Reconstrução e Sanitização do Catálogo Local
 *
 * Reprocessa o catálogo existente aplicando o pipeline simplificado de moderação
 * (Blacklist manual em config/blocked-wallpapers.json, Classificação Steam e Metadados),
 * expurgando itens adultos ou não autorizados.
 *
 * Preserva backup seguro verificável em .moderation/backups/ e registra
 * a quarentena em .moderation/quarantine.json (fora de public/).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, openSync, closeSync, unlinkSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import process from 'node:process';
import type { WallpaperItem } from '../src/types/wallpaper.ts';
import { ModerationPipeline } from '../src/services/moderation/moderationPipeline.ts';
import type { ModerationDecision, ModerationSummary } from '../src/services/moderation/types.ts';
import { createCatalogShards, writeCatalogShardsSync } from '../src/utils/catalogSharder.ts';
import { isWallpaperItem } from '../src/utils/validateWallpaper.ts';

const WALLPAPER_ENGINE_APP_ID = 431960;

export async function rebuildCatalog(options: {
  catalogPath?: string;
  backupDir?: string;
  quarantinePath?: string;
  blacklistPath?: string;
} = {}): Promise<{
  totalOriginal: number;
  approvedCount: number;
  quarantinedCount: number;
  backupPath: string;
}> {
  const catalogPath = resolve(options.catalogPath ?? 'public/data/catalog.json');
  const backupDir = resolve(options.backupDir ?? '.moderation/backups');
  const quarantinePath = resolve(options.quarantinePath ?? '.moderation/quarantine.json');
  const blacklistPath = options.blacklistPath ? resolve(options.blacklistPath) : undefined;

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   WallpaperGallery — Sanitização e Moderação de Catálogo   ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  if (!existsSync(catalogPath)) {
    throw new Error(`Catálogo não encontrado para reconstrução em: ${catalogPath}`);
  }

  const rawData = readFileSync(catalogPath, 'utf-8');
  let items: WallpaperItem[];
  try {
    items = JSON.parse(rawData);
    if (!Array.isArray(items)) throw new Error('Formato de catálogo inválido');
  } catch (err) {
    throw new Error('Falha ao interpretar JSON do catálogo', { cause: err });
  }

  // 1. Criação de Backup Seguro e Verificável
  mkdirSync(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = resolve(backupDir, `catalog_backup_${timestamp}.json`);
  copyFileSync(catalogPath, backupPath);
  console.log(`📦 Backup de segurança preservado em:\n   ${backupPath}\n`);

  // 2. Execução do Pipeline de Moderação Simplificado
  const pipeline = new ModerationPipeline({ blacklistPath });
  const approvedItems: WallpaperItem[] = [];
  const quarantinedItems: Array<{ item: WallpaperItem; decision: ModerationDecision }> = [];

  let blockedByBlacklist = 0;
  let blockedBySteamRating = 0;
  let blockedByMetadata = 0;
  let blockedByInvalidMetadata = 0;

  console.log(`🔍 Analisando ${items.length} wallpapers através do pipeline de moderação...`);

  for (const item of items) {
    const decision = pipeline.evaluateItem(item);

    if (decision.status === 'safe') {
      approvedItems.push(item);
    } else {
      quarantinedItems.push({ item, decision });

      const hasBlacklist = decision.reasons.some((r) => r.category === 'manual_blacklist');
      const hasSteam = decision.reasons.some((r) => r.category === 'steam_rating');
      const hasMeta = decision.reasons.some((r) => r.category === 'metadata_keyword');
      const hasInvalid = decision.reasons.some((r) => r.category === 'invalid_metadata');

      if (hasBlacklist) blockedByBlacklist++;
      else if (hasSteam) blockedBySteamRating++;
      else if (hasMeta) blockedByMetadata++;
      else if (hasInvalid) blockedByInvalidMetadata++;
    }
  }

  // 3. Registro do Relatório de Quarentena (Fora do diretório public/)
  mkdirSync(dirname(quarantinePath), { recursive: true });
  const summary: ModerationSummary = {
    totalAnalyzed: items.length,
    approvedCount: approvedItems.length,
    blockedCount: quarantinedItems.length,
    blockedByBlacklist,
    blockedBySteamRating,
    blockedByMetadata,
    blockedByInvalidMetadata,
    timestamp: new Date().toISOString(),
  };

  const quarantinePayload = {
    summary,
    quarantined: quarantinedItems.map((q) => ({
      id: q.item.id,
      title: q.item.title,
      author: q.item.author,
      rating: q.item.rating,
      tags: q.item.tags,
      decision: q.decision,
    })),
  };

  writeFileSync(quarantinePath, JSON.stringify(quarantinePayload, null, 2), 'utf-8');
  console.log(`📋 Relatório de quarentena gerado em:\n   ${quarantinePath}\n`);

  // 4. Pré-validação rigorosa de todos os itens antes de qualquer modificação em arquivos públicos
  for (const item of approvedItems) {
    if (!isWallpaperItem(item)) {
      throw new Error(`Item inválido para inclusão no catálogo: ${(item as { id?: string })?.id ?? 'desconhecido'}`);
    }
    if (item.isSimulated) {
      throw new Error(`Item simulado rejeitado no catálogo de produção: ${item.id}`);
    }
  }

  const shardedDir = catalogPath.endsWith('.json')
    ? catalogPath.slice(0, -5)
    : resolve(dirname(catalogPath), 'catalog');

  // Pré-gera os shards em memória para assegurar consistência antes da escrita
  const sharded = createCatalogShards(approvedItems, {
    appId: WALLPAPER_ENGINE_APP_ID,
    pageSize: 24,
    allowSimulated: false,
  });

  // Verifica antecipadamente se o lock dos shards está ocupado
  const shardsLockPath = `${shardedDir}.lock`;
  if (existsSync(shardsLockPath)) {
    const err = new Error(`EEXIST: Lock ocupado em: ${shardsLockPath}`);
    (err as NodeJS.ErrnoException).code = 'EEXIST';
    throw err;
  }

  // 5. Gravação Atômica do Catálogo Sanitizado e Shards com Rollback
  const lockPath = `${catalogPath}.lock`;
  const lock = openSync(lockPath, 'wx');
  const tempPath = `${catalogPath}.${process.pid}.tmp`;
  let publicationStarted = false;
  try {
    if (existsSync(catalogPath)) {
      const currentRaw = readFileSync(catalogPath, 'utf-8');
      if (currentRaw !== rawData) {
        throw new Error('Catálogo alterado por outro processo');
      }
    }

    writeFileSync(tempPath, JSON.stringify(approvedItems, null, 2), { encoding: 'utf-8', flag: 'wx' });
    renameSync(tempPath, catalogPath);
    publicationStarted = true;

    // Regeneração dos Shards e Manifesto Públicos
    writeCatalogShardsSync(shardedDir, sharded, {
      isMock: false,
    });
  } catch (err) {
    // Rollback para restaurar o catálogo anterior se a escrita dos shards falhar
    if (publicationStarted && existsSync(backupPath)) {
      try {
        copyFileSync(backupPath, catalogPath);
      } catch {}
    }
    throw err;
  } finally {
    closeSync(lock);
    if (existsSync(lockPath)) unlinkSync(lockPath);
    if (existsSync(tempPath)) unlinkSync(tempPath);
  }

  console.log('📊 Relatório de Sanitização:');
  console.log(`   • Total original no catálogo:         ${items.length}`);
  console.log(`   • Wallpapers Aprovados (Seguros):     ${approvedItems.length}`);
  console.log(`   • Wallpapers Quarentenados/Bloqueados: ${quarantinedItems.length}`);
  console.log(`     - Bloqueados por Blacklist Manual:  ${blockedByBlacklist}`);
  console.log(`     - Bloqueados por Steam Rating:      ${blockedBySteamRating}`);
  console.log(`     - Bloqueados por Termos/Tags:       ${blockedByMetadata}`);
  if (blockedByInvalidMetadata > 0) {
    console.log(`     - Bloqueados por Metadados Inválidos: ${blockedByInvalidMetadata}`);
  }
  console.log(`\n✅ Sucesso! Catálogo público sanitizado em: ${catalogPath}`);
  console.log(`✅ Sucesso! Shards atualizados em: ${shardedDir}\n`);

  return {
    totalOriginal: items.length,
    approvedCount: approvedItems.length,
    quarantinedCount: quarantinedItems.length,
    backupPath,
  };
}

if (process.argv[1]?.endsWith('rebuild-catalog.ts') || process.argv[1]?.endsWith('rebuild-catalog.js')) {
  rebuildCatalog().catch((err) => {
    console.error('Falha na reconstrução do catálogo:', err);
    process.exit(1);
  });
}
