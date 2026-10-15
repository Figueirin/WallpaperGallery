import type { WallpaperAuthor } from '../types/wallpaper';

/** Nome público disponível, sem apresentar placeholders ou SteamID como nome. */
export function getAuthorDisplayName(author?: WallpaperAuthor): string | null {
  const name = author?.name?.trim();
  if (!name || name === author?.steamId || /^\d{17}$/.test(name)
    || /^SteamUser\s*\(\d+\)$/i.test(name) || /^Steam Creator$/i.test(name)) return null;
  return name;
}
