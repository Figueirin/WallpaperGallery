import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSyntheticBatch,
  syncWallpapersToFirestore,
  DEFAULT_FIRST_SYNC_LIMIT,
} from '../scripts/sync-firestore.ts';
import { isFirebaseConfigured } from '../src/config/firebase.ts';
import { createWallpaperProvider } from '../src/services/providerFactory.ts';
import { MockWallpaperProvider } from '../src/services/mockProvider.ts';

describe('Preparação da Infraestrutura de Sincronização Firestore (Etapa Firebase)', () => {
  describe('geração de lote sintético de validação (generateSyntheticBatch)', () => {
    it('deve gerar exatamente 200 wallpapers únicos sem duplicidade de ID', () => {
      const batch = generateSyntheticBatch(200);
      assert.strictEqual(batch.length, 200);

      const uniqueIds = new Set(batch.map((item) => item.id));
      assert.strictEqual(uniqueIds.size, 200);
    });

    it('cada item do lote de 200 deve conter metadados e URLs válidos', () => {
      const batch = generateSyntheticBatch(200);

      batch.forEach((item, index) => {
        assert.ok(item.id);
        assert.ok(item.title);
        assert.ok(item.author.name);
        assert.ok(item.previewUrl);
        assert.ok(['Scene', 'Video', 'Web'].includes(item.type));
        assert.ok(item.resolution);
        assert.ok(item.aspectRatio);
        assert.ok(Array.isArray(item.tags));
        assert.ok(item.tags.length > 0);
        assert.ok(item.stats);
        assert.strictEqual(typeof item.stats.views, 'number');
        assert.strictEqual(typeof item.stats.subscriptions, 'number');
        assert.ok(
          item.steamUrl.startsWith('https://steamcommunity.com/sharedfiles/filedetails/?id=')
        );
        assert.ok(item.steamClientUri.startsWith('steam://url/CommunityFilePage/'));
      });
    });

    it('deve respeitar proporções corretas (16:9 e 21:9) e tipos de mídia', () => {
      const batch = generateSyntheticBatch(50);
      const ultrawide = batch.filter((item) => item.resolution === '3440x1440');
      assert.ok(ultrawide.length > 0);
      ultrawide.forEach((item) => {
        assert.strictEqual(item.aspectRatio, '21:9');
      });

      const videoItems = batch.filter((item) => item.type === 'Video');
      assert.ok(videoItems.length > 0);
      videoItems.forEach((item) => {
        assert.ok(item.videoPreviewUrl);
      });
    });
  });

  describe('orquestrador de sincronização em modo DRY RUN seguro (syncWallpapersToFirestore)', () => {
    it('deve executar simulação completa de 200 itens em modo dry-run sem gravação real', async () => {
      const stats = await syncWallpapersToFirestore({
        limit: 200,
        dryRun: true,
        useMockData: true,
      });

      assert.strictEqual(stats.isDryRun, true);
      assert.strictEqual(stats.requestedLimit, 200);
      assert.strictEqual(stats.fetchedCount, 200);
      assert.strictEqual(stats.insertedCount, 200);
      assert.strictEqual(stats.failedCount, 0);
      assert.ok(stats.executionTimeMs >= 0);
    });

    it('deve impor teto rígido de segurança de no máximo 200 itens na primeira execução', async () => {
      const stats = await syncWallpapersToFirestore({
        limit: 9999, // Solicita mais do que o permitido
        dryRun: true,
        useMockData: true,
      });

      // Teto rígido de segurança garante que a primeira coleta não ultrapassa 200
      assert.strictEqual(stats.requestedLimit, 200);
      assert.strictEqual(stats.fetchedCount, 200);
    });

    it('deve adotar 200 itens como limite padrão de segurança', () => {
      assert.strictEqual(DEFAULT_FIRST_SYNC_LIMIT, 200);
    });
  });

  describe('detecção e fábrica de provedores (providerFactory e Firebase config)', () => {
    it('deve identificar que Firebase não está configurado sem credenciais reais', () => {
      // Como não há VITE_FIREBASE_API_KEY real no ambiente de testes, deve retornar false
      assert.strictEqual(isFirebaseConfigured(), false);
    });

    it('deve retornar MockWallpaperProvider com segurança por padrão', () => {
      const provider = createWallpaperProvider('mock');
      assert.ok(provider instanceof MockWallpaperProvider);
    });

    it('deve aplicar fallback gracioso para MockWallpaperProvider se Firestore for solicitado sem credenciais', () => {
      const provider = createWallpaperProvider('firestore');
      assert.ok(provider instanceof MockWallpaperProvider);
    });
  });
});
