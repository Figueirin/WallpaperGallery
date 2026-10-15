import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getRecommendedWallpapers } from '../src/utils/recommendations.ts';

// Fixture sintética privada: casos estáveis de busca, paginação e recomendações.
const rawData = readFileSync('./tests/fixtures/wallpapers.json', 'utf-8');
const catalog = JSON.parse(rawData);

describe('Recomendações de Wallpapers Relacionados (getRecommendedWallpapers)', () => {
  it('nunca deve recomendar o próprio item atualmente aberto', () => {
    const currentItem = catalog[0]; // mock-3001
    const recs = getRecommendedWallpapers(catalog, currentItem, 6);

    assert.ok(recs.length > 0);
    assert.strictEqual(
      recs.some((r) => r.id === currentItem.id),
      false,
      'O item atual não pode estar na lista de recomendações'
    );
  });

  it('não deve conter nenhum item duplicado na lista de recomendações', () => {
    const currentItem = catalog[1]; // mock-3002
    const recs = getRecommendedWallpapers(catalog, currentItem, 6);
    const ids = recs.map((r) => r.id);
    const uniqueIds = new Set(ids);

    assert.strictEqual(uniqueIds.size, ids.length, 'Não devem existir itens duplicados');
  });

  it('deve priorizar wallpapers com tags em comum (Prioridade 1)', () => {
    // mock-3001 tem as tags: ["Cyberpunk", "Rain", "City", "Relaxing"]
    const currentItem = catalog.find((w) => w.id === 'mock-3001');
    assert.ok(currentItem);

    const recs = getRecommendedWallpapers(catalog, currentItem, 6);
    assert.ok(recs.length > 0);

    // O primeiro recomendado deve compartilhar pelo menos uma tag com o item atual
    const firstRec = recs[0];
    const sharesTag = firstRec.tags.some((t) =>
      currentItem.tags.map((ct) => ct.toLowerCase()).includes(t.toLowerCase())
    );
    assert.ok(
      sharesTag,
      `O primeiro recomendado (${firstRec.title}) deveria compartilhar tags com ${currentItem.title}`
    );
  });

  it('deve utilizar tipo e resolução como critérios secundários e terciários quando tags empatam', () => {
    const currentItem = catalog.find((w) => w.id === 'mock-3002'); // Video, 2560x1440
    assert.ok(currentItem);

    const recs = getRecommendedWallpapers(catalog, currentItem, 6);
    assert.ok(recs.length > 0);

    // Itens com mesmo tipo 'Video' ou resolução compatível devem pontuar mais
    const hasSameType = recs.some((r) => r.type === currentItem.type);
    assert.ok(hasSameType, 'Deve haver ao menos uma recomendação do mesmo tipo');
  });

  it('deve respeitar estritamente o limite solicitado de itens', () => {
    const currentItem = catalog[0];

    const recs4 = getRecommendedWallpapers(catalog, currentItem, 4);
    assert.strictEqual(recs4.length, 4);

    const recs6 = getRecommendedWallpapers(catalog, currentItem, 6);
    assert.strictEqual(recs6.length, 6);
  });

  it('deve ser completamente determinístico (mesma entrada gera mesma saída ordenada)', () => {
    const currentItem = catalog[2];
    const run1 = getRecommendedWallpapers(catalog, currentItem, 6);
    const run2 = getRecommendedWallpapers(catalog, currentItem, 6);

    assert.deepStrictEqual(
      run1.map((r) => r.id),
      run2.map((r) => r.id),
      'A ordem e os itens das recomendações devem ser 100% determinísticos'
    );
  });

  it('deve lidar graciosamente com entradas nulas, vazias ou catálogo unitário', () => {
    assert.deepStrictEqual(getRecommendedWallpapers([], catalog[0]), []);
    assert.deepStrictEqual(getRecommendedWallpapers(catalog, null), []);
    assert.deepStrictEqual(getRecommendedWallpapers(catalog, undefined), []);
    assert.deepStrictEqual(getRecommendedWallpapers([catalog[0]], catalog[0]), []);
  });
});

it('deduplica IDs realmente repetidos na entrada', () => {
  const base = { id: '1', title: 'Base', tags: ['Nature'], type: 'Scene', resolution: '1920x1080', aspectRatio: '16:9', stats: {} };
  const other = { ...base, id: '2' };
  const result = getRecommendedWallpapers([base, other, { ...other }], base);
  assert.deepEqual(result.map(item => item.id), ['2']);
});
