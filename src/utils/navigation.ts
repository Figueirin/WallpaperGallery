/** Rotas atuais, sem depender de instalação do Steam ou de um domínio publicado. */
export function wallpaperIdFromLocation(pathname: string, hash: string): string | null {
  const match = pathname.match(/^\/wallpaper\/([^/]+)\/?$/) ?? hash.match(/^#\/wallpaper\/([^/]+)\/?$/);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); } catch { return null; }
}

export function pageFromSearch(search: string): number {
  const page = parseInt(new URLSearchParams(search).get('page') || '1', 10);
  return Number.isFinite(page) && page >= 1 ? page : 1;
}

export function galleryUrl(href: string, page: number, wallpaperId: string | null): string {
  const url = new URL(href);
  url.pathname = wallpaperId ? `/wallpaper/${encodeURIComponent(wallpaperId)}` : '/';
  url.hash = '';
  if (page > 1) url.searchParams.set('page', String(page)); else url.searchParams.delete('page');
  return url.toString();
}
