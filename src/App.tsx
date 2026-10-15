import { useLanguage } from './i18n/LanguageContext';
import { wallpaperIdFromLocation } from './utils/navigation';
import { catalogQueryFromSearch, catalogUrl, defaultCatalogQuery, type CatalogQuery } from './utils/catalogQuery';
import { InfiniteCatalog } from './utils/infiniteCatalog';
import { usePageMetadata } from './utils/usePageMetadata';
import { useEffect, useState, useCallback, useRef, useSyncExternalStore } from 'react';
import { createWallpaperProvider } from './services/providerFactory';
import { type WallpaperItem, type FilterMetadata, type WallpaperType, type SortOption, DEFAULT_PAGE_SIZE } from './types/wallpaper';
import { Navbar } from './components/Navbar';
import { FilterBar } from './components/FilterBar';
import { GalleryGrid } from './components/GalleryGrid';
import { WallpaperDetailView } from './components/WallpaperDetailView';
import { LoadingSkeleton } from './components/LoadingSkeleton';
import { EmptyState } from './components/EmptyState';
import { Footer } from './components/Footer';
import { InfiniteScrollFooter } from './components/InfiniteScrollFooter';
import { Info, X, ArrowUp } from 'lucide-react';
import { getResolutionLabel } from './utils/filterWallpapers';

let provider: ReturnType<typeof createWallpaperProvider>;
try { provider = createWallpaperProvider(); } catch (error) {
  const unavailable = async (): Promise<never> => { throw error; };
  provider = { getWallpapers: unavailable, getWallpaperById: unavailable, getFilterMetadata: unavailable };
}
const PAGE_SIZE = DEFAULT_PAGE_SIZE;
const readQuery = () => typeof window === 'undefined' ? defaultCatalogQuery() : catalogQueryFromSearch(window.location.search);
const readId = () => typeof window === 'undefined' ? null : wallpaperIdFromLocation(window.location.pathname, window.location.hash);

function syncUrl(query: CatalogQuery, wallpaperId: string | null, scroll: number, replace = false) {
  const url = catalogUrl(window.location.href, query, wallpaperId);
  const state = { ...window.history.state, galleryScroll: scroll };
  if (replace) window.history.replaceState(state, '', url);
  else window.history.pushState(state, '', url);
}

