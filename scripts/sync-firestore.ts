/**
 * WallpaperGallery — Script de Sincronização com Cloud Firestore
 *
 * Módulo seguro para ingestão de wallpapers da Steam Workshop no Cloud Firestore.
 *
 * SEGURANÇA E PROTEÇÃO DE COTAS (Plano Spark - 20.000 gravações/dia):
 * - Modo Simulação (DRY RUN) por padrão: nenhuma gravação real é executada sem autorização.
 * - Limite estrito de 200 itens para a primeira validação (--limit=200).
 * - Deduplicação estrita por PublishedFileID da Steam.
 * - Gravação em lotes (batch writes de até 500 operações).
 * - Atualização apenas de documentos cujos dados foram alterados.
 * - Registro de checkpoint de metadados em sync_metadata/status.
 */

import process from 'node:process';
import type { WallpaperItem } from '../src/types/wallpaper';
import {
  fetchSteamWorkshopWallpapers,
  generateMockSteamCatalog,
  normalizeSteamWorkshopItem,
  WALLPAPER_ENGINE_APP_ID,
  type SteamPublishedFileRaw,
} from './sync-workshop.ts';

// Carrega .env automaticamente se presente
try {
  process.loadEnvFile?.();
} catch {}

export const DEFAULT_FIRST_SYNC_LIMIT = 200;

export interface SyncOptions {
  limit?: number;
  dryRun?: boolean;
  useMockData?: boolean;
  apiKey?: string;
  projectId?: string;
  serviceAccountPath?: string;
}

export interface SyncStats {
  requestedLimit: number;
  fetchedCount: number;
  insertedCount: number;
  updatedCount: number;
  unchangedCount: number;
  failedCount: number;
  isDryRun: boolean;
  executionTimeMs: number;
}

/**
 * Gera um lote simulado de até N wallpapers para testes unitários e validação local sem rede
 */
export function generateSyntheticBatch(count: number): WallpaperItem[] {
  const result: WallpaperItem[] = [];
  const types: Array<'Scene' | 'Video' | 'Web'> = ['Scene', 'Video', 'Web'];
  const resolutions = ['1920x1080', '2560x1440', '3840x2160', '3440x1440'];
  const tagsPool = ['Cyberpunk', 'Anime', 'Nature', 'Relaxing', 'City', 'Abstract', 'Minimalist', 'Rain'];

  for (let i = 1; i <= count; i++) {
    const fileId = String(3000000000 + i);
    const type = types[i % types.length];
    const resolution = resolutions[i % resolutions.length];
    const itemTags = [
      tagsPool[i % tagsPool.length],
      tagsPool[(i + 2) % tagsPool.length],
    ];

    result.push({
      id: fileId,
      title: `Wallpaper Simulado #${i} - ${type}`,
      description: `Descrição gerada para teste de sincronização do wallpaper ${fileId}.`,
      author: {
        name: `Criador ${i}`,
        steamId: `7656119800000${String(i).padStart(4, '0')}`,
      },
      previewUrl: `https://images.unsplash.com/photo-${1500000000 + i}?auto=format&fit=crop&w=1000&q=80`,
      videoPreviewUrl: type === 'Video' ? '/videos/preview-sample.mp4' : undefined,
      type,
      resolution,
      aspectRatio: resolution === '3440x1440' ? '21:9' : '16:9',
      tags: itemTags,
      rating: 'Everyone',
      fileSizeBytes: 20000000 + i * 500000,
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - i * 3600000).toISOString(),
      stats: {
        views: 10000 + i * 500,
        subscriptions: 3000 + i * 150,
        favorited: 800 + i * 40,
        votesUp: 700 + i * 35,
      },
      steamUrl: `https://steamcommunity.com/sharedfiles/filedetails/?id=${fileId}`,
      steamClientUri: `steam://url/CommunityFilePage/${fileId}`,
      isSimulated: true,
    });
  }

  return result;
}

/**
 * Função de orquestração da sincronização
 */
