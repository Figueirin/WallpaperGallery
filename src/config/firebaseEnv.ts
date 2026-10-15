/**
 * WallpaperGallery — Verificação Leve de Variáveis do Firebase
 *
 * Isola a inspeção de variáveis públicas (VITE_FIREBASE_*) para permitir
 * que o Vite faça code-splitting e NÃO empacote o SDK do Firebase
 * no bundle principal quando os provedores forem 'mock' ou 'catalog'.
 */

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
