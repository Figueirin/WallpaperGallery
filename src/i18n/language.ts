import { translate, type Language } from './translations.ts';

export const LANGUAGE_STORAGE_KEY = 'wallpapergallery.language';
export function resolveLanguage(saved?: string | null, browserLanguage?: string): Language {
  if (saved === 'en' || saved === 'pt-BR') return saved;
  return /^pt(?:-|$)/i.test(browserLanguage ?? '') ? 'pt-BR' : 'en';
}

export function readInitialLanguage(): Language {
  let saved: string | null = null;
  try { saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY); } catch { /* Storage can be blocked. */ }
  return resolveLanguage(saved, typeof navigator === 'undefined' ? undefined : navigator.language);
}

export function saveLanguage(language: Language, storage?: Pick<Storage, 'setItem'>): void {
  try { (storage ?? window.localStorage).setItem(LANGUAGE_STORAGE_KEY, language); } catch { /* Switching remains available without storage. */ }
}

export function applyDocumentLanguage(language: Language, doc: Document = document): void {
  doc.documentElement.lang = language;
  const locale = doc.querySelector<HTMLMetaElement>('meta[property="og:locale"]');
  if (locale) locale.content = language === 'pt-BR' ? 'pt_BR' : 'en_US';
  const schema = doc.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
  if (schema) {
    try {
      const value = JSON.parse(schema.textContent ?? '{}');
      if (value['@type'] !== 'WebSite') return;
      value.inLanguage = language;
      value.description = translate(language, 'siteDescription');
      schema.textContent = JSON.stringify(value);
    } catch { /* Do not replace malformed or unrelated structured data. */ }
  }
}
