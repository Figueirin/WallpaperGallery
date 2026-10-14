import type {
  WallpaperItem,
  WallpaperFilterOptions,
  FilterMetadata,
  WallpaperType,
} from '../types/wallpaper';

/**
 * Mapeamento descritivo para resoluções conhecidas do catálogo,
 * sem inferir ou inventar informações que não estejam na resolução real.
 */
export function getResolutionLabel(resolution: string): string {
  switch (resolution) {
    case '1920x1080':
      return '1080p (Full HD)';
    case '2560x1440':
      return '1440p (QHD)';
    case '3840x2160':
      return '4K UHD';
    case '3440x1440':
      return 'Ultrawide 21:9';
    default:
      return resolution;
  }
}

/**
 * Filtra e ordena uma coleção de wallpapers de forma pura e imutável.
 */
export function filterAndSortWallpapers(
  items: readonly WallpaperItem[],
  options: WallpaperFilterOptions = {}
): WallpaperItem[] {
  let result = [...items];

  // 1. Pesquisa textual (título, autor, tags e descrição)
  if (options.searchQuery && options.searchQuery.trim() !== '') {
    // Normaliza espaços excedentes e converte para minúsculas
    const normalizedQuery = options.searchQuery.trim().replace(/\s+/g, ' ').toLowerCase();
    const queryTokens = normalizedQuery.split(' ');

    result = result.filter((item) => {
      const titleLower = item.title.toLowerCase();
      const authorLower = item.author.name.toLowerCase();
      const descLower = item.description.toLowerCase();
      const tagsLower = item.tags.map((t) => t.toLowerCase());

      // Cada termo da pesquisa deve ser encontrado em pelo menos um dos campos
      return queryTokens.every((token) => {
        return (
          titleLower.includes(token) ||
          authorLower.includes(token) ||
          descLower.includes(token) ||
          tagsLower.some((t) => t.includes(token))
        );
      });
    });
  }

  // 2. Filtro por Tipo de Wallpaper (AND com as outras categorias)
  if (options.types && options.types.length > 0) {
    result = result.filter((item) => options.types!.includes(item.type));
  }

  // 3. Filtro por Resolução (AND com as outras categorias)
  if (options.resolutions && options.resolutions.length > 0) {
    result = result.filter((item) => options.resolutions!.includes(item.resolution));
  }

  // 4. Filtro por Tags (OR dentro de tags: item deve ter pelo menos uma das tags selecionadas)
  if (options.tags && options.tags.length > 0) {
    result = result.filter((item) =>
      options.tags!.some((selectedTag) => item.tags.includes(selectedTag))
    );
  }

  // 5. Filtro por Classificação Etária (se aplicável)
  if (options.ratings && options.ratings.length > 0) {
    result = result.filter((item) => options.ratings!.includes(item.rating));
  }

  // 6. Ordenação imutável
  const sortBy = options.sortBy || 'popularity_desc';
  result.sort((a, b) => {
    switch (sortBy) {
      case 'popularity_desc': {
        const popA =
          (a.stats.subscriptions ?? 0) +
          (a.stats.favorited ?? 0) +
          (a.stats.votesUp ?? 0);
        const popB =
          (b.stats.subscriptions ?? 0) +
          (b.stats.favorited ?? 0) +
          (b.stats.votesUp ?? 0);
        return popB - popA;
      }
      case 'date_desc': {
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        return timeB - timeA;
      }
      case 'date_asc': {
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        return timeA - timeB;
      }
      case 'title_asc':
        return a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' });
      default:
        return 0;
    }
  });

  return result;
}

/**
 * Extrai os metadados únicos disponíveis em uma lista de wallpapers para popular filtros.
 */
export function extractFilterMetadata(items: readonly WallpaperItem[]): FilterMetadata {
  const tagSet = new Set<string>();
  const resSet = new Set<string>();
  const typeSet = new Set<WallpaperType>();

  items.forEach((item) => {
    item.tags.forEach((t) => tagSet.add(t));
    resSet.add(item.resolution);
    typeSet.add(item.type);
  });

  return {
    tags: Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    resolutions: Array.from(resSet).sort(),
    types: Array.from(typeSet).sort(),
  };
}

/**
 * Localiza um wallpaper específico por seu ID único no catálogo.
 */
export function findWallpaperById(
  items: readonly WallpaperItem[],
  id: string
): WallpaperItem | null {
  if (!id || typeof id !== 'string') {
    return null;
  }
  return items.find((item) => item.id === id) || null;
}

