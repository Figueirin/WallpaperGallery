import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createCatalogShards,
  writeCatalogShardsSync,
  CATALOG_FORMAT_VERSION,
} from '../src/utils/catalogSharder.ts';
import { StaticCatalogProvider } from '../src/services/staticCatalogProvider.ts';
import { filterAndSortWallpapers, paginateWallpapers } from '../src/utils/filterWallpapers.ts';

/**
 * Cria fixtures realistas e válidas de wallpapers para testes
 */
function createFixture(id, overrides = {}) {
  const types = ['Scene', 'Video', 'Web', 'Application'];
  const resolutions = ['1920x1080', '2560x1440', '3840x2160', '3440x1440'];
  const type = overrides.type ?? types[id % types.length];
  const resolution = overrides.resolution ?? resolutions[id % resolutions.length];

  return {
    id: String(id),
    title: overrides.title ?? `Wallpaper #${id} ${type}`,
    description: overrides.description ?? `Descrição detalhada do wallpaper de teste número ${id}`,
    author: overrides.author ?? {
      name: `Autor ${id % 5}`,
      steamId: `7656119800000000${id % 5}`,
    },
    previewUrl: overrides.previewUrl ?? `https://steamuserimages.akamaihd.net/ugc/${id}/preview.jpg`,
    videoPreviewUrl: type === 'Video' ? `https://steamuserimages.akamaihd.net/ugc/${id}/video.mp4` : undefined,
    type,
    resolution,
    aspectRatio: resolution === '3440x1440' ? '21:9' : '16:9',
    tags: overrides.tags ?? [`Tag${id % 4}`, 'Wallpaper Engine', id % 2 === 0 ? 'Cyberpunk' : 'Nature'],
    rating: overrides.rating ?? (id % 10 === 0 ? 'Mature' : 'Everyone'),
    createdAt: overrides.createdAt ?? new Date(1700000000000 + id * 3600000).toISOString(),
    updatedAt: overrides.updatedAt ?? new Date(1700000000000 + id * 3600000).toISOString(),
    stats: overrides.stats ?? {
      views: 1000 + id * 50,
      subscriptions: 500 + id * 25,
      favorited: 100 + id * 5,
      votesUp: 80 + id * 4,
    },
    steamUrl: `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`,
    steamClientUri: `steam://url/CommunityFilePage/${id}`,
    isSimulated: overrides.isSimulated,
  };
}

function createDataset(count, simulated = false) {
  return Array.from({ length: count }, (_, idx) => createFixture(1000 + idx, { isSimulated: simulated ? true : undefined }));
}

