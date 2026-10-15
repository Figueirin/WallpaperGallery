/**
 * WallpaperGallery — Fábrica de Provedores de Dados (Provider Factory)
 *
 * Permite alternar entre Mock local, Catálogo JSON e Cloud Firestore
 * sem necessidade de alterar nenhum componente da interface visual.
 */

import type { IWallpaperDataProvider } from './dataProvider';
import { MockWallpaperProvider } from './mockProvider.ts';
import { FirestoreWallpaperProvider } from './firestoreProvider.ts';
import { isFirebaseConfigured } from '../config/firebase.ts';

export type ProviderType = 'mock' | 'catalog' | 'firestore';

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
      return new FirestoreWallpaperProvider();
    }
    throw new Error('Firestore solicitado sem configuração Firebase válida');
  }

  // A fonte é explícita; catálogo real nunca usa fallback de demonstração.
  if (targetType !== 'mock' && targetType !== 'catalog') throw new Error('DataProvider desconhecido');
  return new MockWallpaperProvider(undefined, targetType);
}
