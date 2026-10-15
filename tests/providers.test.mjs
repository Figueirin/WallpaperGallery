import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { FirestoreWallpaperProvider } from '../src/services/firestoreProvider.ts';
import { MockWallpaperProvider } from '../src/services/mockProvider.ts';
import { normalizeSteamWorkshopItem } from '../scripts/sync-workshop.ts';

test('Firestore combina chamadas concorrentes e não oculta erros nem documentos sem subscriptions', async () => {
  // SDK constrói referências localmente. getDocs/getDoc são fakes; nenhuma conexão.
  const app = initializeApp({ projectId: 'offline-fixture', apiKey: 'offline-fixture' }, 'offline-tests');
  const db = getFirestore(app);
  const payload = normalizeSteamWorkshopItem({ publishedfileid: '1', title: 'Sem métricas' });
  let calls = 0, reject = false, oversized = false;
  const provider = new FirestoreWallpaperProvider({
    getDb: () => db,
    getDocs: async () => {
      calls++; await new Promise(resolve => setTimeout(resolve, 1));
      if (reject) throw new Error('offline error');
      return { size: oversized ? 301 : 1, forEach(fn) { fn({ id: '1', data: () => payload }); } };
    },
  });
  try {
    reject = true;
    await assert.rejects(provider.getWallpapers(), /offline error/);
    reject = false;
    const [results, metadata] = await Promise.all([provider.getWallpapers(), provider.getFilterMetadata()]);
    assert.equal(calls, 2); // uma falha + uma carga compartilhada
    assert.equal(results.total, 1);
    assert.equal(metadata.types[0], 'Scene');
    await provider.getWallpapers();
    assert.equal(calls, 2);
    oversized = true;
    const large = new FirestoreWallpaperProvider({ getDb: () => db, getDocs: provider.dependencies.getDocs });
    await assert.rejects(large.getWallpapers(), /300/);
  } finally { await deleteApp(app); }
});

test('catálogo real não usa fallback sintético em erro ou conteúdo simulado', async () => {
  const previous = globalThis.fetch;
  try {
    const provider = new MockWallpaperProvider(undefined, 'catalog');
    globalThis.fetch = async () => new Response('missing', { status: 404 });
    await assert.rejects(provider.getWallpapers(), /404/);
    globalThis.fetch = async () => Response.json([{ ...normalizeSteamWorkshopItem({ publishedfileid: '1', title: 'Fixture' }), isSimulated: true }]);
    await assert.rejects(provider.getWallpapers(), /simulado/);
    globalThis.fetch = async () => Response.json([normalizeSteamWorkshopItem({ publishedfileid: '1', title: 'Fixture' })]);
    assert.equal((await provider.getWallpapers()).total, 1);
    globalThis.fetch = () => { throw new Error('não deve acessar rede'); };
    const mock = await new MockWallpaperProvider().getWallpapers();
    assert.ok(mock.items.every(item => item.isSimulated));
  } finally { globalThis.fetch = previous; }
});
