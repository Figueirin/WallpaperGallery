import { useEffect, useState, useCallback, useRef } from 'react';
import { createWallpaperProvider } from './services/providerFactory';
import {
  WallpaperItem,
  FilterMetadata,
  WallpaperType,
  SortOption,
  DEFAULT_PAGE_SIZE,
} from './types/wallpaper';
import { Navbar } from './components/Navbar';
import { FilterBar } from './components/FilterBar';
import { GalleryGrid } from './components/GalleryGrid';
import { WallpaperDetailView } from './components/WallpaperDetailView';
import { LoadingSkeleton } from './components/LoadingSkeleton';
import { EmptyState } from './components/EmptyState';
import { Footer } from './components/Footer';
import { Pagination } from './components/Pagination';
import {
  Info,
  X,
  ArrowUp,
} from 'lucide-react';
import { getResolutionLabel } from './utils/filterWallpapers';

let provider: ReturnType<typeof createWallpaperProvider>;
try {
  provider = createWallpaperProvider();
} catch (error) {
  const unavailable = async (): Promise<never> => { throw error; };
  provider = { getWallpapers: unavailable, getWallpaperById: unavailable, getFilterMetadata: unavailable };
}

const PAGE_SIZE = DEFAULT_PAGE_SIZE;


function parseWallpaperIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const pathMatch = window.location.pathname.match(/^\/wallpaper\/([^/]+)\/?$/);
  if (pathMatch) {
    try { return decodeURIComponent(pathMatch[1]); } catch { return null; }
  }
  const hashMatch = window.location.hash.match(/^#\/wallpaper\/([^/]+)\/?$/);
  if (hashMatch) {
    try { return decodeURIComponent(hashMatch[1]); } catch { return null; }
  }
  return null;
}

function parsePageFromUrl(): number {
  if (typeof window === 'undefined') return 1;
  try {
    const params = new URLSearchParams(window.location.search);
    const p = parseInt(params.get('page') || '1', 10);
    return Number.isFinite(p) && p >= 1 ? p : 1;
  } catch {
    return 1;
  }
}

function syncUrl(page: number, wallpaperId: string | null, replace = false) {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (wallpaperId) {
      url.pathname = `/wallpaper/${encodeURIComponent(wallpaperId)}`;
      url.hash = '';
    } else {
      url.pathname = '/';
      url.hash = '';
    }
    if (page > 1) {
      url.searchParams.set('page', String(page));
    } else {
      url.searchParams.delete('page');
    }
    if (replace) {
      window.history.replaceState({ page, wallpaperId }, '', url.toString());
    } else {
      window.history.pushState({ page, wallpaperId }, '', url.toString());
    }
  } catch {
    // ignorar em ambientes restritos
  }
}

