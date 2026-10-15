import type {
  WallpaperItem,
  WallpaperFilterOptions,
  PaginatedResult,
  FilterMetadata,
} from '../types/wallpaper';
import type { IWallpaperDataProvider } from './dataProvider';
import fallbackMockData from '../../public/data/mock-wallpapers.json' with { type: 'json' };
import {
  filterAndSortWallpapers,
  extractFilterMetadata,
  findWallpaperById,
  paginateWallpapers,
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

    // 1. Tenta carregar o catálogo real sincronizado da Steam (catalog.json) se existir
    try {
      const catalogRes = await fetch('/data/catalog.json');
      if (catalogRes.ok) {
        const catalog = (await catalogRes.json()) as WallpaperItem[];
        if (Array.isArray(catalog) && catalog.length > 0) {
          this.items = catalog;
          this.isLoaded = true;
          return this.items;
        }
      }
    } catch {
      // Ignora falha de rede/arquivo e prossegue para o catálogo mock
    }

    // 2. Fallback para os dados simulados locais
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

