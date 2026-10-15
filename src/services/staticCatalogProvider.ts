/**
 * WallpaperGallery — Provedor de Dados do Catálogo JSON Estático Shardado
 *
 * Implementa IWallpaperDataProvider sobre uma arquitetura estática fragmentada:
 * - manifest.json: Metadados globais imediatos (0 ms de overhead de busca)
 * - index.json: Índice compacto carregado sob demanda apenas para busca e filtros globais
 * - pages/000001.json, ...: Shards com WallpaperItem completos carregados pontualmente
 * - Suporte transparente a catálogo único de legado (catalog.json) como fallback
 * - Validação estrita: rejeita dados simulados ou corrompidos na fonte de produção
 */

import type {
  WallpaperItem,
  WallpaperFilterOptions,
  PaginatedResult,
  FilterMetadata,
  SortOption,
} from '../types/wallpaper.ts';
import type { IWallpaperDataProvider } from './dataProvider';
import type {
  CatalogManifest,
  CompactCatalogIndexEntry,
} from '../utils/catalogSharder.ts';
import { isWallpaperItem } from '../utils/validateWallpaper.ts';
import {
  filterAndSortWallpapers,
  extractFilterMetadata,
  findWallpaperById,
  paginateWallpapers,
} from '../utils/filterWallpapers.ts';

export interface StaticCatalogProviderOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  initialManifest?: CatalogManifest;
  catalogPath?: string;
}

export class StaticCatalogProvider implements IWallpaperDataProvider {
  private baseUrl: string;
  private fetchFn: typeof fetch;
  private catalogPath: string;

  private manifest: CatalogManifest | null = null;
  private compactIndex: CompactCatalogIndexEntry[] | null = null;
  private itemCache = new Map<string, WallpaperItem>();
  private shardCache = new Map<number, WallpaperItem[]>();
  private loadedShards = new Set<number>();

  // Modo monolítico de fallback (se manifest.json não existir, mas catalog.json existir)
  private isMonolithic = false;
  private monolithicItems: WallpaperItem[] = [];

  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private indexPromise: Promise<CompactCatalogIndexEntry[]> | null = null;
  private pendingShardLoads = new Map<number, Promise<void>>();

