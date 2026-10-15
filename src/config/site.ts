/** Public identity shared by build-time discovery files and client metadata. */
export const SITE_URL = 'https://wewallpapers.cc';
export const SITE_NAME = 'WallpaperGallery';
export const SOCIAL_IMAGE_PATH = '/social-card.png';
export const DEFAULT_SOCIAL_IMAGE = `${SITE_URL}${SOCIAL_IMAGE_PATH}`;

export function canonicalUrl(wallpaperId?: string | null): string {
  return wallpaperId && /^[1-9]\d*$/.test(wallpaperId)
    ? `${SITE_URL}/wallpaper/${wallpaperId}`
    : `${SITE_URL}/`;
}
