/**
 * WallpaperGallery — Configuração do Cliente Firebase (SDK Web)
 *
 * Utiliza credenciais públicas para leitura no Firestore pelo navegador.
 * A escrita é bloqueada no cliente pelas regras de segurança (firestore.rules).
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

import {
  getFirebaseConfig,
  isFirebaseConfigured,
  type FirebaseClientConfig,
} from './firebaseEnv.ts';

export {
  getFirebaseConfig,
  isFirebaseConfigured,
  type FirebaseClientConfig,
};

let firebaseAppInstance: FirebaseApp | null = null;
let firestoreDbInstance: Firestore | null = null;

/**
 * Obtém ou inicializa a instância do FirebaseApp de forma segura e preguiçosa (lazy).
 */
export function getFirebaseApp(): FirebaseApp | null {
  if (firebaseAppInstance) {
    return firebaseAppInstance;
  }

  if (!isFirebaseConfigured()) {
    return null;
  }

  const existingApps = getApps();
  if (existingApps.length > 0) {
    firebaseAppInstance = existingApps[0];
    return firebaseAppInstance;
  }

  const config = getFirebaseConfig();
  firebaseAppInstance = initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
  });

  return firebaseAppInstance;
}

/**
 * Obtém a instância do Cloud Firestore de forma segura.
 */
export function getFirestoreDb(): Firestore | null {
  if (firestoreDbInstance) {
    return firestoreDbInstance;
  }

  const app = getFirebaseApp();
  if (!app) {
    return null;
  }

  firestoreDbInstance = getFirestore(app);
  return firestoreDbInstance;
}
