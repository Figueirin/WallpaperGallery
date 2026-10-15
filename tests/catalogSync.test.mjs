import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWallpaperType,
  normalizeResolution,
  normalizeRating,
  extractThematicTags,
  normalizeSteamWorkshopItem,
  generateMockSteamCatalog,
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

    it('deve fornecer 1920x1080 16:9 como padrão na ausência de tag', () => {
      const res = normalizeResolution(['Anime', 'Cyberpunk']);
      assert.strictEqual(res.resolution, '1920x1080');
      assert.strictEqual(res.aspectRatio, '16:9');
    });
  });

  describe('normalização de classificação indicativa (normalizeRating)', () => {
    it('deve identificar Mature e Questionable', () => {
      assert.strictEqual(normalizeRating(['Mature', 'Anime']), 'Mature');
      assert.strictEqual(normalizeRating(['Questionable']), 'Questionable');
    });

    it('deve padronizar para Everyone por padrão seguro', () => {
      assert.strictEqual(normalizeRating(['Everyone']), 'Everyone');
      assert.strictEqual(normalizeRating(['Nature']), 'Everyone');
      assert.strictEqual(normalizeRating([]), 'Everyone');
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

  describe('catálogo de demonstração (generateMockSteamCatalog)', () => {
    it('deve gerar múltiplos itens válidos para modo offline', () => {
      const catalog = generateMockSteamCatalog();
      assert.ok(catalog.length >= 3);
      catalog.forEach((item) => {
        assert.ok(item.id);
        assert.ok(item.title);
        assert.ok(item.previewUrl);
        assert.ok(item.steamUrl.startsWith('https://steamcommunity.com/sharedfiles/filedetails/?id='));
        assert.ok(item.steamClientUri.startsWith('steam://url/CommunityFilePage/'));
      });
    });
  });
});
