import { useEffect, useState, useCallback } from 'react';
import { MockWallpaperProvider } from './services/mockProvider';
import { WallpaperItem } from './types/wallpaper';
import { Navbar } from './components/Navbar';
import { GalleryGrid } from './components/GalleryGrid';
import { LoadingSkeleton } from './components/LoadingSkeleton';
import { EmptyState } from './components/EmptyState';
import { Footer } from './components/Footer';
import { Info } from 'lucide-react';

const provider = new MockWallpaperProvider();

export function App() {
  const [wallpapers, setWallpapers] = useState<WallpaperItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchWallpapers = useCallback(async (query: string) => {
    try {
      setIsLoading(true);
      setHasError(false);
      setErrorMessage(null);

      const result = await provider.getWallpapers({
        searchQuery: query,
        pageSize: 24,
      });

      setWallpapers(result.items);
      setTotalCount(result.total);
    } catch (err) {
      console.error('Falha ao carregar wallpapers:', err);
      setHasError(true);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Ocorreu um erro inesperado ao carregar o catálogo.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Carrega catálogo inicial e atualiza na mudança da busca
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchWallpapers(searchQuery);
    }, 150);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, fetchWallpapers]);

  const handleRetry = () => {
    fetchWallpapers(searchQuery);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col antialiased selection:bg-indigo-500 selection:text-white">
      {/* Barra de Navegação Superior e Busca */}
      <Navbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        totalCount={totalCount}
      />

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Banner Informativo de Ambiente */}
        <section
          aria-label="Informações do catálogo"
          className="mb-8 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-zinc-400"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
              <Info className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <p className="font-medium text-zinc-300">
                Catálogo em Modo de Demonstração (Dados Simulados)
              </p>
              <p className="text-zinc-500 text-[11px]">
                Navegue visualmente por wallpapers do Steam Workshop sem download de arquivos completos (.pkg).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 text-[11px]">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/80 border border-zinc-700/60 text-zinc-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {wallpapers.length} {wallpapers.length === 1 ? 'item exibido' : 'itens exibidos'}
            </span>
          </div>
        </section>

        {/* Feedback visual se houver busca ativa */}
        {searchQuery.trim() !== '' && (
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-300">
              Resultados para{' '}
              <span className="text-indigo-400 font-semibold">"{searchQuery}"</span>
              <span className="text-zinc-500 font-normal ml-2">
                ({totalCount} {totalCount === 1 ? 'encontrado' : 'encontrados'})
              </span>
            </h2>

            <button
              type="button"
              onClick={handleClearSearch}
              className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Limpar busca
            </button>
          </div>
        )}

        {/* Área de Exibição da Galeria / Skeleton / Erro */}
        {isLoading ? (
          <LoadingSkeleton count={8} />
        ) : hasError ? (
          <EmptyState
            type="error"
            title="Erro ao carregar o catálogo"
            description={errorMessage || undefined}
            onReset={handleRetry}
            resetLabel="Tentar novamente"
          />
        ) : (
          <GalleryGrid
            wallpapers={wallpapers}
            onResetSearch={handleClearSearch}
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
