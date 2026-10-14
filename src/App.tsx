import { useEffect, useState, useCallback } from 'react';
import { MockWallpaperProvider } from './services/mockProvider';
import {
  WallpaperItem,
  FilterMetadata,
  WallpaperType,
  SortOption,
} from './types/wallpaper';
import { Navbar } from './components/Navbar';
import { FilterBar } from './components/FilterBar';
import { GalleryGrid } from './components/GalleryGrid';
import { LoadingSkeleton } from './components/LoadingSkeleton';
import { EmptyState } from './components/EmptyState';
import { Footer } from './components/Footer';
import { Info, X } from 'lucide-react';
import { getResolutionLabel } from './utils/filterWallpapers';

const provider = new MockWallpaperProvider();

export function App() {
  const [wallpapers, setWallpapers] = useState<WallpaperItem[]>([]);
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

  // Busca e filtra wallpapers respeitando todos os critérios combinados
  const fetchWallpapers = useCallback(async () => {
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
        pageSize: 50,
      });

      setWallpapers(result.items);
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
        onSearchChange={setSearchQuery}
        totalCount={totalCatalogCount}
      />

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
              {wallpapers.length} de {totalCatalogCount} wallpapers
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
              {wallpapers.length}{' '}
              {wallpapers.length === 1 ? 'wallpaper encontrado' : 'wallpapers encontrados'}
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
          <GalleryGrid
            wallpapers={wallpapers}
            onResetSearch={handleResetAll}
            searchQuery={searchQuery}
          />
        )}
      </main>

      {/* Rodapé */}
      <Footer />
    </div>
  );
}

export default App;
