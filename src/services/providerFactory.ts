/**
 * WallpaperGallery — Fábrica de Provedores de Dados (Provider Factory)
 *
 * Permite alternar entre Mock local, Catálogo JSON Shardado e Cloud Firestore
 * sem necessidade de alterar nenhum componente da interface visual.
 *
 * Otimização de Performance e Bundle:
 * - O FirestoreWallpaperProvider é carregado sob demanda (lazy dynamic import)
 *   somente quando VITE_DATA_PROVIDER=firestore estiver ativo e configurado.
 * - Evita que os SDKs pesados do Firebase (@firebase/firestore e @firebase/app)
 *   sejam empacotados no bundle JavaScript principal para usuários do catálogo estático.
 */

import type { IWallpaperDataProvider } from './dataProvider';
import { MockWallpaperProvider } from './mockProvider.ts';
import { StaticCatalogProvider } from './staticCatalogProvider.ts';
import { isFirebaseConfigured } from '../config/firebaseEnv.ts';
import type {
  WallpaperItem,
  WallpaperFilterOptions,
  PaginatedResult,
  FilterMetadata,
} from '../types/wallpaper';

export type ProviderType = 'mock' | 'catalog' | 'firestore';

/**
 * Proxy preguiçoso para o FirestoreWallpaperProvider.
 * Carrega dinamicamente o módulo somente na primeira invocação de método.
 */
export class LazyFirestoreWallpaperProvider implements IWallpaperDataProvider {
  private delegatePromise: Promise<IWallpaperDataProvider> | null = null;
  private dependencies?: Record<string, unknown>;

  constructor(dependencies?: Record<string, unknown>) {
    this.dependencies = dependencies;
  }

  private async getDelegate(): Promise<IWallpaperDataProvider> {
    if (!this.delegatePromise) {
      this.delegatePromise = (async () => {
        const { FirestoreWallpaperProvider } = await import('./firestoreProvider.ts');
        return new FirestoreWallpaperProvider(this.dependencies);
      })();
    }
    return this.delegatePromise;
  }

  async getWallpapers(options: WallpaperFilterOptions = {}): Promise<PaginatedResult<WallpaperItem>> {
    const delegate = await this.getDelegate();
    return delegate.getWallpapers(options);
  }

  async getWallpaperById(id: string): Promise<WallpaperItem | null> {
    const delegate = await this.getDelegate();
    return delegate.getWallpaperById(id);
  }

  async getFilterMetadata(): Promise<FilterMetadata> {
    const delegate = await this.getDelegate();
    return delegate.getFilterMetadata();
  }
}

/**
 * Cria a instância adequada de IWallpaperDataProvider baseada na configuração atual do ambiente.
 */
export function createWallpaperProvider(preferredType?: ProviderType): IWallpaperDataProvider {
  const envType = (
    typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env.VITE_DATA_PROVIDER
      : typeof process !== 'undefined'
      ? process.env?.VITE_DATA_PROVIDER
      : undefined
  ) as ProviderType | undefined;

  const targetType = preferredType || envType || 'mock';

  if (targetType === 'firestore') {
    if (isFirebaseConfigured()) {
      return new LazyFirestoreWallpaperProvider();
    }
    throw new Error('Firestore solicitado sem configuração Firebase válida');
  }

  if (targetType === 'catalog') {
    return new StaticCatalogProvider();
  }

  if (targetType === 'mock') {
    return new MockWallpaperProvider();
  }

  throw new Error('DataProvider desconhecido');
}
