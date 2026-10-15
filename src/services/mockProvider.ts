import type {
  WallpaperItem,
  WallpaperFilterOptions,
  PaginatedResult,
  FilterMetadata,
} from '../types/wallpaper';
import { isWallpaperItem } from '../utils/validateWallpaper.ts';
import type { IWallpaperDataProvider } from './dataProvider';
import fallbackMockData from '../../public/data/mock-wallpapers.json' with { type: 'json' };
import {
  filterAndSortWallpapers,
  extractFilterMetadata,
  findWallpaperById,
  paginateWallpapers,
} from '../utils/filterWallpapers.ts';

export class MockWallpaperProvider implements IWallpaperDataProvider {
  private items: WallpaperItem[] = [];
  private isLoaded = false;
  private loading: Promise<WallpaperItem[]> | null = null;

  private source: 'mock' | 'catalog';

  constructor(initialData?: WallpaperItem[], source: 'mock' | 'catalog' = 'mock') {
    this.source = source;
    if (initialData) {
      this.items = initialData;
      this.isLoaded = true;
    }
  }

  private async loadData(): Promise<WallpaperItem[]> {
    if (this.isLoaded) {
      return this.items;
    }

    if (!this.loading) {
      this.loading = (async () => {
        if (this.source === 'mock') {
          this.items = (fallbackMockData as unknown as WallpaperItem[]).map(item => ({ ...item, isSimulated: true }));
        } else {
          const response = await fetch(`${import.meta.env?.BASE_URL ?? '/'}data/catalog.json`);
          if (!response.ok) throw new Error(`Catálogo indisponível: HTTP ${response.status}`);
          const data: unknown = await response.json();
          if (!Array.isArray(data) || data.some(item => !isWallpaperItem(item) || item.isSimulated)) throw new Error('Catálogo real inválido ou simulado');
          this.items = data;
        }
        this.isLoaded = true;
        return this.items;
      })().catch(error => { this.loading = null; throw error; });
    }
    return this.loading;
  }

  async getWallpapers(options: WallpaperFilterOptions = {}): Promise<PaginatedResult<WallpaperItem>> {
    const data = await this.loadData();
    const filtered = filterAndSortWallpapers(data, options);
    return paginateWallpapers(filtered, options.page, options.pageSize);
  }

  async getWallpaperById(id: string): Promise<WallpaperItem | null> {
    const data = await this.loadData();
    return findWallpaperById(data, id);
  }

  async getFilterMetadata(): Promise<FilterMetadata> {
    const data = await this.loadData();
    return extractFilterMetadata(data);
  }
}

