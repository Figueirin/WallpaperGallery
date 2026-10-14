import {
  WallpaperItem,
  WallpaperFilterOptions,
  PaginatedResult,
  FilterMetadata,
  WallpaperType,
} from '../types/wallpaper';
import { IWallpaperDataProvider } from './dataProvider';

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
      console.error('Falha ao carregar mock-wallpapers.json:', err);
      return [];
    }
  }

  async getWallpapers(options: WallpaperFilterOptions = {}): Promise<PaginatedResult<WallpaperItem>> {
    const data = await this.loadData();
    let filtered = [...data];

    // Busca textual (título, descrição, autor, tags)
    if (options.searchQuery && options.searchQuery.trim() !== '') {
      const query = options.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query) ||
          item.author.name.toLowerCase().includes(query) ||
          item.tags.some((t) => t.toLowerCase().includes(query))
      );
    }

    // Filtro por tags (se alguma tag selecionada coincidir)
    if (options.tags && options.tags.length > 0) {
      filtered = filtered.filter((item) =>
        options.tags!.some((t) => item.tags.includes(t))
      );
    }

    // Filtro por resolução
    if (options.resolutions && options.resolutions.length > 0) {
      filtered = filtered.filter((item) =>
        options.resolutions!.includes(item.resolution)
      );
    }

    // Filtro por tipo (Scene, Video, Web)
    if (options.types && options.types.length > 0) {
      filtered = filtered.filter((item) => options.types!.includes(item.type));
    }

    // Filtro por classificação indicativa
    if (options.ratings && options.ratings.length > 0) {
      filtered = filtered.filter((item) => options.ratings!.includes(item.rating));
    }

    // Ordenação
    const sortBy = options.sortBy || 'popularity_desc';
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'popularity_desc': {
          const popA = (a.stats.subscriptions || 0) + (a.stats.favorited || 0);
          const popB = (b.stats.subscriptions || 0) + (b.stats.favorited || 0);
          return popB - popA;
        }
        case 'date_desc':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'date_asc':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'title_asc':
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

    // Paginação
    const page = options.page && options.page > 0 ? options.page : 1;
    const pageSize = options.pageSize && options.pageSize > 0 ? options.pageSize : 12;
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
    return data.find((item) => item.id === id) || null;
  }

  async getFilterMetadata(): Promise<FilterMetadata> {
    const data = await this.loadData();

    const tagSet = new Set<string>();
    const resSet = new Set<string>();
    const typeSet = new Set<WallpaperType>();

    data.forEach((item) => {
      item.tags.forEach((t) => tagSet.add(t));
      resSet.add(item.resolution);
      typeSet.add(item.type);
    });

    return {
      tags: Array.from(tagSet).sort(),
      resolutions: Array.from(resSet).sort(),
      types: Array.from(typeSet).sort(),
    };
  }
}

