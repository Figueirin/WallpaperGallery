import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { SITE_URL } from './src/config/site';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), {
    name: 'public-seo-origin',
    transformIndexHtml: { order: 'pre', handler: html => html.replaceAll('__SITE_URL__', SITE_URL) },
  }],
});

