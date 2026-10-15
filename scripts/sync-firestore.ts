/**
 * WallpaperGallery — Script de Sincronização com Cloud Firestore (LEGADO / ISOLADO)
 *
 * AVISO ARQUITETURAL (N-08):
 * A arquitetura primária de produção do WallpaperGallery é JSON-First (catalog.json e shards).
 * Este script é um caminho legado e NÃO integra o pipeline centralizado de moderação NSFW.
 * NÃO deve ser utilizado para publicar conteúdo de produção sem moderação prévia.
 *
 * SEGURANÇA E PROTEÇÃO DE COTAS (Plano Spark - 20.000 gravações/dia):
 * - Modo Simulação (DRY RUN) por padrão: nenhuma gravação real é executada sem autorização.
 * - Limite estrito de 200 itens para a primeira validação (--limit=200).
 * - Deduplicação estrita por PublishedFileID da Steam.
 * - Gravação em lotes (batch writes de até 500 operações).
 * - Atualização apenas de documentos cujos dados foram alterados.
 * - Registro de status da última execução (não cursor) em sync_metadata/status.
 */

import process from 'node:process';
import type { WallpaperItem } from '../src/types/wallpaper';
import {
  fetchSteamWorkshopWallpapers,
  STEAM_QUERY,
  WALLPAPER_ENGINE_APP_ID,
  REAL_SYNC_AUTHORIZATION,
  loadLocalEnv,
  positiveInteger,
} from './sync-workshop.ts';
import { isWallpaperItem } from '../src/utils/validateWallpaper.ts';
import type { Firestore } from 'firebase-admin/firestore';

export const DEFAULT_FIRST_SYNC_LIMIT = 200;

export interface SyncOptions {
  limit?: number;
  dryRun?: boolean;
  useMockData?: boolean;
  apiKey?: string;
  projectId?: string;
  serviceAccountPath?: string;
  authorization?: string;
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

/** Remove undefined recursivamente; rejeita números não finitos. */
export function serializeDocument(value: unknown): any {
  if (value === undefined) return undefined;
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Número inválido');
  if (Array.isArray(value)) return value.filter(v => v !== undefined).map(serializeDocument);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, serializeDocument(v)])
  );
  return value;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}

/** Mesmo caminho de escrita para Admin SDK e fake offline; sem inicializar SDK. */
export async function persistWallpapers(db: Pick<Firestore, 'collection' | 'batch' | 'getAll'>, items: WallpaperItem[]) {
  if (items.some(item => !isWallpaperItem(item) || item.isSimulated)) throw new Error('Documento real inválido ou simulado');
  const unique = Array.from(new Map(items.map(item => [item.id, item])).values());
  const refs = unique.map(item => db.collection('wallpapers').doc(item.id));
  const snapshots = refs.length ? await db.getAll(...refs) : [];
  if (snapshots.some(snapshot => snapshot.exists && snapshot.data()?.isSimulated)) throw new Error('Documento simulado existente; revisão manual obrigatória');
  let insertedCount = 0, updatedCount = 0, unchangedCount = 0;
  let batch = db.batch(), pending = 0;
  for (let index = 0; index < unique.length; index++) {
    const incoming = serializeDocument(unique[index]);
    const previous = snapshots[index].exists ? snapshots[index].data()! : undefined;
    const { lastSyncedAt: _lastSyncedAt, ...old } = previous ?? {};
    const combined = { ...old, ...incoming, author: { ...old.author, ...incoming.author }, stats: { ...old.stats, ...incoming.stats } };
    if (previous && canonical(old) === canonical(combined)) { unchangedCount++; continue; }
    batch.set(refs[index], combined);
    if (previous) updatedCount++; else insertedCount++;
    if (++pending === 400) { await batch.commit(); batch = db.batch(); pending = 0; }
  }
  if (pending) await batch.commit();
  // Estado de execução, não um checkpoint de varredura nem total da coleção.
  await db.collection('sync_metadata').doc('status').set({
    lastSyncAt: new Date().toISOString(), lastRunCount: unique.length,
    insertedCount, updatedCount, unchangedCount, status: 'completed', appId: WALLPAPER_ENGINE_APP_ID,
  });
  return { insertedCount, updatedCount, unchangedCount };
}