describe('Arquitetura JSON-First: Particionamento e Provedor Estático (Sharded Catalog)', () => {
  it('deve gerar manifesto completo com versão, contagens, metadados e mapeamento de shards', () => {
    const dataset = createDataset(50);
    const { manifest, shards, index } = createCatalogShards(dataset, { pageSize: 20 });

    assert.equal(manifest.version, CATALOG_FORMAT_VERSION);
    assert.equal(manifest.totalItems, 50);
    assert.equal(manifest.pageSize, 20);
    assert.equal(manifest.totalPages, 3);
    assert.equal(manifest.shards.length, 3);
    assert.equal(shards.length, 3);
    assert.equal(index.length, 50);

    // Valida shard individual
    assert.equal(shards[0].page, 1);
    assert.equal(shards[0].items.length, 20);
    assert.equal(shards[1].page, 2);
    assert.equal(shards[1].items.length, 20);
    assert.equal(shards[2].page, 3);
    assert.equal(shards[2].items.length, 10);

    // Valida mapeamento de IDs para páginas
    for (const item of shards[0].items) {
      assert.equal(manifest.itemToPage[item.id], 1);
    }
    for (const item of shards[2].items) {
      assert.equal(manifest.itemToPage[item.id], 3);
    }

    // Metadados extraídos
    assert.ok(manifest.metadata.types.includes('Scene'));
    assert.ok(manifest.metadata.resolutions.includes('1920x1080'));
  });

  it('deve gerar catálogo vazio de forma segura', () => {
    const { manifest, shards, index } = createCatalogShards([], { pageSize: 24 });
    assert.equal(manifest.totalItems, 0);
    assert.equal(manifest.totalPages, 0);
    assert.equal(shards.length, 0);
    assert.equal(index.length, 0);
    assert.deepEqual(manifest.shards, []);
  });

  it('deve rejeitar IDs duplicados na geração', () => {
    const itemA = createFixture(1001);
    const itemB = createFixture(1001, { title: 'Duplicado' });
    assert.throws(
      () => createCatalogShards([itemA, itemB]),
      /ID duplicado/
    );
  });

  it('deve rejeitar itens simulados no catálogo de produção por padrão', () => {
    const simulated = createFixture(1001, { isSimulated: true });
    assert.throws(
      () => createCatalogShards([simulated]),
      /Item simulado rejeitado/
    );
  });

  it('deve permitir dados simulados apenas com flag explícita allowSimulated', () => {
    const simulated = createFixture(1001, { isSimulated: true });
    const { manifest } = createCatalogShards([simulated], { allowSimulated: true });
    assert.equal(manifest.totalItems, 1);
  });

  it('deve gravar shards e manifesto atomicamente em disco', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wg-shards-test-'));
    try {
      const dataset = createDataset(25);
      const sharded = createCatalogShards(dataset, { pageSize: 10 });
      writeCatalogShardsSync(tempDir, sharded);

      const manifestContent = JSON.parse(readFileSync(join(tempDir, 'manifest.json'), 'utf-8'));
      assert.equal(manifestContent.totalItems, 25);
      assert.equal(manifestContent.totalPages, 3);

      const page1 = JSON.parse(readFileSync(join(tempDir, 'pages/000001.json'), 'utf-8'));
      assert.equal(page1.length, 10);
      const page3 = JSON.parse(readFileSync(join(tempDir, 'pages/000003.json'), 'utf-8'));
      assert.equal(page3.length, 5);

      const indexContent = JSON.parse(readFileSync(join(tempDir, 'index.json'), 'utf-8'));
      assert.equal(indexContent.length, 25);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('deve ser 100% determinístico para entradas equivalentes', () => {
    const datasetA = createDataset(20);
    const datasetB = [...datasetA].reverse(); // Mesmos itens em ordem inversa

    const generatedAt = '2026-10-14T23:00:00.000Z';
    const resultA = createCatalogShards(datasetA, { generatedAt, pageSize: 8 });
    const resultB = createCatalogShards(datasetB, { generatedAt, pageSize: 8 });

    assert.deepEqual(resultA.manifest, resultB.manifest);
    assert.deepEqual(resultA.index, resultB.index);
    assert.deepEqual(resultA.shards, resultB.shards);
  });

  it('StaticCatalogProvider: navegação padrão carrega apenas o shard necessário', async () => {
    const dataset = createDataset(30);
    const sharded = createCatalogShards(dataset, { pageSize: 10 });

    const fetchedUrls = [];
    const fakeFetch = async (url) => {
      const urlStr = String(url);
      fetchedUrls.push(urlStr);

      if (urlStr.endsWith('manifest.json')) {
        return Response.json(sharded.manifest);
      }
      const pageMatch = urlStr.match(/pages\/(\d+)\.json$/);
      if (pageMatch) {
        const pageNum = parseInt(pageMatch[1], 10);
        const shard = sharded.shards.find(s => s.page === pageNum);
        if (shard) return Response.json(shard.items);
      }
      return new Response('Not found', { status: 404 });
    };

    const provider = new StaticCatalogProvider({
      fetchImpl: fakeFetch,
      catalogPath: 'catalog',
    });

    // 1. Metadados imediatos (lê apenas manifest.json)
    const meta = await provider.getFilterMetadata();
    assert.deepEqual(meta, sharded.manifest.metadata);
    assert.equal(fetchedUrls.length, 1);
    assert.ok(fetchedUrls[0].endsWith('manifest.json'));

    // 2. Consulta da página 1 (8 itens): requer apenas o shard 1 (pages/000001.json)
    const page1Result = await provider.getWallpapers({ page: 1, pageSize: 8 });
    assert.equal(page1Result.items.length, 8);
    assert.equal(page1Result.total, 30);
    assert.equal(page1Result.hasMore, true);

    // Deve ter chamado apenas manifest.json e pages/000001.json
    assert.equal(fetchedUrls.length, 2);
    assert.ok(fetchedUrls[1].endsWith('pages/000001.json'));

    // 3. Consulta da página 2 (itens 9-16): os itens 9 e 10 já estão no shard 1, itens 11-16 exigem shard 2
    const page2Result = await provider.getWallpapers({ page: 2, pageSize: 8 });
    assert.equal(page2Result.items.length, 8);

    // Deve ter adicionado apenas pages/000002.json
    assert.equal(fetchedUrls.length, 3);
    assert.ok(fetchedUrls[2].endsWith('pages/000002.json'));
  });

  it('StaticCatalogProvider: getWallpaperById busca shard específico diretamente', async () => {
    const dataset = createDataset(30);
    const sharded = createCatalogShards(dataset, { pageSize: 10 });
    const targetItem = sharded.shards[2].items[0]; // Item localizado na página 3

    const fetchedUrls = [];
    const fakeFetch = async (url) => {
      const urlStr = String(url);
      fetchedUrls.push(urlStr);
      if (urlStr.endsWith('manifest.json')) return Response.json(sharded.manifest);
      if (urlStr.endsWith('pages/000003.json')) return Response.json(sharded.shards[2].items);
      return new Response('Not found', { status: 404 });
    };

    const provider = new StaticCatalogProvider({
      fetchImpl: fakeFetch,
      catalogPath: 'catalog',
    });

    const found = await provider.getWallpaperById(targetItem.id);
    assert.ok(found);
    assert.equal(found.id, targetItem.id);
    assert.equal(found.title, targetItem.title);

    // Deve ter acessado diretamente manifest.json e pages/000003.json, ignorando shards 1 e 2!
    assert.deepEqual(fetchedUrls.map(u => u.split('/').slice(-2).join('/')), [
      'catalog/manifest.json',
      'pages/000003.json',
    ]);

    // Busca repetida usa cache em memória
    const cached = await provider.getWallpaperById(targetItem.id);
    assert.strictEqual(cached, found);
    assert.equal(fetchedUrls.length, 2); // Nenhuma nova requisição de rede
  });

  it('StaticCatalogProvider: rejeita catálogo ausente com mensagem clara', async () => {
    const fakeFetch = async () => new Response('Not found', { status: 404 });
    const provider = new StaticCatalogProvider({ fetchImpl: fakeFetch });

    await assert.rejects(
      provider.getWallpapers(),
      /Catálogo estático indisponível/
    );
  });

  it('StaticCatalogProvider: rejeita catálogo corrompido com erro descritivo', async () => {
    const fakeFetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('manifest.json')) {
        return Response.json({ version: '1.0', totalItems: 'not-a-number' }); // Manifesto inválido
      }
      return new Response('Not found', { status: 404 });
    };
    const provider = new StaticCatalogProvider({ fetchImpl: fakeFetch });

    await assert.rejects(
      provider.getWallpapers(),
      /Manifesto do catálogo estático corrompido/
    );
  });

  it('StaticCatalogProvider: rejeita shard contendo itens simulados', async () => {
    const dataset = createDataset(5);
    const sharded = createCatalogShards(dataset, { pageSize: 10 });
    // Injeta um item simulado no shard
    sharded.shards[0].items[0].isSimulated = true;

    const fakeFetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('manifest.json')) return Response.json(sharded.manifest);
      if (urlStr.endsWith('pages/000001.json')) return Response.json(sharded.shards[0].items);
      return new Response('Not found', { status: 404 });
    };

    const provider = new StaticCatalogProvider({ fetchImpl: fakeFetch });
    await assert.rejects(
      provider.getWallpapers(),
      /simulado/
    );
  });

  it('Comparação de Referência: busca e filtros no provedor shardado coincidem 100% com a filtragem de referência', async () => {
    // Dataset robusto com 60 itens cobrindo combinações diversas
    const dataset = createDataset(60);
    const sharded = createCatalogShards(dataset, { pageSize: 15 });

    const fakeFetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('manifest.json')) return Response.json(sharded.manifest);
      if (urlStr.endsWith('index.json')) return Response.json(sharded.index);
      const pageMatch = urlStr.match(/pages\/(\d+)\.json$/);
      if (pageMatch) {
        const pageNum = parseInt(pageMatch[1], 10);
        const shard = sharded.shards.find(s => s.page === pageNum);
        if (shard) return Response.json(shard.items);
      }
      return new Response('Not found', { status: 404 });
    };

    const provider = new StaticCatalogProvider({
      fetchImpl: fakeFetch,
      catalogPath: 'catalog',
    });

    // Cenários diversos de teste
    const scenarios = [
      { name: 'Busca por termo no título', options: { searchQuery: 'Scene' } },
      { name: 'Busca por termo em tags', options: { searchQuery: 'Cyberpunk' } },
      { name: 'Busca por nome de autor', options: { searchQuery: 'Autor 2' } },
      { name: 'Filtro por tipo Video', options: { types: ['Video'] } },
      { name: 'Filtro combinado tipo e resolução', options: { types: ['Scene'], resolutions: ['1920x1080'] } },
      { name: 'Filtro por múltiplas tags (OR)', options: { tags: ['Cyberpunk', 'Nature'] } },
      { name: 'Ordenação por data mais recente', options: { sortBy: 'date_desc', page: 1, pageSize: 8 } },
      { name: 'Ordenação por data mais antiga', options: { sortBy: 'date_asc', page: 2, pageSize: 8 } },
      { name: 'Ordenação alfabética por título', options: { sortBy: 'title_asc', page: 1, pageSize: 12 } },
      { name: 'Pesquisa + filtros + ordenação + paginação', options: { searchQuery: 'Wallpaper', types: ['Video', 'Scene'], sortBy: 'popularity_desc', page: 2, pageSize: 6 } },
      { name: 'Pesquisa sem resultados', options: { searchQuery: 'TermoInexistenteXYZ123' } },
    ];

    for (const scenario of scenarios) {
      // 1. Executa no provedor shardado (usa index compacto e carrega shards sob demanda)
      const providerResult = await provider.getWallpapers(scenario.options);

      // 2. Executa a função de referência diretamente sobre o conjunto completo
      const referenceFiltered = filterAndSortWallpapers(dataset, scenario.options);
      const referenceResult = paginateWallpapers(
        referenceFiltered,
        scenario.options.page ?? 1,
        scenario.options.pageSize ?? 8
      );

      // 3. Validação de equivalência matemática estrita
      assert.equal(
        providerResult.total,
        referenceResult.total,
        `[${scenario.name}] Total de resultados diverge: esperado ${referenceResult.total}, obtido ${providerResult.total}`
      );

      assert.equal(
        providerResult.hasMore,
        referenceResult.hasMore,
        `[${scenario.name}] hasMore diverge`
      );

      assert.equal(
        providerResult.items.length,
        referenceResult.items.length,
        `[${scenario.name}] Quantidade de itens na página diverge`
      );

      const providerIds = providerResult.items.map(item => item.id);
      const referenceIds = referenceResult.items.map(item => item.id);

      assert.deepEqual(
        providerIds,
        referenceIds,
        `[${scenario.name}] IDs e ordenação dos itens divergem da referência pura!`
      );
    }
  });

  it('StaticCatalogProvider: suporta fallback gracioso para catalog.json monolítico tradicional', async () => {
    const dataset = createDataset(10);

    const fakeFetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('manifest.json')) return new Response('Not found', { status: 404 });
      if (urlStr.endsWith('catalog.json')) return Response.json(dataset);
      return new Response('Not found', { status: 404 });
    };

    const provider = new StaticCatalogProvider({
      fetchImpl: fakeFetch,
      catalogPath: 'catalog',
    });

    const result = await provider.getWallpapers({ pageSize: 5 });
    assert.equal(result.total, 10);
    assert.equal(result.items.length, 5);
    assert.equal(result.hasMore, true);

    const item = await provider.getWallpaperById(dataset[0].id);
    assert.ok(item);
    assert.equal(item.id, dataset[0].id);
  });
});
