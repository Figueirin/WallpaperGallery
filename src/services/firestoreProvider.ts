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
  type DocumentData,
} from 'firebase/firestore';
import type {
  WallpaperItem,
  WallpaperFilterOptions,
  PaginatedResult,
  FilterMetadata,
} from '../types/wallpaper';
import type { IWallpaperDataProvider } from './dataProvider';
import { isWallpaperItem } from '../utils/validateWallpaper.ts';
import { getFirestoreDb } from '../config/firebase.ts';
import {
  filterAndSortWallpapers,
  extractFilterMetadata,
  paginateWallpapers,
} from '../utils/filterWallpapers.ts';

export class FirestoreWallpaperProvider implements IWallpaperDataProvider {
  private dependencies: { getDb: typeof getFirestoreDb; getDocs: typeof getDocs; getDoc: typeof getDoc };

  constructor(dependencies: Partial<{ getDb: typeof getFirestoreDb; getDocs: typeof getDocs; getDoc: typeof getDoc }> = {}) {
    this.dependencies = { getDb: getFirestoreDb, getDocs, getDoc, ...dependencies };
  }

  private itemCache = new Map<string, WallpaperItem>();
  private metadataCache: FilterMetadata | null = null;
  private allLoadedItems: WallpaperItem[] = [];
  private isInitialFetchDone = false;
  private initialFetch: Promise<void> | null = null;

  /**
   * Converte documento do Firestore para o modelo de dados tipado WallpaperItem
   */
  private docToWallpaper(data: DocumentData, docId: string): WallpaperItem {
    const item = { ...data, id: docId };
    if (!isWallpaperItem(item) || item.isSimulated) throw new Error(`Documento de wallpaper inválido: ${docId}`);
    return item;
  }

  /**
   * Carrega os papéis de parede do Firestore respeitando filtros e cache.
   * Utiliza cache para minimizar o consumo de leituras gratuitas do Spark.
   */
  async getWallpapers(
    options: WallpaperFilterOptions = {}
  ): Promise<PaginatedResult<WallpaperItem>> {
    const db = this.dependencies.getDb();
    if (!db) throw new Error('Firestore não configurado');

    try {
      // Para o teste inicial de até 200 itens, carregar em bloco e filtrar em memória
      // consome apenas 1 leitura por documento e viabiliza filtros instantâneos sem gastar novas leituras
      if (!this.isInitialFetchDone) {
        if (!this.initialFetch) this.initialFetch = (async () => {
          const wallpapersRef = collection(db, 'wallpapers');
          const q = query(
            wallpapersRef,
            firestoreLimit(301)
          );

          const snapshot = await this.dependencies.getDocs(q);
          if (snapshot.size > 300) throw new Error('Catálogo excede 300 itens; paginação remota necessária');
          const loaded: WallpaperItem[] = [];

          snapshot.forEach((d) => {
            const item = this.docToWallpaper(d.data(), d.id);
            loaded.push(item);
          });

          loaded.forEach(item => this.itemCache.set(item.id, item));
          this.allLoadedItems = loaded;
          this.isInitialFetchDone = true;
        })().catch(error => { this.initialFetch = null; throw error; });
        await this.initialFetch;
      }

      // Aplica os filtros combinados e ordenação puros na coleção em cache
      const filtered = filterAndSortWallpapers(this.allLoadedItems, options);
      return paginateWallpapers(filtered, options.page, options.pageSize);
    } catch (err) {
      console.error('Erro ao consultar Firestore:', err);
      throw err;
    }
  }

  /**
   * Obtém um wallpaper individual por ID (priorizando o cache em memória)
   */
  async getWallpaperById(id: string): Promise<WallpaperItem | null> {
    if (!id || typeof id !== 'string' || !/^\d+$/.test(id)) return null;

    // 1. Tenta cache em memória primeiro (0 leituras consumidas no Firestore!)
    if (this.itemCache.has(id)) {
      return this.itemCache.get(id)!;
    }

    const db = this.dependencies.getDb();
    if (!db) return null;

    try {
      const docRef = doc(db, 'wallpapers', id);
      const snap = await this.dependencies.getDoc(docRef);

      if (snap.exists()) {
        const item = this.docToWallpaper(snap.data(), snap.id);
        this.itemCache.set(item.id, item);
        return item;
      }
      return null;
    } catch (err) {
      console.error(`Erro ao buscar wallpaper ${id} no Firestore:`, err);
      throw err;
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
