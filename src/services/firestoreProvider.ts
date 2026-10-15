/**
 * WallpaperGallery — Provedor de Dados Cloud Firestore (Etapa 8/Firebase)
 *
 * Implementa a interface IWallpaperDataProvider para ler dados diretamente
 * do Cloud Firestore com cache em memória para economizar cotas de leitura
 * do plano Spark (limite de 50.000 leituras/dia).
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  limit as firestoreLimit,
  orderBy,
  type DocumentData,
} from 'firebase/firestore';
import type {
  WallpaperItem,
  WallpaperFilterOptions,
  PaginatedResult,
  FilterMetadata,
} from '../types/wallpaper';
import type { IWallpaperDataProvider } from './dataProvider';
import { getFirestoreDb } from '../config/firebase.ts';
import {
  filterAndSortWallpapers,
  extractFilterMetadata,
  paginateWallpapers,
} from '../utils/filterWallpapers.ts';

export class FirestoreWallpaperProvider implements IWallpaperDataProvider {
  private itemCache = new Map<string, WallpaperItem>();
  private metadataCache: FilterMetadata | null = null;
  private allLoadedItems: WallpaperItem[] = [];
  private isInitialFetchDone = false;

  /**
   * Converte documento do Firestore para o modelo de dados tipado WallpaperItem
   */
  private docToWallpaper(data: DocumentData, docId: string): WallpaperItem {
    return {
      id: docId,
      title: data.title || `Wallpaper #${docId}`,
      description: data.description || '',
      author: {
        name: data.author?.name || 'Steam Creator',
        steamId: data.author?.steamId,
        avatarUrl: data.author?.avatarUrl,
      },
      previewUrl: data.previewUrl || '',
      videoPreviewUrl: data.videoPreviewUrl,
      youtubePreviewUrl: data.youtubePreviewUrl,
      webDemoUrl: data.webDemoUrl,
      mediaFormat: data.mediaFormat,
      type: data.type || 'Scene',
      resolution: data.resolution || '1920x1080',
      aspectRatio: data.aspectRatio || '16:9',
      tags: Array.isArray(data.tags) ? data.tags : [],
      rating: data.rating || 'Everyone',
      fileSizeBytes: data.fileSizeBytes,
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString(),
      stats: {
        views: data.stats?.views,
        subscriptions: data.stats?.subscriptions,
        favorited: data.stats?.favorited,
        votesUp: data.stats?.votesUp,
      },
      steamUrl:
        data.steamUrl ||
        `https://steamcommunity.com/sharedfiles/filedetails/?id=${docId}`,
      steamClientUri:
        data.steamClientUri || `steam://url/CommunityFilePage/${docId}`,
      isSimulated: Boolean(data.isSimulated),
    };
  }

  /**
   * Carrega os papéis de parede do Firestore respeitando filtros e cache.
   * Utiliza cache para minimizar o consumo de leituras gratuitas do Spark.
   */
  async getWallpapers(
    options: WallpaperFilterOptions = {}
  ): Promise<PaginatedResult<WallpaperItem>> {
    const db = getFirestoreDb();
    if (!db) {
      console.warn('Firestore não configurado. Retornando resultado vazio.');
      return {
        items: [],
        total: 0,
        page: options.page || 1,
        pageSize: options.pageSize || 8,
        hasMore: false,
      };
    }

    try {
      // Para o teste inicial de até 200 itens, carregar em bloco e filtrar em memória
      // consome apenas 1 leitura por documento e viabiliza filtros instantâneos sem gastar novas leituras
      if (!this.isInitialFetchDone) {
        const wallpapersRef = collection(db, 'wallpapers');
        const q = query(
          wallpapersRef,
          orderBy('stats.subscriptions', 'desc'),
          firestoreLimit(300)
        );

        const snapshot = await getDocs(q);
        const loaded: WallpaperItem[] = [];

        snapshot.forEach((d) => {
          const item = this.docToWallpaper(d.data(), d.id);
          this.itemCache.set(item.id, item);
          loaded.push(item);
        });

        this.allLoadedItems = loaded;
        this.isInitialFetchDone = true;
      }

      // Aplica os filtros combinados e ordenação puros na coleção em cache
      const filtered = filterAndSortWallpapers(this.allLoadedItems, options);
      return paginateWallpapers(filtered, options.page, options.pageSize);
    } catch (err) {
      console.error('Erro ao consultar Firestore:', err);
      // Se houver falha de rede, retorna o que estiver no cache local
      const filtered = filterAndSortWallpapers(this.allLoadedItems, options);
      return paginateWallpapers(filtered, options.page, options.pageSize);
    }
  }

  /**
   * Obtém um wallpaper individual por ID (priorizando o cache em memória)
   */
  async getWallpaperById(id: string): Promise<WallpaperItem | null> {
    if (!id || typeof id !== 'string') return null;

    // 1. Tenta cache em memória primeiro (0 leituras consumidas no Firestore!)
    if (this.itemCache.has(id)) {
      return this.itemCache.get(id)!;
    }

    const db = getFirestoreDb();
    if (!db) return null;

    try {
      const docRef = doc(db, 'wallpapers', id);
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        const item = this.docToWallpaper(snap.data(), snap.id);
        this.itemCache.set(item.id, item);
        return item;
      }
      return null;
    } catch (err) {
      console.error(`Erro ao buscar wallpaper ${id} no Firestore:`, err);
      return null;
    }
  }

  /**
   * Extrai os metadados de filtros únicos a partir do catálogo carregado
   */
  async getFilterMetadata(): Promise<FilterMetadata> {
    if (this.metadataCache) {
      return this.metadataCache;
    }

    if (!this.isInitialFetchDone) {
      await this.getWallpapers({ pageSize: 1 });
    }

    this.metadataCache = extractFilterMetadata(this.allLoadedItems);
    return this.metadataCache;
  }
}
