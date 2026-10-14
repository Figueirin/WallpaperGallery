import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  filterAndSortWallpapers,
  extractFilterMetadata,
  getResolutionLabel,
} from '../src/utils/filterWallpapers.ts';

// Carrega o catálogo real do mock-wallpapers.json
const rawData = readFileSync('./public/data/mock-wallpapers.json', 'utf-8');
const catalog = JSON.parse(rawData);

describe('Pesquisa textual (Search)', () => {
  it('deve retornar todos os itens se a query for vazia ou apenas espaços', () => {
    const result = filterAndSortWallpapers(catalog, { searchQuery: '   ' });
    assert.strictEqual(result.length, catalog.length);
  });

  it('deve buscar por título ignorando maiúsculas/minúsculas', () => {
    const result = filterAndSortWallpapers(catalog, { searchQuery: 'cyberpunk' });
    assert.ok(result.length > 0);
    result.forEach((item) => {
      const match =
        item.title.toLowerCase().includes('cyberpunk') ||
        item.description.toLowerCase().includes('cyberpunk') ||
        item.tags.some((t) => t.toLowerCase().includes('cyberpunk'));
      assert.ok(match);
    });
  });

  it('deve buscar por nome do autor', () => {
    const result = filterAndSortWallpapers(catalog, { searchQuery: 'KuroDev' });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].author.name, 'KuroDev');
  });

  it('deve buscar por tag existente', () => {
    const result = filterAndSortWallpapers(catalog, { searchQuery: 'Retro' });
    assert.ok(result.length >= 1);
    assert.ok(result.some((item) => item.tags.includes('Retro')));
  });

  it('deve suportar múltiplos termos com espaços excedentes (busca por tokens)', () => {
    const result = filterAndSortWallpapers(catalog, {
      searchQuery: '   Neon    Rain   ',
    });
    assert.ok(result.length > 0);
    // Deve encontrar o item que contém Neon e Rain
    assert.ok(result.some((item) => item.title.includes('Neon') && item.tags.includes('Rain')));
  });

  it('deve retornar array vazio para termos sem correspondência', () => {
    const result = filterAndSortWallpapers(catalog, {
      searchQuery: 'termo_totalmente_inexistente_xyz_999',
    });
    assert.strictEqual(result.length, 0);
  });
});

describe('Filtros por Tipo de Wallpaper', () => {
  it('deve filtrar por tipo "Video"', () => {
    const result = filterAndSortWallpapers(catalog, { types: ['Video'] });
    assert.ok(result.length > 0);
    result.forEach((item) => assert.strictEqual(item.type, 'Video'));
  });

  it('deve filtrar por tipo "Scene"', () => {
    const result = filterAndSortWallpapers(catalog, { types: ['Scene'] });
    assert.ok(result.length > 0);
    result.forEach((item) => assert.strictEqual(item.type, 'Scene'));
  });

  it('deve filtrar por tipo "Web"', () => {
    const result = filterAndSortWallpapers(catalog, { types: ['Web'] });
    assert.ok(result.length > 0);
    result.forEach((item) => assert.strictEqual(item.type, 'Web'));
  });
});

describe('Filtros por Resolução', () => {
  it('deve filtrar por resolução 4K (3840x2160)', () => {
    const result = filterAndSortWallpapers(catalog, { resolutions: ['3840x2160'] });
    assert.ok(result.length > 0);
    result.forEach((item) => assert.strictEqual(item.resolution, '3840x2160'));
  });

  it('deve filtrar por resolução Ultrawide (3440x1440)', () => {
    const result = filterAndSortWallpapers(catalog, { resolutions: ['3440x1440'] });
    assert.ok(result.length > 0);
    result.forEach((item) => assert.strictEqual(item.resolution, '3440x1440'));
  });

  it('deve permitir múltiplas resoluções', () => {
    const result = filterAndSortWallpapers(catalog, {
      resolutions: ['1920x1080', '2560x1440'],
    });
    assert.ok(result.length > 0);
    result.forEach((item) => {
      assert.ok(item.resolution === '1920x1080' || item.resolution === '2560x1440');
    });
  });
});

describe('Filtro por Tags (Lógica OR)', () => {
  it('deve aplicar lógica OR quando múltiplas tags são selecionadas', () => {
    const result = filterAndSortWallpapers(catalog, {
      tags: ['Space', 'Anime'],
    });
    assert.ok(result.length >= 2);
    result.forEach((item) => {
      const hasSpace = item.tags.includes('Space');
      const hasAnime = item.tags.includes('Anime');
      assert.ok(hasSpace || hasAnime, `Item ${item.title} deveria conter Space ou Anime`);
    });
  });
});