  constructor(options: StaticCatalogProviderOptions = {}) {
    this.baseUrl = options.baseUrl ?? (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL ? import.meta.env.BASE_URL : '/');
    if (!this.baseUrl.endsWith('/')) {
      this.baseUrl += '/';
    }
    if (options.fetchImpl) {
      this.fetchFn = (input: RequestInfo | URL, init?: RequestInit) => options.fetchImpl!(input, init);
    } else {
      this.fetchFn = (input: RequestInfo | URL, init?: RequestInit) => {
        const targetContext = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : undefined);
        if (targetContext && typeof targetContext.fetch === 'function') {
          return targetContext.fetch(input, init);
        }
        return fetch(input, init);
      };
    }
    this.catalogPath = options.catalogPath ?? 'data/catalog';
    if (options.initialManifest) {
      this.manifest = options.initialManifest;
      this.isInitialized = true;
    }
  }

  /**
   * Inicializa o catálogo lendo o manifesto ou recorrendo ao catálogo monolítico
   */
  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) return;

    if (!this.initPromise) {
      this.initPromise = (async () => {
        const manifestUrl = `${this.baseUrl}${this.catalogPath}/manifest.json`;

        try {
          const res = await this.fetchFn(manifestUrl);
          if (res.ok) {
            const data: unknown = await res.json();
            if (this.isValidManifest(data)) {
              this.manifest = data;
              this.isMonolithic = false;
              this.isInitialized = true;
              return;
            }
            throw new Error('Manifesto do catálogo estático corrompido ou inválido');
          }
        } catch (err) {
          // Se falhou por erro de validação do manifesto, propaga o erro imediatamente
          if (err instanceof Error && err.message.includes('Manifesto')) {
            throw err;
          }
        }

        // Fallback: tentar ler catalog.json monolítico tradicional
        const monolithicUrl = `${this.baseUrl}data/catalog.json`;
        const monoRes = await this.fetchFn(monolithicUrl);
        if (!monoRes.ok) {
          throw new Error(
            `Catálogo estático indisponível: nenhum shard encontrado em ${manifestUrl} nem catálogo monolítico em ${monolithicUrl}. Verifique os arquivos publicados do catálogo.`
          );
        }

        const monoData: unknown = await monoRes.json();
        if (!Array.isArray(monoData) || monoData.length === 0) {
          throw new Error(
            'Catálogo estático real não inicializado: o arquivo public/data/catalog.json está vazio. Verifique os arquivos publicados do catálogo.'
          );
        }

        const hasSimulated = monoData.some((item) => !isWallpaperItem(item) || item.isSimulated);
        if (hasSimulated) {
          throw new Error(
            'Catálogo estático real não inicializado: o catálogo existente contém dados inválidos ou simulados. Publicação de conteúdo simulado não é permitida.'
          );
        }

        this.monolithicItems = monoData;
        this.isMonolithic = true;
        this.isInitialized = true;
      })().catch((error) => {
        this.initPromise = null;
        throw error;
      });
    }

    return this.initPromise;
  }

  private isValidManifest(value: unknown): value is CatalogManifest {
    if (!value || typeof value !== 'object') return false;
    const m = value as Record<string, unknown>;
    return (
      typeof m.version === 'string' &&
      typeof m.generatedAt === 'string' &&
      typeof m.totalItems === 'number' &&
      typeof m.pageSize === 'number' &&
      typeof m.totalPages === 'number' &&
      Boolean(m.metadata && typeof m.metadata === 'object') &&
      Array.isArray(m.shards) &&
      Boolean(m.itemToPage && typeof m.itemToPage === 'object')
    );
  }

  /**
   * Carrega o índice compacto sob demanda para busca textual e filtros combinados
   */
  private async loadCompactIndex(): Promise<CompactCatalogIndexEntry[]> {
    if (this.compactIndex) return this.compactIndex;

    if (!this.indexPromise) {
      this.indexPromise = (async () => {
        const indexUrl = `${this.baseUrl}${this.catalogPath}/index.json`;
        const res = await this.fetchFn(indexUrl);
        if (!res.ok) {
          throw new Error(`Índice do catálogo indisponível: HTTP ${res.status}`);
        }
        const data: unknown = await res.json();
        if (!Array.isArray(data)) {
          throw new Error('Formato inválido do índice do catálogo');
        }
        this.compactIndex = data as CompactCatalogIndexEntry[];
        return this.compactIndex;
      })().catch((err) => {
        this.indexPromise = null;
        throw err;
      });
    }

    return this.indexPromise;
  }

  /**
   * Carrega um shard de página individual de forma segura e cacheada
   */
  private async loadShard(pageNumber: number): Promise<void> {
    if (this.loadedShards.has(pageNumber)) return;

    if (!this.pendingShardLoads.has(pageNumber)) {
      const loadPromise = (async () => {
        const shardFile = `pages/${String(pageNumber).padStart(6, '0')}.json`;
        const shardUrl = `${this.baseUrl}${this.catalogPath}/${shardFile}`;
        const res = await this.fetchFn(shardUrl);
        if (!res.ok) {
          throw new Error(`Shard de página indisponível: HTTP ${res.status} em ${shardUrl}`);
        }
        const data: unknown = await res.json();
        if (!Array.isArray(data)) {
          throw new Error(`Shard ${shardFile} corrompido: esperado array`);
        }

        const items: WallpaperItem[] = [];
        for (const raw of data) {
          if (!isWallpaperItem(raw) || raw.isSimulated) {
            throw new Error(`Shard ${shardFile} contém item inválido ou simulado`);
          }
          this.itemCache.set(raw.id, raw);
          items.push(raw);
        }

        this.shardCache.set(pageNumber, items);
        this.loadedShards.add(pageNumber);
      })().finally(() => {
        this.pendingShardLoads.delete(pageNumber);
      });

      this.pendingShardLoads.set(pageNumber, loadPromise);
    }

    return this.pendingShardLoads.get(pageNumber);
  }

  async getFilterMetadata(): Promise<FilterMetadata> {
    await this.ensureInitialized();
    if (this.isMonolithic) {
      return extractFilterMetadata(this.monolithicItems);
    }
    return this.manifest!.metadata;
  }

  async getWallpapers(options: WallpaperFilterOptions = {}): Promise<PaginatedResult<WallpaperItem>> {
    await this.ensureInitialized();

    const page = options.page && options.page > 0 ? Math.floor(options.page) : 1;
    const pageSize = options.pageSize && options.pageSize > 0 ? Math.floor(options.pageSize) : 8;



    // Cenário Fallback: Catálogo Monolítico
    if (this.isMonolithic) {
      const filtered = filterAndSortWallpapers(this.monolithicItems, options);
      return paginateWallpapers(filtered, page, pageSize);
    }

    // Cenário Shardado:
    const manifest = this.manifest!;
    if (manifest.totalItems === 0) {
      return { items: [], total: 0, page, pageSize, hasMore: false };
    }

    const hasSearch = Boolean(options.searchQuery && options.searchQuery.trim() !== '');
    const hasTypes = Boolean(options.types && options.types.length > 0);
    const hasResolutions = Boolean(options.resolutions && options.resolutions.length > 0);
    const hasTags = Boolean(options.tags && options.tags.length > 0);
    const hasRatings = Boolean(options.ratings && options.ratings.length > 0);
    const isCustomSort = Boolean(options.sortBy && options.sortBy !== 'popularity_desc');

    const isFiltered = hasSearch || hasTypes || hasResolutions || hasTags || hasRatings || isCustomSort;

    // Subcenário A: Navegação padrão sem filtros (alta performance: baixa apenas o shard pontual)
    if (!isFiltered) {
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;

      if (startIndex >= manifest.totalItems) {
        return { items: [], total: manifest.totalItems, page, pageSize, hasMore: false };
      }

      const shardPageSize = manifest.pageSize;
      const startShard = Math.floor(startIndex / shardPageSize) + 1;
      const endShard = Math.floor((Math.min(endIndex, manifest.totalItems) - 1) / shardPageSize) + 1;

      // Carrega os shards necessários para cobrir os itens da página solicitada
      const shardsToLoad: Promise<void>[] = [];
      for (let s = startShard; s <= endShard; s++) {
        if (!this.loadedShards.has(s)) {
          shardsToLoad.push(this.loadShard(s));
        }
      }
      if (shardsToLoad.length > 0) {
        await Promise.all(shardsToLoad);
      }

      // Constrói a lista dos itens da página a partir dos shards carregados
      const loadedShardItems: WallpaperItem[] = [];
      for (let s = startShard; s <= endShard; s++) {
        const shardItems = this.shardCache.get(s);
        if (shardItems) {
          loadedShardItems.push(...shardItems);
        }
      }

      const baseIndex = (startShard - 1) * shardPageSize;
      const relativeStart = startIndex - baseIndex;
      const relativeEnd = endIndex - baseIndex;
      const pageItems = loadedShardItems.slice(relativeStart, relativeEnd);

      return {
        items: pageItems,
        total: manifest.totalItems,
        page,
        pageSize,
        hasMore: endIndex < manifest.totalItems,
      };
    }

    // Subcenário B: Busca, Filtros Combinados e Ordenação Customizada
    const index = await this.loadCompactIndex();

    // Aplica busca e filtros sobre o índice compacto
    let matching = index;

    if (hasSearch) {
      const normalizedQuery = options.searchQuery!.trim().replace(/\s+/g, ' ').toLowerCase();
      const queryTokens = normalizedQuery.split(' ');

      matching = matching.filter((entry) => {
        const titleLower = entry.title.toLowerCase();
        const authorLower = entry.author.toLowerCase();
        const descLower = entry.desc.toLowerCase();
        const tagsLower = entry.tags.map((t) => t.toLowerCase());

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

    if (hasTypes) {
      matching = matching.filter((e) => options.types!.includes(e.type));
    }

    if (hasResolutions) {
      matching = matching.filter((e) => options.resolutions!.includes(e.res));
    }

    if (hasTags) {
      matching = matching.filter((e) => options.tags!.some((t) => e.tags.includes(t)));
    }

    if (hasRatings) {
      matching = matching.filter((e) => options.ratings!.includes(e.rating));
    }

    // Ordenação determinística do resultado
    const sortBy: SortOption = options.sortBy || 'popularity_desc';
    matching.sort((a, b) => {
      switch (sortBy) {
        case 'popularity_desc':
          if (b.pop !== a.pop) return b.pop - a.pop;
          if (b.date !== a.date) return b.date - a.date;
          return a.id.localeCompare(b.id);
        case 'date_desc':
          if (b.date !== a.date) return b.date - a.date;
          return b.pop - a.pop;
        case 'date_asc':
          if (a.date !== b.date) return a.date - b.date;
          return b.pop - a.pop;
        case 'title_asc':
          return a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' });
        default:
          return 0;
      }
    });

    const total = matching.length;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;

    if (startIndex >= total) {
      return { items: [], total, page, pageSize, hasMore: false };
    }

    const pageSlice = matching.slice(startIndex, endIndex);

    // Identifica quais shards precisam ser carregados para materializar os itens completos
    const requiredShards = new Set<number>();
    for (const entry of pageSlice) {
      if (!this.itemCache.has(entry.id)) {
        requiredShards.add(entry.page);
      }
    }

    if (requiredShards.size > 0) {
      await Promise.all(Array.from(requiredShards).map((p) => this.loadShard(p)));
    }

    const fullItems = pageSlice.map((entry) => this.itemCache.get(entry.id)!).filter(Boolean);

    return {
      items: fullItems,
      total,
      page,
      pageSize,
      hasMore: endIndex < total,
    };
  }

  async getWallpaperById(id: string): Promise<WallpaperItem | null> {
    if (!id || typeof id !== 'string') return null;
    await this.ensureInitialized();

    if (this.itemCache.has(id)) {
      return this.itemCache.get(id)!;
    }

    if (this.isMonolithic) {
      return findWallpaperById(this.monolithicItems, id);
    }

    const manifest = this.manifest!;
    const targetShardPage = manifest.itemToPage[id];
    if (targetShardPage) {
      await this.loadShard(targetShardPage);
      return this.itemCache.get(id) || null;
    }

    return null;
  }
}
