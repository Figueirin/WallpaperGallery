import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWallpaperProvider, LazyFirestoreWallpaperProvider } from '../src/services/providerFactory.ts';
import { StaticCatalogProvider } from '../src/services/staticCatalogProvider.ts';

function withProviderSetting(value, run) {
  const previous = process.env.VITE_DATA_PROVIDER;
  if (value === undefined) delete process.env.VITE_DATA_PROVIDER;
  else process.env.VITE_DATA_PROVIDER = value;
  return Promise.resolve().then(run).finally(() => {
    if (previous === undefined) delete process.env.VITE_DATA_PROVIDER;
    else process.env.VITE_DATA_PROVIDER = previous;
  });
}

const localFetch = async input => {
  const pathname = new URL(String(input), 'https://offline.invalid').pathname;
  assert.ok(pathname.startsWith('/data/catalog/'));
  return Response.json(JSON.parse(readFileSync(`public${pathname}`, 'utf8')));
};

test('sem variável: factory real navega nos 5000 itens, busca, filtra, pagina e abre detalhe', async () => {
  await withProviderSetting(undefined, async () => {
    const provider = createWallpaperProvider(undefined, { fetchImpl: localFetch });
    assert.ok(provider instanceof StaticCatalogProvider);
    const first = await provider.getWallpapers({ page: 1, pageSize: 25 });
    const last = await provider.getWallpapers({ page: 200, pageSize: 25 });
    assert.equal(first.total, 5000);
    assert.equal(first.items.length, 25);
    assert.equal(last.items.length, 25);
    assert.equal(last.hasMore, false);
    assert.ok(first.items.every(item => !item.isSimulated));
    const item = first.items[0];
    assert.deepEqual(await provider.getWallpaperById(item.id), item);
    const search = await provider.getWallpapers({ searchQuery: item.title, pageSize: 5000 });
    assert.ok(search.items.some(found => found.id === item.id));
    const filtered = await provider.getWallpapers({ types: [item.type], sortBy: 'title_asc' });
    assert.ok(filtered.items.length > 0);
    assert.ok(filtered.items.every(found => found.type === item.type));
    for (let i = 1; i < filtered.items.length; i++) assert.ok(filtered.items[i - 1].title.localeCompare(filtered.items[i].title, 'pt-BR') <= 0);
  });
});

test('catalog explícito funciona; provider removido e valores desconhecidos falham sem fallback', async () => {
  await withProviderSetting('catalog', () => assert.ok(createWallpaperProvider() instanceof StaticCatalogProvider));
  for (const invalid of ['mock', 'demo', 'unknown']) {
    await withProviderSetting(invalid, () => assert.throws(() => createWallpaperProvider(), /DataProvider desconhecido/));
  }
});

test('Firestore continua explícito e lazy com configuração de teste; nenhuma conexão', async () => {
  const keys = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID'];
  const previous = keys.map(key => process.env[key]);
  try {
    process.env.VITE_FIREBASE_API_KEY = 'offline-fixture';
    process.env.VITE_FIREBASE_PROJECT_ID = 'offline-fixture';
    await withProviderSetting('firestore', () => assert.ok(createWallpaperProvider() instanceof LazyFirestoreWallpaperProvider));
  } finally {
    keys.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i];
    });
  }
});
