import type { WallpaperItem } from '../types/wallpaper';

export function isWallpaperItem(value: unknown): value is WallpaperItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as WallpaperItem;
  return ['videoPreviewUrl', 'youtubePreviewUrl', 'webDemoUrl'].every(key => { const v = (item as unknown as Record<string, unknown>)[key]; return v === undefined || typeof v === 'string'; })
    && typeof item.id === 'string' && /^\d+$/.test(item.id)
    && ['title', 'description', 'previewUrl', 'resolution', 'createdAt', 'updatedAt', 'steamUrl', 'steamClientUri'].every(key => typeof (item as unknown as Record<string, unknown>)[key] === 'string')
    && Boolean(item.author && typeof item.author.name === 'string')
    && Array.isArray(item.tags) && item.tags.every(tag => typeof tag === 'string')
    && ['Scene', 'Video', 'Web', 'Application'].includes(item.type)
    && ['Everyone', 'Questionable', 'Mature'].includes(item.rating)
    && ['16:9', '21:9', '16:10', '32:9', 'Other'].includes(item.aspectRatio)
    && Boolean(item.stats && typeof item.stats === 'object')
    && Object.values(item.stats).every(value => value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0));
}