export function App() {
  const [selectedWallpaperId, setSelectedWallpaperId] = useState<string | null>(parseWallpaperIdFromUrl);
  const [wallpapers, setWallpapers] = useState<WallpaperItem[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(parsePageFromUrl);
  const [totalFilteredCount, setTotalFilteredCount] = useState(0);

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

  const requestVersion = useRef(0);

  // Sincroniza histórico de navegação SPA (popstate e hashchange)
  useEffect(() => {
    const handleLocationChange = () => {
      const id = parseWallpaperIdFromUrl();
      setSelectedWallpaperId(id);
      const urlPage = parsePageFromUrl();
      setCurrentPage((prev) => (prev !== urlPage ? urlPage : prev));
    };

    window.addEventListener('hashchange', handleLocationChange);
    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  // Carrega metadados iniciais do catálogo sem requisição redundante de wallpapers
  useEffect(() => {
    async function initMetadata() {
      try {
        const meta = await provider.getFilterMetadata();
        setMetadata(meta);
      } catch (err) {
        console.error('Falha ao obter metadados do catálogo:', err);
      }
    }
    initMetadata();
  }, []);

  // Busca e filtra wallpapers respeitando todos os critérios combinados
  const fetchWallpapers = useCallback(async (pageToFetch: number = currentPage) => {
    const version = ++requestVersion.current;
    try {
      setIsLoading(true);
      setHasError(false);
      setErrorMessage(null);

      const result = await provider.getWallpapers({
        searchQuery: searchQuery,
        types: selectedType !== 'ALL' ? [selectedType] : undefined,
        resolutions: selectedResolutions.length > 0 ? selectedResolutions : undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        sortBy: sortBy,
        page: pageToFetch,
        pageSize: PAGE_SIZE,
      });

      if (version !== requestVersion.current) return;
      setWallpapers(result.items);
      setTotalFilteredCount(result.total);
      setCurrentPage(result.page);

      const isDefaultView =
        !searchQuery.trim() &&
        selectedType === 'ALL' &&
        selectedResolutions.length === 0 &&
        selectedTags.length === 0 &&
        sortBy === 'popularity_desc';

      if (isDefaultView) {
        setTotalCatalogCount(result.total);
      }
    } catch (err) {
      if (version !== requestVersion.current) return;
      console.error('Falha ao aplicar filtros e carregar wallpapers:', err);
      setHasError(true);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Ocorreu um erro inesperado ao filtrar o catálogo.'
      );
    } finally {
      if (version === requestVersion.current) setIsLoading(false);
    }
  }, [searchQuery, selectedType, selectedResolutions, selectedTags, sortBy, currentPage]);

  // Executa busca com debounce para digitação e sincronização de filtros
  useEffect(() => {
    requestVersion.current++;
    const timeoutId = setTimeout(() => {
      fetchWallpapers(currentPage);
    }, 120);

    return () => {
      clearTimeout(timeoutId);
      requestVersion.current++;
    };
  }, [fetchWallpapers, currentPage]);

  const handlePageChange = (newPage: number) => {
    if (newPage === currentPage) return;
    setCurrentPage(newPage);
    syncUrl(newPage, selectedWallpaperId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleResolution = (res: string) => {
    setSelectedResolutions((prev) =>
      prev.includes(res) ? prev.filter((r) => r !== res) : [...prev, res]
    );
    setCurrentPage(1);
    syncUrl(1, selectedWallpaperId, true);
  };

  const handleToggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
    setCurrentPage(1);
    syncUrl(1, selectedWallpaperId, true);
  };

  const handleSelectType = (type: WallpaperType | 'ALL') => {
    setSelectedType(type);
    setCurrentPage(1);
    syncUrl(1, selectedWallpaperId, true);
  };

  const handleSortChange = (newSort: SortOption) => {
    setSortBy(newSort);
    setCurrentPage(1);
    syncUrl(1, selectedWallpaperId, true);
  };

  const handleResetFilters = () => {
    setSelectedType('ALL');
    setSelectedResolutions([]);
    setSelectedTags([]);
    setCurrentPage(1);
    syncUrl(1, selectedWallpaperId, true);
  };

  const handleResetAll = () => {
    setSearchQuery('');
    handleResetFilters();
    setSortBy('popularity_desc');
    setCurrentPage(1);
    syncUrl(1, selectedWallpaperId, true);
  };

  const handleSelectWallpaper = (item: WallpaperItem) => {
    setSelectedWallpaperId(item.id);
    syncUrl(currentPage, item.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToGallery = () => {
    setSelectedWallpaperId(null);
    syncUrl(currentPage, null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
    if (selectedWallpaperId) {
      setSelectedWallpaperId(null);
      syncUrl(1, null);
    } else {
      syncUrl(1, null, true);
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
        isLoading={isLoading}
      />

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-[2400px] w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 py-6 sm:py-8">
        {wallpapers.some((item) => item.isSimulated) && (
          <p role="status" className="mb-4 text-sm text-amber-300">
            Catálogo de demonstração — dados e mídias simulados.
          </p>
        )}

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
                    {wallpapers.some((item) => item.isSimulated)
                      ? 'Catálogo em Modo de Demonstração (Steam Workshop • AppID 431960)'
                      : 'Catálogo Steam Workshop (AppID 431960)'}
                  </p>
                  <p className="text-zinc-500 text-[11px]">
                    {wallpapers.some((item) => item.isSimulated)
                      ? 'Dados simulados para desenvolvimento local.'
                      : 'Descoberta visual sem download de arquivos completos (.pkg). Deep linking direto para Steam no Linux.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 text-[11px]">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/80 border border-zinc-700/60 text-zinc-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {totalFilteredCount < totalCatalogCount
                    ? `${wallpapers.length} de ${totalFilteredCount} filtrados (${totalCatalogCount} total)`
                    : `${totalCatalogCount} wallpapers no catálogo`}
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
                  {totalFilteredCount === 1 ? 'wallpaper encontrado' : 'wallpapers encontrados'}
                  {totalFilteredCount > wallpapers.length && (
                    <span className="text-xs font-normal text-zinc-400 ml-1.5">
                      (Página {currentPage} • {wallpapers.length} exibidos)
                    </span>
                  )}
                </span>

                {/* Chips de Filtros Ativos para remoção rápida */}
                {selectedType !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700">
                    Tipo: {selectedType}
                    <button
                      type="button"
                      onClick={() => handleSelectType('ALL')}
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
                      onClick={() => handleSearchChange('')}
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
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-medium cursor-pointer"
                >
                  Limpar busca e filtros
                </button>
              )}
            </div>

            {/* Área de Exibição da Galeria / Skeleton / Erro */}
            {isLoading && wallpapers.length === 0 ? (
              <LoadingSkeleton count={PAGE_SIZE} />
            ) : hasError ? (
              <EmptyState
                type="error"
                title="Erro ao carregar o catálogo"
                description={errorMessage || undefined}
                onReset={() => fetchWallpapers(currentPage)}
                resetLabel="Tentar novamente"
              />
            ) : (
              <div className={`transition-opacity duration-200 ${isLoading ? 'opacity-60 pointer-events-none' : 'opacity-100'}`}>
                <GalleryGrid
                  wallpapers={wallpapers}
                  onResetSearch={handleResetAll}
                  searchQuery={searchQuery}
                  onSelectWallpaper={handleSelectWallpaper}
                />

                {/* Controles de Paginação (shards de 25 itens) */}
                <Pagination
                  currentPage={currentPage}
                  totalItems={totalFilteredCount}
                  pageSize={PAGE_SIZE}
                  onPageChange={handlePageChange}
                  isLoading={isLoading}
                />

                {/* Botão de retorno ao topo */}
                {wallpapers.length > 0 && (
                  <div className="mt-8 pt-4 flex justify-center">
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
