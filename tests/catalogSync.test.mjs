import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWallpaperType,
  normalizeResolution,
  normalizeRating,
  extractThematicTags,
  normalizeSteamWorkshopItem,
  generateMockSteamCatalog,
  mergeWallpapers,
} from '../scripts/sync-workshop.ts';

describe('Sincronização e Normalização do Steam Workshop (Catalog Sync)', () => {
  describe('normalização de tipos (normalizeWallpaperType)', () => {
    it('deve identificar tipo Video a partir das tags', () => {
      assert.strictEqual(normalizeWallpaperType(['Video', 'Nature']), 'Video');
      assert.strictEqual(normalizeWallpaperType(['video']), 'Video');
    });

    it('deve identificar tipo Web a partir das tags web ou html', () => {
      assert.strictEqual(normalizeWallpaperType(['Web', 'Interactive']), 'Web');
      assert.strictEqual(normalizeWallpaperType(['html5']), 'Web');
    });

    it('deve identificar tipo Application', () => {
      assert.strictEqual(normalizeWallpaperType(['Application']), 'Application');
    });

    it('deve adotar Scene como fallback para itens 2D/3D da Steam', () => {
      assert.strictEqual(normalizeWallpaperType(['Scene', 'Anime']), 'Scene');
      assert.strictEqual(normalizeWallpaperType(['SemTipoEspecifico']), 'Scene');
      assert.strictEqual(normalizeWallpaperType([]), 'Scene');
    });
  });

  describe('normalização de resolução e aspect ratio (normalizeResolution)', () => {
    it('deve normalizar 4K UHD com espaços e calcular proporção 16:9', () => {
      const res = normalizeResolution(['3840 x 2160', 'Scene']);
      assert.strictEqual(res.resolution, '3840x2160');
      assert.strictEqual(res.aspectRatio, '16:9');
    });

    it('deve normalizar Ultrawide 3440x1440 e calcular proporção 21:9', () => {
      const res = normalizeResolution(['Ultrawide', '3440 x 1440']);
      assert.strictEqual(res.resolution, '3440x1440');
      assert.strictEqual(res.aspectRatio, '21:9');
    });

    it('deve normalizar proporções 16:10 como 1920x1200 ou 2560x1600', () => {
      const res = normalizeResolution(['1920 x 1200']);
      assert.strictEqual(res.resolution, '1920x1200');
      assert.strictEqual(res.aspectRatio, '16:10');
    });

    it('deve normalizar proporções Super Ultrawide 32:9 como 5120x1440', () => {
      const res = normalizeResolution(['5120 x 1440']);
      assert.strictEqual(res.resolution, '5120x1440');
      assert.strictEqual(res.aspectRatio, '32:9');
    });

    it('deve preservar resolução desconhecida sem inventar metadados', () => {
      const res = normalizeResolution(['Anime', 'Cyberpunk']);
      assert.strictEqual(res.resolution, 'Não informada');
      assert.strictEqual(res.aspectRatio, 'Other');
    });
  });

  describe('normalização de classificação indicativa (normalizeRating)', () => {
    it('deve identificar Mature e Questionable', () => {
      assert.strictEqual(normalizeRating(['Mature', 'Anime']), 'Mature');
      assert.strictEqual(normalizeRating(['Questionable']), 'Questionable');
    });

    it('deve identificar Everyone explicitamente e Unrated quando não informado', () => {
      assert.strictEqual(normalizeRating(['Everyone']), 'Everyone');
      assert.strictEqual(normalizeRating(['Nature']), 'Unrated');
      assert.strictEqual(normalizeRating([]), 'Unrated');
      assert.strictEqual(normalizeRating(['Unrated']), 'Unrated');
      assert.strictEqual(normalizeRating([' Mature ']), 'Mature');
      assert.strictEqual(normalizeRating(['Everyone', 'Mature']), 'Mature');
    });
  });

  describe('extração de tags temáticas (extractThematicTags)', () => {
    it('deve remover tags estruturais de sistema e preservar tags visuais', () => {
      const input = [
        'Scene',
        '3840 x 2160',
        'Everyone',
        'Cyberpunk',
        'Rain',
        'City',
      ];
      const tags = extractThematicTags(input);
      assert.deepStrictEqual(tags, ['Cyberpunk', 'Rain', 'City']);
    });
  });

  describe('normalização de item bruto da Steam (normalizeSteamWorkshopItem)', () => {
    it('deve converter campos da API Steam para o modelo WallpaperItem', () => {
      const raw = {
        publishedfileid: '123456789',
        title: 'Cyberpunk Rain Loop',
        file_description: 'Descrição de teste',
        creator: '76561198000000099',
        preview_url: 'https://steamuserimages-a.akamaihd.net/ugc/test.jpg',
        time_created: 1720000000,
        time_updated: 1720100000,
        file_size: 52428800,
        views: 12000,
        subscriptions: 4500,
        favorited: 1100,
        vote_data: { votes_up: 980 },
        tags: [
          { tag: 'Video' },
          { tag: '1920 x 1080' },
          { tag: 'Everyone' },
          { tag: 'Cyberpunk' },
          { tag: 'Rain' },
        ],
        previews: [
          {
            youtubevideo: 'testYtId123',
          },
        ],
      };

      const item = normalizeSteamWorkshopItem(raw);

      assert.strictEqual(item.id, '123456789');
      assert.strictEqual(item.title, 'Cyberpunk Rain Loop');
      assert.strictEqual(item.type, 'Video');
      assert.strictEqual(item.resolution, '1920x1080');
      assert.strictEqual(item.aspectRatio, '16:9');
      assert.strictEqual(item.rating, 'Everyone');
      assert.deepStrictEqual(item.tags, ['Cyberpunk', 'Rain']);
      assert.strictEqual(
        item.youtubePreviewUrl,
        'https://www.youtube.com/watch?v=testYtId123'
      );
      assert.strictEqual(
        item.steamUrl,
        'https://steamcommunity.com/sharedfiles/filedetails/?id=123456789'
      );
      assert.strictEqual(
        item.steamClientUri,
        'steam://url/CommunityFilePage/123456789'
      );
      assert.strictEqual(item.stats.views, 12000);
      assert.strictEqual(item.stats.subscriptions, 4500);
      assert.strictEqual(item.stats.votesUp, 980);
      assert.ok(item.createdAt.includes('2024'));
    });
  });

  describe('fusão incremental de catálogos (mergeWallpapers)', () => {
    const baseItemA = {
      id: 'item-A',
      title: 'Wallpaper A',
      description: 'Desc A',
      author: { name: 'User A' },
      previewUrl: 'https://example.com/a.jpg',
      type: 'Scene',
      resolution: '1920x1080',
      aspectRatio: '16:9',
      tags: ['Nature'],
      rating: 'Everyone',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      stats: { views: 100, subscriptions: 50 },
      steamUrl: 'https://steamcommunity.com/sharedfiles/filedetails/?id=item-A',
      steamClientUri: 'steam://url/CommunityFilePage/item-A',
      videoPreviewUrl: '/videos/sample.mp4',
    };

    const baseItemB = {
      id: 'item-B',
      title: 'Wallpaper B',
      description: 'Desc B',
      author: { name: 'User B' },
      previewUrl: 'https://example.com/b.jpg',
      type: 'Video',
      resolution: '2560x1440',
      aspectRatio: '16:9',
      tags: ['Cyberpunk'],
      rating: 'Everyone',
      createdAt: '2025-02-01T00:00:00Z',
      updatedAt: '2025-02-01T00:00:00Z',
      stats: { views: 200, subscriptions: 80 },
      steamUrl: 'https://steamcommunity.com/sharedfiles/filedetails/?id=item-B',
      steamClientUri: 'steam://url/CommunityFilePage/item-B',
    };

    it('deve adicionar novos itens ao catálogo sem duplicar existentes', () => {
      const existing = [baseItemA];
      const incoming = [baseItemA, baseItemB];

      const result = mergeWallpapers(existing, incoming);

      assert.strictEqual(result.merged.length, 2);
      assert.strictEqual(result.added, 1);
      assert.strictEqual(result.updated, 0);
      assert.strictEqual(result.unchanged, 1);
    });

    it('deve atualizar estatísticas quando um item existente receber novos dados da Steam', () => {
      const existing = [baseItemA];
      const updatedIncomingA = {
        ...baseItemA,
        stats: { views: 350, subscriptions: 120 },
        updatedAt: '2025-03-01T00:00:00Z',
      };

      const result = mergeWallpapers(existing, [updatedIncomingA]);

      assert.strictEqual(result.merged.length, 1);
      assert.strictEqual(result.added, 0);
      assert.strictEqual(result.updated, 1);
      assert.strictEqual(result.merged[0].stats.views, 350);
      assert.strictEqual(result.merged[0].stats.subscriptions, 120);
      assert.strictEqual(result.merged[0].updatedAt, '2025-03-01T00:00:00Z');
    });

    it('deve preservar propriedades customizadas locais como videoPreviewUrl', () => {
      const existing = [baseItemA]; // Possui videoPreviewUrl: '/videos/sample.mp4'
      const steamIncomingA = {
        ...baseItemA,
        videoPreviewUrl: undefined, // Steam crua não fornece videoPreviewUrl direto
        stats: { views: 500 },
      };

      const result = mergeWallpapers(existing, [steamIncomingA]);

      assert.strictEqual(result.merged.length, 1);
      assert.strictEqual(result.merged[0].videoPreviewUrl, '/videos/sample.mp4');
      assert.strictEqual(result.merged[0].stats.views, 500);
    });

    it('deve lidar com listas vazias ou nulas com segurança', () => {
      const resultEmpty = mergeWallpapers([], [baseItemA]);
      assert.strictEqual(resultEmpty.merged.length, 1);
      assert.strictEqual(resultEmpty.added, 1);

      const resultNoIncoming = mergeWallpapers([baseItemA], []);
      assert.strictEqual(resultNoIncoming.merged.length, 1);
      assert.strictEqual(resultNoIncoming.added, 0);
    });
  });

  describe('catálogo de demonstração (generateMockSteamCatalog)', () => {
    it('deve gerar múltiplos itens válidos para modo offline', () => {
      const catalog = generateMockSteamCatalog();
      assert.ok(catalog.length >= 3);
      catalog.forEach((item) => {
        assert.ok(item.id);
        assert.ok(item.title);
        assert.ok(item.previewUrl);
        assert.ok(
          item.steamUrl.startsWith(
            'https://steamcommunity.com/sharedfiles/filedetails/?id='
          )
        );
        assert.ok(
          item.steamClientUri.startsWith('steam://url/CommunityFilePage/')
        );
      });
    });
  });
});


