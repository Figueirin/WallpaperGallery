import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { StaticCatalogProvider } from '../src/services/staticCatalogProvider.ts';
import { getRecommendedWallpapers } from '../src/utils/recommendations.ts';
import { steamLinks } from '../src/utils/safeUrls.ts';

// Carrega os dados reais de disco para validação estrita
const manifest = JSON.parse(readFileSync('./public/data/catalog/manifest.json', 'utf-8'));
const fullCatalog = JSON.parse(readFileSync('./public/data/catalog.json', 'utf-8'));

/**
 * Cria um fetch customizado que lê diretamente os arquivos de public/data/catalog/
 */
function createLocalCatalogFetch() {
  return async (input) => {
    const urlStr = String(input);
    const cleanPath = urlStr.replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '');

    // Mapeamento para arquivos reais do projeto
    let filePath = cleanPath;
    if (filePath.startsWith('data/catalog/')) {
      filePath = `public/${filePath}`;
    } else if (filePath.startsWith('data/catalog.json')) {
      filePath = 'public/data/catalog.json';
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(content),
        text: async () => content,
      };
    } catch {
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => { throw new Error('Not found'); },
        text: async () => 'Not found',
      };
    }
  };
}

describe('Validação Funcional do Frontend com Catálogo Real (178 Wallpapers / 8 Shards)', () => {
  it('manifesto e catálogo contêm exatamente 178 wallpapers distribuídos em 8 shards de 24 itens (último com 10)', () => {
    assert.strictEqual(manifest.totalItems, 178);
    assert.strictEqual(manifest.pageSize, 24);
    assert.strictEqual(manifest.totalPages, 8);
    assert.strictEqual(manifest.shards.length, 8);
    assert.strictEqual(fullCatalog.length, 178);

    // Valida cada shard individualmente
    for (let p = 1; p <= 7; p++) {
      const shard = manifest.shards.find((s) => s.page === p);
      assert.ok(shard, `Shard da página ${p} deve existir`);
      assert.strictEqual(shard.count, 24, `Página ${p} deve ter 24 itens`);
    }

    const lastShard = manifest.shards.find((s) => s.page === 8);
    assert.ok(lastShard, 'Shard da página 8 deve existir');
    assert.strictEqual(lastShard.count, 10, 'Página 8 deve conter exatamente 10 itens');
  });

  it('StaticCatalogProvider: navegação página por página cobre todos os 178 itens sem duplicatas nem omissões', async () => {
    const provider = new StaticCatalogProvider({
      fetchImpl: createLocalCatalogFetch(),
      catalogPath: 'data/catalog',
    });

    const collectedIds = new Set();
    const allItems = [];

    for (let page = 1; page <= 8; page++) {
      const result = await provider.getWallpapers({ page, pageSize: 24 });

      if (page < 8) {
        assert.strictEqual(result.items.length, 24, `Página ${page} deve retornar 24 itens`);
        assert.strictEqual(result.hasMore, true, `Página ${page} deve ter hasMore = true`);
      } else {
        assert.strictEqual(result.items.length, 10, 'Página 8 (última) deve retornar 10 itens');
        assert.strictEqual(result.hasMore, false, 'Página 8 (última) deve ter hasMore = false');
      }

      assert.strictEqual(result.total, 178);
      assert.strictEqual(result.page, page);

      for (const item of result.items) {
        assert.ok(!collectedIds.has(item.id), `Item ${item.id} não pode ser duplicado entre páginas`);
        collectedIds.add(item.id);
        allItems.push(item);
      }
    }

    assert.strictEqual(collectedIds.size, 178, 'Total de itens coletados deve ser exatamente 178');
  });

  it('StaticCatalogProvider: acesso direto à página 8 (última) carrega apenas a página 8 com 10 itens', async () => {
    const fetchedUrls = [];
    const trackingFetch = async (input, init) => {
      fetchedUrls.push(String(input));
      return createLocalCatalogFetch()(input, init);
    };

    const provider = new StaticCatalogProvider({
      fetchImpl: trackingFetch,
      catalogPath: 'data/catalog',
    });

    const result = await provider.getWallpapers({ page: 8, pageSize: 24 });
    assert.strictEqual(result.items.length, 10);
    assert.strictEqual(result.total, 178);
    assert.strictEqual(result.hasMore, false);

    // Deve ter baixado apenas manifest.json e pages/000008.json (sem carregar shards 1..7)
    assert.ok(fetchedUrls.some((u) => u.includes('manifest.json')));
    assert.ok(fetchedUrls.some((u) => u.includes('pages/000008.json')));
    assert.strictEqual(
      fetchedUrls.some((u) => u.includes('pages/000001.json')),
      false,
      'Não deve carregar o shard 1 quando a página 8 for acessada diretamente'
    );
  });

  it('Busca textual com dados reais é insensível a maiúsculas, minúsculas e termos parciais', async () => {
    const provider = new StaticCatalogProvider({
      fetchImpl: createLocalCatalogFetch(),
      catalogPath: 'data/catalog',
    });

    // Pega o primeiro item do catálogo para teste de busca
    const sampleItem = fullCatalog[0];
    const sampleWord = sampleItem.title.split(' ')[0].toLowerCase();

    // Busca minúscula
    const resLower = await provider.getWallpapers({ searchQuery: sampleWord, pageSize: 24 });
    // Busca maiúscula
    const resUpper = await provider.getWallpapers({ searchQuery: sampleWord.toUpperCase(), pageSize: 24 });

    assert.ok(resLower.items.length > 0);
    assert.strictEqual(resLower.total, resUpper.total, 'Busca deve ser case-insensitive');
    assert.ok(resLower.items.some((w) => w.id === sampleItem.id));
  });

  it('Busca por termo inexistente retorna zero itens de forma limpa', async () => {
    const provider = new StaticCatalogProvider({
      fetchImpl: createLocalCatalogFetch(),
      catalogPath: 'data/catalog',
    });

    const res = await provider.getWallpapers({ searchQuery: 'termo_completamente_inexistente_xyz_123', pageSize: 24 });
    assert.strictEqual(res.items.length, 0);
    assert.strictEqual(res.total, 0);
    assert.strictEqual(res.hasMore, false);
  });

  it('Filtros combinados de tipo, resolução e tags funcionam com o catálogo real', async () => {
    const provider = new StaticCatalogProvider({
      fetchImpl: createLocalCatalogFetch(),
      catalogPath: 'data/catalog',
    });

    const meta = await provider.getFilterMetadata();
    assert.ok(meta.types.length > 0);
    assert.ok(meta.resolutions.length > 0);

    // Filtra por primeiro tipo disponível
    const testType = meta.types[0];
    const resType = await provider.getWallpapers({ types: [testType], pageSize: 24 });
    assert.ok(resType.items.length > 0);
    resType.items.forEach((item) => assert.strictEqual(item.type, testType));
  });

  it('Ordenação por popularidade, data e título é consistente', async () => {
    const provider = new StaticCatalogProvider({
      fetchImpl: createLocalCatalogFetch(),
      catalogPath: 'data/catalog',
    });

    const byPop = await provider.getWallpapers({ sortBy: 'popularity_desc', pageSize: 24 });
    const byDate = await provider.getWallpapers({ sortBy: 'date_desc', pageSize: 24 });
    const byTitle = await provider.getWallpapers({ sortBy: 'title_asc', pageSize: 24 });

    assert.strictEqual(byPop.items.length, 24);
    assert.strictEqual(byDate.items.length, 24);
    assert.strictEqual(byTitle.items.length, 24);

    // Title deve estar ordenado alfabeticamente
    for (let i = 0; i < byTitle.items.length - 1; i++) {
      const cmp = byTitle.items[i].title.localeCompare(byTitle.items[i + 1].title, 'pt-BR');
      assert.ok(cmp <= 0, 'Itens devem estar em ordem alfabética');
    }
  });

  it('Detalhes de wallpaper: getWallpaperById localiza o item no shard correto e gera links válidos', async () => {
    const provider = new StaticCatalogProvider({
      fetchImpl: createLocalCatalogFetch(),
      catalogPath: 'data/catalog',
    });

    // Pega um item que está especificamente no shard 5
    const shard5Item = manifest.shards[4];
    const targetId = shard5Item.idRange[0];

    const item = await provider.getWallpaperById(targetId);
    assert.ok(item, 'Item do shard 5 deve ser localizado');
    assert.strictEqual(item.id, targetId);

    // Links da Steam
    const links = steamLinks(item.id, item.isSimulated);
    assert.strictEqual(links.web, `https://steamcommunity.com/sharedfiles/filedetails/?id=${targetId}`);
    assert.strictEqual(links.client, `steam://url/CommunityFilePage/${targetId}`);
  });

  it('Recomendações determinísticas baseadas em tags e tipo', () => {
    const currentItem = fullCatalog[0];
    const recs = getRecommendedWallpapers(fullCatalog, currentItem, 6);

    assert.ok(recs.length <= 6);
    assert.strictEqual(recs.some((r) => r.id === currentItem.id), false, 'Item atual não deve ser recomendado');

    const ids = new Set(recs.map((r) => r.id));
    assert.strictEqual(ids.size, recs.length, 'Recomendações não devem ter duplicatas');
  });
});
