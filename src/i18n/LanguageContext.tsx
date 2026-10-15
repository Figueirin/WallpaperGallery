import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { applyDocumentLanguage, readInitialLanguage, saveLanguage } from './language';
import { translate, type Language, type TranslationKey, type TranslationParams } from './translations';

type LanguageState = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
};
const LanguageContext = createContext<LanguageState>({
  language: 'en', setLanguage: () => {}, t: (key, params) => translate('en', key, params),
});

export function LanguageProvider({ children, initialLanguage }: { children: ReactNode; initialLanguage?: Language }) {
  const [language, updateLanguage] = useState<Language>(() => initialLanguage ?? readInitialLanguage());
  const setLanguage = useCallback((selected: Language) => {
    saveLanguage(selected);
    updateLanguage(selected);
  }, []);
  useEffect(() => { applyDocumentLanguage(language); }, [language]);
  const value = useMemo(() => ({ language, setLanguage, t: (key: TranslationKey, params?: TranslationParams) => translate(language, key, params) }), [language, setLanguage]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
export function useLanguage() { return useContext(LanguageContext); }
