import { useEffect } from 'react';
import { updatePageMetadata, type PageMetadataOptions } from './pageMetadata';
import { useLanguage } from '../i18n/LanguageContext';

export function usePageMetadata(title?: string, description?: string, options: PageMetadataOptions = {}) {
  const { language } = useLanguage();
  const { wallpaperId, image } = options;
  useEffect(() => {
    if (!title || !description) return;
    // The active view owns metadata; never restore stale route/locale on unmount.
    updatePageMetadata(title, description, { wallpaperId, image, language });
  }, [title, description, wallpaperId, image, language]);
}
