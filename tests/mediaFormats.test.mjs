import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectMediaFormat,
  extractYouTubeVideoId,
  isGifUrl,
  isAnimatedMedia,
  getMediaBadgeInfo,
} from '../src/utils/mediaFormats.ts';

describe('Detecção e Extração de Formatos de Mídia (Media Formats)', () => {
  const baseItem = {
    id: 'test-1',
    title: 'Item de Teste',
    description: 'Descrição',
    author: { name: 'Autor' },
    previewUrl: 'https://images.unsplash.com/photo-1?auto=format&fit=crop&w=1000',
    type: 'Scene',
    resolution: '1920x1080',
    aspectRatio: '16:9',
    tags: ['Nature'],
    rating: 'Everyone',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    stats: {},
    steamUrl: 'https://steamcommunity.com/sharedfiles/filedetails/?id=1',
    steamClientUri: 'steam://url/CommunityFilePage/1',
  };

  describe('extração de ID do YouTube (extractYouTubeVideoId)', () => {
    it('deve extrair ID de URLs padrão watch?v=', () => {
      assert.strictEqual(
        extractYouTubeVideoId('https://www.youtube.com/watch?v=jfKfPfyJRdk'),
        'jfKfPfyJRdk'
      );
    });

    it('deve extrair ID de URLs curtas youtu.be', () => {
      assert.strictEqual(
        extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ'),
        'dQw4w9WgXcQ'
      );
    });

    it('deve extrair ID de URLs embed', () => {
      assert.strictEqual(
        extractYouTubeVideoId('https://www.youtube.com/embed/jfKfPfyJRdk'),
        'jfKfPfyJRdk'
      );
    });

    it('deve extrair ID com parâmetros extras na query string', () => {
      assert.strictEqual(
        extractYouTubeVideoId('https://www.youtube.com/watch?feature=shared&v=jfKfPfyJRdk&t=42'),
        'jfKfPfyJRdk'
      );
    });

    it('deve retornar null para URLs inválidas ou nulas', () => {
      assert.strictEqual(extractYouTubeVideoId(''), null);
      assert.strictEqual(extractYouTubeVideoId(undefined), null);
      assert.strictEqual(extractYouTubeVideoId('https://vimeo.com/12345'), null);
      assert.strictEqual(extractYouTubeVideoId('https://google.com'), null);
    });
  });

  describe('identificação de GIFs (isGifUrl)', () => {
    it('deve identificar extensões .gif em minúsculas e maiúsculas', () => {
      assert.strictEqual(isGifUrl('https://example.com/preview.gif'), true);
      assert.strictEqual(isGifUrl('https://example.com/PREVIEW.GIF'), true);
      assert.strictEqual(isGifUrl('https://example.com/preview.gif?v=123'), true);
    });

    it('deve rejeitar outros formatos de imagem ou nulo', () => {
      assert.strictEqual(isGifUrl('https://example.com/preview.jpg'), false);
      assert.strictEqual(isGifUrl('https://example.com/preview.png'), false);
      assert.strictEqual(isGifUrl('https://example.com/preview.webp'), false);
      assert.strictEqual(isGifUrl(undefined), false);
    });
  });

  describe('detecção de formato primário (detectMediaFormat)', () => {
    it('deve detectar vídeo direto MP4 ou WebM via videoPreviewUrl', () => {
      const mp4Item = {
        ...baseItem,
        type: 'Video',
        videoPreviewUrl: '/videos/sample.mp4',
      };
      assert.strictEqual(detectMediaFormat(mp4Item), 'video');

      const webmItem = {
        ...baseItem,
        type: 'Video',
        videoPreviewUrl: '/videos/sample.webm',
      };
      assert.strictEqual(detectMediaFormat(webmItem), 'video');
    });

    it('deve priorizar formato explícito se definido', () => {
      const customItem = {
        ...baseItem,
        mediaFormat: 'youtube',
      };
      assert.strictEqual(detectMediaFormat(customItem), 'youtube');
    });

    it('deve detectar YouTube preview quando fornecido youtubePreviewUrl', () => {
      const ytItem = {
        ...baseItem,
        youtubePreviewUrl: 'https://youtu.be/dQw4w9WgXcQ',
      };
      assert.strictEqual(detectMediaFormat(ytItem), 'youtube');
    });

    it('deve detectar GIF quando previewUrl for um arquivo .gif', () => {
      const gifItem = {
        ...baseItem,
        previewUrl: 'https://steamuserimages-a.akamaihd.net/ugc/sample.gif',
      };
      assert.strictEqual(detectMediaFormat(gifItem), 'gif');
    });

    it('deve detectar Web quando tipo for Web ou possuir webDemoUrl', () => {
      const webItem = {
        ...baseItem,
        type: 'Web',
      };
      assert.strictEqual(detectMediaFormat(webItem), 'web');

      const webDemoItem = {
        ...baseItem,
        webDemoUrl: 'https://demo.codepen.io/test',
      };
      assert.strictEqual(detectMediaFormat(webDemoItem), 'web');
    });

    it('deve classificar como Scene se for do tipo Scene nativo', () => {
      const sceneItem = {
        ...baseItem,
        type: 'Scene',
      };
      assert.strictEqual(detectMediaFormat(sceneItem), 'scene');
    });
  });

  describe('verificação de mídia animada (isAnimatedMedia)', () => {
    it('deve reconhecer itens animados por vídeo, GIF ou web', () => {
      assert.strictEqual(
        isAnimatedMedia({ ...baseItem, videoPreviewUrl: '/videos/sample.mp4' }),
        true
      );
      assert.strictEqual(
        isAnimatedMedia({ ...baseItem, previewUrl: 'https://example.com/test.gif' }),
        true
      );
      assert.strictEqual(
        isAnimatedMedia({ ...baseItem, type: 'Video' }),
        true
      );
      assert.strictEqual(
        isAnimatedMedia({ ...baseItem, type: 'Web' }),
        true
      );
    });

    it('deve retornar falso para itens estáticos', () => {
      const staticItem = {
        ...baseItem,
        type: 'Scene',
        previewUrl: 'https://images.unsplash.com/test.jpg',
      };
      assert.strictEqual(isAnimatedMedia(staticItem), false);
    });
  });

  describe('metadados de badges (getMediaBadgeInfo)', () => {
    it('deve retornar labels e hints descritivos para cada formato', () => {
      const videoBadge = getMediaBadgeInfo({
        ...baseItem,
        videoPreviewUrl: '/videos/sample.mp4',
      });
      assert.strictEqual(videoBadge.label, 'Vídeo');
      assert.strictEqual(videoBadge.isPlayable, true);

      const ytBadge = getMediaBadgeInfo({
        ...baseItem,
        youtubePreviewUrl: 'https://youtu.be/dQw4w9WgXcQ',
      });
      assert.strictEqual(ytBadge.label, 'YouTube');
      assert.strictEqual(ytBadge.isPlayable, true);

      const sceneBadge = getMediaBadgeInfo(baseItem);
      assert.strictEqual(sceneBadge.label, 'Scene 2D/3D');
      assert.strictEqual(sceneBadge.isPlayable, false);
    });
  });
});

