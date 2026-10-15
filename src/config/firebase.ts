/**
 * WallpaperGallery — Configuração do Cliente Firebase (SDK Web)
 *
 * Utiliza credenciais públicas para leitura no Firestore pelo navegador.
 * A escrita é bloqueada no cliente pelas regras de segurança (firestore.rules).
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

export interface FirebaseClientConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

/**
 * Carrega a configuração do Firebase a partir das variáveis públicas do Vite (VITE_FIREBASE_*)
 */
export function getFirebaseConfig(): FirebaseClientConfig {
  const env: Record<string, string | undefined> =
    typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env as unknown as Record<string, string | undefined>)
      : typeof process !== 'undefined'
      ? process.env
      : {};

  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
}

/**
 * Verifica se as credenciais mínimas necessárias para conectar ao Firebase estão presentes.
 */
export function isFirebaseConfigured(): boolean {
  const config = getFirebaseConfig();
  return Boolean(
    config.apiKey &&
      config.projectId &&
      config.apiKey !== 'your_firebase_api_key' &&
      config.projectId !== 'your_project_id'
  );
}

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
