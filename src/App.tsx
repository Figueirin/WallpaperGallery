import { useEffect, useState, useCallback, useRef } from 'react';
import { createWallpaperProvider } from './services/providerFactory';
import {
  WallpaperItem,
  FilterMetadata,
  WallpaperType,
  SortOption,
} from './types/wallpaper';
import { Navbar } from './components/Navbar';
import { FilterBar } from './components/FilterBar';
import { GalleryGrid } from './components/GalleryGrid';
import { WallpaperDetailView } from './components/WallpaperDetailView';
import { LoadingSkeleton } from './components/LoadingSkeleton';
import { EmptyState } from './components/EmptyState';
import { Footer } from './components/Footer';
import {
  Info,
  X,
  Loader2,
  ChevronDown,
  ArrowUp,
  RefreshCw,
} from 'lucide-react';
import { getResolutionLabel } from './utils/filterWallpapers';

const provider = createWallpaperProvider();
const PAGE_SIZE = 8;

function parseWallpaperIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const pathMatch = window.location.pathname.match(/^\/wallpaper\/([^/]+)\/?$/);
  if (pathMatch) return decodeURIComponent(pathMatch[1]);
  const hashMatch = window.location.hash.match(/^#\/wallpaper\/([^/]+)\/?$/);
  if (hashMatch) return decodeURIComponent(hashMatch[1]);
  return null;
}

