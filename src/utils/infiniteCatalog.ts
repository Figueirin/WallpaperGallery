import type { IWallpaperDataProvider } from '../services/dataProvider.ts';
import { DEFAULT_PAGE_SIZE, type WallpaperItem } from '../types/wallpaper.ts';
import { defaultCatalogQuery, queryKey, type CatalogQuery } from './catalogQuery.ts';

export interface InfiniteCatalogState {
  query: CatalogQuery;
  items: WallpaperItem[];
  total: number;
  catalogTotal: number | null;
  page: number;
  hasMore: boolean;
  loading: boolean;
  error: boolean;
}

/** One in-flight batch per query. Old responses may fill provider caches but cannot update this list. */
export class InfiniteCatalog {
  private state: InfiniteCatalogState;
  private generation = 0;
  private listeners = new Set<() => void>();

  private provider: Pick<IWallpaperDataProvider, 'getWallpapers'>;
  constructor(provider: Pick<IWallpaperDataProvider, 'getWallpapers'>, query = defaultCatalogQuery()) {
    this.provider = provider;
    this.state = { query, items: [], total: 0, catalogTotal: null, page: 0, hasMore: true, loading: false, error: false };
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<InfiniteCatalogState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }
  reset(query: CatalogQuery): boolean {
    if (queryKey(query) === queryKey(this.state.query)) return false;
    this.generation++;
    this.update({ query, items: [], total: 0, page: 0, hasMore: true, loading: false, error: false });
    return true;
  }
  retry = (): Promise<void> => {
    if (this.state.loading) return Promise.resolve();
    if (this.state.error) this.update({ error: false });
    return this.loadNext();
  };
  loadNext = async (): Promise<void> => {
    if (this.state.loading || !this.state.hasMore || this.state.error) return;
    const generation = this.generation;
    const { query, page } = this.state;
    this.update({ loading: true, error: false });
    try {
      const result = await this.provider.getWallpapers({
        searchQuery: query.searchQuery,
        types: query.type === 'ALL' ? undefined : [query.type],
        resolutions: query.resolutions.length ? query.resolutions : undefined,
        tags: query.tags.length ? query.tags : undefined,
        sortBy: query.sortBy,
        page: page + 1,
        pageSize: DEFAULT_PAGE_SIZE,
      });
      if (generation !== this.generation) return;
      const seen = new Set(this.state.items.map(item => item.id));
      const added = result.items.filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true; });
      const unfiltered = !query.searchQuery.trim() && query.type === 'ALL' && !query.resolutions.length && !query.tags.length;
      this.update({
        items: [...this.state.items, ...added], total: result.total, page: page + 1,
        catalogTotal: unfiltered ? result.total : this.state.catalogTotal,
        hasMore: result.hasMore && added.length > 0, loading: false, error: false,
      });
    } catch {
      if (generation === this.generation) this.update({ loading: false, error: true });
    }
  };
}