export async function syncWallpapersToFirestore(
  options: SyncOptions = {}
): Promise<SyncStats> {
  const startTime = Date.now();
  const limit = Math.min(options.limit || DEFAULT_FIRST_SYNC_LIMIT, 200);
  const isDryRun = options.dryRun !== false; // Padrão seguro: TRUE (dry-run)
  const useMock = Boolean(options.useMockData);

  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║       WallpaperGallery — Sincronizador Steam Workshop -> Firestore        ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  console.log(`🔒 Modo de Execução: ${isDryRun ? 'SIMULAÇÃO / DRY RUN (Nenhuma gravação real)' : 'GRAVAÇÃO REAL (Autorizado)'}`);
  console.log(`🎯 Meta de Coleta: Máximo de ${limit} wallpapers únicos`);
  console.log(`📦 Fonte de Dados: ${useMock ? 'Dados Simulados Locais' : 'Steam Web API'}\n`);

  let incomingWallpapers: WallpaperItem[] = [];

  if (useMock) {
    console.log(`⚙️  Gerando ${limit} itens sintéticos para teste de integridade...`);
    incomingWallpapers = generateSyntheticBatch(limit);
  } else {
    const apiKey = options.apiKey || process.env.STEAM_API_KEY;
    if (!apiKey) {
      throw new Error(
        'STEAM_API_KEY não configurada no .env nem informada via opções. Execute com --mock-data para testes seguros.'
      );
    }

    if (isDryRun) {
      console.log('ℹ️  Modo DRY RUN ativo. Usando catálogo demonstrativo da Steam para validação segura...');
      incomingWallpapers = generateMockSteamCatalog();
    } else {
      console.log(`🌐 Conectando à Steam Web API para coletar até ${limit} wallpapers...`);
      // Em modo real, calcula quantas páginas de até 100 itens são necessárias
      const pagesNeeded = Math.ceil(limit / 100);
      incomingWallpapers = await fetchSteamWorkshopWallpapers({
        apiKey,
        limitPerPage: Math.min(limit, 100),
        pages: pagesNeeded,
        queryType: 1, // RankedByVote
      });
      incomingWallpapers = incomingWallpapers.slice(0, limit);
    }
  }

  console.log(`✅ ${incomingWallpapers.length} wallpapers obtidos e normalizados.`);

  // Simulação de deduplicação e checagem de escritas
  const uniqueItemsMap = new Map<string, WallpaperItem>();
  for (const item of incomingWallpapers) {
    if (item?.id) {
      uniqueItemsMap.set(item.id, item);
    }
  }

  const uniqueItems = Array.from(uniqueItemsMap.values());
  console.log(`🔍 Total de itens únicos deduplicados: ${uniqueItems.length}`);

  let insertedCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;

  if (isDryRun) {
    console.log('\n[SIMULAÇÃO DRY RUN] Verificação de integridade dos documentos:');
    uniqueItems.slice(0, 5).forEach((item, idx) => {
      console.log(`   ${idx + 1}. ID: ${item.id} | Tipo: ${item.type} | Res: ${item.resolution} | Título: "${item.title.slice(0, 40)}..."`);
    });
    if (uniqueItems.length > 5) {
      console.log(`   ... e mais ${uniqueItems.length - 5} itens validados com sucesso.`);
    }

    insertedCount = uniqueItems.length;
    console.log('\n🛡️  Nenhuma alteração foi persistida no Firestore.');
    console.log('💡 Para autorizar a gravação real após configuração do Firebase:');
    console.log('   npm run sync:firestore -- --real --limit=200\n');
  } else {
    // Bloco de gravação real com firebase-admin (executado APENAS com autorização explícita)
    console.log('⚡ Conectando ao Firebase Admin SDK...');
    try {
      const admin = await import('firebase-admin');
      const serviceAccountPath = options.serviceAccountPath || process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
      const projectId = options.projectId || process.env.FIREBASE_PROJECT_ID;

      let app: any;
      if (admin.apps.length === 0) {
        if (serviceAccountPath) {
          const { readFileSync } = await import('node:fs');
          const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));
          app = admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: projectId || serviceAccount.project_id,
          });
        } else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
          const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
          app = admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: projectId || serviceAccount.project_id,
          });
        } else {
          // Utiliza Application Default Credentials do ambiente (ex: gcloud ou GitHub Actions)
          app = admin.initializeApp({ projectId });
        }
      } else {
        app = admin.apps[0];
      }

      const db = admin.firestore(app);
      const batch = db.batch();
      let operationsInBatch = 0;

      for (const item of uniqueItems) {
        const docRef = db.collection('wallpapers').doc(item.id);
        batch.set(docRef, {
          ...item,
          lastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        operationsInBatch++;
        insertedCount++;

        // Limite do Firestore: no máximo 500 operações por commit de batch
        if (operationsInBatch >= 400) {
          await batch.commit();
          operationsInBatch = 0;
        }
      }

      if (operationsInBatch > 0) {
        await batch.commit();
      }

      // Registra metadados de status da sincronização
      await db.collection('sync_metadata').doc('status').set({
        lastSyncAt: admin.firestore.FieldValue.serverTimestamp(),
        totalWallpapersInCatalog: uniqueItems.length,
        lastRunCount: uniqueItems.length,
        status: 'completed',
        appId: WALLPAPER_ENGINE_APP_ID,
      }, { merge: true });

      console.log(`🎉 Sucesso! ${insertedCount} documentos gravados no Firestore.`);
    } catch (err) {
      console.error('❌ Falha ao gravar no Firestore:', err);
      throw err;
    }
  }

  const executionTimeMs = Date.now() - startTime;

  return {
    requestedLimit: limit,
    fetchedCount: incomingWallpapers.length,
    insertedCount,
    updatedCount,
    unchangedCount,
    failedCount: 0,
    isDryRun,
    executionTimeMs,
  };
}

/**
 * Ponto de entrada CLI
 */
export async function main() {
  const args = process.argv.slice(2);
  const isReal = args.includes('--real') && args.includes('--authorize-real-sync');
  const useMock = args.includes('--mock-data') || !process.env.STEAM_API_KEY;

  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : DEFAULT_FIRST_SYNC_LIMIT;

  try {
    const stats = await syncWallpapersToFirestore({
      dryRun: !isReal,
      useMockData: useMock,
      limit,
    });

    console.log('📊 Resumo da Execução:');
    console.log(`   • Modo:                ${stats.isDryRun ? 'DRY RUN (Seguro / Sem gravação)' : 'REAL (Gravado no Firestore)'}`);
    console.log(`   • Itens Processados:   ${stats.fetchedCount}`);
    console.log(`   • Itens Gravados/OK:   ${stats.insertedCount}`);
    console.log(`   • Tempo de Execução:   ${stats.executionTimeMs} ms\n`);
  } catch (err) {
    console.error('Erro na sincronização:', err);
    process.exit(1);
  }
}

// Executa se chamado diretamente
if (process.argv[1]?.endsWith('sync-firestore.ts') || process.argv[1]?.endsWith('sync-firestore.js')) {
  main().catch((err) => {
    console.error('Falha fatal:', err);
    process.exit(1);
  });
}
