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

export type ProviderType = 'mock' | 'firestore';

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
    console.warn(
      'VITE_DATA_PROVIDER está configurado como "firestore", mas as credenciais do Firebase não foram encontradas. Utilizando MockWallpaperProvider como fallback seguro.'
    );
  }

  // Padrão seguro: MockWallpaperProvider (que automaticamente lê catalog.json se existir)
  return new MockWallpaperProvider();
}
