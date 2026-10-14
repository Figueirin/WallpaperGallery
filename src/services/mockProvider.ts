import {
  WallpaperItem,
  WallpaperFilterOptions,
  PaginatedResult,
  FilterMetadata,
} from '../types/wallpaper';
import { IWallpaperDataProvider } from './dataProvider';
import fallbackMockData from '../../public/data/mock-wallpapers.json';
import {
  filterAndSortWallpapers,
  extractFilterMetadata,
  findWallpaperById,
} from '../utils/filterWallpapers';

export class MockWallpaperProvider implements IWallpaperDataProvider {
  private items: WallpaperItem[] = [];
  private isLoaded = false;

  constructor(initialData?: WallpaperItem[]) {
    if (initialData) {
      this.items = initialData;
      this.isLoaded = true;
    }
  }

  private async loadData(): Promise<WallpaperItem[]> {
    if (this.isLoaded) {
      return this.items;
    }

    try {
      const response = await fetch('/data/mock-wallpapers.json');
      if (!response.ok) {
        throw new Error(`Erro ao carregar dados simulados: HTTP ${response.status}`);
      }
      this.items = (await response.json()) as WallpaperItem[];
      this.isLoaded = true;
      return this.items;
    } catch (err) {
      console.warn('Usando catálogo simulado de fallback após falha no fetch:', err);
      this.items = fallbackMockData as unknown as WallpaperItem[];
      this.isLoaded = true;
      return this.items;
    }
  }

  async getWallpapers(options: WallpaperFilterOptions = {}): Promise<PaginatedResult<WallpaperItem>> {
    const data = await this.loadData();
    const filtered = filterAndSortWallpapers(data, options);

    // Paginação simples sem alterar catálogo original
    const page = options.page && options.page > 0 ? options.page : 1;
    const pageSize = options.pageSize && options.pageSize > 0 ? options.pageSize : 24;
    const startIndex = (page - 1) * pageSize;
    const paginatedItems = filtered.slice(startIndex, startIndex + pageSize);

    return {
      items: paginatedItems,
      total: filtered.length,
      page,
      pageSize,
      hasMore: startIndex + pageSize < filtered.length,
    };
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

