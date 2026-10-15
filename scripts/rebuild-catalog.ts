/**
 * WallpaperGallery — Script de Reconstrução e Sanitização do Catálogo Local
 *
 * Reprocessa o catálogo existente aplicando o pipeline completo de moderação
 * (metadados e visual), expurgando itens adultos ou não autorizados.
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

const WALLPAPER_ENGINE_APP_ID = 431960;

export async function rebuildCatalog(options: {
  catalogPath?: string;
  backupDir?: string;
  quarantinePath?: string;
  skipVisualAnalysis?: boolean;
} = {}): Promise<{
  totalOriginal: number;
  approvedCount: number;
  quarantinedCount: number;
  backupPath: string;
}> {
  const args = process.argv.slice(2);
  const cliSkipVisual =
    args.includes('--skipVisualAnalysis') ||
    args.includes('--skip-visual') ||
    args.includes('--skip-visual-analysis') ||
    args.includes('--offline') ||
    process.env.SKIP_VISUAL_MODERATION === 'true';

  const catalogPath = resolve(options.catalogPath ?? 'public/data/catalog.json');
  const backupDir = resolve(options.backupDir ?? '.moderation/backups');
  const quarantinePath = resolve(options.quarantinePath ?? '.moderation/quarantine.json');
  const skipVisual = options.skipVisualAnalysis !== undefined ? Boolean(options.skipVisualAnalysis) : cliSkipVisual;

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

  // 2. Execução do Pipeline de Moderação
  const pipeline = new ModerationPipeline({ skipVisualAnalysis: skipVisual });
  const approvedItems: WallpaperItem[] = [];
  const quarantinedItems: Array<{ item: WallpaperItem; decision: ModerationDecision }> = [];

  let blockedBySteamRating = 0;
  let blockedByMetadata = 0;
  let blockedByVisual = 0;
  let reviewByVisual = 0;

  console.log(`🔍 Analisando ${items.length} wallpapers através do pipeline de moderação...`);

  for (const item of items) {
    const decision = await pipeline.evaluateItem(item);

    if (decision.status === 'safe') {
      approvedItems.push(item);
    } else {
      quarantinedItems.push({ item, decision });

      const hasSteam = decision.reasons.some((r) => r.category === 'steam_rating');
      const hasMeta = decision.reasons.some((r) => r.category === 'metadata_keyword');
      const hasVisBlocked = decision.reasons.some((r) => r.category === 'visual_analysis' && decision.status === 'blocked');
      const hasVisReview = decision.reasons.some((r) => r.category === 'visual_analysis' && decision.status === 'review');

      if (hasSteam) blockedBySteamRating++;
      else if (hasMeta) blockedByMetadata++;
      else if (hasVisBlocked) blockedByVisual++;
      else if (hasVisReview) reviewByVisual++;
    }
  }

  pipeline.saveVisualCache();

  // 3. Registro do Relatório de Quarentena (Fora do diretório public/)
  mkdirSync(dirname(quarantinePath), { recursive: true });
  const summary: ModerationSummary = {
    totalAnalyzed: items.length,
    approvedCount: approvedItems.length,
    blockedCount: quarantinedItems.filter((q) => q.decision.status === 'blocked').length,
    reviewCount: quarantinedItems.filter((q) => q.decision.status === 'review').length,
    blockedBySteamRating,
    blockedByMetadata,
    blockedByVisual,
    reviewByVisual,
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

  // 4. Gravação Atômica do Catálogo Sanitizado
  const lockPath = `${catalogPath}.lock`;
  const lock = openSync(lockPath, 'wx');
  const tempPath = `${catalogPath}.${process.pid}.tmp`;
  try {
    writeFileSync(tempPath, JSON.stringify(approvedItems, null, 2), { encoding: 'utf-8', flag: 'wx' });
    renameSync(tempPath, catalogPath);
  } finally {
    closeSync(lock);
    if (existsSync(lockPath)) unlinkSync(lockPath);
    if (existsSync(tempPath)) unlinkSync(tempPath);
  }

  // 5. Regeneração dos Shards e Manifesto Públicos (Apenas com itens Aprovados)
  const shardedDir = catalogPath.endsWith('.json')
    ? catalogPath.slice(0, -5)
    : resolve(dirname(catalogPath), 'catalog');

  const sharded = createCatalogShards(approvedItems, {
    appId: WALLPAPER_ENGINE_APP_ID,
    pageSize: 24,
    allowSimulated: false,
  });

  writeCatalogShardsSync(shardedDir, sharded, {
    isMock: false,
  });

  console.log('📊 Relatório de Sanitização:');
  console.log(`   • Total original no catálogo:         ${items.length}`);
  console.log(`   • Wallpapers Aprovados (Seguros):     ${approvedItems.length}`);
  console.log(`   • Wallpapers Quarentenados/Bloqueados: ${quarantinedItems.length}`);
  console.log(`     - Bloqueados por Steam Rating:      ${blockedBySteamRating}`);
  console.log(`     - Bloqueados por Termos/Tags:       ${blockedByMetadata}`);
  console.log(`     - Bloqueados por Análise Visual:    ${blockedByVisual}`);
  console.log(`     - Em Revisão por Imagem/Download:   ${reviewByVisual}`);
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