export function App() {
  const { t } = useLanguage();
  const [catalog] = useState(() => new InfiniteCatalog(provider, readQuery()));
  const state = useSyncExternalStore(catalog.subscribe, catalog.getSnapshot, catalog.getSnapshot);
  const { query, items: wallpapers, total: totalFilteredCount } = state;
  const { searchQuery, type: selectedType, resolutions: selectedResolutions, tags: selectedTags, sortBy } = query;
  const totalCatalogCount = state.catalogTotal ?? totalFilteredCount;
  const initialLoading = state.page === 0 && !state.error;
  const isLoading = state.loading || initialLoading;
  const hasError = state.error && wallpapers.length === 0;
  const [selectedWallpaperId, setSelectedWallpaperId] = useState<string | null>(readId);
  const [metadata, setMetadata] = useState<FilterMetadata | null>(null);
  const galleryScroll = useRef(0);
  usePageMetadata(selectedWallpaperId ? undefined : t('siteTitle'), t('siteDescription'));

  useEffect(() => {
    const handleLocationChange = () => {
      const changed = catalog.reset(readQuery());
      galleryScroll.current = changed ? 0 : (window.history.state?.galleryScroll ?? galleryScroll.current);
      setSelectedWallpaperId(readId());
    };
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    syncUrl(catalog.getSnapshot().query, readId(), 0, true); // Strip legacy page= without loading preceding batches.
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.history.scrollRestoration = previous;
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, [catalog]);

  useEffect(() => {
    let active = true;
    provider.getFilterMetadata().then(meta => { if (active) setMetadata(meta); }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (selectedWallpaperId || catalog.getSnapshot().page > 0) return;
    const timer = setTimeout(() => { void catalog.loadNext(); }, 120);
    return () => clearTimeout(timer);
  }, [catalog, query, selectedWallpaperId]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => window.scrollTo({ top: selectedWallpaperId ? 0 : galleryScroll.current, behavior: 'auto' }));
    return () => window.cancelAnimationFrame(frame);
  }, [selectedWallpaperId, query]);

  const changeQuery = (next: CatalogQuery, replace = false) => {
    galleryScroll.current = 0;
    catalog.reset(next); // Invalidates old requests synchronously, before the next render/debounce.
    syncUrl(next, null, 0, replace && !selectedWallpaperId);
    setSelectedWallpaperId(null);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };
  const handleToggleResolution = (res: string) => changeQuery({ ...query, resolutions: selectedResolutions.includes(res) ? selectedResolutions.filter(value => value !== res) : [...selectedResolutions, res] });
  const handleToggleTag = (tag: string) => changeQuery({ ...query, tags: selectedTags.includes(tag) ? selectedTags.filter(value => value !== tag) : [...selectedTags, tag] });
  const handleSelectType = (type: WallpaperType | 'ALL') => changeQuery({ ...query, type });
  const handleSortChange = (sortBy: SortOption) => changeQuery({ ...query, sortBy });
  const handleResetFilters = () => changeQuery({ ...query, type: 'ALL', resolutions: [], tags: [] });
  const handleResetAll = () => changeQuery(defaultCatalogQuery());
  const handleSearchChange = (searchQuery: string) => changeQuery({ ...query, searchQuery }, true);

  const handleSelectWallpaper = useCallback((item: WallpaperItem) => {
    if (!selectedWallpaperId) {
      galleryScroll.current = window.scrollY;
      syncUrl(catalog.getSnapshot().query, null, galleryScroll.current, true);
    }
    syncUrl(catalog.getSnapshot().query, item.id, galleryScroll.current);
    setSelectedWallpaperId(item.id);
  }, [catalog, selectedWallpaperId]);
  const handleBackToGallery = () => {
    syncUrl(query, null, galleryScroll.current);
    setSelectedWallpaperId(null);
  };

  const hasActiveFilters =
    selectedType !== 'ALL' ||
    selectedResolutions.length > 0 ||
    selectedTags.length > 0;

  const hasActiveSearchOrFilters = hasActiveFilters || searchQuery.trim() !== '';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col antialiased selection:bg-indigo-500 selection:text-white">
      {/* Barra Superior com Identidade e Pesquisa Global */}
      <Navbar
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        totalCount={totalCatalogCount}
        onNavigateHome={selectedWallpaperId ? handleBackToGallery : undefined}
        isLoading={isLoading}
      />

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-[2400px] w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 py-6 sm:py-8">
        {selectedWallpaperId ? (
          <WallpaperDetailView
            key={selectedWallpaperId}
            wallpaperId={selectedWallpaperId}
            provider={provider}
            onBack={handleBackToGallery}
            onSelectWallpaper={handleSelectWallpaper}
          />
        ) : (
          <>
            <h1 className="sr-only">{t('siteHeading')}</h1>
            <h2 className="sr-only">{t('catalogHeading')}</h2>
            {/* Banner Informativo de Ambiente e Compatibilidade */}
            <section
              aria-label={t('catalogInfo')}
              className="mb-6 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-zinc-400"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
                  <Info className="w-4 h-4" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-medium text-zinc-300">
                    {t('catalogSteam')}
                  </p>
                  <p className="text-zinc-500 text-[11px]">
                    {t('compatibility')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 text-[11px]">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/80 border border-zinc-700/60 text-zinc-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {state.catalogTotal === null
                    ? t('loadedCount', { count: wallpapers.length, total: totalFilteredCount })
                    : totalFilteredCount < totalCatalogCount
                    ? t('filteredCount', { shown: wallpapers.length, filtered: totalFilteredCount, total: totalCatalogCount })
                    : t('catalogCount', { count: totalCatalogCount })}
                </span>
              </div>
            </section>

            {/* Barra de Filtros e Ordenação */}
            {metadata && (
              <FilterBar
                metadata={metadata}
                selectedType={selectedType}
                onSelectType={handleSelectType}
                selectedResolutions={selectedResolutions}
                onToggleResolution={handleToggleResolution}
                selectedTags={selectedTags}
                onToggleTag={handleToggleTag}
                sortBy={sortBy}
                onSortChange={handleSortChange}
                onResetFilters={handleResetFilters}
                hasActiveFilters={hasActiveFilters}
              />
            )}

            {/* Linha de Indicadores de Filtros Ativos e Contagem */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-zinc-200">
                  {totalFilteredCount}{' '}
                  {totalFilteredCount === 1 ? t('foundOne') : t('foundMany')}
                  {totalFilteredCount > wallpapers.length && (
                    <span className="text-xs font-normal text-zinc-400 ml-1.5">
                      {t('loadedCount', { count: wallpapers.length, total: totalFilteredCount })}
                    </span>
                  )}
                </span>

                {/* Chips de Filtros Ativos para remoção rápida */}
                {selectedType !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700">
                    {t('type')} {t(`type${selectedType}`)}
                    <button
                      type="button"
                      onClick={() => handleSelectType('ALL')}
                      aria-label={t('removeType')}
                      className="hover:text-zinc-100"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {selectedResolutions.map((res) => (
                  <span
                    key={`active-res-${res}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700"
                  >
                    {getResolutionLabel(res)}
                    <button
                      type="button"
                      onClick={() => handleToggleResolution(res)}
                      aria-label={t('removeResolution', { resolution: res })}
                      className="hover:text-zinc-100"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}

                {selectedTags.map((tag) => (
                  <span
                    key={`active-tag-${tag}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700"
                  >
                    {t('tagPrefix')} {tag}
                    <button
                      type="button"
                      onClick={() => handleToggleTag(tag)}
                      aria-label={t('removeTag', { tag })}
                      className="hover:text-zinc-100"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}

                {searchQuery.trim() !== '' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                    {t('searchChip', { query: searchQuery })}
                    <button
                      type="button"
                      onClick={() => handleSearchChange('')}
                      aria-label={t('clearSearchTerm')}
                      className="hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
              </div>

              {hasActiveSearchOrFilters && (
                <button
                  type="button"
                  onClick={handleResetAll}
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-medium cursor-pointer"
                >
                  {t('clearAll')}
                </button>
              )}
            </div>

            {/* Área de Exibição da Galeria / Skeleton / Erro */}
            {isLoading && wallpapers.length === 0 ? (
              <LoadingSkeleton count={PAGE_SIZE} />
            ) : hasError ? (
              <EmptyState
                type="error"
                title={t('catalogError')}
                description={t('loadErrorDescription')}
                onReset={catalog.retry}
                resetLabel={t('retry')}
              />
            ) : (
              <div>
                <GalleryGrid
                  wallpapers={wallpapers}
                  onResetSearch={handleResetAll}
                  searchQuery={searchQuery}
                  onSelectWallpaper={handleSelectWallpaper}
                />

                {wallpapers.length > 0 && (
                  <InfiniteScrollFooter
                    loading={state.loading}
                    hasMore={state.hasMore}
                    error={state.error}
                    loaded={wallpapers.length}
                    total={totalFilteredCount}
                    onLoadMore={catalog.retry}
                    onAutoLoad={catalog.loadNext}
                  />
                )}

                {/* Botão de retorno ao topo */}
                {wallpapers.length > 0 && (
                  <div className="mt-8 pt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                      className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors inline-flex items-center gap-1 cursor-pointer font-medium"
                    >
                      <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{t('backTop')}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Rodapé */}
      <Footer />
    </div>
  );
}

export default App;