export function App() {
  const [selectedWallpaperId, setSelectedWallpaperId] = useState<string | null>(parseWallpaperIdFromUrl);
  const [wallpapers, setWallpapers] = useState<WallpaperItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalFilteredCount, setTotalFilteredCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  const [metadata, setMetadata] = useState<FilterMetadata | null>(null);
  const [totalCatalogCount, setTotalCatalogCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<WallpaperType | 'ALL'>('ALL');
  const [selectedResolutions, setSelectedResolutions] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('popularity_desc');

  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Sincroniza histórico de navegação SPA (popstate)
  useEffect(() => {
    const handleLocationChange = () => {
      const id = parseWallpaperIdFromUrl();
      setSelectedWallpaperId(id);
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  // Carrega metadados iniciais do catálogo (tags, resoluções e tipos reais)
  useEffect(() => {
    async function initMetadata() {
      try {
        const meta = await provider.getFilterMetadata();
        setMetadata(meta);
        const initial = await provider.getWallpapers({});
        setTotalCatalogCount(initial.total);
      } catch (err) {
        console.error('Falha ao obter metadados do catálogo:', err);
      }
    }
    initMetadata();
  }, []);

  // Busca e filtra wallpapers respeitando todos os critérios combinados (Página 1)
  const fetchWallpapers = useCallback(async () => {
    try {
      setIsLoading(true);
      setHasError(false);
      setErrorMessage(null);
      setLoadMoreError(null);

      const result = await provider.getWallpapers({
        searchQuery: searchQuery,
        types: selectedType !== 'ALL' ? [selectedType] : undefined,
        resolutions: selectedResolutions.length > 0 ? selectedResolutions : undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        sortBy: sortBy,
        page: 1,
        pageSize: PAGE_SIZE,
      });

      setWallpapers(result.items);
      setTotalFilteredCount(result.total);
      setCurrentPage(1);
      setHasMore(result.hasMore);
    } catch (err) {
      console.error('Falha ao aplicar filtros e carregar wallpapers:', err);
      setHasError(true);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Ocorreu um erro inesperado ao filtrar o catálogo.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedType, selectedResolutions, selectedTags, sortBy]);

  // Carrega próxima página de wallpapers de forma progressiva
  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || isLoading) return;

    try {
      setIsLoadingMore(true);
      setLoadMoreError(null);
      const nextPage = currentPage + 1;

      const result = await provider.getWallpapers({
        searchQuery: searchQuery,
        types: selectedType !== 'ALL' ? [selectedType] : undefined,
        resolutions: selectedResolutions.length > 0 ? selectedResolutions : undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        sortBy: sortBy,
        page: nextPage,
        pageSize: PAGE_SIZE,
      });

      setWallpapers((prev) => [...prev, ...result.items]);
      setCurrentPage(nextPage);
      setHasMore(result.hasMore);
    } catch (err) {
      console.error('Falha ao carregar mais wallpapers:', err);
      setLoadMoreError(
        err instanceof Error
          ? err.message
          : 'Falha ao carregar a próxima página de wallpapers.'
      );
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    currentPage,
    hasMore,
    isLoading,
    isLoadingMore,
    searchQuery,
    selectedType,
    selectedResolutions,
    selectedTags,
    sortBy,
  ]);

  // IntersectionObserver para carregamento progressivo e infinito conforme scroll
  useEffect(() => {
    if (!hasMore || isLoading || isLoadingMore) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          handleLoadMore();
        }
      },
      {
        root: null,
        rootMargin: '250px',
        threshold: 0.1,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, isLoadingMore, handleLoadMore]);

  // Executa busca com debounce para digitação
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchWallpapers();
    }, 120);

    return () => clearTimeout(timeoutId);
  }, [fetchWallpapers]);

  const handleToggleResolution = (res: string) => {
    setSelectedResolutions((prev) =>
      prev.includes(res) ? prev.filter((r) => r !== res) : [...prev, res]
    );
  };

  const handleToggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleResetFilters = () => {
    setSelectedType('ALL');
    setSelectedResolutions([]);
    setSelectedTags([]);
  };

  const handleResetAll = () => {
    setSearchQuery('');
    handleResetFilters();
    setSortBy('popularity_desc');
  };

  const handleSelectWallpaper = (item: WallpaperItem) => {
    setSelectedWallpaperId(item.id);
    window.history.pushState({ wallpaperId: item.id }, '', `/wallpaper/${item.id}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToGallery = () => {
    if (window.history.state?.wallpaperId) {
      window.history.back();
    } else {
      setSelectedWallpaperId(null);
      window.history.pushState(null, '', '/');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    if (selectedWallpaperId) {
      setSelectedWallpaperId(null);
      window.history.pushState(null, '', '/');
    }
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
      />

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-[2400px] w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 py-6 sm:py-8">
        {selectedWallpaperId ? (
          <WallpaperDetailView
            wallpaperId={selectedWallpaperId}
            provider={provider}
            onBack={handleBackToGallery}
            onSelectWallpaper={handleSelectWallpaper}
          />
        ) : (
          <>
            {/* Banner Informativo de Ambiente e Compatibilidade */}
            <section
              aria-label="Informações do catálogo"
              className="mb-6 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-zinc-400"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
                  <Info className="w-4 h-4" aria-hidden="true" />
                </div>
                <div>
              <p className="font-medium text-zinc-300">
                Catálogo em Modo de Demonstração (Steam Workshop • AppID 431960)
              </p>
              <p className="text-zinc-500 text-[11px]">
                Descoberta visual sem download de arquivos completos (.pkg). Deep linking direto para Steam no Linux.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 text-[11px]">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/80 border border-zinc-700/60 text-zinc-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {totalFilteredCount < totalCatalogCount
                ? `${wallpapers.length} de ${totalFilteredCount} filtrados (${totalCatalogCount} total)`
                : `${wallpapers.length} de ${totalCatalogCount} wallpapers`}
            </span>
          </div>
        </section>

        {/* Barra de Filtros e Ordenação */}
        {metadata && (
          <FilterBar
            metadata={metadata}
            selectedType={selectedType}
            onSelectType={setSelectedType}
            selectedResolutions={selectedResolutions}
            onToggleResolution={handleToggleResolution}
            selectedTags={selectedTags}
            onToggleTag={handleToggleTag}
            sortBy={sortBy}
            onSortChange={setSortBy}
            onResetFilters={handleResetFilters}
            hasActiveFilters={hasActiveFilters}
          />
        )}

        {/* Linha de Indicadores de Filtros Ativos e Contagem */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-zinc-200">
              {totalFilteredCount}{' '}
              {totalFilteredCount === 1 ? 'wallpaper encontrado' : 'wallpapers encontrados'}
              {totalFilteredCount > wallpapers.length && (
                <span className="text-xs font-normal text-zinc-400 ml-1.5">
                  ({wallpapers.length} exibidos)
                </span>
              )}
            </span>

            {/* Chips de Filtros Ativos para remoção rápida */}
            {selectedType !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700">
                Tipo: {selectedType}
                <button
                  type="button"
                  onClick={() => setSelectedType('ALL')}
                  aria-label="Remover filtro de tipo"
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
                  aria-label={`Remover filtro de resolução ${res}`}
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
                Tag: {tag}
                <button
                  type="button"
                  onClick={() => handleToggleTag(tag)}
                  aria-label={`Remover filtro da tag ${tag}`}
                  className="hover:text-zinc-100"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            {searchQuery.trim() !== '' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                Busca: "{searchQuery}"
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Limpar termo de busca"
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
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
            >
              Limpar busca e filtros
            </button>
          )}
        </div>

        {/* Área de Exibição da Galeria / Skeleton / Erro */}
        {isLoading ? (
          <LoadingSkeleton count={8} />
        ) : hasError ? (
          <EmptyState
            type="error"
            title="Erro ao carregar o catálogo"
            description={errorMessage || undefined}
            onReset={fetchWallpapers}
            resetLabel="Tentar novamente"
          />
        ) : (
          <>
            <GalleryGrid
              wallpapers={wallpapers}
              onResetSearch={handleResetAll}
              searchQuery={searchQuery}
              onSelectWallpaper={handleSelectWallpaper}
            />

            {/* Bloco de Paginação / Carregamento Progressivo */}
            {hasMore && (
              <div
                ref={sentinelRef}
                className="mt-10 py-6 flex flex-col items-center justify-center gap-4"
              >
                {isLoadingMore ? (
                  <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 text-sm text-zinc-300 shadow-xl">
                    <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" aria-hidden="true" />
                    <span>Carregando mais wallpapers...</span>
                  </div>
                ) : loadMoreError ? (
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-xs text-rose-400">{loadMoreError}</p>
                    <button
                      type="button"
                      onClick={handleLoadMore}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-xs font-medium text-zinc-300 border border-zinc-800 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Tentar novamente</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    className="inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-850 text-sm font-medium text-zinc-200 border border-zinc-800 hover:border-zinc-700 hover:shadow-lg hover:shadow-black/50 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    <span>Carregar mais wallpapers</span>
                    <ChevronDown className="w-4 h-4 text-zinc-400" aria-hidden="true" />
                  </button>
                )}

                <p className="text-xs text-zinc-500">
                  Exibindo {wallpapers.length} de {totalFilteredCount} itens
                </p>
              </div>
            )}

            {/* Indicador de Fim do Catálogo */}
            {!hasMore && wallpapers.length > 0 && !isLoading && (
              <div className="mt-12 py-8 border-t border-zinc-900 flex flex-col items-center justify-center gap-2 text-center">
                <p className="text-xs font-medium text-zinc-400">
                  Você visualizou todos os {wallpapers.length} wallpapers encontrados
                </p>
                <button
                  type="button"
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors inline-flex items-center gap-1 cursor-pointer font-medium"
                >
                  <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Voltar ao topo</span>
                </button>
              </div>
            )}
          </>
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
