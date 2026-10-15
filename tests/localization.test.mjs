import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { translations, translate } from '../src/i18n/translations.ts';
import { resolveLanguage, readInitialLanguage, saveLanguage, applyDocumentLanguage, LANGUAGE_STORAGE_KEY } from '../src/i18n/language.ts';

mkdirSync('node_modules/.tmp', { recursive: true });
const directory = mkdtempSync(resolve('node_modules/.tmp/localization-'));
const outfile = join(directory, 'ui.mjs');
buildSync({ stdin: { contents: `
  export { LanguageProvider } from './src/i18n/LanguageContext.tsx';
  export { Navbar } from './src/components/Navbar.tsx';
  export { Footer } from './src/components/Footer.tsx';
  export { EmptyState } from './src/components/EmptyState.tsx';
  export { FilterBar } from './src/components/FilterBar.tsx';
  export { InfiniteScrollFooter } from './src/components/InfiniteScrollFooter.tsx';
  export { GalleryGrid } from './src/components/GalleryGrid.tsx';
  export { LoadingSkeleton } from './src/components/LoadingSkeleton.tsx';
  export { WallpaperRecommendations } from './src/components/WallpaperRecommendations.tsx';
`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', external: ['react', 'react/jsx-runtime', 'lucide-react'], outfile, logLevel: 'silent' });
const ui = await import(pathToFileURL(outfile).href);
after(() => rmSync(directory, { recursive: true, force: true }));
const render = (language, Component, props = {}) => renderToStaticMarkup(createElement(ui.LanguageProvider, { initialLanguage: language }, createElement(Component, props)));

test('idioma: preferência válida vence navegador; pt regional resolve PT-BR e demais caem em inglês', () => {
  for (const browser of ['pt', 'pt-BR', 'pt-PT', 'PT-br']) assert.equal(resolveLanguage(null, browser), 'pt-BR');
  for (const browser of [undefined, '', 'en', 'en-US', 'es', 'fr']) assert.equal(resolveLanguage(null, browser), 'en');
  assert.equal(resolveLanguage('en', 'pt-BR'), 'en');
  assert.equal(resolveLanguage('pt-BR', 'en-US'), 'pt-BR');
  assert.equal(resolveLanguage('invalid', 'pt-BR'), 'pt-BR');
  assert.equal(resolveLanguage('invalid', 'ja'), 'en');
});

test('preferência manual: persistência e leitura reais sobrevivem à próxima inicialização; storage bloqueado não impede uso', () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const store = new Map();
  const storage = { setItem: (key, value) => store.set(key, value), getItem: key => store.get(key) ?? null };
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'en-US' } });
    assert.equal(readInitialLanguage(), 'en');
    saveLanguage('pt-BR');
    assert.equal(store.get(LANGUAGE_STORAGE_KEY), 'pt-BR');
    assert.equal(readInitialLanguage(), 'pt-BR');
    saveLanguage('en');
    assert.equal(readInitialLanguage(), 'en');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { get localStorage() { throw new Error('blocked'); } } });
    assert.doesNotThrow(() => saveLanguage('pt-BR'));
    assert.equal(readInitialLanguage(), 'en');
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else delete globalThis.window;
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator); else delete globalThis.navigator;
  }
});

test('idioma do documento: HTML lang, OG locale e JSON-LD acompanham EN e PT-BR', () => {
  const locale = { content: '' }, schema = { textContent: JSON.stringify({ '@type': 'WebSite', name: 'WallpaperGallery' }) };
  const document = { documentElement: { lang: '' }, querySelector: selector => selector.includes('og:locale') ? locale : schema };
  for (const language of ['pt-BR', 'en']) {
    applyDocumentLanguage(language, document);
    assert.equal(document.documentElement.lang, language);
    assert.equal(locale.content, language === 'pt-BR' ? 'pt_BR' : 'en_US');
    const parsed = JSON.parse(schema.textContent);
    assert.equal(parsed.inLanguage, language);
    assert.equal(parsed.name, 'WallpaperGallery');
    assert.equal(parsed.description, translate(language, 'siteDescription'));
  }
});

test('dicionários: mesmas chaves e placeholders; traduções e interpolação mantêm dados externos', () => {
  assert.deepEqual(Object.keys(translations.en).sort(), Object.keys(translations['pt-BR']).sort());
  for (const key of Object.keys(translations.en)) {
    assert.ok(translations.en[key].trim()); assert.ok(translations['pt-BR'][key].trim());
    assert.deepEqual(translations.en[key].match(/\{\w+\}/g)?.sort(), translations['pt-BR'][key].match(/\{\w+\}/g)?.sort(), key);
  }
  assert.equal(translate('en', 'youMayLike'), 'You may also like');
  assert.equal(translate('pt-BR', 'youMayLike'), 'Você também pode gostar');
  assert.equal(translate('en', 'previewAlt', { title: '夜空 — Paisagem' }), 'Wallpaper preview: 夜空 — Paisagem');
});