export async function syncWallpapersToFirestore(options: SyncOptions = {}): Promise<SyncStats> {
  const startTime = Date.now();
  const limit = Math.min(positiveInteger(options.limit ?? DEFAULT_FIRST_SYNC_LIMIT, 'limit'), 200);
  const isDryRun = options.dryRun !== false;
  if (!isDryRun && options.authorization !== REAL_SYNC_AUTHORIZATION) throw new Error('Autorização explícita ausente');
  if (!isDryRun && options.useMockData) throw new Error('Dados simulados proibidos no modo real');
  if (isDryRun && !options.useMockData) throw new Error('Dry-run offline exige --mock-data');
  if (!isDryRun && !(options.apiKey || process.env.STEAM_API_KEY)) throw new Error('STEAM_API_KEY ausente');
  if (!isDryRun && !(options.projectId || process.env.FIREBASE_PROJECT_ID)) throw new Error('FIREBASE_PROJECT_ID explícito obrigatório');
  let counts = { insertedCount: 0, updatedCount: 0, unchangedCount: 0 };
  let items: WallpaperItem[];
  if (isDryRun) {
    items = generateSyntheticBatch(limit);
    items.forEach(serializeDocument);
    counts.insertedCount = items.length; // planejamento; nenhuma escrita
  } else {
    const projectId = options.projectId || process.env.FIREBASE_PROJECT_ID;
    const serviceAccountPath = options.serviceAccountPath || process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    const { readFileSync } = await import('node:fs');
    const raw = serviceAccountPath ? readFileSync(serviceAccountPath, 'utf-8') : process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!raw) throw new Error('Conta de serviço explícita obrigatória; ADC desativado');
    let account;
    try { account = JSON.parse(raw); } catch { throw new Error('Conta de serviço inválida'); }
    if (account.project_id !== projectId) throw new Error('Projeto da conta de serviço diverge do destino');
    items = await fetchSteamWorkshopWallpapers({ apiKey: options.apiKey || process.env.STEAM_API_KEY!, limitPerPage: Math.min(limit, 100), pages: Math.ceil(limit / 100), queryType: STEAM_QUERY.popular });
    items = items.slice(0, limit);
    if (!items.length) throw new Error('Coleta vazia; nenhuma escrita');
    const { initializeApp, cert, deleteApp } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    const app = initializeApp({ projectId, credential: cert(account) }, `wallpaper-sync-${process.pid}-${Date.now()}`);
    try { counts = await persistWallpapers(getFirestore(app), items); }
    finally { await deleteApp(app); }
  }
  return { requestedLimit: limit, fetchedCount: items.length, ...counts, failedCount: 0, isDryRun, executionTimeMs: Date.now() - startTime };
}

export async function main() {
  loadLocalEnv();
  const args = process.argv.slice(2);
  if (args.some(a => !['--real', '--authorize-real-sync', '--mock-data', '--dry-run'].includes(a) && !a.startsWith('--limit='))) throw new Error('Argumento desconhecido');
  const real = args.includes('--real');
  if (real && (!args.includes('--authorize-real-sync') || args.includes('--dry-run'))) throw new Error('Modo real exige autorização e não permite --dry-run');
  const stats = await syncWallpapersToFirestore({
    dryRun: !real, useMockData: args.includes('--mock-data'),
    authorization: process.env.WALLPAPER_SYNC_AUTHORIZATION,
    limit: Number(args.find(a => a.startsWith('--limit='))?.slice(8) ?? DEFAULT_FIRST_SYNC_LIMIT),
  });
  console.log(JSON.stringify(stats));
}

if (process.argv[1]?.endsWith('sync-firestore.ts') || process.argv[1]?.endsWith('sync-firestore.js')) {
  main().catch(() => {
    console.error('Sincronização interrompida. Verifique autorização, argumentos e configuração.');
    process.exitCode = 1;
  });
}
