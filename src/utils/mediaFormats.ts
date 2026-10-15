/**
 * Utilitários para detecção, análise e suporte a múltiplos formatos de mídia
 * para wallpapers do Wallpaper Engine e Steam Workshop.
 */

import type { WallpaperItem } from '../types/wallpaper';

export type DetectedMediaFormat =
  | 'video'
  | 'youtube'
  | 'gif'
  | 'web'
  | 'scene'
  | 'image';

/**
 * Extrai o identificador único de um vídeo do YouTube a partir de diversas variações de URL.
 */
export function extractYouTubeVideoId(url?: string): string | null {
  if (!url || typeof url !== 'string') return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    let id: string | null = null;
    if (parsed.hostname === 'youtu.be') id = parsed.pathname.slice(1);
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(parsed.hostname)) {
      id = parsed.pathname === '/watch' ? parsed.searchParams.get('v') : parsed.pathname.match(/^\/(?:embed|v|shorts)\/([^/]+)$/)?.[1] ?? null;
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch { return null; }

}

/**
 * Determina se a URL ou item aponta para um GIF animado.
 */
export function isGifUrl(url?: string): boolean {
  if (!url || typeof url !== 'string') return false;
  return /\.gif(\?.*)?$/i.test(url.trim());
}

/**
 * Detecta o formato prioritário de apresentação da mídia do wallpaper.
 */
export function detectMediaFormat(wallpaper: WallpaperItem): DetectedMediaFormat {
  if (!wallpaper) return 'image';

  // 1. Se houver formato explícito
  if (wallpaper.mediaFormat) {
    return wallpaper.mediaFormat;
  }

  // 2. Se houver URL direta de vídeo (MP4 ou WebM)
  if (
    wallpaper.videoPreviewUrl &&
    /\.(mp4|webm)(\?.*)?$/i.test(wallpaper.videoPreviewUrl)
  ) {
    return 'video';
  }

  // 3. Se houver link direto ou trailer do YouTube
  if (
    wallpaper.youtubePreviewUrl &&
    extractYouTubeVideoId(wallpaper.youtubePreviewUrl)
  ) {
    return 'youtube';
  }

  // 4. Se a própria prévia for um GIF animado
  if (isGifUrl(wallpaper.previewUrl)) {
    return 'gif';
  }

  // 5. Se for uma aplicação ou wallpaper Web (HTML/WebGL)
  if (wallpaper.type === 'Web' || Boolean(wallpaper.webDemoUrl)) {
    return 'web';
  }

  // 6. Se for um cenário nativo do Wallpaper Engine (Scene 2D/3D)
  if (wallpaper.type === 'Scene') {
    return 'scene';
  }

  return 'image';
}

/**
 * Verifica se a mídia possui reprodução dinâmica/animada.
 */
export function isAnimatedMedia(wallpaper: WallpaperItem): boolean {
  if (!wallpaper) return false;
  return (
    Boolean(wallpaper.videoPreviewUrl) ||
    Boolean(wallpaper.youtubePreviewUrl) ||
    isGifUrl(wallpaper.previewUrl) ||
    wallpaper.type === 'Video' ||
    wallpaper.type === 'Web'
  );
}

export interface MediaBadgeInfo {
  label: string;
  format: DetectedMediaFormat;
  isPlayable: boolean;
  hint: string;
}

/**
 * Retorna os metadados descritivos para apresentação de badges e acessibilidade.
 */
export function getMediaBadgeInfo(wallpaper: WallpaperItem): MediaBadgeInfo {
  const format = detectMediaFormat(wallpaper);

  switch (format) {
    case 'video':
      return {
        label: 'Vídeo',
        format,
        isPlayable: true,
        hint: 'Prévia em loop de vídeo (MP4/WebM)',
      };
    case 'youtube':
      return {
        label: 'YouTube',
        format,
        isPlayable: true,
        hint: 'Trailer ou demonstração no YouTube',
      };
    case 'gif':
      return {
        label: 'GIF Animado',
        format,
        isPlayable: true,
        hint: 'Imagem animada em loop contínuo',
      };
    case 'web':
      return {
        label: 'Web / HTML5',
        format,
        isPlayable: false,
        hint: 'Aplicação interativa em HTML/CSS/WebGL',
      };
    case 'scene':
      return {
        label: 'Scene 2D/3D',
        format,
        isPlayable: false,
        hint: 'Cenário renderizado em tempo real pelo Wallpaper Engine (.pkg)',
      };
    case 'image':
    default:
      return {
        label: 'Imagem',
        format: 'image',
        isPlayable: false,
        hint: 'Imagem de alta resolução estática',
      };
  }
}