describe('Combinação de Filtros (Lógica AND entre categorias)', () => {
  it('deve combinar Tipo, Resolução e Pesquisa simultaneamente', () => {
    const result = filterAndSortWallpapers(catalog, {
      searchQuery: 'Mountain',
      types: ['Video'],
      resolutions: ['2560x1440'],
    });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 'mock-3002');
  });

  it('deve combinar Tags e Tipo', () => {
    const result = filterAndSortWallpapers(catalog, {
      types: ['Scene'],
      tags: ['Cyberpunk'],
    });
    assert.ok(result.length > 0);
    result.forEach((item) => {
      assert.strictEqual(item.type, 'Scene');
      assert.ok(item.tags.includes('Cyberpunk'));
    });
  });
});

describe('Ordenação', () => {
  it('deve ordenar por popularidade decrescente (subscriptions + favorited + votesUp)', () => {
    const result = filterAndSortWallpapers(catalog, { sortBy: 'popularity_desc' });
    for (let i = 0; i < result.length - 1; i++) {
      const popA =
        (result[i].stats.subscriptions || 0) +
        (result[i].stats.favorited || 0) +
        (result[i].stats.votesUp || 0);
      const popB =
        (result[i + 1].stats.subscriptions || 0) +
        (result[i + 1].stats.favorited || 0) +
        (result[i + 1].stats.votesUp || 0);
      assert.ok(popA >= popB, `Item ${i} (${popA}) deveria ter popularidade >= item ${i+1} (${popB})`);
    }
  });

  it('deve ordenar por data decrescente (mais recentes primeiro)', () => {
    const result = filterAndSortWallpapers(catalog, { sortBy: 'date_desc' });
    for (let i = 0; i < result.length - 1; i++) {
      const timeA = new Date(result[i].createdAt).getTime();
      const timeB = new Date(result[i + 1].createdAt).getTime();
      assert.ok(timeA >= timeB, `Data de ${result[i].title} deve ser mais recente que ${result[i + 1].title}`);
    }
  });

  it('deve ordenar por data crescente (mais antigos primeiro)', () => {
    const result = filterAndSortWallpapers(catalog, { sortBy: 'date_asc' });
    for (let i = 0; i < result.length - 1; i++) {
      const timeA = new Date(result[i].createdAt).getTime();
      const timeB = new Date(result[i + 1].createdAt).getTime();
      assert.ok(timeA <= timeB, `Data de ${result[i].title} deve ser mais antiga que ${result[i + 1].title}`);
    }
  });

  it('deve ordenar por título alfabético (A-Z)', () => {
    const result = filterAndSortWallpapers(catalog, { sortBy: 'title_asc' });
    for (let i = 0; i < result.length - 1; i++) {
      assert.ok(result[i].title.localeCompare(result[i + 1].title, 'pt-BR') <= 0);
    }
  });
});

describe('Imutabilidade e Utilitários', () => {
  it('não deve modificar o array ou objetos originais do catálogo', () => {
    const originalFirstId = catalog[0].id;
    const originalLength = catalog.length;

    filterAndSortWallpapers(catalog, { sortBy: 'title_asc', types: ['Web'] });

    assert.strictEqual(catalog.length, originalLength);
    assert.strictEqual(catalog[0].id, originalFirstId);
  });

  it('deve extrair metadados únicos ordenados', () => {
    const meta = extractFilterMetadata(catalog);
    assert.ok(meta.tags.length > 0);
    assert.ok(meta.resolutions.includes('3840x2160'));
    assert.ok(meta.types.includes('Scene'));
    assert.ok(meta.types.includes('Video'));
    assert.ok(meta.types.includes('Web'));
  });

  it('deve mapear rótulos amigáveis para resoluções conhecidas', () => {
    assert.strictEqual(getResolutionLabel('1920x1080'), '1080p (Full HD)');
    assert.strictEqual(getResolutionLabel('2560x1440'), '1440p (QHD)');
    assert.strictEqual(getResolutionLabel('3840x2160'), '4K UHD');
    assert.strictEqual(getResolutionLabel('3440x1440'), 'Ultrawide 21:9');
    assert.strictEqual(getResolutionLabel('1280x720'), '1280x720');
  });
});