test('interface real em EN/PT-BR: busca, seletor acessível, filtros, progresso, loading, erros e rodapé', () => {
  for (const language of ['en', 'pt-BR']) {
    const navbar = render(language, ui.Navbar, { searchQuery: '', totalCount: 979, onSearchChange() {} });
    assert.ok(navbar.includes('WallpaperGallery'));
    assert.ok(navbar.includes(translate(language, 'searchPlaceholder')));
    assert.ok(navbar.includes(`aria-label="${translate(language, 'language')}"`));
    assert.match(navbar, new RegExp(`<option(?=[^>]*value="${language}")(?=[^>]*selected="")[^>]*>`));
    assert.equal((navbar.match(/selected=""/g) ?? []).length, 1);
    const filters = render(language, ui.FilterBar, { metadata: { types: ['Scene'], tags: ['OriginalTag'], resolutions: ['1920x1080'] }, selectedType: 'ALL', selectedResolutions: [], selectedTags: [], sortBy: 'popularity_desc', hasActiveFilters: false });
    assert.ok(filters.includes(translate(language, 'filters')));
    assert.ok(filters.includes(translate(language, 'newest')));
    assert.ok(filters.includes('OriginalTag'));
    const progress = render(language, ui.InfiniteScrollFooter, { loaded: 50, total: 979, loading: false, hasMore: true, error: false, onLoadMore() {} });
    assert.ok(progress.includes(translate(language, 'loadedCount', { count: 50, total: 979 })));
    assert.ok(progress.includes(translate(language, 'loadMore')));
    assert.ok(render(language, ui.LoadingSkeleton).includes(translate(language, 'loadingGallery')));
    assert.ok(render(language, ui.EmptyState, { type: 'error' }).includes(translate(language, 'loadErrorDescription')));
    assert.ok(render(language, ui.Footer).includes(translate(language, 'footerDescription')));
  }
});

test('recomendações reais: cards idênticos ao grid principal, links nativos e metadata original em ambos os idiomas', () => {
  const wallpapers = JSON.parse(readFileSync('public/data/catalog.json', 'utf8')).slice(0, 3);
  const before = JSON.stringify(wallpapers);
  for (const language of ['en', 'pt-BR']) {
    const html = render(language, ui.WallpaperRecommendations, { wallpapers, onSelectWallpaper() {} });
    assert.ok(html.includes(translate(language, 'youMayLike')));
    assert.ok(html.includes('grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'));
    assert.ok(!html.includes('xl:grid-cols-6'));
    assert.ok(html.includes('object-cover'));
    const mainGrid = render(language, ui.GalleryGrid, { wallpapers, onSelectWallpaper() {} });
    assert.deepEqual(html.match(/<article\b[\s\S]*?<\/article>/g), mainGrid.match(/<article\b[\s\S]*?<\/article>/g));
    assert.ok(html.includes('aspect-video'));
    assert.ok(html.includes('focus-visible:ring-2'));
    assert.ok(html.includes('truncate'));
    assert.ok(!html.includes('min-h-10'));
    for (const wallpaper of wallpapers) assert.ok(html.includes(`href="/wallpaper/${wallpaper.id}"`));
    assert.equal(JSON.stringify(wallpapers), before);
  }
  assert.equal(render('en', ui.WallpaperRecommendations, { wallpapers: [] }), '');
});

test('branding e SEO: produto único, fallback inglês, Steam Workshop preservado e origem pública autorizada', () => {
  const paths = ['index.html', 'src/App.tsx', ...readdirSync('src/components').map(name => `src/components/${name}`), 'src/utils/pageMetadata.ts', 'src/i18n/translations.ts'];
  for (const path of paths) assert.ok(!readFileSync(path, 'utf8').includes('Workshop Gallery'), path);
  const html = readFileSync('index.html', 'utf8');
  for (const marker of ['lang="en"', 'content="WallpaperGallery"', '"name":"WallpaperGallery"', 'Steam Workshop', '"inLanguage":["en","pt-BR"]', 'content="en_US"']) assert.ok(html.includes(marker), marker);
  assert.ok(!html.includes('rel="canonical"'));
});


test('infinite scroll: mensagens EN/PT-BR de carregamento, fim, erro e botão acessível', () => {
  for (const language of ['en', 'pt-BR']) {
    const base = { loaded: 25, total: 979, onLoadMore() {}, error: false, loading: false, hasMore: true };
    const loading = render(language, ui.InfiniteScrollFooter, { ...base, loading: true });
    assert.ok(loading.includes(translate(language, 'loadingMore')));
    assert.ok(loading.includes('disabled=""'));
    assert.ok(loading.includes('aria-live="polite"'));
    const end = render(language, ui.InfiniteScrollFooter, { ...base, hasMore: false });
    assert.ok(end.includes(renderToStaticMarkup(createElement('p', { role: 'status', 'aria-live': 'polite' }, translate(language, 'endResults')))));
    assert.ok(!end.includes('<button'));
    const error = render(language, ui.InfiniteScrollFooter, { ...base, error: true });
    assert.ok(error.includes(translate(language, 'loadMoreError')));
    assert.ok(error.includes(translate(language, 'retry')));
    assert.ok(!error.includes('disabled=""'));
  }
});
