/**
 * Interface abstrata do provedor de dados de wallpapers.
 * Permite chavear de forma transparente entre:
 * - MockDataProvider (desenvolvimento e testes offline)
 * - StaticDataProvider (catálogo JSON gerado periodicamente)
 * - ApiProxyDataProvider (caso implementado proxy serverless no futuro)
 */

import {
  WallpaperItem,
  WallpaperFilterOptions,
  PaginatedResult,
  FilterMetadata,
} from '../types/wallpaper';

export interface IWallpaperDataProvider {
  /**
   * Consulta a lista de wallpapers aplicando filtros, busca e paginação.
   */
  getWallpapers(options?: WallpaperFilterOptions): Promise<PaginatedResult<WallpaperItem>>;

  /**
   * Busca um wallpaper por ID do Steam Workshop.
   */
  getWallpaperById(id: string): Promise<WallpaperItem | null>;

  /**
   * Retorna os metadados disponíveis (tags existentes, resoluções, categorias).
   */
  getFilterMetadata(): Promise<FilterMetadata>;
}

