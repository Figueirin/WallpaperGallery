/**
 * Workshop Gallery - Definições de Tipos para Wallpapers do Wallpaper Engine
 * Baseado no modelo de dados do Steam Workshop (AppID 431960).
 */

export type WallpaperType = 'Scene' | 'Video' | 'Web' | 'Application';

export type WallpaperAgeRating = 'Everyone' | 'Questionable' | 'Mature' | 'Unrated';

export type AspectRatio = '16:9' | '21:9' | '16:10' | '32:9' | 'Other';

export interface WallpaperAuthor {
  name: string;
  steamId?: string;
  avatarUrl?: string;
}

export interface WallpaperStats {
  views?: number;
  subscriptions?: number;
  favorited?: number;
  votesUp?: number;
}

export interface WallpaperItem {
  /** ID único do item no Steam Workshop (PublishedFileID) */
  id: string;
  title: string;
  description: string;
  author: WallpaperAuthor;
  /** URL pública da imagem de miniatura (CDN Akamai da Steam ou similar) */
  previewUrl: string;
  /** URL direta de vídeo opcional para preview interativo (MP4/WebM) */
  videoPreviewUrl?: string;
  /** URL opcional de trailer ou demonstração do YouTube (frequente em itens da Steam) */
  youtubePreviewUrl?: string;
  /** URL opcional de demonstração web interativa (para wallpapers do tipo Web) */
  webDemoUrl?: string;
  /** Formato explícito da mídia de preview (se determinado) */
  mediaFormat?: 'video' | 'gif' | 'web' | 'youtube' | 'image';
  type: WallpaperType;
  /** Resolução nominal, ex: "1920x1080", "2560x1440", "3840x2160", "3440x1440" */
  resolution: string;
  aspectRatio: AspectRatio;
  /** Tags temáticas (ex: "Anime", "Cyberpunk", "Nature", "Relaxing") */
  tags: string[];
  rating: WallpaperAgeRating;
  /** Tamanho do download em bytes (apenas informativo) */
  fileSizeBytes?: number;
  createdAt: string; // ISO 8601 string
  updatedAt: string; // ISO 8601 string
  stats: WallpaperStats;
  /** Link web para a página do item no Steam Community Workshop */
  steamUrl: string;
  /** URI legada do cliente Steam, preservada nos dados; não utilizada como ação na interface */
  steamClientUri: string;
  /** Flag que indica se o item provém de mock de desenvolvimento */
  isSimulated?: boolean;
}

export type SortOption =
  | 'popularity_desc'
  | 'date_desc'
  | 'date_asc'
  | 'title_asc';

export interface WallpaperFilterOptions {
  searchQuery?: string;
  tags?: string[];
  resolutions?: string[];
  types?: WallpaperType[];
  ratings?: WallpaperAgeRating[];
  sortBy?: SortOption;
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface FilterMetadata {
  tags: string[];
  resolutions: string[];
  types: WallpaperType[];
}

export const DEFAULT_PAGE_SIZE = 25;


