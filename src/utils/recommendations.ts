import type { WallpaperItem } from '../types/wallpaper';

export interface RecommendationScore {
  item: WallpaperItem;
  score: number;
  matchingTagsCount: number;
}

/**
 * Calcula recomendações de wallpapers de maneira determinística, pura e transparente.
 *
 * Sistema de pontuação:
 * - Tags em comum (peso primário): +10 pontos por tag coincidente.
 * - Mesmo tipo de mídia (peso secundário): +4 pontos se o tipo (Video, Scene, Web) for idêntico.
 * - Mesma resolução ou proporção (peso terciário): +2 pontos se a resolução for idêntica, ou +1 se a proporção de tela for idêntica.
 * - Desempate determinístico: popularidade existente (subscriptions + favorited + votesUp), seguido pelo título alfabético (A-Z).
 *
 * Restrições estritas:
 * - Nunca inclui o item atual.
 * - Não produz itens duplicados.
 * - Não fabrica dados fictícios.
 */
export function getRecommendedWallpapers(
  catalog: readonly WallpaperItem[],
  currentItem: WallpaperItem | null | undefined,
  limit: number = 6
): WallpaperItem[] {
  if (!currentItem || !Array.isArray(catalog) || catalog.length <= 1) {
    return [];
  }

  const currentTagsSet = new Set(
    (currentItem.tags || []).map((t: string) => t.trim().toLowerCase())
  );

  // Exclui estritamente o próprio item aberto
  const candidates = Array.from(new Map(catalog.filter((item) => item.id !== currentItem.id).map(item => [item.id, item])).values());

  const scored = candidates.map((item) => {
    let score = 0;
    let matchingTagsCount = 0;

    // 1. Tags em comum (peso primário)
    if (item.tags && item.tags.length > 0) {
      item.tags.forEach((t: string) => {
        if (currentTagsSet.has(t.trim().toLowerCase())) {
          matchingTagsCount++;
          score += 10;
        }
      });
    }

    // 2. Mesmo tipo de wallpaper (peso secundário)
    if (item.type === currentItem.type) {
      score += 4;
    }

    // 3. Mesma resolução ou proporção (peso terciário)
    if (item.resolution === currentItem.resolution) {
      score += 2;
    } else if (item.aspectRatio === currentItem.aspectRatio) {
      score += 1;
    }

    // Métrica de popularidade real para desempate suave
    const popularity =
      (item.stats?.subscriptions || 0) +
      (item.stats?.favorited || 0) +
      (item.stats?.votesUp || 0);

    return {
      item,
      score,
      matchingTagsCount,
      popularity,
    };
  });

  // Ordenação determinística decrescente
  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (b.matchingTagsCount !== a.matchingTagsCount) {
      return b.matchingTagsCount - a.matchingTagsCount;
    }
    if (b.popularity !== a.popularity) {
      return b.popularity - a.popularity;
    }
    return a.item.title.localeCompare(b.item.title, 'pt-BR');
  });

  return scored.slice(0, Math.max(0, limit)).map((entry) => entry.item);
}
