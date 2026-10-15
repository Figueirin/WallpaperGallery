import type { SortOption, WallpaperType } from '../types/wallpaper.ts';

export interface CatalogQuery {
  searchQuery: string;
  type: WallpaperType | 'ALL';
  resolutions: string[];
  tags: string[];
  sortBy: SortOption;
}
export const defaultCatalogQuery = (): CatalogQuery => ({ searchQuery: '', type: 'ALL', resolutions: [], tags: [], sortBy: 'popularity_desc' });
export const queryKey = (query: CatalogQuery) => JSON.stringify(query);

export function catalogQueryFromSearch(search: string): CatalogQuery {
  const params = new URLSearchParams(search);
  const type = params.get('type') ?? 'ALL';
  const sort = params.get('sort') ?? 'popularity_desc';
  return {
    searchQuery: params.get('q') ?? '',
    type: ['Scene', 'Video', 'Web', 'Application'].includes(type) ? type as WallpaperType : 'ALL',
    resolutions: [...new Set(params.getAll('resolution').filter(Boolean))],
    tags: [...new Set(params.getAll('tag').filter(Boolean))],
    sortBy: ['popularity_desc', 'date_desc', 'date_asc', 'title_asc'].includes(sort) ? sort as SortOption : 'popularity_desc',
  };
}

export function catalogUrl(href: string, query: CatalogQuery, wallpaperId: string | null): string {
  const url = new URL(href);
  url.pathname = wallpaperId ? `/wallpaper/${encodeURIComponent(wallpaperId)}` : '/';
  url.hash = '';
  for (const key of ['page', 'q', 'type', 'resolution', 'tag', 'sort']) url.searchParams.delete(key);
  if (query.searchQuery) url.searchParams.set('q', query.searchQuery);
  if (query.type !== 'ALL') url.searchParams.set('type', query.type);
  query.resolutions.forEach(value => url.searchParams.append('resolution', value));
  query.tags.forEach(value => url.searchParams.append('tag', value));
  if (query.sortBy !== 'popularity_desc') url.searchParams.set('sort', query.sortBy);
  return url.toString();
}
