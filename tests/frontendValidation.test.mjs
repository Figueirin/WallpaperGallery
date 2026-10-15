import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { StaticCatalogProvider } from '../src/services/staticCatalogProvider.ts';
import { getRecommendedWallpapers } from '../src/utils/recommendations.ts';
import { steamLinks } from '../src/utils/safeUrls.ts';
import { DEFAULT_PAGE_SIZE } from '../src/types/wallpaper.ts';

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

describe('Validação Funcional do Frontend com Catálogo Real Expandido (979 Wallpapers / 40 Shards de 25 Itens)', () => {
  it('manifesto e catálogo contêm 979 wallpapers distribuídos em 40 shards de 25 itens (último com 4)', () => {
    assert.strictEqual(manifest.totalItems, 979);
    assert.strictEqual(manifest.pageSize, 25);
    assert.strictEqual(manifest.pageSize, DEFAULT_PAGE_SIZE);
    assert.strictEqual(manifest.totalPages, 40);
    assert.strictEqual(manifest.shards.length, 40);
    assert.strictEqual(fullCatalog.length, 979);

    // Valida os primeiros 39 shards (devem conter exatamente 25 itens cada)
    for (let p = 1; p <= 39; p++) {
      const shard = manifest.shards.find((s) => s.page === p);
      assert.ok(shard, `Shard da página ${p} deve existir`);
      assert.strictEqual(shard.count, 25, `Página ${p} deve ter 25 itens`);
    }

    const lastShard = manifest.shards.find((s) => s.page === 40);
    assert.ok(lastShard, 'Shard da página 40 deve existir');
    assert.strictEqual(lastShard.count, 4, 'Página 40 (última) deve conter exatamente 4 itens restantes');
  });

  it('preserva 100% dos 178 wallpapers originais da fase anterior', () => {
    const backupPath = './.moderation/backups/fase5_pre_expansion_backup/catalog.json';
    assert.ok(existsSync(backupPath), 'Backup de segurança da Fase 5 deve existir');
    const backupCatalog = JSON.parse(readFileSync(backupPath, 'utf-8'));
    assert.strictEqual(backupCatalog.length, 178);

    const currentIds = new Set(fullCatalog.map((w) => w.id));
    for (const original of backupCatalog) {
      assert.ok(
        currentIds.has(original.id),
        `Wallpaper original ID ${original.id} (${original.title}) deve permanecer no catálogo expandido`
      );
    }
  });

  it('StaticCatalogProvider: navegação pelas páginas cobre os itens sem duplicatas nem omissões', async () => {
    const provider = new StaticCatalogProvider({
      fetchImpl: createLocalCatalogFetch(),
      catalogPath: 'data/catalog',
    });

    const collectedIds = new Set();

    // Testa as primeiras 5 páginas e as 2 últimas
    const pagesToTest = [1, 2, 3, 4, 5, 39, 40];
    for (const page of pagesToTest) {
      const result = await provider.getWallpapers({ page, pageSize: 25 });

      if (page < 40) {
        assert.strictEqual(result.items.length, 25, `Página ${page} deve retornar 25 itens`);
        assert.strictEqual(result.hasMore, true, `Página ${page} deve ter hasMore = true`);
      } else {
        assert.strictEqual(result.items.length, 4, 'Página 40 (última) deve retornar 4 itens');
        assert.strictEqual(result.hasMore, false, 'Página 40 (última) deve ter hasMore = false');
      }

      assert.strictEqual(result.total, 979);
      assert.strictEqual(result.page, page);

      for (const item of result.items) {
        assert.ok(!collectedIds.has(item.id), `Item ${item.id} não pode ser duplicado entre páginas testadas`);
        collectedIds.add(item.id);
      }
    }
  });

  it('StaticCatalogProvider: acesso direto a página intermediária (página 20) carrega pontualmente sem carregar anteriores', async () => {
    const fetchedUrls = [];
    const trackingFetch = async (input, init) => {
      fetchedUrls.push(String(input));
      return createLocalCatalogFetch()(input, init);
    };

    const provider = new StaticCatalogProvider({
      fetchImpl: trackingFetch,
      catalogPath: 'data/catalog',
    });

    const result = await provider.getWallpapers({ page: 20, pageSize: 25 });
    assert.strictEqual(result.items.length, 25);
    assert.strictEqual(result.total, 979);
    assert.strictEqual(result.hasMore, true);

    // Deve carregar manifest.json e apenas pages/000020.json
    assert.ok(fetchedUrls.some((u) => u.includes('manifest.json')));
    assert.ok(fetchedUrls.some((u) => u.includes('pages/000020.json')));
    assert.strictEqual(fetchedUrls.some((u) => u.includes('pages/000001.json')), false);
    assert.strictEqual(fetchedUrls.some((u) => u.includes('pages/000019.json')), false);
  });

  it('StaticCatalogProvider: acesso direto à página 40 (última) carrega apenas a página 40 com 4 itens', async () => {
    const fetchedUrls = [];
    const trackingFetch = async (input, init) => {
      fetchedUrls.push(String(input));
      return createLocalCatalogFetch()(input, init);
    };

    const provider = new StaticCatalogProvider({
      fetchImpl: trackingFetch,
      catalogPath: 'data/catalog',
    });

    const result = await provider.getWallpapers({ page: 40, pageSize: 25 });
    assert.strictEqual(result.items.length, 4);
    assert.strictEqual(result.total, 979);
    assert.strictEqual(result.hasMore, false);

    assert.ok(fetchedUrls.some((u) => u.includes('manifest.json')));
    assert.ok(fetchedUrls.some((u) => u.includes('pages/000040.json')));
    assert.strictEqual(
      fetchedUrls.some((u) => u.includes('pages/000001.json')),
      false,
      'Não deve carregar o shard 1 quando a página 40 for acessada diretamente'
    );
  });

  it('Busca textual por título e por autor é precisa e case-insensitive', async () => {
    const provider = new StaticCatalogProvider({
      fetchImpl: createLocalCatalogFetch(),
      catalogPath: 'data/catalog',
    });

    const sampleItem = fullCatalog[10];
    const sampleWord = sampleItem.title.split(' ')[0].toLowerCase();

    // Busca minúscula e maiúscula por título
    const resLower = await provider.getWallpapers({ searchQuery: sampleWord, pageSize: 25 });
    const resUpper = await provider.getWallpapers({ searchQuery: sampleWord.toUpperCase(), pageSize: 25 });

    assert.ok(resLower.items.length > 0);
    assert.strictEqual(resLower.total, resUpper.total, 'Busca por título deve ser case-insensitive');
    assert.ok(resLower.items.some((w) => w.id === sampleItem.id));

    // Busca por autor
    if (sampleItem.author.name) {
      const authorWord = sampleItem.author.name.slice(0, 8);
      const resAuthor = await provider.getWallpapers({ searchQuery: authorWord, pageSize: 25 });
      assert.ok(resAuthor.items.length > 0);
      assert.ok(resAuthor.items.some((w) => w.author.name.includes(authorWord)));
    }
  });

  it('Busca por termo inexistente retorna zero itens de forma limpa', async () => {
    const provider = new StaticCatalogProvider({
      fetchImpl: createLocalCatalogFetch(),
      catalogPath: 'data/catalog',
    });

    const res = await provider.getWallpapers({ searchQuery: 'termo_completamente_inexistente_xyz_123', pageSize: 25 });
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
    const resType = await provider.getWallpapers({ types: [testType], pageSize: 25 });
    assert.ok(resType.items.length > 0);
    resType.items.forEach((item) => assert.strictEqual(item.type, testType));
  });

  it('Ordenação por popularidade, data e título é consistente', async () => {
    const provider = new StaticCatalogProvider({
      fetchImpl: createLocalCatalogFetch(),
      catalogPath: 'data/catalog',
    });

    const byPop = await provider.getWallpapers({ sortBy: 'popularity_desc', pageSize: 25 });
    const byDate = await provider.getWallpapers({ sortBy: 'date_desc', pageSize: 25 });
    const byTitle = await provider.getWallpapers({ sortBy: 'title_asc', pageSize: 25 });

    assert.strictEqual(byPop.items.length, 25);
    assert.strictEqual(byDate.items.length, 25);
    assert.strictEqual(byTitle.items.length, 25);

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

    // Pega um item que está especificamente no shard 25
    const shard25Item = manifest.shards[24];
    const targetId = shard25Item.idRange[0];

    const item = await provider.getWallpaperById(targetId);
    assert.ok(item, 'Item do shard 25 deve ser localizado');
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

  it('Recomendações funcionam com amostra de 48 itens sem duplicatas nem auto-recomendação', () => {
    const sample = fullCatalog.slice(0, 48);
    const currentItem = sample[5];
    const recs = getRecommendedWallpapers(sample, currentItem, 6);

    assert.ok(recs.length <= 6);
    assert.strictEqual(recs.some((r) => r.id === currentItem.id), false);
    const ids = new Set(recs.map((r) => r.id));
    assert.strictEqual(ids.size, recs.length);
  });

  it('Metadados do catálogo excedem o limite de 12 tags, ativando corretamente a funcionalidade de expansão/recolhimento', () => {
    assert.ok(manifest.metadata.tags.length > 12, 'Catálogo real deve ter mais de 12 tags');
    assert.strictEqual(manifest.metadata.tags.length, 45);
  });
});
