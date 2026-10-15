import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  paginateWallpapers,
  filterAndSortWallpapers,
} from '../src/utils/filterWallpapers.ts';

// Fixture sintética privada: casos estáveis de busca, paginação e recomendações.
const rawData = readFileSync('./tests/fixtures/wallpapers.json', 'utf-8');
const catalog = JSON.parse(rawData);

describe('Paginação e Carregamento Progressivo (paginateWallpapers)', () => {
  it('deve retornar a primeira página com quantidade correta e hasMore = true', () => {
    const result = paginateWallpapers(catalog, 1, 8);

    assert.strictEqual(result.items.length, 8);
    assert.strictEqual(result.page, 1);
    assert.strictEqual(result.pageSize, 8);
    assert.strictEqual(result.total, catalog.length);
    assert.strictEqual(result.hasMore, catalog.length > 8);
  });

  it('deve retornar a segunda página sem duplicar itens da primeira página', () => {
    const page1 = paginateWallpapers(catalog, 1, 8);
    const page2 = paginateWallpapers(catalog, 2, 8);

    assert.strictEqual(page2.page, 2);
    assert.strictEqual(page2.items.length, Math.min(8, catalog.length - 8));

    // Garante que nenhum item da página 1 aparece na página 2
    const page1Ids = new Set(page1.items.map((i) => i.id));
    const hasOverlap = page2.items.some((i) => page1Ids.has(i.id));
    assert.strictEqual(hasOverlap, false, 'Não deve haver sobreposição entre páginas consecutivas');

    // Se o catálogo tem 16 itens, na página 2 hasMore deve ser falso
    if (catalog.length <= 16) {
      assert.strictEqual(page2.hasMore, false);
    }
  });

  it('deve suportar tamanhos de página customizados fracionados', () => {
    const pageSize = 5;
    const page1 = paginateWallpapers(catalog, 1, pageSize);
    const page2 = paginateWallpapers(catalog, 2, pageSize);
    const page3 = paginateWallpapers(catalog, 3, pageSize);
    const page4 = paginateWallpapers(catalog, 4, pageSize);

    assert.strictEqual(page1.items.length, 5);
    assert.strictEqual(page1.hasMore, true);

    assert.strictEqual(page2.items.length, 5);
    assert.strictEqual(page2.hasMore, true);

    assert.strictEqual(page3.items.length, 5);
    assert.strictEqual(page3.hasMore, true);

    assert.strictEqual(page4.items.length, catalog.length - 15);
    assert.strictEqual(page4.hasMore, false);
  });

  it('deve retornar array vazio e hasMore = false para páginas além do limite do catálogo', () => {
    const result = paginateWallpapers(catalog, 999, 8);

    assert.strictEqual(result.items.length, 0);
    assert.strictEqual(result.hasMore, false);
    assert.strictEqual(result.total, catalog.length);
  });

  it('deve combinar paginação com filtros e pesquisa com precisão no total e hasMore', () => {
    const filtered = filterAndSortWallpapers(catalog, { types: ['Video'] });
    assert.ok(filtered.length > 0);

    const result = paginateWallpapers(filtered, 1, 2);

    assert.strictEqual(result.items.length, 2);
    assert.strictEqual(result.total, filtered.length);
    assert.strictEqual(result.hasMore, filtered.length > 2);
    result.items.forEach((item) => assert.strictEqual(item.type, 'Video'));
  });

  it('deve tratar parâmetros de página e tamanho inválidos com valores padrão seguros', () => {
    const resultInvalidPage = paginateWallpapers(catalog, -1, 8);
    assert.strictEqual(resultInvalidPage.page, 1);
    assert.strictEqual(resultInvalidPage.items.length, 8);

    const resultInvalidSize = paginateWallpapers(catalog, 1, 0);
    assert.strictEqual(resultInvalidSize.page, 1);
    assert.ok(resultInvalidSize.pageSize > 0);
  });
});
