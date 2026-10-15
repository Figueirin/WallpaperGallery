import { updatePageMetadata, SITE_TITLE, SITE_DESCRIPTION } from './utils/pageMetadata';
import { wallpaperIdFromLocation } from './utils/navigation';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { LanguageProvider } from './i18n/LanguageContext';

// No homepage canonical in shared HTML: set the actual route before React/data loading.
updatePageMetadata(SITE_TITLE, SITE_DESCRIPTION, { wallpaperId: wallpaperIdFromLocation(window.location.pathname, window.location.hash) });

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <LanguageProvider><App /></LanguageProvider>
    </StrictMode>
  );
}

